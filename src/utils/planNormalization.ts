import { parseLocalDate, getDateStringFromDate } from './dateUtils';
import { logger } from './logger';
import { isDateBasedPlan } from './planTypeHelpers';
import { computeProgressPanel, calculateWeeksToRace } from './stepProgressSystem';
import { supabase } from '../lib/supabase';
import { isWeekBasedPlan, convertWeeksToDays } from './weekToDaysConverter';
import { validateCanonicalDaysPlan } from './planValidator';
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
    // CRITICAL: Store the COMPLETE day object, preserving all fields including workout, workout_type, tips, title, etc.
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
        // CRITICAL: Use the EXACT day object from days[] array - never overwrite existing data
        const dayData = daysMap.get(dateString)!;
        const workout = dayData.workout || 'Rest';
        weekDays[dayName] = {
          workout: workout.trim() === '' ? 'Rest' : workout,
          tips: dayData.tips || [],
          date: dateString,
          workoutType: dayData.workoutType,
          calibrationTag: dayData.calibrationTag,
          // Preserve any other fields that may exist
          ...dayData
        };
      } else {
        // Only add missing dates as Rest days - this is the ADDITIVE-ONLY behavior
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
  needsPersistence: boolean; // Only true if days[] was modified (migration or gap-filling)
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

  // MIGRATION-ON-READ: Convert legacy week-based plans to canonical days[] format
  let workingPlanData = planData;
  let wasConverted = false;

  if (isWeekBasedPlan(planData) && (!planData.days || planData.days.length === 0) && startDate) {
    logger.info('[Normalization] Detected legacy week-based plan, converting to days[]', {
      ...logContext,
      weeksCount: planData.plan?.length || 0,
      startDate
    });

    const conversion = convertWeeksToDays(planData, startDate);

    if (conversion.success && conversion.days.length > 0) {
      workingPlanData = {
        ...planData,
        days: conversion.days,
        _migration_metadata: {
          migrated_at: new Date().toISOString(),
          original_format: 'week_based',
          weeks_converted: conversion.metadata.weeksConverted,
          days_generated: conversion.metadata.daysGenerated
        }
      };
      wasConverted = true;

      logger.info('[Normalization] Week-based plan converted successfully', {
        ...logContext,
        daysGenerated: conversion.days.length,
        startDate: conversion.metadata.startDate,
        endDate: conversion.metadata.endDate
      });
    } else {
      logger.error('[Normalization] Failed to convert week-based plan', {
        ...logContext,
        errors: conversion.errors
      });
      // Fall back to original behavior if conversion fails
    }
  }

  if (!isDateBasedPlan(workingPlanData) && !wasConverted) {
    logger.info('[Normalization] Skipping non-date-based plan', logContext);
    const progressPanel = computeProgressPanelForPlan(workingPlanData, startDate, allFeedback);

    if (progressPanel && planId && userId) {
      emitStepsProgressPanelEvent(planId, userId, progressPanel, workingPlanData).catch(() => {});
    }

    return {
      planData: workingPlanData,
      wasNormalized: false,
      needsPersistence: false,
      originalWeeksCount: workingPlanData.plan?.length || 0,
      normalizedWeeksCount: workingPlanData.plan?.length || 0,
      originalDaysCount: 0,
      normalizedDaysCount: 0,
      firstWeekHasAllDays: false,
      missingWeek1Days: [],
      invariantFailCount: 0,
      progressPanel
    };
  }

  if (!workingPlanData.days || !Array.isArray(workingPlanData.days) || workingPlanData.days.length === 0) {
    logger.warn('[Normalization] No days array found', { ...logContext, hasDays: !!workingPlanData.days });
    const progressPanel = computeProgressPanelForPlan(workingPlanData, startDate, allFeedback);

    if (progressPanel && planId && userId) {
      emitStepsProgressPanelEvent(planId, userId, progressPanel, workingPlanData).catch(() => {});
    }

    return {
      planData: workingPlanData,
      wasNormalized: false,
      needsPersistence: false,
      originalWeeksCount: workingPlanData.plan?.length || 0,
      normalizedWeeksCount: workingPlanData.plan?.length || 0,
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
    const progressPanel = computeProgressPanelForPlan(workingPlanData, startDate, allFeedback);

    if (progressPanel && planId && userId) {
      emitStepsProgressPanelEvent(planId, userId, progressPanel, workingPlanData).catch(() => {});
    }

    return {
      planData: workingPlanData,
      wasNormalized: false,
      needsPersistence: false,
      originalWeeksCount: workingPlanData.plan?.length || 0,
      normalizedWeeksCount: workingPlanData.plan?.length || 0,
      originalDaysCount: workingPlanData.days.length,
      normalizedDaysCount: workingPlanData.days.length,
      firstWeekHasAllDays: false,
      missingWeek1Days: [],
      invariantFailCount: 0,
      progressPanel
    };
  }

  const originalWeeksCount = workingPlanData.plan?.length || 0;
  const originalDaysCount = workingPlanData.days.length;

  // DIAGNOSTIC: Create a hash of the days[] array to detect if it gets modified
  const originalDaysHash = JSON.stringify(
    workingPlanData.days.map((d: any) => ({ date: d.date, workout: d.workout }))
  );

  logger.info('[Normalization] Starting normalization', {
    ...logContext,
    originalWeeksCount,
    originalDaysCount,
    startDate,
    wasConverted,
    sampleDays: workingPlanData.days.slice(0, 3).map((d: any) => ({ date: d.date, workout: d.workout?.substring(0, 30) }))
  });

  try {
    const sortedDays = [...workingPlanData.days].sort((a, b) => {
      const dateA = parseLocalDate(a.date).getTime();
      const dateB = parseLocalDate(b.date).getTime();
      return dateA - dateB;
    });

    const normalizedPlan = convertDaysToWeeks(sortedDays, startDate);

    // CRITICAL VERIFICATION: Ensure days[] array was NOT modified during week conversion
    const finalDaysHash = JSON.stringify(
      workingPlanData.days.map((d: any) => ({ date: d.date, workout: d.workout }))
    );

    if (originalDaysHash !== finalDaysHash) {
      logger.error('[Normalization] CRITICAL: days[] array was modified during normalization!', {
        ...logContext,
        originalHash: originalDaysHash.substring(0, 100),
        finalHash: finalDaysHash.substring(0, 100)
      });
    }

    if (normalizedPlan.length === 0) {
      logger.error('[Normalization] Generated 0 weeks - ABORTING', {
        ...logContext,
        originalWeeksCount,
        sortedDaysCount: sortedDays.length
      });
      const progressPanel = computeProgressPanelForPlan(workingPlanData, startDate, allFeedback);

      if (progressPanel && planId && userId) {
        emitStepsProgressPanelEvent(planId, userId, progressPanel, workingPlanData).catch(() => {});
      }

      return {
        planData: workingPlanData,
        wasNormalized: false,
        needsPersistence: false,
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
      ...workingPlanData,
      plan: normalizedPlan
      // CRITICAL: days[] array is NEVER modified - only the plan (weeks view) is rebuilt
    };

    const hasChanged = wasConverted || !deepEqual(workingPlanData.plan, normalizedPlan);

    // CRITICAL: Only persist if we modified the days[] array (migration)
    // Rebuilding the weeks view from days[] is NOT destructive and should NOT trigger persistence
    const needsPersistence = wasConverted;

    // VERIFICATION: Confirm the days[] array is preserved exactly
    if (normalizedPlanData.days !== workingPlanData.days) {
      logger.error('[Normalization] CRITICAL: days[] array reference was changed!', {
        ...logContext,
        originalDaysLength: workingPlanData.days.length,
        normalizedDaysLength: normalizedPlanData.days?.length || 0
      });
    }

    const normalizedWeeksCount = normalizedPlan.length;
    const normalizedDaysInWeeks = normalizedPlan.reduce((total, week) => {
      return total + Object.keys(week.days || {}).length;
    }, 0);

    logger.info('[Normalization] Normalization complete', {
      ...logContext,
      wasNormalized: hasChanged,
      needsPersistence,
      wasConverted,
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
      needsPersistence,
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
      needsPersistence: false,
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
