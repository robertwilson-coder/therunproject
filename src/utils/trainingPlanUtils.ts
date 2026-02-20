import { parseLocalDate } from './dateUtils';

export const dayOrder = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

export const DEFAULT_TIMEZONE = 'Europe/Paris';

export function getTodayInTimezone(timezone: string = DEFAULT_TIMEZONE): string {
  const now = new Date();
  const tzTime = new Date(now.toLocaleString('en-US', { timeZone: timezone }));
  const year = tzTime.getFullYear();
  const month = String(tzTime.getMonth() + 1).padStart(2, '0');
  const day = String(tzTime.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export const renderMarkdown = (text: string) => {
  let formatted = text
    .replace(/\n/g, '<br>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

  formatted = formatted
    .replace(/\s*\|\s*/g, '<br>')
    .replace(/(<strong>Warm up:<\/strong>)/gi, '<br>$1')
    .replace(/(<strong>Work:<\/strong>)/gi, '<br>$1')
    .replace(/(<strong>Cool down:<\/strong>)/gi, '<br>$1')
    .replace(/^<br>/, '')
    .replace(/<br>\s*<br>+/g, '<br>');

  return formatted;
};

export const getTodayInfo = (planStartDate?: string, timezone: string = DEFAULT_TIMEZONE) => {
  const todayISO = getTodayInTimezone(timezone);
  const todayDate = parseLocalDate(todayISO);
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  let weekNumber = 0;
  let dayIndex = todayDate.getDay() - 1;
  if (dayIndex < 0) dayIndex = 6;

  if (planStartDate) {
    const startDate = parseLocalDate(planStartDate);
    const today = todayDate;
    today.setHours(0, 0, 0, 0);

    const startDayOfWeek = startDate.getDay();
    const startDayIndex = startDayOfWeek === 0 ? 6 : startDayOfWeek - 1;

    const daysToMonday = startDayIndex;
    const planWeekStart = new Date(startDate);
    planWeekStart.setDate(startDate.getDate() - daysToMonday);
    planWeekStart.setHours(0, 0, 0, 0);

    const todayDayOfWeek = today.getDay();
    const todayDayIndex = todayDayOfWeek === 0 ? 6 : todayDayOfWeek - 1;
    const currentWeekStart = new Date(today);
    currentWeekStart.setDate(today.getDate() - todayDayIndex);
    currentWeekStart.setHours(0, 0, 0, 0);

    const weeksDiff = Math.floor((currentWeekStart.getTime() - planWeekStart.getTime()) / (7 * 24 * 60 * 60 * 1000));
    weekNumber = weeksDiff >= 0 ? weeksDiff : 0;
  }

  return {
    dayName: days[dayIndex],
    date: todayISO,
    weekNumber: weekNumber
  };
};

export const extractRPEFromActivity = (activity: string): string | null => {
  const rpeMatch = activity.match(/RPE[:\s]+(\d+)(?:-(\d+))?/i);
  if (rpeMatch) {
    const min = rpeMatch[1];
    const max = rpeMatch[2] || min;
    return `${min}-${max}`;
  }
  return null;
};

export const convertRPEtoEffort = (text: string | undefined, isBeginnerPlan: boolean, weekNumber?: number): string => {
  // Handle undefined or non-string input
  if (!text || typeof text !== 'string') {
    return '';
  }

  if (isBeginnerPlan) {
    return text
      .replace(/\bat RPE (\d+(?:-\d+)?)\b/gi, 'at Effort: $1/10')
      .replace(/\bRPE (\d+(?:-\d+)?)\b/gi, 'Effort: $1/10');
  }

  if (weekNumber && weekNumber <= 2) {
    return text
      .replace(/\bat RPE (\d+(?:-\d+)?)\b/gi, 'at Rate of Perceived Exertion (RPE) $1')
      .replace(/\bRPE (\d+(?:-\d+)?)\b/gi, 'Rate of Perceived Exertion (RPE) $1');
  }

  return text;
};

export const getDayColor = (activity: string, isCurrentDay: boolean) => {
  const activityLower = activity.toLowerCase();
  let baseColor = 'bg-neutral-100 dark:bg-neutral-900/90 border-neutral-300 dark:border-neutral-700';

  if (activityLower.includes('rest') || activityLower.includes('active recovery')) {
    baseColor = 'bg-neutral-100 dark:bg-neutral-900/90 border-neutral-300 dark:border-neutral-700';
  } else if (activityLower.includes('interval') ||
      activityLower.includes('fartlek') ||
      /\d+\s*x\s*[(\d]/.test(activityLower)) {
    baseColor = 'bg-red-100 dark:bg-red-500/15 border-red-300 dark:border-red-500/40';
  } else if (activityLower.includes('tempo') || activityLower.includes('threshold')) {
    baseColor = 'bg-purple-100 dark:bg-purple-500/15 border-purple-300 dark:border-purple-500/40';
  } else if (activityLower.includes('hill')) {
    baseColor = 'bg-orange-100 dark:bg-orange-500/15 border-orange-300 dark:border-orange-500/40';
  } else if (activityLower.includes('long')) {
    baseColor = 'bg-yellow-100 dark:bg-yellow-500/15 border-yellow-300 dark:border-yellow-500/40';
  } else if (activityLower.includes('easy') || activityLower.includes('recovery')) {
    baseColor = 'bg-green-100 dark:bg-green-500/15 border-green-300 dark:border-green-500/40';
  } else {
    baseColor = 'bg-blue-100 dark:bg-blue-500/15 border-blue-300 dark:border-blue-500/40';
  }

  if (isCurrentDay) {
    return baseColor + ' ring-2 ring-primary-500';
  }
  return baseColor;
};

export const getEffortLevel = (activity: string, isBeginnerPlan: boolean, weekNumber: number): string => {
  const activityLower = activity.toLowerCase();
  if (activityLower.includes('rest')) return '';

  const showFullRPE = !isBeginnerPlan && weekNumber <= 2;

  if (isBeginnerPlan) {
    if (activityLower.includes('race day')) return 'Effort: 9-10/10';
    if (activityLower.includes('interval') || activityLower.includes('hill')) return 'Effort: 7-9/10';
    if (activityLower.includes('fartlek')) return 'Effort: 7-9/10';
    if (activityLower.includes('tempo')) return 'Effort: 6-7/10';
    if (activityLower.includes('progressive')) return 'Effort: 6-7/10';
    if (activityLower.includes('long run')) return 'Effort: 4-5/10';
    if (activityLower.includes('recovery')) return 'Effort: 2-3/10';
    if (activityLower.includes('easy')) return 'Effort: 2-3/10';
    return 'Effort: 4-5/10';
  } else {
    const prefix = showFullRPE ? 'Rate of Perceived Exertion (RPE) ' : 'RPE ';
    if (activityLower.includes('race day')) return `${prefix}9-10`;
    if (activityLower.includes('interval') || activityLower.includes('hill')) return `${prefix}7-9`;
    if (activityLower.includes('fartlek')) return `${prefix}7-9`;
    if (activityLower.includes('tempo')) return `${prefix}6-7`;
    if (activityLower.includes('progressive')) return `${prefix}6-7`;
    if (activityLower.includes('long run')) return `${prefix}4-5`;
    if (activityLower.includes('recovery')) return `${prefix}2-3`;
    if (activityLower.includes('easy')) return `${prefix}2-3`;
    return `${prefix}4-5`;
  }
};

export const calculateWorkoutDate = (weekNumber: number, dayName: string, planStartDate: string): string => {
  if (!planStartDate) return new Date().toISOString().split('T')[0];

  const startDate = parseLocalDate(planStartDate);
  const dayIndex = dayOrder.indexOf(dayName as any);
  const startDayOfWeek = startDate.getDay();
  const startDayIndex = startDayOfWeek === 0 ? 6 : startDayOfWeek - 1;
  const daysToMonday = startDayIndex;
  const planWeekStart = new Date(startDate);
  planWeekStart.setDate(startDate.getDate() - daysToMonday);

  const workoutDate = new Date(planWeekStart);
  workoutDate.setDate(planWeekStart.getDate() + (weekNumber * 7) + dayIndex);

  return workoutDate.toISOString().split('T')[0];
};

export const isDayBeforeStart = (weekIndex: number, dayName: string, planStartDate: string): boolean => {
  const dayIndex = dayOrder.indexOf(dayName as typeof dayOrder[number]);
  const startDate = parseLocalDate(planStartDate);
  const startDayOfWeek = startDate.getDay();
  const startDayIndex = startDayOfWeek === 0 ? 6 : startDayOfWeek - 1;

  if (weekIndex === 0) {
    return dayIndex < startDayIndex;
  }
  return false;
};

export const getTimeProgress = (planStartDate?: string, raceDate?: string, timezone: string = DEFAULT_TIMEZONE) => {
  if (!planStartDate || !raceDate) return null;

  const startDate = parseLocalDate(planStartDate);
  const raceDateObj = parseLocalDate(raceDate);

  const todayISO = getTodayInTimezone(timezone);
  const today = parseLocalDate(todayISO);
  today.setHours(0, 0, 0, 0);

  const totalDays = Math.ceil((raceDateObj.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
  const elapsedDays = Math.max(0, Math.ceil((today.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)));
  const remainingDays = Math.max(0, totalDays - elapsedDays);
  const progressPercent = totalDays > 0 ? Math.min(100, Math.round((elapsedDays / totalDays) * 100)) : 0;

  return {
    totalDays,
    elapsedDays,
    remainingDays,
    progressPercent
  };
};
