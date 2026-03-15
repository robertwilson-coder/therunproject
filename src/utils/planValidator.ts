import type { DayWorkoutWithDate } from '../types';
import { parseLocalDate } from './dateUtils';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export interface ValidateDateBasedPlanOptions {
  days: DayWorkoutWithDate[];
  availableDays: string[];
  raceDate: string;
  startDate: string;
}

export function validateDateBasedPlan(options: ValidateDateBasedPlanOptions): ValidationResult {
  const { days, availableDays, raceDate, startDate } = options;
  const errors: string[] = [];

  if (!days || days.length === 0) {
    errors.push('Plan must contain at least one day');
    return { valid: false, errors };
  }

  const start = parseLocalDate(startDate);
  const race = parseLocalDate(raceDate);

  let raceWorkoutCount = 0;
  const workoutsAfterRace: string[] = [];

  for (const day of days) {
    const dayDate = parseLocalDate(day.date);

    if (day.date === raceDate) {
      raceWorkoutCount++;
      if (day.workout_type !== 'RACE' && !day.workout.includes('RACE')) {
        errors.push(`Race date ${raceDate} must have a RACE workout`);
      }
    }

    if (dayDate > race && day.workout_type === 'TRAIN') {
      workoutsAfterRace.push(day.date);
    }

    if (day.date !== raceDate && !availableDays.includes(day.dow)) {
      if (day.workout_type === 'TRAIN' || (day.workout && !day.workout.includes('Rest') && !day.workout.includes('Active Recovery'))) {
        errors.push(`Training workout scheduled on ${day.dow} (${day.date}), which is not in availableDays`);
      }
    }

    if (!day.workout || day.workout.trim() === '') {
      errors.push(`Day ${day.date} has no workout assigned`);
    }

    if (!day.tips || day.tips.length === 0) {
      errors.push(`Day ${day.date} has no tips`);
    }
  }

  if (raceWorkoutCount === 0) {
    errors.push(`No race workout found on race date ${raceDate}`);
  } else if (raceWorkoutCount > 1) {
    errors.push(`Multiple race workouts found (expected exactly 1)`);
  }

  if (workoutsAfterRace.length > 0) {
    errors.push(`Training workouts scheduled after race date: ${workoutsAfterRace.join(', ')}`);
  }

  const sortedDays = [...days].sort((a, b) => parseLocalDate(a.date).getTime() - parseLocalDate(b.date).getTime());
  const firstDay = sortedDays[0].date;
  const lastDay = sortedDays[sortedDays.length - 1].date;

  if (firstDay !== startDate) {
    errors.push(`Plan should start on ${startDate}, but starts on ${firstDay}`);
  }

  const lastDayDate = parseLocalDate(lastDay);
  if (lastDayDate.getTime() !== race.getTime()) {
    errors.push(`Plan should end on race date ${raceDate}, but ends on ${lastDay}`);
  }

  const dateSet = new Set<string>();
  for (const day of days) {
    if (dateSet.has(day.date)) {
      errors.push(`Duplicate date found: ${day.date}`);
    }
    dateSet.add(day.date);
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

export function validateWorkoutStructure(workout: string): ValidationResult {
  const errors: string[] = [];

  if (workout.includes('Rest') || workout.includes('Active Recovery')) {
    return { valid: true, errors: [] };
  }

  if (workout.includes('RACE')) {
    return { valid: true, errors: [] };
  }

  const hasWarmup = workout.toLowerCase().includes('warm') || workout.toLowerCase().includes('warm-up');
  const hasCooldown = workout.toLowerCase().includes('cool') || workout.toLowerCase().includes('cool-down');

  if (!hasWarmup) {
    errors.push('Workout missing warm-up section');
  }

  if (!hasCooldown) {
    errors.push('Workout missing cool-down section');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

export function validateAvailableDaysCompliance(days: DayWorkoutWithDate[], availableDays: string[]): ValidationResult {
  const errors: string[] = [];

  for (const day of days) {
    if (day.workout_type === 'RACE') {
      continue;
    }

    if (!availableDays.includes(day.dow)) {
      if (day.workout_type === 'TRAIN') {
        errors.push(`Training workout on ${day.dow} (${day.date}) violates availableDays constraint`);
      } else if (day.workout_type !== 'REST') {
        errors.push(`Day ${day.date} has invalid workout_type: ${day.workout_type}`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Validates that plan_data has a valid canonical days[] array.
 * This is the primary validator for ensuring date-based storage integrity.
 */
export function validateCanonicalDaysPlan(planData: any): ValidationResult {
  const errors: string[] = [];

  // Check days[] exists and is an array
  if (!planData.days) {
    errors.push('Missing days[] array - canonical days-based storage required');
    return { valid: false, errors };
  }

  if (!Array.isArray(planData.days)) {
    errors.push('days[] must be an array');
    return { valid: false, errors };
  }

  if (planData.days.length === 0) {
    errors.push('days[] cannot be empty');
    return { valid: false, errors };
  }

  // Validate each day has required fields
  const seenDates = new Set<string>();
  planData.days.forEach((day: any, index: number) => {
    if (!day.date) {
      errors.push(`Day at index ${index} missing required field: date`);
    } else {
      // Check for duplicates
      if (seenDates.has(day.date)) {
        errors.push(`Duplicate date found: ${day.date}`);
      }
      seenDates.add(day.date);

      // Validate date format
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day.date)) {
        errors.push(`Invalid date format at index ${index}: ${day.date} (expected YYYY-MM-DD)`);
      }
    }

    if (!day.dow) {
      errors.push(`Day at index ${index} (${day.date || 'unknown'}) missing required field: dow`);
    }

    if (!day.workout) {
      errors.push(`Day at index ${index} (${day.date || 'unknown'}) missing required field: workout`);
    }
  });

  // Check chronological order
  const sortedDays = [...planData.days].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  const isChronological = planData.days.every((day: any, i: number) => day.date === sortedDays[i].date);

  if (!isChronological) {
    errors.push('days[] must be in chronological order');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Sanitizes days[] array: removes duplicates, sorts chronologically
 */
export function sanitizeDays(days: DayWorkoutWithDate[]): DayWorkoutWithDate[] {
  // Remove duplicates (keep first occurrence)
  const seen = new Set<string>();
  const unique = days.filter(day => {
    if (seen.has(day.date)) {
      return false;
    }
    seen.add(day.date);
    return true;
  });

  // Sort chronologically
  return unique.sort((a, b) => parseLocalDate(a.date).getTime() - parseLocalDate(b.date).getTime());
}
