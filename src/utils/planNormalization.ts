import { parseLocalDate, getDateStringFromDate } from './dateUtils';
import { logger } from './logger';
import { isDateBasedPlan } from './planTypeHelpers';
import { computeProgressPanel, calculateWeeksToRace } from './stepProgressSystem';
import { supabase } from '../lib/supabase';
import type { PlanData, ProgressPanel, WorkoutFeedback } from '../types';

const dayOrder = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

/**
 * This event exists for system observability, not user tracking.
 * Captures how the Steps/Progress Panel system is making decisions to improve coaching logic.
 */
async function emitStepsProgressPanelEvent(
  trainingPlanId: string,
  userId: string,
  progressPanel: ProgressPanel,
  planData: PlanData
): Promise<void> {
  try {
    const weeksToRace = calculateWeeksToRace(planData.race_date);
    const planLengthWeeks = planData.plan?.length ?? null;

    await supabase.from('steps_progress_analytics').insert({
      training_plan_id: trainingPlanId,
      user_id: userId,
      steps_enabled: progressPanel.steps_enabled,
      show_progress_bar: progressPanel.show_progress_bar,
      current_focus: progressPanel.current_focus_name || null,
      reason_codes: progressPanel.reason_codes || null,
      confidence: progressPanel.confidence || null,
      progress_percent: progressPanel.show_progress_bar ? progressPanel.progress_percent : null,
      weeks_to_race: weeksToRace,
      plan_length_weeks: planLengthWeeks
    });
  } catch (error) {
    logger.warn('[Analytics] Failed to emit steps_progress_panel_evaluated', { error });
  }
}

function convertDaysToWeeks(days: any[], startDate: string) {
  if (!days || days.length === 0) return [];

  const sortedDays = [...days].sort((a, b) => {
    const dateA = parseLocalDate(a.date).getTime();
    const dateB = parseLocalDate(b.date).getTime();
    return dateA - dateB;
  });

  const daysMap = new Map<string, any>();
  sortedDays.forEach(day => {
    daysMap.set(day.date, day);
  });

  const firstDate = parseLocalDate(sortedDays[0].date);
  const lastDate = parseLocalDate(sortedDays[sortedDays.length - 1].date);

  const firstDayOfWeek = firstDate.getDay();
  const daysToMonday = firstDayOfWeek === 0 ? 6 : firstDayOfWeek - 1;
  const firstMonday = new Date(firstDate);
  firstMonday.setDate(firstMonday.getDate() - daysToMonday);
  firstMonday.setHours(0, 0, 0, 0);

  const lastDayOfWeek = lastDate.getDay();
  const daysToSunday = lastDayOfWeek === 0 ? 0 : 7 - lastDayOfWeek;
  const lastSunday = new Date(lastDate);
  lastSunday.setDate(lastSunday.getDate() + daysToSunday);
  lastSunday.setHours(0, 0, 0, 0);

  const weeks: any[] = [];
  let currentMonday = new Date(firstMonday);
  let weekNumber = 1;

  while (currentMonday <= lastSunday) {
    const weekDays: any = {};

    for (let i = 0; i < 7; i++) {
      const currentDate = new Date(currentMonday);
      currentDate.setDate(currentDate.getDate() + i);
      const dateString = getDateStringFromDate(currentDate);
      const dayName = dayOrder[i];

      if (daysMap.has(dateString)) {
        const dayData = daysMap.get(dateString)!;
        weekDays[dayName] = {
          workout: dayData.workout,
          tips: dayData.tips || [],
          date: dateString,
          workoutType: dayData.workoutType,
          calibrationTag: dayData.calibrationTag
        };
      } else {
        weekDays[dayName] = {
          workout: 'Rest',
          tips: [],
          date: dateString,
          workoutType: undefined,
          calibrationTag: undefined
        };
      }
    }

    weeks.push({
      week: weekNumber,
      days: weekDays
    });

    weekNumber++;
    currentMonday.setDate(currentMonday.getDate() + 7);
  }

  return weeks;
}

function deepEqual(obj1: any, obj2: any): boolean {
  if (obj1 === obj2) return true;

  if (obj1 == null || obj2 == null) return false;
  if (typeof obj1 !== 'object' || typeof obj2 !== 'object') return false;

  const keys1 = Object.keys(obj1);
  const keys2 = Object.keys(obj2);

  if (keys1.length !== keys2.length) return false;

  for (const key of keys1) {
    if (!keys2.includes(key)) return false;
    if (!deepEqual(obj1[key], obj2[key])) return false;
  }

  return true;
}

export interface NormalizationResult {
  planData: PlanData;
  wasNormalized: boolean;
  originalWeeksCount: number;
  normalizedWeeksCount: number;
  originalDaysCount: number;
  normalizedDaysCount: number;
  firstWeekHasAllDays: boolean;
  missingWeek1Days: string[];
  invariantFailCount: number;
  progressPanel?: ProgressPanel;
}

function getCurrentWeekNumber(startDate: string | null): number {
  if (!startDate) return 1;

  try {
    const start = parseLocalDate(startDate);
    const now = new Date();
    now.setHours(0, 0, 0, 0);

    const diffTime = now.getTime() - start.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    const weekNumber = Math.floor(diffDays / 7) + 1;

    return Math.max(1, weekNumber);
  } catch (error) {
    logger.warn('[Normalization] Failed to calculate current week', { error, startDate });
    return 1;
  }
}

export function computeProgressPanelForPlan(
  planData: PlanData,
  startDate: string | null,
  allFeedback: WorkoutFeedback[] = []
): ProgressPanel | undefined {
  if (!planData.steps_meta) {
    return undefined;
  }

  const currentWeekNumber = getCurrentWeekNumber(startDate);
  const raceDate = planData.race_date;

  return computeProgressPanel(
    planData.steps_meta,
    currentWeekNumber,
    allFeedback,
    raceDate,
    startDate || undefined
  );
}

export function normalizeDateBasedPlan(
  planData: PlanData,
  startDate: string | null,
  planId?: string | null,
  userId?: string,
  allFeedback?: WorkoutFeedback[]
): NormalizationResult {
  const logContext = {
    planId: planId || 'unknown',
    userId: userId || 'unknown',
    planType: planData.plan_type
  };

  if (!isDateBasedPlan(planData)) {
    logger.info('[Normalization] Skipping non-date-based plan', logContext);
    const progressPanel = computeProgressPanelForPlan(planData, startDate, allFeedback);

    if (progressPanel && planId && userId) {
      emitStepsProgressPanelEvent(planId, userId, progressPanel, planData).catch(() => {});
    }

    return {
      planData,
      wasNormalized: false,
      originalWeeksCount: planData.plan?.length || 0,
      normalizedWeeksCount: planData.plan?.length || 0,
      originalDaysCount: 0,
      normalizedDaysCount: 0,
      firstWeekHasAllDays: false,
      missingWeek1Days: [],
      invariantFailCount: 0,
      progressPanel
    };
  }

  if (!planData.days || !Array.isArray(planData.days) || planData.days.length === 0) {
    logger.warn('[Normalization] No days array found', { ...logContext, hasDays: !!planData.days });
    const progressPanel = computeProgressPanelForPlan(planData, startDate, allFeedback);

    if (progressPanel && planId && userId) {
      emitStepsProgressPanelEvent(planId, userId, progressPanel, planData).catch(() => {});
    }

    return {
      planData,
      wasNormalized: false,
      originalWeeksCount: planData.plan?.length || 0,
      normalizedWeeksCount: planData.plan?.length || 0,
      originalDaysCount: 0,
      normalizedDaysCount: 0,
      firstWeekHasAllDays: false,
      missingWeek1Days: [],
      invariantFailCount: 0,
      progressPanel
    };
  }

  if (!startDate) {
    logger.warn('[Normalization] No start_date provided', logContext);
    const progressPanel = computeProgressPanelForPlan(planData, startDate, allFeedback);

    if (progressPanel && planId && userId) {
      emitStepsProgressPanelEvent(planId, userId, progressPanel, planData).catch(() => {});
    }

    return {
      planData,
      wasNormalized: false,
      originalWeeksCount: planData.plan?.length || 0,
      normalizedWeeksCount: planData.plan?.length || 0,
      originalDaysCount: planData.days.length,
      normalizedDaysCount: planData.days.length,
      firstWeekHasAllDays: false,
      missingWeek1Days: [],
      invariantFailCount: 0,
      progressPanel
    };
  }

  const originalWeeksCount = planData.plan?.length || 0;
  const originalDaysCount = planData.days.length;

  logger.info('[Normalization] Starting normalization', {
    ...logContext,
    originalWeeksCount,
    originalDaysCount,
    startDate
  });

  try {
    const sortedDays = [...planData.days].sort((a, b) => {
      const dateA = parseLocalDate(a.date).getTime();
      const dateB = parseLocalDate(b.date).getTime();
      return dateA - dateB;
    });

    const normalizedPlan = convertDaysToWeeks(sortedDays, startDate);

    if (normalizedPlan.length === 0) {
      logger.error('[Normalization] Generated 0 weeks - ABORTING', {
        ...logContext,
        originalWeeksCount,
        sortedDaysCount: sortedDays.length
      });
      const progressPanel = computeProgressPanelForPlan(planData, startDate, allFeedback);

      if (progressPanel && planId && userId) {
        emitStepsProgressPanelEvent(planId, userId, progressPanel, planData).catch(() => {});
      }

      return {
        planData,
        wasNormalized: false,
        originalWeeksCount,
        normalizedWeeksCount: 0,
        originalDaysCount,
        normalizedDaysCount: sortedDays.length,
        firstWeekHasAllDays: false,
        missingWeek1Days: [],
        invariantFailCount: 0,
        progressPanel
      };
    }

    const firstWeekDays = normalizedPlan[0]?.days || {};
    const firstWeekDayKeys = Object.keys(firstWeekDays);
    const allDaysPresent = dayOrder.every(day => firstWeekDayKeys.includes(day));
    const missingDays = dayOrder.filter(day => !firstWeekDayKeys.includes(day));

    if (!allDaysPresent) {
      logger.error('[INVARIANT FAIL] Week 1 missing days', {
        ...logContext,
        presentDays: firstWeekDayKeys,
        missingDays,
        weekDaysCount: firstWeekDayKeys.length
      });
    }

    const daysMap = new Map<string, string>();
    sortedDays.forEach(day => {
      daysMap.set(day.date, day.workout);
    });

    let invariantFailCount = 0;
    normalizedPlan.forEach((week, weekIdx) => {
      Object.entries(week.days || {}).forEach(([dayName, dayData]: [string, any]) => {
        if (dayData.workout !== 'Rest' && dayData.date) {
          const expectedWorkout = daysMap.get(dayData.date);
          if (!expectedWorkout) {
            logger.error('[INVARIANT FAIL] Week view has workout not in days[]', {
              ...logContext,
              weekNumber: week.week,
              dayName,
              date: dayData.date,
              workout: dayData.workout
            });
            invariantFailCount++;
          } else if (expectedWorkout !== dayData.workout) {
            logger.error('[INVARIANT FAIL] Workout mismatch', {
              ...logContext,
              weekNumber: week.week,
              dayName,
              date: dayData.date,
              expectedWorkout,
              actualWorkout: dayData.workout
            });
            invariantFailCount++;
          }
        }
      });
    });

    const normalizedPlanData = {
      ...planData,
      plan: normalizedPlan
    };

    const hasChanged = !deepEqual(planData.plan, normalizedPlan);

    const normalizedWeeksCount = normalizedPlan.length;
    const normalizedDaysInWeeks = normalizedPlan.reduce((total, week) => {
      return total + Object.keys(week.days || {}).length;
    }, 0);

    logger.info('[Normalization] Normalization complete', {
      ...logContext,
      wasNormalized: hasChanged,
      originalWeeksCount,
      normalizedWeeksCount,
      originalDaysCount,
      normalizedDaysCount: normalizedDaysInWeeks,
      weeksDiff: normalizedWeeksCount - originalWeeksCount,
      daysDiff: normalizedDaysInWeeks - originalDaysCount,
      firstWeekHasAllDays: allDaysPresent,
      missingWeek1Days: missingDays,
      invariantFailCount
    });

    const progressPanel = computeProgressPanelForPlan(normalizedPlanData, startDate, allFeedback);

    if (progressPanel && planId && userId) {
      emitStepsProgressPanelEvent(planId, userId, progressPanel, normalizedPlanData).catch(() => {});
    }

    return {
      planData: normalizedPlanData,
      wasNormalized: hasChanged,
      originalWeeksCount,
      normalizedWeeksCount,
      originalDaysCount,
      normalizedDaysCount: normalizedDaysInWeeks,
      firstWeekHasAllDays: allDaysPresent,
      missingWeek1Days: missingDays,
      invariantFailCount,
      progressPanel
    };

  } catch (error) {
    logger.error('[Normalization] Failed to normalize plan', {
      ...logContext,
      error: error instanceof Error ? error.message : String(error)
    });

    const progressPanel = computeProgressPanelForPlan(planData, startDate, allFeedback);

    if (progressPanel && planId && userId) {
      emitStepsProgressPanelEvent(planId, userId, progressPanel, planData).catch(() => {});
    }

    return {
      planData,
      wasNormalized: false,
      originalWeeksCount,
      normalizedWeeksCount: 0,
      originalDaysCount,
      normalizedDaysCount: 0,
      firstWeekHasAllDays: false,
      missingWeek1Days: [],
      invariantFailCount: 0,
      progressPanel
    };
  }
}
