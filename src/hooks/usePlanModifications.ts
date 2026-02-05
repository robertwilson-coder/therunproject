import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { logger } from '../utils/logger';
import { parseLocalDate, getDateStringFromDate } from '../utils/dateUtils';
import { isDateBasedPlan } from '../utils/planTypeHelpers';

interface UsePlanModificationsProps {
  planData: any;
  onUpdatePlan: (updatedPlan: any) => void;
  savedPlanId?: string | null;
  userId?: string;
}

const dayOrder = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

function validateDaysArrayInvariants(days: any[], operation: string): boolean {
  if (!days || !Array.isArray(days) || days.length === 0) {
    logger.error(`[validateDaysArrayInvariants] Invalid days array after ${operation}`);
    return false;
  }

  // Check for duplicate dates
  const dates = new Set<string>();
  for (const day of days) {
    if (!day.date) {
      logger.error(`[validateDaysArrayInvariants] Day missing date after ${operation}`, day);
      return false;
    }
    if (dates.has(day.date)) {
      logger.error(`[validateDaysArrayInvariants] Duplicate date after ${operation}:`, day.date);
      return false;
    }
    dates.add(day.date);
  }

  // Check that days are in chronological order
  for (let i = 1; i < days.length; i++) {
    const prevDate = parseLocalDate(days[i - 1].date);
    const currDate = parseLocalDate(days[i].date);
    if (currDate < prevDate) {
      logger.error(`[validateDaysArrayInvariants] Days not in chronological order after ${operation}`, {
        prevDate: days[i - 1].date,
        currDate: days[i].date
      });
      return false;
    }
  }

  logger.info(`[validateDaysArrayInvariants] Days array valid after ${operation}`, {
    daysCount: days.length,
    dateRange: `${days[0].date} to ${days[days.length - 1].date}`
  });
  return true;
}

function convertDaysToWeeks(days: any[], startDate: string) {
  if (!days || days.length === 0) return [];

  // Sort days chronologically (CRITICAL: prevents order-dependent bugs)
  const sortedDays = [...days].sort((a, b) => {
    const dateA = parseLocalDate(a.date).getTime();
    const dateB = parseLocalDate(b.date).getTime();
    return dateA - dateB;
  });

  // Create a map of date string -> day data for O(1) lookup
  const daysMap = new Map<string, any>();
  sortedDays.forEach(day => {
    daysMap.set(day.date, day);
  });

  // Get first and last dates in the plan
  const firstDate = parseLocalDate(sortedDays[0].date);
  const lastDate = parseLocalDate(sortedDays[sortedDays.length - 1].date);

  // Find the Monday of the week containing the first date (ISO week standard)
  const firstDayOfWeek = firstDate.getDay();
  const daysToMonday = firstDayOfWeek === 0 ? 6 : firstDayOfWeek - 1;
  const firstMonday = new Date(firstDate);
  firstMonday.setDate(firstMonday.getDate() - daysToMonday);
  firstMonday.setHours(0, 0, 0, 0);

  // Find the Sunday of the week containing the last date
  const lastDayOfWeek = lastDate.getDay();
  const daysToSunday = lastDayOfWeek === 0 ? 0 : 7 - lastDayOfWeek;
  const lastSunday = new Date(lastDate);
  lastSunday.setDate(lastSunday.getDate() + daysToSunday);
  lastSunday.setHours(0, 0, 0, 0);

  const weeks: any[] = [];
  let currentMonday = new Date(firstMonday);
  let weekNumber = 1;

  // Generate complete calendar weeks (Mon-Sun) from firstMonday to lastSunday
  while (currentMonday <= lastSunday) {
    const weekDays: any = {};

    // Generate all 7 days of the week (Mon-Sun)
    for (let i = 0; i < 7; i++) {
      const currentDate = new Date(currentMonday);
      currentDate.setDate(currentDate.getDate() + i);
      const dateString = getDateStringFromDate(currentDate);
      const dayName = dayOrder[i];

      // Check if we have data for this date
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
        // Fill missing days with Rest (ensures complete Mon-Sun weeks)
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

export const usePlanModifications = ({ planData, onUpdatePlan, savedPlanId, userId }: UsePlanModificationsProps) => {
  const [pendingAction, setPendingAction] = useState<{type: string; data: any} | null>(null);

  const saveToDatabase = async (updatedPlan: any) => {
    if (!savedPlanId || !userId) return;

    try {
      const { error } = await supabase
        .from('training_plans')
        .update({
          plan_data: updatedPlan,
          updated_at: new Date().toISOString()
        })
        .eq('id', savedPlanId)
        .eq('user_id', userId);

      if (error) throw error;
      logger.info('Plan modifications saved to database');
    } catch (error) {
      logger.error('Failed to save plan modifications:', error);
    }
  };

  const handleMoveWorkout = async (weekNumber: number, fromDay: string, toDay: string, activity: string) => {
    const updatedPlan = JSON.parse(JSON.stringify(planData));

    // For date-based plans: ONLY update days array, then regenerate plan structure
    if (isDateBasedPlan(updatedPlan) && updatedPlan.days && Array.isArray(updatedPlan.days) && updatedPlan.start_date) {
      logger.info('[usePlanModifications] Moving workout in date-based plan', {
        planType: updatedPlan.plan_type,
        weekNumber,
        fromDay,
        toDay,
        daysArrayLength: updatedPlan.days.length
      });

      const weekIndex = updatedPlan.plan.findIndex((w: any) => w.week === weekNumber);
      if (weekIndex === -1) {
        logger.error('[usePlanModifications] Week not found', { weekNumber });
        return;
      }

      const week = updatedPlan.plan[weekIndex];
      const fromDayData = week.days[fromDay];
      const toDayData = week.days[toDay];

      const fromDate = fromDayData?.date;
      const toDate = toDayData?.date;

      logger.info('[usePlanModifications] Move operation details', {
        fromDate,
        toDate,
        fromWorkout: fromDayData?.workout || 'N/A',
        toWorkout: toDayData?.workout || 'N/A'
      });

      if (fromDate && toDate) {
        const fromDayIndex = updatedPlan.days.findIndex((d: any) => d.date === fromDate);
        const toDayIndex = updatedPlan.days.findIndex((d: any) => d.date === toDate);

        if (fromDayIndex !== -1 && toDayIndex !== -1) {
          // Swap workout data in days array (source of truth) while preserving dates
          const fromWorkout = updatedPlan.days[fromDayIndex].workout;
          const fromTips = updatedPlan.days[fromDayIndex].tips;
          const fromWorkoutType = updatedPlan.days[fromDayIndex].workoutType;
          const fromCalibrationTag = updatedPlan.days[fromDayIndex].calibrationTag;

          const toWorkout = updatedPlan.days[toDayIndex].workout;
          const toTips = updatedPlan.days[toDayIndex].tips;
          const toWorkoutType = updatedPlan.days[toDayIndex].workoutType;
          const toCalibrationTag = updatedPlan.days[toDayIndex].calibrationTag;

          // Perform immutable swap
          updatedPlan.days[fromDayIndex] = {
            ...updatedPlan.days[fromDayIndex],
            workout: toWorkout,
            tips: toTips,
            workoutType: toWorkoutType,
            calibrationTag: toCalibrationTag
          };

          updatedPlan.days[toDayIndex] = {
            ...updatedPlan.days[toDayIndex],
            workout: fromWorkout,
            tips: fromTips,
            workoutType: fromWorkoutType,
            calibrationTag: fromCalibrationTag
          };

          logger.info('[usePlanModifications] Swapped workouts in days[] array', {
            fromDayIndex,
            toDayIndex,
            newFromWorkout: updatedPlan.days[fromDayIndex].workout,
            newToWorkout: updatedPlan.days[toDayIndex].workout
          });

          // Validate invariants
          if (!validateDaysArrayInvariants(updatedPlan.days, 'moveWorkout')) {
            logger.error('[usePlanModifications] Invariant validation failed after move');
            return;
          }

          // Regenerate ENTIRE plan structure from days (this is the single source of truth)
          updatedPlan.plan = convertDaysToWeeks(updatedPlan.days, updatedPlan.start_date);
          logger.info('[usePlanModifications] Plan structure regenerated from days[]', {
            weeksCount: updatedPlan.plan.length
          });
        } else {
          logger.error('[usePlanModifications] Day indices not found in days[]', {
            fromDayIndex,
            toDayIndex
          });
        }
      } else {
        logger.error('[usePlanModifications] Missing date information', { fromDate, toDate });
      }
    } else {
      // For non-date-based plans: directly swap in week structure
      logger.info('[usePlanModifications] Moving workout in non-date-based plan', {
        planType: updatedPlan.plan_type,
        weekNumber,
        fromDay,
        toDay
      });

      const weekIndex = updatedPlan.plan.findIndex((w: any) => w.week === weekNumber);
      if (weekIndex === -1) return;

      const week = updatedPlan.plan[weekIndex];
      const fromDayData = week.days[fromDay];
      const toDayData = week.days[toDay];

      week.days[toDay] = fromDayData;
      week.days[fromDay] = toDayData;
    }

    onUpdatePlan(updatedPlan);
    await saveToDatabase(updatedPlan);
    setPendingAction(null);
  };

  const handleMakeEasier = async (weekNumber: number, dayName: string, activity: string, easeType: 'distance' | 'intensity' | 'rest') => {
    const updatedPlan = JSON.parse(JSON.stringify(planData));

    // For date-based plans: ONLY update days array, then regenerate plan structure
    if (isDateBasedPlan(updatedPlan) && updatedPlan.days && Array.isArray(updatedPlan.days) && updatedPlan.start_date) {
      logger.info('[usePlanModifications] Making workout easier in date-based plan', {
        planType: updatedPlan.plan_type,
        weekNumber,
        dayName,
        easeType
      });

      const weekIndex = updatedPlan.plan.findIndex((w: any) => w.week === weekNumber);
      if (weekIndex === -1) return;

      const week = updatedPlan.plan[weekIndex];
      const dayData = week.days[dayName];

      if (!dayData?.date) return;

      const dayIndex = updatedPlan.days.findIndex((d: any) => d.date === dayData.date);
      if (dayIndex === -1) return;

      const currentWorkout = updatedPlan.days[dayIndex].workout;
      let newWorkout = '';
      let newTips = updatedPlan.days[dayIndex].tips;

      if (easeType === 'rest') {
        newWorkout = 'Rest';
        newTips = ["Rest is when your body adapts and gets stronger"];
      } else if (easeType === 'distance') {
        const distanceMatch = currentWorkout.match(/(\d+(?:\.\d+)?)\s*(km|mi|miles?)/i);
        if (distanceMatch) {
          const currentDistance = parseFloat(distanceMatch[1]);
          const newDistance = (currentDistance * 0.8).toFixed(1);
          const unit = distanceMatch[2];
          newWorkout = currentWorkout.replace(distanceMatch[0], `${newDistance} ${unit}`);
        } else {
          newWorkout = currentWorkout;
        }
      } else if (easeType === 'intensity') {
        const distanceMatch = currentWorkout.match(/(\d+(?:\.\d+)?)\s*(km|mi|miles?)/i);
        if (distanceMatch) {
          const distance = distanceMatch[1];
          const unit = distanceMatch[2];
          newWorkout = `Easy ${distance} ${unit}`;
        } else {
          newWorkout = 'Easy 5 km';
        }
      }

      // Update days array (source of truth) immutably
      updatedPlan.days[dayIndex] = {
        ...updatedPlan.days[dayIndex],
        workout: newWorkout,
        tips: newTips
      };

      // Validate invariants
      if (!validateDaysArrayInvariants(updatedPlan.days, 'makeEasier')) {
        logger.error('[usePlanModifications] Invariant validation failed after make easier');
        return;
      }

      // Regenerate ENTIRE plan structure from days
      updatedPlan.plan = convertDaysToWeeks(updatedPlan.days, updatedPlan.start_date);
      logger.info('[usePlanModifications] Plan structure regenerated from days[] after make easier', {
        weeksCount: updatedPlan.plan.length,
        updatedDate: updatedPlan.days[dayIndex].date,
        newWorkout
      });

    } else {
      // For non-date-based plans: directly update week structure
      const weekIndex = updatedPlan.plan.findIndex((w: any) => w.week === weekNumber);
      if (weekIndex === -1) return;

      const week = updatedPlan.plan[weekIndex];
      const dayData = week.days[dayName];
      let newWorkout = '';

      if (easeType === 'rest') {
        newWorkout = 'Rest';
        if (typeof dayData === 'string') {
          week.days[dayName] = newWorkout;
        } else {
          week.days[dayName] = { ...dayData, workout: newWorkout, tips: ["Rest is when your body adapts and gets stronger"] };
        }
      } else if (easeType === 'distance') {
        const currentWorkout = typeof dayData === 'string' ? dayData : dayData.workout;
        const distanceMatch = currentWorkout.match(/(\d+(?:\.\d+)?)\s*(km|mi|miles?)/i);

        if (distanceMatch) {
          const currentDistance = parseFloat(distanceMatch[1]);
          const newDistance = (currentDistance * 0.8).toFixed(1);
          const unit = distanceMatch[2];
          newWorkout = currentWorkout.replace(distanceMatch[0], `${newDistance} ${unit}`);

          if (typeof dayData === 'string') {
            week.days[dayName] = newWorkout;
          } else {
            week.days[dayName] = { ...dayData, workout: newWorkout };
          }
        }
      } else if (easeType === 'intensity') {
        const currentWorkout = typeof dayData === 'string' ? dayData : dayData.workout;
        const distanceMatch = currentWorkout.match(/(\d+(?:\.\d+)?)\s*(km|mi|miles?)/i);

        if (distanceMatch) {
          const distance = distanceMatch[1];
          const unit = distanceMatch[2];
          newWorkout = `Easy ${distance} ${unit}`;
        } else {
          newWorkout = 'Easy 5 km';
        }

        if (typeof dayData === 'string') {
          week.days[dayName] = newWorkout;
        } else {
          week.days[dayName] = { ...dayData, workout: newWorkout };
        }
      }
    }

    onUpdatePlan(updatedPlan);
    await saveToDatabase(updatedPlan);
    setPendingAction(null);
  };

  return {
    pendingAction,
    setPendingAction,
    handleMoveWorkout,
    handleMakeEasier
  };
};
