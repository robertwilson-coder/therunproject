/**
 * Week-to-Days Converter
 *
 * Deterministically converts legacy week-based plan[] format to canonical days[] format.
 * Used for migration-on-read of old plans to ensure backward compatibility.
 */

import { logger } from './logger';
import type { DayWorkoutWithDate } from '../types';
import { parseLocalDate } from './dateUtils';

const DAY_ORDER = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export interface WeekBasedPlan {
  plan: Array<{
    week: number;
    days: {
      [key: string]: {
        workout: string;
        tips?: string[];
        workoutType?: string;
        workout_type?: string;
        calibrationTag?: string;
      };
    };
  }>;
  [key: string]: any;
}

export interface ConversionResult {
  days: DayWorkoutWithDate[];
  success: boolean;
  errors: string[];
  metadata: {
    weeksConverted: number;
    daysGenerated: number;
    startDate: string;
    endDate: string;
  };
}

/**
 * Converts week-based plan[] to days[] format
 */
export function convertWeeksToDays(
  planData: WeekBasedPlan,
  startDate: string
): ConversionResult {
  const errors: string[] = [];
  const days: DayWorkoutWithDate[] = [];

  if (!planData.plan || !Array.isArray(planData.plan)) {
    errors.push('Missing or invalid plan[] array');
    return {
      days: [],
      success: false,
      errors,
      metadata: {
        weeksConverted: 0,
        daysGenerated: 0,
        startDate,
        endDate: startDate
      }
    };
  }

  if (!startDate || !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
    errors.push(`Invalid start_date: ${startDate}`);
    return {
      days: [],
      success: false,
      errors,
      metadata: {
        weeksConverted: 0,
        daysGenerated: 0,
        startDate: startDate || 'unknown',
        endDate: startDate || 'unknown'
      }
    };
  }

  const start = parseLocalDate(startDate);
  let lastDate = startDate;

  logger.info('[WeekToDays] Starting conversion', {
    weeksCount: planData.plan.length,
    startDate
  });

  // Convert each week
  planData.plan.forEach((week, weekIndex) => {
    if (!week.days) {
      errors.push(`Week ${week.week || weekIndex + 1} missing days object`);
      return;
    }

    // Process each day in order (Mon-Sun)
    DAY_ORDER.forEach((dayName, dayIndex) => {
      const dayData = week.days[dayName];

      // Calculate the date for this day
      const daysFromStart = (weekIndex * 7) + dayIndex;
      const date = new Date(start);
      date.setDate(start.getDate() + daysFromStart);
      const dateStr = date.toISOString().split('T')[0];
      lastDate = dateStr;

      // If day doesn't exist in week data, create a Rest day
      if (!dayData || !dayData.workout) {
        days.push({
          date: dateStr,
          dow: dayName,
          workout: 'Rest',
          tips: ['Recovery day'],
          workout_type: 'REST',
          workoutType: 'REST'
        });
        return;
      }

      // Convert day data
      const dayEntry: DayWorkoutWithDate = {
        date: dateStr,
        dow: dayName,
        workout: dayData.workout,
        tips: dayData.tips || []
      };

      // Preserve workout type fields (both variants)
      if (dayData.workoutType) {
        dayEntry.workoutType = dayData.workoutType;
      }
      if (dayData.workout_type) {
        dayEntry.workout_type = dayData.workout_type;
      }

      // Infer workout_type if missing
      if (!dayEntry.workout_type && !dayEntry.workoutType) {
        const workout = dayData.workout.toLowerCase();
        if (workout.includes('race') || workout.includes('🏁')) {
          dayEntry.workout_type = 'RACE';
          dayEntry.workoutType = 'RACE';
        } else if (workout === 'rest' || workout.includes('rest day')) {
          dayEntry.workout_type = 'REST';
          dayEntry.workoutType = 'REST';
        } else {
          dayEntry.workout_type = 'TRAIN';
          dayEntry.workoutType = 'TRAIN';
        }
      }

      // Preserve calibration tag if present
      if (dayData.calibrationTag) {
        dayEntry.calibrationTag = dayData.calibrationTag;
      }

      days.push(dayEntry);
    });
  });

  logger.info('[WeekToDays] Conversion complete', {
    weeksConverted: planData.plan.length,
    daysGenerated: days.length,
    startDate,
    endDate: lastDate,
    errorCount: errors.length
  });

  return {
    days,
    success: errors.length === 0,
    errors,
    metadata: {
      weeksConverted: planData.plan.length,
      daysGenerated: days.length,
      startDate,
      endDate: lastDate
    }
  };
}

/**
 * Checks if a plan_data is in week-based format (legacy)
 */
export function isWeekBasedPlan(planData: any): boolean {
  return !!(planData.plan && Array.isArray(planData.plan) && planData.plan.length > 0);
}

/**
 * Checks if a plan_data is in days-based format (canonical)
 */
export function isDaysBasedPlan(planData: any): boolean {
  return !!(planData.days && Array.isArray(planData.days) && planData.days.length > 0);
}

/**
 * Migrates a week-based plan to days-based format (in-place)
 * Returns a new plan_data object with days[] populated
 */
export function migrateWeekBasedPlan(
  planData: WeekBasedPlan,
  startDate: string
): any {
  logger.info('[MigrateWeekPlan] Starting migration', {
    hasWeeks: isWeekBasedPlan(planData),
    hasDays: isDaysBasedPlan(planData),
    weeksCount: planData.plan?.length || 0,
    daysCount: (planData as any).days?.length || 0,
    startDate
  });

  // If already has days[], keep it (assume it's the source of truth)
  if (isDaysBasedPlan(planData)) {
    logger.info('[MigrateWeekPlan] Plan already has days[], no conversion needed');
    return planData;
  }

  // Convert weeks to days
  const conversion = convertWeeksToDays(planData, startDate);

  if (!conversion.success) {
    logger.error('[MigrateWeekPlan] Conversion failed', {
      errors: conversion.errors
    });
    // Return original plan if conversion fails (safer than losing data)
    return planData;
  }

  // Create new plan_data with days[] as canonical
  const migratedPlan = {
    ...planData,
    days: conversion.days,
    // Keep plan[] for backward compatibility but mark it as deprecated
    _legacy_plan: planData.plan,
    _migration_metadata: {
      migrated_at: new Date().toISOString(),
      original_format: 'week_based',
      weeks_converted: conversion.metadata.weeksConverted,
      days_generated: conversion.metadata.daysGenerated
    }
  };

  logger.info('[MigrateWeekPlan] Migration successful', {
    daysGenerated: conversion.days.length,
    startDate: conversion.metadata.startDate,
    endDate: conversion.metadata.endDate
  });

  return migratedPlan;
}
