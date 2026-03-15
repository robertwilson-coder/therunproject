/**
 * planImpactAnalyzer.ts
 *
 * Detects when user edits significantly reduce training load for a given week,
 * and returns coaching signals so the coach can offer guidance.
 *
 * This module NEVER modifies the plan. It only analyzes and signals.
 * The runner must always confirm any structural changes.
 */

const KM_RE = /(\d+(?:\.\d+)?)\s*km/i;

function extractKm(workout: string): number {
  const m = (workout ?? '').match(KM_RE);
  return m ? parseFloat(m[1]) : 0;
}

function isRestDay(day: any): boolean {
  return !day || day.workout_type === 'REST' || !day.workout || day.workout.toLowerCase().includes('rest');
}

function isLongRun(workout: string): boolean {
  return (workout ?? '').toLowerCase().includes('long run');
}

function isQualityWorkout(workout: string): boolean {
  const lower = (workout ?? '').toLowerCase();
  return (
    lower.includes('interval') ||
    lower.includes('tempo') ||
    lower.includes('threshold') ||
    lower.includes('speed') ||
    lower.includes('fartlek') ||
    lower.includes('repeat') ||
    lower.includes('progression') ||
    lower.includes('race pace')
  );
}

function getWeekBounds(isoDate: string): { mondayMs: number; sundayMs: number } {
  const dow = new Date(isoDate + 'T12:00:00Z').getUTCDay();
  const mondayOffset = dow === 0 ? -6 : 1 - dow;
  const mondayMs = new Date(isoDate + 'T00:00:00Z').getTime() + mondayOffset * 86400000;
  const sundayMs = mondayMs + 7 * 86400000;
  return { mondayMs, sundayMs };
}

function isInWeek(dateStr: string, mondayMs: number, sundayMs: number): boolean {
  const t = new Date(dateStr + 'T00:00:00Z').getTime();
  return t >= mondayMs && t < sundayMs;
}

export type ImpactSignal =
  | 'long_run_removed'
  | 'multiple_sessions_removed'
  | 'large_volume_drop'
  | 'week_training_eliminated'
  | 'quality_removed';

export type ImpactLevel = 'none' | 'moderate' | 'major';
export type RecommendedAction = 'none' | 'fatigue_check';

export interface PlanImpact {
  impactLevel: ImpactLevel;
  signals: ImpactSignal[];
  recommendedAction: RecommendedAction;
  weekVolumeBeforeKm: number;
  weekVolumeAfterKm: number;
  sessionsRemovedThisWeek: number;
}

export interface ImpactAnalysisOptions {
  affectedDate?: string | null;
  todayISO: string;
}

/**
 * Analyzes the impact of a plan action by comparing before/after state.
 *
 * @param daysBefore - The days array before the action was executed
 * @param daysAfter - The days array after the action was executed
 * @param options - Context including the affected date and today's date
 * @returns A PlanImpact object describing training load change signals
 */
export function analyzePlanImpact(
  daysBefore: any[],
  daysAfter: any[],
  options: ImpactAnalysisOptions,
): PlanImpact {
  const { affectedDate, todayISO } = options;

  const referenceDate = affectedDate ?? todayISO;
  const { mondayMs, sundayMs } = getWeekBounds(referenceDate);

  const beforeWeek = daysBefore.filter((d) => isInWeek(d.date, mondayMs, sundayMs));
  const afterWeek = daysAfter.filter((d) => isInWeek(d.date, mondayMs, sundayMs));

  const beforeTrainDays = beforeWeek.filter((d) => !isRestDay(d));
  const afterTrainDays = afterWeek.filter((d) => !isRestDay(d));

  const sessionsRemovedThisWeek = beforeTrainDays.length - afterTrainDays.length;

  const weekVolumeBeforeKm = beforeTrainDays.reduce((sum, d) => sum + extractKm(d.workout ?? ''), 0);
  const weekVolumeAfterKm = afterTrainDays.reduce((sum, d) => sum + extractKm(d.workout ?? ''), 0);

  const hadLongRun = beforeTrainDays.some((d) => isLongRun(d.workout ?? ''));
  const stillHasLongRun = afterTrainDays.some((d) => isLongRun(d.workout ?? ''));
  const longRunRemoved = hadLongRun && !stillHasLongRun;

  const hadQuality = beforeTrainDays.some((d) => isQualityWorkout(d.workout ?? ''));
  const stillHasQuality = afterTrainDays.some((d) => isQualityWorkout(d.workout ?? ''));
  const qualityRemoved = hadQuality && !stillHasQuality;

  const volumeDropPct =
    weekVolumeBeforeKm > 0
      ? (weekVolumeBeforeKm - weekVolumeAfterKm) / weekVolumeBeforeKm
      : 0;

  const signals: ImpactSignal[] = [];

  if (sessionsRemovedThisWeek >= 2) {
    signals.push('multiple_sessions_removed');
  }

  if (volumeDropPct >= 0.30 && weekVolumeBeforeKm > 0) {
    signals.push('large_volume_drop');
  }

  if (longRunRemoved) {
    signals.push('long_run_removed');
  }

  if (qualityRemoved && longRunRemoved) {
    signals.push('week_training_eliminated');
  } else if (qualityRemoved && !signals.includes('multiple_sessions_removed')) {
    signals.push('quality_removed');
  }

  let impactLevel: ImpactLevel = 'none';
  if (signals.length === 1) {
    impactLevel = 'moderate';
  } else if (signals.length >= 2) {
    impactLevel = 'major';
  }

  const recommendedAction: RecommendedAction =
    impactLevel !== 'none' ? 'fatigue_check' : 'none';

  return {
    impactLevel,
    signals,
    recommendedAction,
    weekVolumeBeforeKm: Math.round(weekVolumeBeforeKm * 10) / 10,
    weekVolumeAfterKm: Math.round(weekVolumeAfterKm * 10) / 10,
    sessionsRemovedThisWeek,
  };
}

export interface PlanState {
  longRunExists: boolean;
  qualitySessionExists: boolean;
  easyRunsRemaining: number;
  weeklyVolumeKm: number;
}

export function derivePlanState(weekDays: any[]): PlanState {
  const trainingDays = weekDays.filter((d) => !isRestDay(d));
  return {
    longRunExists: trainingDays.some((d) => isLongRun(d.workout ?? '')),
    qualitySessionExists: trainingDays.some((d) => isQualityWorkout(d.workout ?? '')),
    easyRunsRemaining: trainingDays.filter(
      (d) => !isLongRun(d.workout ?? '') && !isQualityWorkout(d.workout ?? ''),
    ).length,
    weeklyVolumeKm: trainingDays.reduce((sum, d) => sum + extractKm(d.workout ?? ''), 0),
  };
}

export function actionPreconditions(
  action: 'L2_SOFTEN_WEEK' | 'L3_REDUCE_WEEK' | 'L4_INSERT_RECOVERY_WEEK',
  state: PlanState,
): boolean {
  switch (action) {
    case 'L2_SOFTEN_WEEK':
      return state.qualitySessionExists || state.longRunExists;
    case 'L3_REDUCE_WEEK':
      return state.weeklyVolumeKm > 0;
    case 'L4_INSERT_RECOVERY_WEEK':
      return true;
  }
}

/**
 * Builds a coaching follow-up message to append after the action confirmation
 * when the impact is moderate or major.
 *
 * Only presents options whose preconditions are satisfied given the post-action plan state.
 * This does NOT modify the plan. It returns text for the coach to deliver.
 *
 * ISSUE B FIX: Removed italic formatting and "Training load impact detected:" label.
 * Options are now short and consistent plain text.
 */
export function buildImpactCoachingNote(impact: PlanImpact, postActionDays?: any[]): string {
  if (impact.recommendedAction !== 'fatigue_check') return '';

  const lines: string[] = [];

  if (impact.impactLevel === 'major') {
    if (impact.signals.includes('week_training_eliminated')) {
      lines.push(
        "That removes most of this week's training stimulus.",
      );
    } else if (
      impact.signals.includes('multiple_sessions_removed') &&
      impact.signals.includes('long_run_removed')
    ) {
      lines.push(
        `That removes ${impact.sessionsRemovedThisWeek} sessions including the long run.`,
      );
    } else if (impact.signals.includes('large_volume_drop')) {
      const dropKm = Math.round((impact.weekVolumeBeforeKm - impact.weekVolumeAfterKm) * 10) / 10;
      lines.push(
        `That drops this week's volume by around ${dropKm} km.`,
      );
    } else {
      lines.push("That reduces this week's training load significantly.");
    }
  } else {
    if (impact.signals.includes('long_run_removed')) {
      lines.push("That removes this week's long run.");
    } else if (impact.signals.includes('multiple_sessions_removed')) {
      lines.push(
        `That removes ${impact.sessionsRemovedThisWeek} sessions from this week.`,
      );
    } else if (impact.signals.includes('large_volume_drop')) {
      lines.push("That reduces this week's volume quite a bit.");
    } else {
      lines.push("That reduces your training load this week.");
    }
  }

  const state = postActionDays ? derivePlanState(postActionDays) : null;

  const candidateActions: Array<'L2_SOFTEN_WEEK' | 'L3_REDUCE_WEEK' | 'L4_INSERT_RECOVERY_WEEK'> = [
    'L2_SOFTEN_WEEK',
    'L3_REDUCE_WEEK',
    'L4_INSERT_RECOVERY_WEEK',
  ];

  const availableActions = state
    ? candidateActions.filter((action) => actionPreconditions(action, state))
    : candidateActions;

  lines.push('');
  lines.push('Would you like to adjust this week further?');
  lines.push('');
  lines.push("1. Leave it as edited");

  let optionIndex = 2;
  if (availableActions.includes('L4_INSERT_RECOVERY_WEEK')) {
    lines.push(`${optionIndex}. Convert to a structured recovery week`);
    optionIndex++;
  }
  if (availableActions.includes('L2_SOFTEN_WEEK')) {
    lines.push(`${optionIndex}. Soften the remaining sessions`);
    optionIndex++;
  }
  if (availableActions.includes('L3_REDUCE_WEEK')) {
    lines.push(`${optionIndex}. Reduce the remaining sessions slightly`);
  }

  return lines.join('\n');
}
