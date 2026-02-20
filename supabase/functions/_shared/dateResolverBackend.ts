/**
 * Gold Standard Date Resolver - Backend Version (ISO-First, Deterministic)
 *
 * Single source of truth for all date operations in edge functions.
 * ALWAYS uses user's timezone (IANA format).
 * ALWAYS formats dates as UK format: "7 Feb 26"
 *
 * NON-NEGOTIABLE INVARIANTS:
 * - Backend is authoritative for "today"
 * - All date resolution happens in code, never in LLM
 * - Timezone must be provided (defaults to Europe/Paris)
 * - ISO-first: all operations work on ISO strings, never timezone-parsed Dates
 * - Uses Intl.DateTimeFormat().formatToParts() for reliable timezone conversion
 * - Uses UTC-noon trick for deterministic date arithmetic
 */

const DEFAULT_TIMEZONE = 'Europe/Paris';

export interface DateResolution {
  isoDate: string;
  displayDate: string;
  isAmbiguous: boolean;
  requiresClarification?: string;
  options?: Array<{ isoDate: string; displayDate: string; label: string }>;
}

export interface DateRange {
  startDate: string;
  endDate: string;
  displayRange: string;
  dayCount: number;
}

export class DateResolver {
  private referenceTodayISO: string;
  private timezone: string;

  constructor(referenceDateISO?: string, timezone?: string) {
    this.timezone = timezone || DEFAULT_TIMEZONE;
    this.referenceTodayISO = referenceDateISO || this.getTodayISOInTimezone();
  }

  /**
   * Get the reference "today" date as ISO string
   */
  getTodayISO(): string {
    return this.referenceTodayISO;
  }

  /**
   * Get today's date in the specified timezone using formatToParts
   * This is the ONLY reliable way to get "today" in a specific timezone
   */
  getTodayISOInTimezone(): string {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: this.timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });

    const parts = formatter.formatToParts(now);
    const year = parts.find(p => p.type === 'year')!.value;
    const month = parts.find(p => p.type === 'month')!.value;
    const day = parts.find(p => p.type === 'day')!.value;

    return `${year}-${month}-${day}`;
  }

  /**
   * Get day of week (0=Sunday, 6=Saturday) from ISO date
   * Uses UTC-noon trick for deterministic results
   */
  getDayOfWeek(isoDate: string): number {
    const date = new Date(isoDate + 'T12:00:00Z');
    return date.getUTCDay();
  }

  /**
   * Add days to an ISO date using UTC-noon trick
   * This is deterministic and avoids timezone drift
   */
  addDays(isoDate: string, days: number): string {
    const date = new Date(isoDate + 'T12:00:00Z');
    date.setUTCDate(date.getUTCDate() + days);

    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
  }

  /**
   * Format ISO date for display using UK format: "7 Feb 26"
   * Uses Intl.DateTimeFormat for proper timezone-aware formatting
   */
  formatUKDisplay(isoDate: string): string {
    const date = new Date(isoDate + 'T12:00:00Z');
    const formatter = new Intl.DateTimeFormat('en-GB', {
      timeZone: this.timezone,
      day: 'numeric',
      month: 'short',
      year: '2-digit',
    });

    const parts = formatter.formatToParts(date);
    const day = parts.find(p => p.type === 'day')!.value;
    const month = parts.find(p => p.type === 'month')!.value;
    const year = parts.find(p => p.type === 'year')!.value;

    return `${day} ${month} ${year}`;
  }

  /**
   * Format ISO date for display using long UK format: "7 February 2026"
   */
  formatUKDisplayLong(isoDate: string): string {
    const date = new Date(isoDate + 'T12:00:00Z');
    const formatter = new Intl.DateTimeFormat('en-GB', {
      timeZone: this.timezone,
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });

    const parts = formatter.formatToParts(date);
    const day = parts.find(p => p.type === 'day')!.value;
    const month = parts.find(p => p.type === 'month')!.value;
    const year = parts.find(p => p.type === 'year')!.value;

    return `${day} ${month} ${year}`;
  }

  /**
   * Get day name from ISO date
   */
  getDayName(isoDate: string): string {
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return dayNames[this.getDayOfWeek(isoDate)];
  }

  /**
   * Normalize input text for date parsing
   * ONLY strips possessives from weekdays, preserves other words
   */
  normalizeInput(input: string): string {
    let normalized = input.toLowerCase().trim();

    // Remove commas and apostrophes
    normalized = normalized.replace(/[',]/g, '');

    // Expand weekday abbreviations FIRST
    const abbrevMap: Record<string, string> = {
      'mon': 'monday',
      'tue': 'tuesday',
      'tues': 'tuesday',
      'wed': 'wednesday',
      'thu': 'thursday',
      'thur': 'thursday',
      'thurs': 'thursday',
      'fri': 'friday',
      'sat': 'saturday',
      'sun': 'sunday',
    };

    Object.entries(abbrevMap).forEach(([abbrev, full]) => {
      normalized = normalized.replace(new RegExp(`\\b${abbrev}\\b`, 'g'), full);
    });

    // Strip possessives ONLY from weekdays (tuesday's → tuesday)
    const weekdays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    weekdays.forEach(day => {
      normalized = normalized.replace(new RegExp(`\\b${day}s\\b`, 'g'), day);
    });

    return normalized.trim();
  }

  resolveRelativeDay(input: string): DateResolution {
    const normalized = this.normalizeInput(input);

    const today = this.referenceTodayISO;
    const todayDayOfWeek = this.getDayOfWeek(today);

    const dayMap: Record<string, number> = {
      'sunday': 0,
      'monday': 1,
      'tuesday': 2,
      'wednesday': 3,
      'thursday': 4,
      'friday': 5,
      'saturday': 6,
    };

    if (normalized === 'today') {
      return {
        isoDate: today,
        displayDate: this.formatUKDisplay(today),
        isAmbiguous: false,
      };
    }

    if (normalized === 'tomorrow') {
      const tomorrow = this.addDays(today, 1);
      return {
        isoDate: tomorrow,
        displayDate: this.formatUKDisplay(tomorrow),
        isAmbiguous: false,
      };
    }

    if (normalized === 'yesterday') {
      const yesterday = this.addDays(today, -1);
      return {
        isoDate: yesterday,
        displayDate: this.formatUKDisplay(yesterday),
        isAmbiguous: false,
      };
    }

    const nextMatch = normalized.match(/^next\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)$/);
    if (nextMatch) {
      const targetDay = dayMap[nextMatch[1]];
      let daysUntil = targetDay - todayDayOfWeek;
      if (daysUntil <= 0) daysUntil += 7;

      const targetDate = this.addDays(today, daysUntil);
      return {
        isoDate: targetDate,
        displayDate: this.formatUKDisplay(targetDate),
        isAmbiguous: false,
      };
    }

    const lastMatch = normalized.match(/^last\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)$/);
    if (lastMatch) {
      const targetDay = dayMap[lastMatch[1]];
      let daysBack = todayDayOfWeek - targetDay;
      if (daysBack <= 0) daysBack += 7;

      const targetDate = this.addDays(today, -daysBack);
      return {
        isoDate: targetDate,
        displayDate: this.formatUKDisplay(targetDate),
        isAmbiguous: false,
      };
    }

    const bareDay = Object.keys(dayMap).find(key => normalized === key);
    if (bareDay) {
      const targetDay = dayMap[bareDay];
      let daysUntil = targetDay - todayDayOfWeek;
      if (daysUntil <= 0) daysUntil += 7;
      const nextDate = this.addDays(today, daysUntil);

      let daysBack = todayDayOfWeek - targetDay;
      if (daysBack <= 0) daysBack += 7;
      const lastDate = this.addDays(today, -daysBack);

      return {
        isoDate: '',
        displayDate: '',
        isAmbiguous: true,
        requiresClarification: `Which ${bareDay} did you mean?`,
        options: [
          {
            isoDate: lastDate,
            displayDate: this.formatUKDisplay(lastDate),
            label: `Last ${bareDay.charAt(0).toUpperCase() + bareDay.slice(1)} (${this.formatUKDisplay(lastDate)})`,
          },
          {
            isoDate: nextDate,
            displayDate: this.formatUKDisplay(nextDate),
            label: `Next ${bareDay.charAt(0).toUpperCase() + bareDay.slice(1)} (${this.formatUKDisplay(nextDate)})`,
          },
        ],
      };
    }

    return {
      isoDate: '',
      displayDate: '',
      isAmbiguous: true,
      requiresClarification: 'Could not understand the date. Please be more specific (e.g., "next Tuesday", "last Friday", "tomorrow").',
    };
  }

  resolveRelativeRange(input: string): DateRange | null {
    const normalized = this.normalizeInput(input);
    const today = this.referenceTodayISO;

    const nextWeekMatch = normalized.match(/^next\s+(\d+)\s+(week|weeks)$/);
    if (nextWeekMatch) {
      const weeks = parseInt(nextWeekMatch[1]);
      const startDate = this.addDays(today, 1);
      const endDate = this.addDays(today, weeks * 7);
      const dayCount = weeks * 7;

      return {
        startDate,
        endDate,
        displayRange: `${this.formatUKDisplay(startDate)} to ${this.formatUKDisplay(endDate)}`,
        dayCount,
      };
    }

    const nextDaysMatch = normalized.match(/^next\s+(\d+)\s+(day|days)$/);
    if (nextDaysMatch) {
      const days = parseInt(nextDaysMatch[1]);
      const startDate = this.addDays(today, 1);
      const endDate = this.addDays(today, days);

      return {
        startDate,
        endDate,
        displayRange: `${this.formatUKDisplay(startDate)} to ${this.formatUKDisplay(endDate)}`,
        dayCount: days,
      };
    }

    const thisWeekMatch = normalized.match(/^this\s+week$/);
    if (thisWeekMatch) {
      const todayDayOfWeek = this.getDayOfWeek(today);
      const monday = todayDayOfWeek === 0 ? -6 : 1 - todayDayOfWeek;
      const startDate = this.addDays(today, monday);
      const endDate = this.addDays(startDate, 6);

      return {
        startDate,
        endDate,
        displayRange: `${this.formatUKDisplay(startDate)} to ${this.formatUKDisplay(endDate)}`,
        dayCount: 7,
      };
    }

    const nextWeekSingleMatch = normalized.match(/^next\s+week$/);
    if (nextWeekSingleMatch) {
      const todayDayOfWeek = this.getDayOfWeek(today);
      const nextMonday = todayDayOfWeek === 0 ? 1 : 8 - todayDayOfWeek;
      const startDate = this.addDays(today, nextMonday);
      const endDate = this.addDays(startDate, 6);

      return {
        startDate,
        endDate,
        displayRange: `${this.formatUKDisplay(startDate)} to ${this.formatUKDisplay(endDate)}`,
        dayCount: 7,
      };
    }

    return null;
  }

  getDatesBetween(startISO: string, endISO: string): string[] {
    const dates: string[] = [];
    let current = startISO;

    while (current <= endISO) {
      dates.push(current);
      current = this.addDays(current, 1);
    }

    return dates;
  }

  extractDatesFromPhrase(phrase: string, planStartDate: string, planDays: Array<{ iso_date: string; workout: string }>): string[] {
    const normalized = this.normalizeInput(phrase);
    const matchedDates: string[] = [];

    const dayMap: Record<string, number> = {
      'sunday': 0,
      'monday': 1,
      'tuesday': 2,
      'wednesday': 3,
      'thursday': 4,
      'friday': 5,
      'saturday': 6,
    };

    if (normalized.includes('rest of week') || normalized.includes('rest of the week')) {
      const today = this.referenceTodayISO;
      const todayDayOfWeek = this.getDayOfWeek(today);
      const daysUntilSunday = 7 - todayDayOfWeek;

      for (let i = 1; i <= daysUntilSunday; i++) {
        matchedDates.push(this.addDays(today, i));
      }
      return matchedDates;
    }

    if (normalized.includes('this week') || normalized.includes('this weekend')) {
      const today = this.referenceTodayISO;
      const todayDayOfWeek = this.getDayOfWeek(today);
      const mondayOffset = todayDayOfWeek === 0 ? -6 : 1 - todayDayOfWeek;
      const weekStart = this.addDays(today, mondayOffset);

      if (normalized.includes('weekend')) {
        matchedDates.push(this.addDays(weekStart, 5));
        matchedDates.push(this.addDays(weekStart, 6));
      } else {
        for (let i = 0; i < 7; i++) {
          matchedDates.push(this.addDays(weekStart, i));
        }
      }
      return matchedDates;
    }

    if (normalized.includes('next week')) {
      const today = this.referenceTodayISO;
      const todayDayOfWeek = this.getDayOfWeek(today);
      const nextMondayOffset = todayDayOfWeek === 0 ? 1 : 8 - todayDayOfWeek;
      const nextMonday = this.addDays(today, nextMondayOffset);

      for (let i = 0; i < 7; i++) {
        matchedDates.push(this.addDays(nextMonday, i));
      }
      return matchedDates;
    }

    Object.entries(dayMap).forEach(([dayName, dayNum]) => {
      const dayRegex = new RegExp(`\\b${dayName}\\b`, 'i');
      if (dayRegex.test(normalized)) {
        planDays.forEach((day) => {
          if (this.getDayOfWeek(day.iso_date) === dayNum) {
            matchedDates.push(day.iso_date);
          }
        });
      }
    });

    return matchedDates;
  }

  isInPast(isoDate: string): boolean {
    return isoDate < this.referenceTodayISO;
  }

  isToday(isoDate: string): boolean {
    return isoDate === this.referenceTodayISO;
  }

  isFuture(isoDate: string): boolean {
    return isoDate > this.referenceTodayISO;
  }
}

export const createDateResolver = (referenceDateISO?: string, timezone?: string): DateResolver => {
  return new DateResolver(referenceDateISO, timezone);
};
