/**
 * Safety Invariants Validator
 *
 * Hard structural invariants enforced before any apply is executed.
 * All invariants are backend-enforced, non-negotiable, and independent of prompt wording.
 * These exist solely for harm prevention — not optimisation or nuance.
 *
 * V1 Hard Invariants:
 * 1. Completed workouts are immutable — no modification of any kind.
 * 2. Plan version must match at commit time — prevents stale-state mutations.
 * 3. Every operation target must exist in the plan — no phantom modifications.
 * 4. No structural rebuilds (insert_recovery_week) inside the taper window.
 * 5. Recovery insertion must leave >= 3 build weeks before taper start.
 * 6. No back-to-back hard sessions (interval/tempo/threshold/speed/track/race).
 * 7. No back-to-back long runs on consecutive days.
 * 8. Past workout modifications require explicit confirmation — retroactive changes are flagged, not silently applied.
 */

import { DateResolver } from './dateResolverBackend.ts';
import {
  guardStructuralRebuildInTaper,
  guardRecoveryInsertionLeavesEnoughBuild,
  computeTaperStartISO,
  deriveTaperWeeks,
} from './taperGuard.ts';

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

export interface PlanContext {
  raceDateISO?: string | null;
  raceDistanceKm?: number;
  totalWeeks?: number;
  currentWeekStartISO?: string;
  todayISO?: string;
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

  /**
   * Invariant 1, 3, 6, 7, 8 — validated before any operation is applied.
   */
  validatePreview(modifications: WorkoutModification[]): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    for (const mod of modifications) {
      // Invariant 3: target must exist and have valid fields
      if (!this.hasValidTarget(mod)) {
        errors.push(
          `Modification missing workout_id or iso_date: ${JSON.stringify(mod.target)}`
        );
        continue;
      }

      if (!this.targetExistsInPlan(mod)) {
        errors.push(
          `Target workout does not exist: ${mod.target.workout_id} on ${mod.target.iso_date}`
        );
        continue;
      }

      // Invariant 1: completed workouts are immutable
      if (this.isCompletedWorkout(mod)) {
        errors.push(
          `Cannot modify completed workout: ${mod.before?.title ?? mod.target.workout_id} on ${this.dateResolver.formatUKDisplay(mod.target.iso_date)}`
        );
        continue;
      }

      // Invariant 8: past workout modifications require explicit confirmation (warning, not hard block)
      if (this.isPastWorkout(mod) && !this.isPastModificationAllowed(mod)) {
        warnings.push(
          `Past workout modification requires explicit confirmation: ${mod.before?.title ?? mod.target.workout_id} on ${this.dateResolver.formatUKDisplay(mod.target.iso_date)}`
        );
      }
    }

    // Invariant 6: no back-to-back hard sessions
    const backToBackHard = this.detectBackToBackHardSessions(modifications);
    for (const pair of backToBackHard) {
      errors.push(`Back-to-back hard sessions not permitted: ${pair}`);
    }

    // Invariant 7: no back-to-back long runs
    const backToBackLong = this.detectBackToBackLongRuns(modifications);
    for (const pair of backToBackLong) {
      errors.push(`Back-to-back long runs not permitted: ${pair}`);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Invariant 2: plan version must match at commit time.
   * Invariant 3: workout IDs must match the previewed set exactly.
   */
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

  /**
   * Invariant 4 + 5: taper protection for structural rebuilds.
   * Call this before allowing insert_recovery_week or suggest_pause to proceed.
   */
  validateStructuralRebuild(planContext: PlanContext): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    const {
      raceDateISO = null,
      raceDistanceKm = 0,
      totalWeeks = 0,
      currentWeekStartISO,
      todayISO,
    } = planContext;

    if (!raceDateISO || !todayISO) {
      return { valid: true, errors, warnings };
    }

    const taperWeeks = raceDistanceKm > 0 ? deriveTaperWeeks(raceDistanceKm, totalWeeks) : 0;
    const taperStartISO = computeTaperStartISO(raceDateISO, taperWeeks);

    // Invariant 4: no structural rebuilds inside taper
    const taperCheck = guardStructuralRebuildInTaper(todayISO, taperStartISO);
    if (!taperCheck.allowed) {
      errors.push(taperCheck.reason!);
    }

    // Invariant 5: recovery insertion must leave >= 3 build weeks before taper
    if (currentWeekStartISO && taperCheck.allowed) {
      const buildCheck = guardRecoveryInsertionLeavesEnoughBuild(currentWeekStartISO, taperStartISO);
      if (!buildCheck.allowed) {
        errors.push(buildCheck.reason!);
      }
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
    const workout = this.workouts.find(w => w.workout_id === mod.target.workout_id);
    return workout?.status === 'completed' || mod.before?.status === 'completed';
  }

  private isPastWorkout(mod: WorkoutModification): boolean {
    return this.dateResolver.isInPast(mod.target.iso_date);
  }

  private isPastModificationAllowed(mod: WorkoutModification): boolean {
    return mod.operation === 'complete' || mod.operation === 'add';
  }

  private detectBackToBackHardSessions(modifications: WorkoutModification[]): string[] {
    const problematic: string[] = [];
    const sorted = [...modifications].sort(
      (a, b) => new Date(a.target.iso_date).getTime() - new Date(b.target.iso_date).getTime()
    );

    for (let i = 0; i < sorted.length - 1; i++) {
      const current = sorted[i];
      const next = sorted[i + 1];
      const daysDiff = Math.floor(
        (new Date(next.target.iso_date).getTime() - new Date(current.target.iso_date).getTime()) /
        (1000 * 60 * 60 * 24)
      );
      if (daysDiff === 1) {
        const currentWorkout = this.workouts.find(w => w.workout_id === current.target.workout_id);
        const nextWorkout = this.workouts.find(w => w.workout_id === next.target.workout_id);
        const afterTitle = (mod: WorkoutModification) => mod.after?.title ?? mod.after?.workout ?? '';
        if (
          this.isHardSession(afterTitle(current) || currentWorkout?.title) &&
          this.isHardSession(afterTitle(next) || nextWorkout?.title)
        ) {
          problematic.push(
            `${this.dateResolver.formatUKDisplay(current.target.iso_date)} and ${this.dateResolver.formatUKDisplay(next.target.iso_date)}`
          );
        }
      }
    }

    return problematic;
  }

  private detectBackToBackLongRuns(modifications: WorkoutModification[]): string[] {
    const problematic: string[] = [];
    const sorted = [...modifications].sort(
      (a, b) => new Date(a.target.iso_date).getTime() - new Date(b.target.iso_date).getTime()
    );

    for (let i = 0; i < sorted.length - 1; i++) {
      const current = sorted[i];
      const next = sorted[i + 1];
      const daysDiff = Math.floor(
        (new Date(next.target.iso_date).getTime() - new Date(current.target.iso_date).getTime()) /
        (1000 * 60 * 60 * 24)
      );
      if (daysDiff === 1) {
        const currentWorkout = this.workouts.find(w => w.workout_id === current.target.workout_id);
        const nextWorkout = this.workouts.find(w => w.workout_id === next.target.workout_id);
        const afterTitle = (mod: WorkoutModification) => mod.after?.title ?? mod.after?.workout ?? '';
        if (
          this.isLongRun(afterTitle(current) || currentWorkout?.title) &&
          this.isLongRun(afterTitle(next) || nextWorkout?.title)
        ) {
          problematic.push(
            `${this.dateResolver.formatUKDisplay(current.target.iso_date)} and ${this.dateResolver.formatUKDisplay(next.target.iso_date)}`
          );
        }
      }
    }

    return problematic;
  }

  private isHardSession(title: string | undefined): boolean {
    if (!title) return false;
    const lower = title.toLowerCase();
    return (
      lower.includes('interval') ||
      lower.includes('tempo') ||
      lower.includes('threshold') ||
      lower.includes('speed') ||
      lower.includes('track') ||
      lower.includes('race')
    );
  }

  private isLongRun(title: string | undefined): boolean {
    if (!title) return false;
    const lower = title.toLowerCase();
    return lower.includes('long run') || lower.includes('long easy');
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

export const validateStructuralRebuild = (
  planContext: PlanContext,
  workouts: Workout[],
  referenceDateISO?: string
): ValidationResult => {
  const validator = new SafetyInvariantsValidator(workouts, referenceDateISO);
  return validator.validateStructuralRebuild(planContext);
};
