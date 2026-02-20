/**
 * Question scope analyzer
 * Determines what workout data is needed based on the user's question
 */

export type QuestionScope =
  | 'today'
  | 'tomorrow'
  | 'this_week'
  | 'next_week'
  | 'specific_week'
  | 'full_plan'
  | 'info_only';

export interface ScopeAnalysis {
  scope: QuestionScope;
  specificWeek?: number;
  needsWorkoutData: boolean;
  needsCompletionData: boolean;
  needsNotesData: boolean;
}

const TODAY_PATTERNS = [
  /\btoday\b/i,
  /\btonight\b/i,
  /\bthis morning\b/i,
  /\bthis afternoon\b/i,
  /\bthis evening\b/i,
  /\btoday'?s\b/i,
];

const TOMORROW_PATTERNS = [
  /\btomorrow\b/i,
  /\btomorrow'?s\b/i,
  /\bnext day\b/i,
];

const THIS_WEEK_PATTERNS = [
  /\bthis week\b/i,
  /\bthis weekend\b/i,
  /\bsaturday\b/i,
  /\bsunday\b/i,
  /\bmonday\b/i,
  /\btuesday\b/i,
  /\bwednesday\b/i,
  /\bthursday\b/i,
  /\bfriday\b/i,
  /\brest of (the )?week\b/i,
];

const NEXT_WEEK_PATTERNS = [
  /\bnext week\b/i,
  /\bfollowing week\b/i,
  /\bupcoming week\b/i,
];

const SPECIFIC_WEEK_PATTERN = /\bweek (\d+)\b/i;

const INFO_ONLY_PATTERNS = [
  /^what'?s (?:my |the )?(?:next|coming|upcoming)/i,
  /^when is (?:my |the )?(?:next|race)/i,
  /^how (?:far|long|many)/i,
  /^explain/i,
  /^what does/i,
  /^tell me about/i,
  /\?$/,
];

const MODIFICATION_PATTERNS = [
  /\b(?:move|swap|change|switch|shift)\b/i,
  /\b(?:cancel|skip|delete|remove)\b/i,
  /\b(?:add|insert|include)\b/i,
  /\b(?:adjust|modify|update|edit)\b/i,
  /\b(?:shorten|lengthen|reduce|increase)\b/i,
  /\bcan'?t (?:do|make|run)\b/i,
  /\bhave (?:a |an )?(?:event|race|competition|injury)\b/i,
];

const PROGRESS_ANALYSIS_PATTERNS = [
  /\banalyze/i,
  /\bhow am i doing/i,
  /\bmy progress/i,
  /\bperformance/i,
  /\badjustments/i,
  /\bhow'?s my training/i,
];

/**
 * Analyzes a user's question to determine what scope of data is needed
 */
export function analyzeQuestionScope(message: string): ScopeAnalysis {
  const lowerMessage = message.toLowerCase();

  // Check for specific week mention
  const weekMatch = message.match(SPECIFIC_WEEK_PATTERN);
  if (weekMatch) {
    const weekNum = parseInt(weekMatch[1], 10);
    return {
      scope: 'specific_week',
      specificWeek: weekNum,
      needsWorkoutData: true,
      needsCompletionData: false,
      needsNotesData: false,
    };
  }

  // Check if this is a progress analysis request
  const isProgressAnalysis = PROGRESS_ANALYSIS_PATTERNS.some(p => p.test(message));
  if (isProgressAnalysis) {
    return {
      scope: 'this_week',
      needsWorkoutData: true,
      needsCompletionData: true,
      needsNotesData: true,
    };
  }

  // Check if this is a modification request
  const isModification = MODIFICATION_PATTERNS.some(p => p.test(message));

  // Check for info-only questions (no workout modifications needed)
  const isInfoOnly = INFO_ONLY_PATTERNS.some(p => p.test(message)) && !isModification;
  if (isInfoOnly) {
    return {
      scope: 'info_only',
      needsWorkoutData: false,
      needsCompletionData: false,
      needsNotesData: false,
    };
  }

  // Check for time-specific patterns
  const isToday = TODAY_PATTERNS.some(p => p.test(message));
  if (isToday) {
    return {
      scope: 'today',
      needsWorkoutData: true,
      needsCompletionData: false,
      needsNotesData: false,
    };
  }

  const isTomorrow = TOMORROW_PATTERNS.some(p => p.test(message));
  if (isTomorrow) {
    return {
      scope: 'tomorrow',
      needsWorkoutData: true,
      needsCompletionData: false,
      needsNotesData: false,
    };
  }

  const isThisWeek = THIS_WEEK_PATTERNS.some(p => p.test(message));
  if (isThisWeek) {
    return {
      scope: 'this_week',
      needsWorkoutData: true,
      needsCompletionData: false,
      needsNotesData: false,
    };
  }

  const isNextWeek = NEXT_WEEK_PATTERNS.some(p => p.test(message));
  if (isNextWeek) {
    return {
      scope: 'next_week',
      needsWorkoutData: true,
      needsCompletionData: false,
      needsNotesData: false,
    };
  }

  // Default: if asking for modifications or vague questions, include current context
  if (isModification) {
    return {
      scope: 'this_week',
      needsWorkoutData: true,
      needsCompletionData: false,
      needsNotesData: false,
    };
  }

  // For everything else, assume they need broader context
  return {
    scope: 'full_plan',
    needsWorkoutData: true,
    needsCompletionData: true,
    needsNotesData: true,
  };
}

/**
 * Filters plan data based on the scope analysis
 */
export function filterPlanDataByScope(
  planData: any,
  scope: QuestionScope,
  currentWeekNumber: number,
  specificWeek?: number
): any {
  if (!planData?.plan) return planData;

  let relevantWeeks: any[] = [];

  switch (scope) {
    case 'today':
    case 'tomorrow':
      // Just current week
      relevantWeeks = planData.plan.filter((w: any) => w.week === currentWeekNumber);
      break;

    case 'this_week':
      // Current week only
      relevantWeeks = planData.plan.filter((w: any) => w.week === currentWeekNumber);
      break;

    case 'next_week':
      // Next week only
      relevantWeeks = planData.plan.filter((w: any) => w.week === currentWeekNumber + 1);
      break;

    case 'specific_week':
      // Specific week requested
      if (specificWeek) {
        relevantWeeks = planData.plan.filter((w: any) => w.week === specificWeek);
      }
      break;

    case 'info_only':
      // No workout data needed, but return minimal structure
      return { ...planData, plan: [] };

    case 'full_plan':
    default:
      // Current week + 2 before and after (5 weeks max)
      const startWeek = Math.max(1, currentWeekNumber - 2);
      const endWeek = Math.min(planData.plan.length, currentWeekNumber + 2);
      relevantWeeks = planData.plan.filter((w: any) => w.week >= startWeek && w.week <= endWeek);
      break;
  }

  return {
    ...planData,
    plan: relevantWeeks,
    _scope: scope,
    _note: `Filtered to ${relevantWeeks.length} week(s) based on question scope: ${scope}`
  };
}
