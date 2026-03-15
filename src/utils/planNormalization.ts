import { parseLocalDate, getDateStringFromDate, getMondayOfWeek } from './dateUtils';
import { logger } from './logger';
import { isDateBasedPlan } from './planTypeHelpers';
import { computeProgressPanel, calculateWeeksToRace } from './stepProgressSystem';
import { supabase } from '../lib/supabase';
import { isWeekBasedPlan, convertWeeksToDays } from './weekToDaysConverter';
import type { PlanData, ProgressPanel, WorkoutFeedback } from '../types';

const DAY_ORDER = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
type DayName = typeof DAY_ORDER[number];

const CANONICAL_DAY_FIELDS = ['workout', 'tips', 'date', 'workout_type', 'workoutType'] as const;

interface CanonicalDayObject {
  workout: string;
  tips: string[];
  date: string;
  workout_type?: 'TRAIN' | 'REST' | 'RACE';
  workoutType?: string;
  calibrationTag?: string;
  [key: string]: unknown;
}

interface WeekStructure {
  week: number;
  days: Record<DayName, CanonicalDayObject>;
}

export interface NormalizationResult {
  planData: PlanData;
  wasConvertedFromWeekBased: boolean;
  planStructureChanged: boolean;
  needsPersistence: boolean;
  canonicalDaysCount: number;
  derivedWeekSlotsCount: number;
  weeksCount: number;
  firstWeekHasAllDays: boolean;
  missingWeek1Days: string[];
  invariantFailures: string[];
  progressPanel?: ProgressPanel;
  wasNormalized: boolean;
}

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

function normalizeWorkoutField(workout: unknown): string {
  if (workout === null || workout === undefined) return 'Rest';
  if (typeof workout !== 'string') return 'Rest';
  const trimmed = workout.trim();
  if (trimmed === '' || trimmed.toLowerCase() === 'rest') return 'Rest';
  return trimmed;
}

function normalizeTipsField(tips: unknown): string[] {
  if (!tips) return [];
  if (Array.isArray(tips)) return tips.filter(t => typeof t === 'string');
  return [];
}

function buildCanonicalDayObject(sourceDayData: Record<string, unknown>, dateString: string): CanonicalDayObject {
  const normalizedWorkout = normalizeWorkoutField(sourceDayData.workout);
  const normalizedTips = normalizeTipsField(sourceDayData.tips);

  const result: CanonicalDayObject = {
    ...sourceDayData,
    workout: normalizedWorkout,
    tips: normalizedTips,
    date: dateString,
  };

  if (sourceDayData.workout_type !== undefined) {
    result.workout_type = sourceDayData.workout_type as 'TRAIN' | 'REST' | 'RACE';
  }
  if (sourceDayData.workoutType !== undefined) {
    result.workoutType = sourceDayData.workoutType as string;
  }
  if (sourceDayData.calibrationTag !== undefined) {
    result.calibrationTag = sourceDayData.calibrationTag as string;
  }

  return result;
}

function buildPlaceholderDay(dateString: string): CanonicalDayObject {
  return {
    workout: 'Rest',
    tips: [],
    date: dateString,
    workout_type: undefined,
    workoutType: undefined,
    calibrationTag: undefined,
  };
}

function convertDaysToWeeks(days: CanonicalDayObject[], startDate: string): WeekStructure[] {
  if (!days || days.length === 0) return [];

  const sortedDays = [...days].sort((a, b) => {
    const dateA = parseLocalDate(a.date).getTime();
    const dateB = parseLocalDate(b.date).getTime();
    return dateA - dateB;
  });

  const daysMap = new Map<string, CanonicalDayObject>();
  for (const day of sortedDays) {
    daysMap.set(day.date, day);
  }

  const planStartDate = parseLocalDate(startDate);
  const firstMonday = getMondayOfWeek(planStartDate);
  firstMonday.setHours(0, 0, 0, 0);

  const lastDayDate = parseLocalDate(sortedDays[sortedDays.length - 1].date);
  const lastDayOfWeek = lastDayDate.getDay();
  const daysToSunday = lastDayOfWeek === 0 ? 0 : 7 - lastDayOfWeek;
  const lastSunday = new Date(lastDayDate);
  lastSunday.setDate(lastDayDate.getDate() + daysToSunday);
  lastSunday.setHours(0, 0, 0, 0);

  const weeks: WeekStructure[] = [];
  let currentMonday = new Date(firstMonday);
  let weekNumber = 1;

  while (currentMonday <= lastSunday) {
    const weekDays: Record<string, CanonicalDayObject> = {};

    for (let i = 0; i < 7; i++) {
      const currentDate = new Date(currentMonday);
      currentDate.setDate(currentMonday.getDate() + i);
      const dateString = getDateStringFromDate(currentDate);
      const dayName = DAY_ORDER[i];

      if (daysMap.has(dateString)) {
        const sourceDayData = daysMap.get(dateString)!;
        weekDays[dayName] = buildCanonicalDayObject(sourceDayData as Record<string, unknown>, dateString);
      } else {
        weekDays[dayName] = buildPlaceholderDay(dateString);
      }
    }

    weeks.push({
      week: weekNumber,
      days: weekDays as Record<DayName, CanonicalDayObject>,
    });

    weekNumber++;
    currentMonday.setDate(currentMonday.getDate() + 7);
  }

  return weeks;
}

function computeWeekStructureHash(plan: WeekStructure[]): string {
  if (!plan || plan.length === 0) return '';

  const normalized = plan.map(week => ({
    week: week.week,
    days: DAY_ORDER.reduce((acc, dayName) => {
      const day = week.days?.[dayName];
      acc[dayName] = day ? {
        date: day.date,
        workout: day.workout,
        tips: day.tips,
      } : null;
      return acc;
    }, {} as Record<string, unknown>),
  }));

  return JSON.stringify(normalized);
}

function deepCloneArray<T>(arr: T[]): T[] {
  return JSON.parse(JSON.stringify(arr));
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

function validateInvariants(
  originalDays: CanonicalDayObject[],
  derivedPlan: WeekStructure[],
  daysAfterNormalization: CanonicalDayObject[],
  logContext: Record<string, unknown>
): string[] {
  const failures: string[] = [];

  const originalDaysJson = JSON.stringify(originalDays.map(d => ({ date: d.date, workout: d.workout })));
  const afterDaysJson = JSON.stringify(daysAfterNormalization.map(d => ({ date: d.date, workout: d.workout })));

  if (originalDaysJson !== afterDaysJson) {
    failures.push('CRITICAL: days[] was mutated during normalization');
    logger.error('[Normalization] INVARIANT VIOLATION: days[] was mutated', {
      ...logContext,
      originalSample: originalDaysJson.substring(0, 200),
      afterSample: afterDaysJson.substring(0, 200),
    });
  }

  const daysMap = new Map<string, string>();
  for (const day of originalDays) {
    daysMap.set(day.date, day.workout);
  }

  for (const week of derivedPlan) {
    const dayKeys = Object.keys(week.days || {});
    const missingDays = DAY_ORDER.filter(d => !dayKeys.includes(d));

    if (missingDays.length > 0) {
      const msg = `Week ${week.week} missing day slots: ${missingDays.join(', ')}`;
      failures.push(msg);
      logger.error('[Normalization] INVARIANT VIOLATION: incomplete week', {
        ...logContext,
        weekNumber: week.week,
        presentDays: dayKeys,
        missingDays,
      });
    }

    for (const [dayName, dayData] of Object.entries(week.days || {})) {
      const typedDayData = dayData as CanonicalDayObject;
      if (!typedDayData.date) {
        failures.push(`Week ${week.week} ${dayName}: missing date field`);
        continue;
      }

      const canonicalWorkout = daysMap.get(typedDayData.date);

      if (canonicalWorkout !== undefined) {
        const normalizedCanonical = normalizeWorkoutField(canonicalWorkout);
        if (typedDayData.workout !== normalizedCanonical) {
          const msg = `Week ${week.week} ${dayName} (${typedDayData.date}): workout mismatch - expected "${normalizedCanonical}", got "${typedDayData.workout}"`;
          failures.push(msg);
          logger.error('[Normalization] INVARIANT VIOLATION: workout mismatch', {
            ...logContext,
            weekNumber: week.week,
            dayName,
            date: typedDayData.date,
            expected: normalizedCanonical,
            actual: typedDayData.workout,
          });
        }
      } else {
        if (typedDayData.workout !== 'Rest') {
          const msg = `Week ${week.week} ${dayName} (${typedDayData.date}): placeholder day has non-Rest workout "${typedDayData.workout}"`;
          failures.push(msg);
        }
      }
    }
  }

  let derivedDatesCount = 0;
  const derivedDatesSet = new Set<string>();
  for (const week of derivedPlan) {
    for (const dayData of Object.values(week.days || {})) {
      const typedDayData = dayData as CanonicalDayObject;
      if (typedDayData.date) {
        derivedDatesSet.add(typedDayData.date);
        derivedDatesCount++;
      }
    }
  }

  for (const day of originalDays) {
    if (!derivedDatesSet.has(day.date)) {
      const msg = `days[] entry "${day.date}" not found in any derived week slot`;
      failures.push(msg);
      logger.error('[Normalization] INVARIANT VIOLATION: orphaned day', {
        ...logContext,
        orphanedDate: day.date,
        orphanedWorkout: day.workout,
      });
    }
  }

  return failures;
}

function createEmptyResult(
  planData: PlanData,
  startDate: string | null,
  allFeedback?: WorkoutFeedback[],
  planId?: string | null,
  userId?: string
): NormalizationResult {
  const progressPanel = computeProgressPanelForPlan(planData, startDate, allFeedback);

  if (progressPanel && planId && userId) {
    emitStepsProgressPanelEvent(planId, userId, progressPanel, planData).catch(() => {});
  }

  return {
    planData,
    wasConvertedFromWeekBased: false,
    planStructureChanged: false,
    needsPersistence: false,
    canonicalDaysCount: (planData as any).days?.length || 0,
    derivedWeekSlotsCount: 0,
    weeksCount: planData.plan?.length || 0,
    firstWeekHasAllDays: false,
    missingWeek1Days: [],
    invariantFailures: [],
    progressPanel,
    wasNormalized: false,
  };
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
    planType: planData.plan_type,
  };

  let workingPlanData = planData;
  let wasConvertedFromWeekBased = false;

  if (isWeekBasedPlan(planData) && (!planData.days || planData.days.length === 0) && startDate) {
    logger.info('[Normalization] Detected legacy week-based plan, converting to days[]', {
      ...logContext,
      weeksCount: planData.plan?.length || 0,
      startDate,
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
          days_generated: conversion.metadata.daysGenerated,
        },
      };
      wasConvertedFromWeekBased = true;

      logger.info('[Normalization] Week-based plan converted successfully', {
        ...logContext,
        daysGenerated: conversion.days.length,
        startDate: conversion.metadata.startDate,
        endDate: conversion.metadata.endDate,
      });
    } else {
      logger.error('[Normalization] Failed to convert week-based plan', {
        ...logContext,
        errors: conversion.errors,
      });
      return createEmptyResult(planData, startDate, allFeedback, planId, userId);
    }
  }

  if (!isDateBasedPlan(workingPlanData) && !wasConvertedFromWeekBased) {
    logger.info('[Normalization] Skipping non-date-based plan', logContext);
    return createEmptyResult(workingPlanData, startDate, allFeedback, planId, userId);
  }

  if (!workingPlanData.days || !Array.isArray(workingPlanData.days) || workingPlanData.days.length === 0) {
    logger.warn('[Normalization] No days array found', { ...logContext, hasDays: !!workingPlanData.days });
    return createEmptyResult(workingPlanData, startDate, allFeedback, planId, userId);
  }

  if (!startDate) {
    logger.warn('[Normalization] No start_date provided', logContext);
    return createEmptyResult(workingPlanData, startDate, allFeedback, planId, userId);
  }

  const canonicalDaysCount = workingPlanData.days.length;
  const originalPlanHash = computeWeekStructureHash(workingPlanData.plan as WeekStructure[] || []);

  const originalDaysSnapshot = deepCloneArray(workingPlanData.days as CanonicalDayObject[]);

  logger.info('[Normalization] Starting normalization', {
    ...logContext,
    canonicalDaysCount,
    existingWeeksCount: workingPlanData.plan?.length || 0,
    startDate,
    wasConvertedFromWeekBased,
    sampleDays: workingPlanData.days.slice(0, 3).map((d: any) => ({
      date: d.date,
      workout: d.workout?.substring?.(0, 30) || d.workout,
    })),
  });

  try {
    const sortedDays = [...workingPlanData.days].sort((a, b) => {
      const dateA = parseLocalDate((a as any).date).getTime();
      const dateB = parseLocalDate((b as any).date).getTime();
      return dateA - dateB;
    });

    const derivedPlan = convertDaysToWeeks(sortedDays as CanonicalDayObject[], startDate);

    if (derivedPlan.length === 0) {
      logger.error('[Normalization] Generated 0 weeks - ABORTING', {
        ...logContext,
        sortedDaysCount: sortedDays.length,
      });
      return createEmptyResult(workingPlanData, startDate, allFeedback, planId, userId);
    }

    const invariantFailures = validateInvariants(
      originalDaysSnapshot,
      derivedPlan,
      workingPlanData.days as CanonicalDayObject[],
      logContext
    );

    const firstWeekDays = derivedPlan[0]?.days || {};
    const firstWeekDayKeys = Object.keys(firstWeekDays);
    const allDaysPresent = DAY_ORDER.every(day => firstWeekDayKeys.includes(day));
    const missingDays = DAY_ORDER.filter(day => !firstWeekDayKeys.includes(day));

    const derivedPlanHash = computeWeekStructureHash(derivedPlan);
    const planStructureChanged = originalPlanHash !== derivedPlanHash;

    const needsPersistence = wasConvertedFromWeekBased || planStructureChanged;

    const normalizedPlanData = {
      ...workingPlanData,
      plan: derivedPlan,
    };

    const derivedWeekSlotsCount = derivedPlan.reduce((total, week) => {
      return total + Object.keys(week.days || {}).length;
    }, 0);

    logger.info('[Normalization] Normalization complete', {
      ...logContext,
      wasConvertedFromWeekBased,
      planStructureChanged,
      needsPersistence,
      canonicalDaysCount,
      derivedWeekSlotsCount,
      weeksCount: derivedPlan.length,
      firstWeekHasAllDays: allDaysPresent,
      missingWeek1Days: missingDays,
      invariantFailCount: invariantFailures.length,
    });

    const progressPanel = computeProgressPanelForPlan(normalizedPlanData, startDate, allFeedback);

    if (progressPanel && planId && userId) {
      emitStepsProgressPanelEvent(planId, userId, progressPanel, normalizedPlanData).catch(() => {});
    }

    return {
      planData: normalizedPlanData,
      wasConvertedFromWeekBased,
      planStructureChanged,
      needsPersistence,
      canonicalDaysCount,
      derivedWeekSlotsCount,
      weeksCount: derivedPlan.length,
      firstWeekHasAllDays: allDaysPresent,
      missingWeek1Days: missingDays,
      invariantFailures,
      progressPanel,
      wasNormalized: wasConvertedFromWeekBased || planStructureChanged,
    };
  } catch (error) {
    logger.error('[Normalization] Failed to normalize plan', {
      ...logContext,
      error: error instanceof Error ? error.message : String(error),
    });

    return createEmptyResult(planData, startDate, allFeedback, planId, userId);
  }
}

export function testIdempotence(
  planData: PlanData,
  startDate: string
): { isIdempotent: boolean; firstHash: string; secondHash: string } {
  const firstResult = normalizeDateBasedPlan(planData, startDate);
  const secondResult = normalizeDateBasedPlan(firstResult.planData, startDate);

  const firstHash = computeWeekStructureHash(firstResult.planData.plan as WeekStructure[]);
  const secondHash = computeWeekStructureHash(secondResult.planData.plan as WeekStructure[]);

  return {
    isIdempotent: firstHash === secondHash && !secondResult.planStructureChanged,
    firstHash,
    secondHash,
  };
}
