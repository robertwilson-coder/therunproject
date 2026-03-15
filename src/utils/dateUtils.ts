export function parseLocalDate(dateString: string): Date {
  if (!dateString || typeof dateString !== 'string') {
    console.error('[parseLocalDate] Invalid input:', { dateString, type: typeof dateString });
    throw new Error(`parseLocalDate requires a string, got ${typeof dateString}`);
  }
  const [year, month, day] = dateString.split('-').map(Number);
  return new Date(year, month - 1, day);
}

export function formatDateForDisplay(dateString: string): string {
  const date = parseLocalDate(dateString);
  return date.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  });
}

export function getDateStringFromDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getCurrentCalendarWeek(): { start: Date; end: Date } {
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  const dayOfWeek = now.getDay();
  const dayIndex = dayOfWeek === 0 ? 6 : dayOfWeek - 1;

  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - dayIndex);
  weekStart.setHours(0, 0, 0, 0);

  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  weekEnd.setHours(23, 59, 59, 999);

  return { start: weekStart, end: weekEnd };
}

export function getMondayOfWeek(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const dayOfWeek = d.getDay();
  const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const monday = new Date(d);
  monday.setDate(d.getDate() - daysToMonday);
  return monday;
}

export function getWeekDateRange(weekIndex: number, planData: any): { start: string; end: string } | null {
  if (!planData || !planData.plan || !planData.plan[weekIndex]) {
    return null;
  }

  const week = planData.plan[weekIndex];
  const dayOrder = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  let firstDate: string | null = null;
  let lastDate: string | null = null;

  for (const day of dayOrder) {
    const dayData = week.days?.[day];
    if (dayData && dayData.date) {
      if (!firstDate) firstDate = dayData.date;
      lastDate = dayData.date;
    }
  }

  if (!firstDate || !lastDate) {
    return null;
  }

  return { start: firstDate, end: lastDate };
}

export function findWeekIndexForDate(dateString: string, planData: any): number {
  if (!planData || !planData.plan || !Array.isArray(planData.plan)) {
    return 0;
  }

  for (let weekIndex = 0; weekIndex < planData.plan.length; weekIndex++) {
    const week = planData.plan[weekIndex];
    if (!week || !week.days) continue;

    const dayOrder = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    for (const day of dayOrder) {
      const dayData = week.days[day];
      if (dayData && dayData.date === dateString) {
        return weekIndex;
      }
    }
  }

  return 0;
}

export function addDays(dateString: string, days: number): string {
  // Validate input
  if (!dateString || typeof dateString !== 'string') {
    console.error('[addDays] Invalid date string:', dateString);
    throw new Error('addDays requires a valid date string');
  }
  const date = parseLocalDate(dateString);
  date.setDate(date.getDate() + days);
  return getDateStringFromDate(date);
}

export function formatDateRange(startDate: string, endDate: string): string {
  const start = parseLocalDate(startDate);
  const end = parseLocalDate(endDate);

  const startMonth = start.toLocaleDateString('en-US', { month: 'short' });
  const endMonth = end.toLocaleDateString('en-US', { month: 'short' });
  const startDay = start.getDate();
  const endDay = end.getDate();
  const year = end.getFullYear();

  if (startMonth === endMonth) {
    return `${startMonth} ${startDay}–${endDay}, ${year}`;
  } else {
    return `${startMonth} ${startDay} – ${endMonth} ${endDay}, ${year}`;
  }
}
