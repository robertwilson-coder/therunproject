import { useState, useMemo } from 'react';
import { logger } from '../utils/logger';
import { parseLocalDate, getDateStringFromDate } from '../utils/dateUtils';
import { isDateBasedPlan } from '../utils/planTypeHelpers';
import { getTodayInTimezone, DEFAULT_TIMEZONE } from '../utils/trainingPlanUtils';

interface UsePlanModificationsProps {
  planData: any;
  onUpdatePlan: (updatedPlan: any) => void;
  savedPlanId?: string | null;
  userId?: string;
  completedWorkouts?: Set<string>;
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

export const usePlanModifications = ({ planData, onUpdatePlan, savedPlanId, userId, completedWorkouts }: UsePlanModificationsProps) => {
  const [pendingAction, setPendingAction] = useState<{type: string; data: any} | null>(null);

  const countFutureWorkoutsOnDay = (dayName: string): number => {
    if (!planData?.days || !Array.isArray(planData.days)) return 0;

    const today = getTodayInTimezone(planData.timezone || DEFAULT_TIMEZONE);
    const todayDate = parseLocalDate(today);

    let count = 0;
    for (const day of planData.days) {
      if (!day.date) continue;
      const dayDate = parseLocalDate(day.date);
      if (dayDate < todayDate) continue;

      const dayOfWeek = dayDate.getDay();
      const dayIndex = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      const shortDayName = dayOrder[dayIndex];

      if (shortDayName === dayName) {
        const workout = day.workout?.toLowerCase() || '';
        if (workout !== 'rest' && workout !== '') {
          count++;
        }
      }
    }
    return count;
  };

  const getAvailableTrainingDays = useMemo((): string[] => {
    if (!planData?.days || !Array.isArray(planData.days)) return [];

    const daysWithWorkouts = new Set<string>();
    for (const day of planData.days) {
      if (!day.date) continue;
      const workout = day.workout?.toLowerCase() || '';
      if (workout !== 'rest' && workout !== '') {
        const dayDate = parseLocalDate(day.date);
        const dayOfWeek = dayDate.getDay();
        const dayIndex = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
        daysWithWorkouts.add(dayOrder[dayIndex]);
      }
    }
    return Array.from(daysWithWorkouts);
  }, [planData]);


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
    setPendingAction(null);
  };

  const handleBulkMoveWeekday = async (fromWeekday: string, toWeekday: string) => {
    if (!isDateBasedPlan(planData) || !planData.days || !Array.isArray(planData.days)) {
      logger.error('[usePlanModifications] Bulk move requires date-based plan with days array');
      setPendingAction(null);
      return;
    }

    logger.info('[usePlanModifications] Starting bulk weekday move', {
      fromWeekday,
      toWeekday,
      daysArrayLength: planData.days.length
    });

    const updatedPlan = JSON.parse(JSON.stringify(planData));
    const today = getTodayInTimezone(updatedPlan.timezone || DEFAULT_TIMEZONE);
    const todayDate = parseLocalDate(today);

    const fromDayIndex = dayOrder.indexOf(fromWeekday as typeof dayOrder[number]);
    const toDayIndex = dayOrder.indexOf(toWeekday as typeof dayOrder[number]);

    if (fromDayIndex === -1 || toDayIndex === -1) {
      logger.error('[usePlanModifications] Invalid day names', { fromWeekday, toWeekday });
      setPendingAction(null);
      return;
    }

    const dayDelta = toDayIndex - fromDayIndex;

    const daysToMove: { originalIndex: number; originalDate: string; newDate: string; dayData: any }[] = [];

    for (let i = 0; i < updatedPlan.days.length; i++) {
      const day = updatedPlan.days[i];
      if (!day.date) continue;

      const dayDate = parseLocalDate(day.date);
      if (dayDate < todayDate) continue;

      const dayOfWeek = dayDate.getDay();
      const currentDayIndex = dayOfWeek === 0 ? 6 : dayOfWeek - 1;

      if (dayOrder[currentDayIndex] === fromWeekday) {
        const workout = day.workout?.toLowerCase() || '';
        if (workout !== 'rest' && workout !== '') {
          const newDate = new Date(dayDate);
          newDate.setDate(newDate.getDate() + dayDelta);

          daysToMove.push({
            originalIndex: i,
            originalDate: day.date,
            newDate: getDateStringFromDate(newDate),
            dayData: { ...day }
          });
        }
      }
    }

    logger.info('[usePlanModifications] Found workouts to move', {
      count: daysToMove.length,
      workouts: daysToMove.map(d => ({ from: d.originalDate, to: d.newDate, workout: d.dayData.workout }))
    });

    if (daysToMove.length === 0) {
      logger.warn('[usePlanModifications] No future workouts found to move');
      setPendingAction(null);
      return;
    }

    const existingDatesMap = new Map<string, number>();
    for (let i = 0; i < updatedPlan.days.length; i++) {
      if (updatedPlan.days[i].date) {
        existingDatesMap.set(updatedPlan.days[i].date, i);
      }
    }

    const conflicts: { date: string; existingWorkout: string; movingWorkout: string }[] = [];

    for (const moveItem of daysToMove) {
      if (existingDatesMap.has(moveItem.newDate)) {
        const existingIndex = existingDatesMap.get(moveItem.newDate)!;
        const existingDay = updatedPlan.days[existingIndex];
        const existingWorkout = existingDay.workout?.toLowerCase() || '';

        if (existingWorkout !== 'rest' && existingWorkout !== '') {
          conflicts.push({
            date: moveItem.newDate,
            existingWorkout: existingDay.workout,
            movingWorkout: moveItem.dayData.workout
          });
        }
      }
    }

    if (conflicts.length > 0) {
      logger.warn('[usePlanModifications] Conflicts detected - swapping workouts', { conflicts });
    }

    for (const moveItem of daysToMove) {
      const originalIndex = existingDatesMap.get(moveItem.originalDate);
      const targetIndex = existingDatesMap.get(moveItem.newDate);

      if (originalIndex === undefined) continue;

      if (targetIndex !== undefined) {
        const targetDay = updatedPlan.days[targetIndex];
        const originalDay = updatedPlan.days[originalIndex];

        updatedPlan.days[targetIndex] = {
          ...targetDay,
          workout: originalDay.workout,
          tips: originalDay.tips,
          workoutType: originalDay.workoutType,
          calibrationTag: originalDay.calibrationTag
        };

        updatedPlan.days[originalIndex] = {
          ...originalDay,
          workout: targetDay.workout || 'Rest',
          tips: targetDay.tips || [],
          workoutType: targetDay.workoutType,
          calibrationTag: targetDay.calibrationTag
        };
      } else {
        updatedPlan.days.push({
          date: moveItem.newDate,
          workout: moveItem.dayData.workout,
          tips: moveItem.dayData.tips,
          workoutType: moveItem.dayData.workoutType,
          calibrationTag: moveItem.dayData.calibrationTag
        });

        updatedPlan.days[originalIndex] = {
          ...updatedPlan.days[originalIndex],
          workout: 'Rest',
          tips: [],
          workoutType: undefined,
          calibrationTag: undefined
        };
      }
    }

    updatedPlan.days.sort((a: any, b: any) => {
      const dateA = parseLocalDate(a.date).getTime();
      const dateB = parseLocalDate(b.date).getTime();
      return dateA - dateB;
    });

    if (!validateDaysArrayInvariants(updatedPlan.days, 'bulkMoveWeekday')) {
      logger.error('[usePlanModifications] Invariant validation failed after bulk move');
      setPendingAction(null);
      return;
    }

    updatedPlan.plan = convertDaysToWeeks(updatedPlan.days, updatedPlan.start_date);
    logger.info('[usePlanModifications] Plan structure regenerated after bulk move', {
      weeksCount: updatedPlan.plan.length,
      movedCount: daysToMove.length
    });

    onUpdatePlan(updatedPlan);
    setPendingAction(null);
  };

  return {
    pendingAction,
    setPendingAction,
    handleMoveWorkout,
    handleMakeEasier,
    handleBulkMoveWeekday,
    countFutureWorkoutsOnDay,
    getAvailableTrainingDays
  };
};
