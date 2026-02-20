/**
 * Safety Invariants Validator
 *
 * Enforces hard safety rules before any commit is executed.
 * All invariants must pass or the commit is rejected.
 */

import { DateResolver } from './dateResolverBackend.ts';

export interface Workout {
  workout_id: string;
  scheduled_for: string;
  status: 'scheduled' | 'cancelled' | 'completed';
  title: string;
  type: string;
}

export interface WorkoutModification {
  target: {
    workout_id: string;
    iso_date: string;
  };
  operation: string;
  before: any;
  after: any;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export class SafetyInvariantsValidator {
  private dateResolver: DateResolver;
  private workouts: Workout[];

  constructor(workouts: Workout[], referenceDateISO?: string) {
    this.dateResolver = new DateResolver(referenceDateISO);
    this.workouts = workouts;
  }

  validatePreview(modifications: WorkoutModification[]): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    for (const mod of modifications) {
      if (!this.hasValidTarget(mod)) {
        errors.push(
          `Modification missing workout_id or iso_date: ${JSON.stringify(mod.target)}`
        );
      }

      if (!this.targetExistsInPlan(mod)) {
        errors.push(
          `Target workout does not exist: ${mod.target.workout_id} on ${mod.target.iso_date}`
        );
      }

      if (this.isCompletedWorkout(mod)) {
        errors.push(
          `Cannot modify completed workout: ${mod.before.title} on ${this.dateResolver.formatUKDisplay(mod.target.iso_date)}`
        );
      }

      if (this.isPastWorkout(mod) && !this.isPastModificationAllowed(mod)) {
        warnings.push(
          `Past workout modification requires explicit confirmation: ${mod.before.title} on ${this.dateResolver.formatUKDisplay(mod.target.iso_date)}`
        );
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  validateCommit(
    previewModifications: WorkoutModification[],
    commitWorkoutIds: string[],
    previewPlanVersion: number,
    currentPlanVersion: number
  ): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    const previewIds = previewModifications.map((m) => m.target.workout_id).sort();
    const commitIds = [...commitWorkoutIds].sort();

    if (JSON.stringify(previewIds) !== JSON.stringify(commitIds)) {
      errors.push(
        'Preview/commit mismatch: workout IDs do not match. Preview may have expired.'
      );
    }

    if (previewPlanVersion !== currentPlanVersion) {
      errors.push(
        `Version mismatch: preview was for v${previewPlanVersion}, but plan is now v${currentPlanVersion}. Please refresh and preview again.`
      );
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  private hasValidTarget(mod: WorkoutModification): boolean {
    return !!(mod.target.workout_id && mod.target.iso_date);
  }

  private targetExistsInPlan(mod: WorkoutModification): boolean {
    return this.workouts.some(
      (w) =>
        w.workout_id === mod.target.workout_id &&
        w.scheduled_for === mod.target.iso_date
    );
  }

  private isCompletedWorkout(mod: WorkoutModification): boolean {
    return mod.before.status === 'completed';
  }

  private isPastWorkout(mod: WorkoutModification): boolean {
    return this.dateResolver.isInPast(mod.target.iso_date);
  }

  private isPastModificationAllowed(mod: WorkoutModification): boolean {
    return mod.operation === 'complete' || mod.operation === 'add';
  }
}

export const validatePreview = (
  modifications: WorkoutModification[],
  workouts: Workout[],
  referenceDateISO?: string
): ValidationResult => {
  const validator = new SafetyInvariantsValidator(workouts, referenceDateISO);
  return validator.validatePreview(modifications);
};

export const validateCommit = (
  previewModifications: WorkoutModification[],
  commitWorkoutIds: string[],
  previewPlanVersion: number,
  currentPlanVersion: number,
  workouts: Workout[],
  referenceDateISO?: string
): ValidationResult => {
  const validator = new SafetyInvariantsValidator(workouts, referenceDateISO);
  return validator.validateCommit(
    previewModifications,
    commitWorkoutIds,
    previewPlanVersion,
    currentPlanVersion
  );
};
