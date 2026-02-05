import type { StepsMeta, StepId, WeekFocus, WorkoutRole } from '../types';
import {
  STEP_DEFINITIONS,
  determineStepUsage,
  calculateWeeksToRace,
  isKeyWorkout
} from './stepProgressSystem';

interface GenerateStepsMetaOptions {
  durationWeeks: number;
  raceDate?: string;
  startDate?: string;
  planData?: any;
}

export function generateStepsMeta(options: GenerateStepsMetaOptions): StepsMeta {
  const { durationWeeks, raceDate, planData } = options;

  const weeksToRace = calculateWeeksToRace(raceDate);
  const stepUsage = determineStepUsage(durationWeeks, weeksToRace);

  if (!stepUsage.stepsEnabled) {
    return {
      steps_enabled: false,
      reason: stepUsage.reason,
      current_focus_only: true,
      generated_at: new Date().toISOString(),
      generator_version: 'v1.0.0'
    };
  }

  const planSteps = stepUsage.allowedSteps.map(stepId => ({
    ...STEP_DEFINITIONS[stepId]
  }));

  const weekFocus = generateWeekFocus(stepUsage.allowedSteps, durationWeeks, weeksToRace);

  const workoutRoles = planData ? inferWorkoutRoles(planData, weekFocus) : {};

  return {
    steps_enabled: true,
    allowed_steps: stepUsage.allowedSteps,
    plan_steps: planSteps,
    week_focus: weekFocus,
    workout_roles: workoutRoles,
    generated_at: new Date().toISOString(),
    generator_version: 'v1.0.0'
  };
}

function generateWeekFocus(allowedSteps: StepId[], durationWeeks: number, weeksToRace: number | null): WeekFocus[] {
  const weekFocus: WeekFocus[] = [];

  if (durationWeeks <= 4) {
    for (let week = 1; week <= durationWeeks; week++) {
      weekFocus.push({ week_number: week, focus_step_id: 'race_specific' });
    }
    return weekFocus;
  }

  if (durationWeeks <= 7) {
    const baseWeeks = Math.ceil(durationWeeks * 0.5);
    for (let week = 1; week <= baseWeeks; week++) {
      weekFocus.push({ week_number: week, focus_step_id: 'aerobic_base' });
    }
    for (let week = baseWeeks + 1; week <= durationWeeks; week++) {
      weekFocus.push({ week_number: week, focus_step_id: 'race_specific' });
    }
    return weekFocus;
  }

  if (durationWeeks >= 12) {
    const baseWeeks = 4;
    const thresholdWeeks = 3;
    const economyWeeks = 2;

    for (let week = 1; week <= baseWeeks; week++) {
      weekFocus.push({ week_number: week, focus_step_id: 'aerobic_base' });
    }

    for (let week = baseWeeks + 1; week <= baseWeeks + thresholdWeeks; week++) {
      weekFocus.push({ week_number: week, focus_step_id: 'threshold' });
    }

    for (let week = baseWeeks + thresholdWeeks + 1; week <= baseWeeks + thresholdWeeks + economyWeeks; week++) {
      weekFocus.push({ week_number: week, focus_step_id: 'economy' });
    }

    for (let week = baseWeeks + thresholdWeeks + economyWeeks + 1; week <= durationWeeks; week++) {
      weekFocus.push({ week_number: week, focus_step_id: 'race_specific' });
    }

    return weekFocus;
  }

  const baseWeeks = Math.ceil(durationWeeks * 0.35);
  const thresholdWeeks = Math.ceil(durationWeeks * 0.25);

  for (let week = 1; week <= baseWeeks; week++) {
    weekFocus.push({ week_number: week, focus_step_id: 'aerobic_base' });
  }

  for (let week = baseWeeks + 1; week <= baseWeeks + thresholdWeeks; week++) {
    weekFocus.push({ week_number: week, focus_step_id: 'threshold' });
  }

  for (let week = baseWeeks + thresholdWeeks + 1; week <= durationWeeks; week++) {
    weekFocus.push({ week_number: week, focus_step_id: 'race_specific' });
  }

  return weekFocus;
}

function inferWorkoutRoles(planData: any, weekFocus: WeekFocus[]): Record<string, WorkoutRole> {
  const workoutRoles: Record<string, WorkoutRole> = {};

  if (planData.days && Array.isArray(planData.days)) {
    planData.days.forEach((day: any) => {
      const role = inferRoleFromWorkout(day.workout, day.workoutType, weekFocus, day.date);
      if (role && day.date) {
        const normalizedId = `${day.date}:${day.workoutType || 'normal'}:${day.workout_type || 'TRAIN'}`;
        workoutRoles[normalizedId] = role;
      }
    });
  }

  if (planData.plan && Array.isArray(planData.plan)) {
    planData.plan.forEach((week: any) => {
      const weekNumber = week.week;
      const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

      days.forEach(dow => {
        const dayData = week.days?.[dow];
        if (dayData) {
          const workoutText = typeof dayData === 'string' ? dayData : dayData.workout;
          const workoutType = typeof dayData === 'object' ? dayData.workoutType : 'normal';
          const role = inferRoleFromWorkout(workoutText, workoutType, weekFocus, undefined, weekNumber);

          if (role) {
            const normalizedId = `${weekNumber}:${dow}:${workoutType || 'normal'}:TRAIN`;
            workoutRoles[normalizedId] = role;
          }
        }
      });
    });
  }

  return workoutRoles;
}

function inferRoleFromWorkout(
  workoutText: string,
  workoutType: string | undefined,
  weekFocus: WeekFocus[],
  date?: string,
  weekNumber?: number
): WorkoutRole | null {
  const lowerWorkout = workoutText.toLowerCase();

  if (workoutType === 'calibration') {
    return 'calibration';
  }

  if (lowerWorkout.includes('rest') || lowerWorkout.includes('off')) {
    return 'recovery';
  }

  if (lowerWorkout.includes('race day') || lowerWorkout.includes('race:')) {
    return 'race_specific';
  }

  if (lowerWorkout.includes('race pace') || lowerWorkout.includes('marathon pace')) {
    return 'race_specific';
  }

  if (lowerWorkout.includes('tempo') || lowerWorkout.includes('threshold') || lowerWorkout.includes('lactate')) {
    return 'threshold';
  }

  if (lowerWorkout.includes('interval') || lowerWorkout.includes('repeat') || lowerWorkout.includes('strides')) {
    return 'economy';
  }

  if (lowerWorkout.includes('easy') || lowerWorkout.includes('recovery run')) {
    return 'base';
  }

  if (lowerWorkout.includes('long run')) {
    return 'base';
  }

  if (weekNumber) {
    const focus = weekFocus.find(wf => wf.week_number === weekNumber);
    if (focus) {
      return focus.focus_step_id as WorkoutRole;
    }
  }

  if (isKeyWorkout(workoutText)) {
    return 'base';
  }

  return null;
}

export function addStepsMetaToPlanData(planData: any, stepsMeta: StepsMeta): any {
  return {
    ...planData,
    steps_meta: stepsMeta
  };
}
