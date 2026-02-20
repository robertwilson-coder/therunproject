/**
 * Gold Standard Date Resolver
 *
 * Single source of truth for all date operations in the app.
 * Uses provided timezone or defaults to Europe/Paris.
 * ALWAYS formats dates as UK format: "7 Feb 26"
 */

const DEFAULT_TIMEZONE = 'Europe/Paris';

export interface DateResolution {
  isoDate: string;
  displayDate: string;
  isAmbiguous: boolean;
  requiresClarification?: string;
}

export interface DateRange {
  startDate: string;
  endDate: string;
  displayRange: string;
  dayCount: number;
}

export class DateResolver {
  private referenceDate: Date;
  private timezone: string;

  constructor(referenceDateISO?: string, timezone?: string) {
    this.timezone = timezone || DEFAULT_TIMEZONE;
    this.referenceDate = referenceDateISO
      ? this.parseInTimezone(referenceDateISO)
      : this.nowInTimezone();
  }

  nowInTimezone(): Date {
    const now = new Date();
    const tzTime = new Date(now.toLocaleString('en-US', { timeZone: this.timezone }));
    return tzTime;
  }

  parseInTimezone(isoDate: string): Date {
    const date = new Date(isoDate + 'T12:00:00Z');
    const tzDate = new Date(date.toLocaleString('en-US', { timeZone: this.timezone }));
    return tzDate;
  }

  toISODate(date: Date): string {
    const tzDate = new Date(date.toLocaleString('en-US', { timeZone: this.timezone }));
    const year = tzDate.getFullYear();
    const month = String(tzDate.getMonth() + 1).padStart(2, '0');
    const day = String(tzDate.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  formatUKDisplay(isoDate: string): string {
    const date = this.parseInTimezone(isoDate);
    const day = date.getDate();
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const month = monthNames[date.getMonth()];
    const year = String(date.getFullYear()).slice(-2);
    return `${day} ${month} ${year}`;
  }

  formatUKDisplayLong(isoDate: string): string {
    const date = this.parseInTimezone(isoDate);
    const day = date.getDate();
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const month = monthNames[date.getMonth()];
    const year = date.getFullYear();
    return `${day} ${month} ${year}`;
  }

  getDayName(isoDate: string): string {
    const date = this.parseInTimezone(isoDate);
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return dayNames[date.getDay()];
  }

  addDays(isoDate: string, days: number): string {
    const date = this.parseInTimezone(isoDate);
    date.setDate(date.getDate() + days);
    return this.toISODate(date);
  }

  resolveRelativeDay(input: string): DateResolution {
    const normalized = input.toLowerCase().trim();

    const today = this.toISODate(this.referenceDate);
    const todayDayOfWeek = this.referenceDate.getDay();

    const dayMap: Record<string, number> = {
      'sunday': 0, 'sun': 0,
      'monday': 1, 'mon': 1,
      'tuesday': 2, 'tue': 2, 'tues': 2,
      'wednesday': 3, 'wed': 3,
      'thursday': 4, 'thu': 4, 'thur': 4, 'thurs': 4,
      'friday': 5, 'fri': 5,
      'saturday': 6, 'sat': 6,
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

    const nextMatch = normalized.match(/^next\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday|sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat)$/);
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

    const lastMatch = normalized.match(/^last\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday|sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat)$/);
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
      return {
        isoDate: '',
        displayDate: '',
        isAmbiguous: true,
        requiresClarification: `Did you mean "next ${bareDay}" or "last ${bareDay}"?`,
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
    const normalized = input.toLowerCase().trim();
    const today = this.toISODate(this.referenceDate);

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
      const todayDayOfWeek = this.referenceDate.getDay();
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
      const todayDayOfWeek = this.referenceDate.getDay();
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
    const start = this.parseInTimezone(startISO);
    const end = this.parseInTimezone(endISO);

    let current = new Date(start);
    while (current <= end) {
      dates.push(this.toISODate(current));
      current.setDate(current.getDate() + 1);
    }

    return dates;
  }

  isInPast(isoDate: string): boolean {
    const today = this.toISODate(this.referenceDate);
    return isoDate < today;
  }

  isToday(isoDate: string): boolean {
    const today = this.toISODate(this.referenceDate);
    return isoDate === today;
  }

  isFuture(isoDate: string): boolean {
    const today = this.toISODate(this.referenceDate);
    return isoDate > today;
  }
}

export const createDateResolver = (referenceDateISO?: string, timezone?: string): DateResolver => {
  return new DateResolver(referenceDateISO, timezone);
};

export const formatUKDate = (isoDate: string, timezone?: string): string => {
  const resolver = new DateResolver(undefined, timezone);
  return resolver.formatUKDisplay(isoDate);
};

export const formatUKDateLong = (isoDate: string, timezone?: string): string => {
  const resolver = new DateResolver(undefined, timezone);
  return resolver.formatUKDisplayLong(isoDate);
};
