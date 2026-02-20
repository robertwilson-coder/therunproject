/**
 * Gold Standard PreviewSet Resolver
 *
 * Converts Draft Proposals into deterministic PreviewSets
 * with explicit workout targeting (workout_id/iso_date only)
 */

import { DateResolver } from './dateResolverBackend.ts';

export interface Workout {
  workout_id: string;
  scheduled_for: string;
  status: 'scheduled' | 'cancelled' | 'completed';
  title: string;
  type: string;
  description?: string;
  duration?: string;
  distance?: string;
  week?: number;
}

export interface WorkoutModification {
  target: {
    workout_id: string;
    iso_date: string;
  };
  operation: 'cancel' | 'reschedule' | 'modify' | 'swap' | 'add' | 'restore';
  before: {
    workout_id: string;
    iso_date: string;
    display_date: string;
    day_name: string;
    title: string;
    type: string;
    status: string;
    description?: string;
    duration?: string;
    distance?: string;
  };
  after: {
    status?: string;
    scheduled_for?: string;
    title?: string;
    type?: string;
    description?: string;
    duration?: string;
    distance?: string;
  };
  reason?: string;
}

export interface PreviewSet {
  preview_id: string;
  proposal_id: string;
  plan_id: string;
  plan_version: number;
  modifications: WorkoutModification[];
  affected_workout_ids: string[];
  affected_date_range: {
    start: string;
    end: string;
    display: string;
  };
  summary: {
    total_workouts: number;
    by_operation: Record<string, number>;
    by_status_change: Record<string, number>;
  };
  warnings: string[];
  requires_confirmation: boolean;
  created_at: string;
  expires_at: string;
}

export interface DraftProposal {
  operation: 'cancel' | 'reschedule' | 'modify' | 'swap' | 'add';
  scope: string;
  modifications?: any;
}

export class PreviewSetResolver {
  private dateResolver: DateResolver;
  private workouts: Workout[];
  private planId: string;
  private planVersion: number;

  constructor(
    workouts: Workout[],
    planId: string,
    planVersion: number,
    referenceDateISO?: string
  ) {
    this.dateResolver = new DateResolver(referenceDateISO);
    this.workouts = workouts;
    this.planId = planId;
    this.planVersion = planVersion;
  }

  resolvePreviewSet(draft: DraftProposal): PreviewSet {
    const previewId = crypto.randomUUID();
    const proposalId = crypto.randomUUID();

    const modifications = this.resolveModifications(draft);

    const affectedWorkoutIds = modifications.map((m) => m.target.workout_id);
    const affectedDates = modifications.map((m) => m.target.iso_date).sort();
    const dateRange = {
      start: affectedDates[0],
      end: affectedDates[affectedDates.length - 1],
      display: `${this.dateResolver.formatUKDisplay(affectedDates[0])} to ${this.dateResolver.formatUKDisplay(affectedDates[affectedDates.length - 1])}`,
    };

    const summary = this.generateSummary(modifications);
    const warnings = this.generateWarnings(modifications);
    const requiresConfirmation = this.checkRequiresConfirmation(modifications);

    const now = this.dateResolver.nowUK();
    const expiresAt = new Date(now.getTime() + 15 * 60 * 1000);

    return {
      preview_id: previewId,
      proposal_id: proposalId,
      plan_id: this.planId,
      plan_version: this.planVersion,
      modifications,
      affected_workout_ids: affectedWorkoutIds,
      affected_date_range: dateRange,
      summary,
      warnings,
      requires_confirmation: requiresConfirmation,
      created_at: now.toISOString(),
      expires_at: expiresAt.toISOString(),
    };
  }

  private resolveModifications(draft: DraftProposal): WorkoutModification[] {
    const scope = draft.scope.toLowerCase().trim();

    if (draft.operation === 'cancel') {
      return this.resolveCancelScope(scope);
    }

    if (draft.operation === 'reschedule' && draft.modifications) {
      return this.resolveRescheduleModifications(draft.modifications);
    }

    if (draft.operation === 'modify' && draft.modifications) {
      return this.resolveModifyModifications(draft.modifications);
    }

    return [];
  }

  private resolveCancelScope(scope: string): WorkoutModification[] {
    const relativeDay = this.dateResolver.resolveRelativeDay(scope);

    if (!relativeDay.isAmbiguous) {
      const workout = this.workouts.find(
        (w) => w.scheduled_for === relativeDay.isoDate && w.status === 'scheduled'
      );

      if (workout) {
        return [this.createCancelModification(workout)];
      }
    }

    const relativeRange = this.dateResolver.resolveRelativeRange(scope);
    if (relativeRange) {
      const dates = this.dateResolver.getDatesBetween(
        relativeRange.startDate,
        relativeRange.endDate
      );

      const workoutsInRange = this.workouts.filter(
        (w) => dates.includes(w.scheduled_for) && w.status === 'scheduled'
      );

      return workoutsInRange.map((w) => this.createCancelModification(w));
    }

    return [];
  }

  private resolveRescheduleModifications(modifications: any): WorkoutModification[] {
    const results: WorkoutModification[] = [];

    for (const mod of modifications) {
      if (mod.workout_id) {
        const workout = this.workouts.find((w) => w.workout_id === mod.workout_id);
        if (workout) {
          results.push(this.createRescheduleModification(workout, mod.new_date));
        }
      } else if (mod.iso_date) {
        const workout = this.workouts.find((w) => w.scheduled_for === mod.iso_date);
        if (workout) {
          results.push(this.createRescheduleModification(workout, mod.new_date));
        }
      }
    }

    return results;
  }

  private resolveModifyModifications(modifications: any): WorkoutModification[] {
    const results: WorkoutModification[] = [];

    for (const mod of modifications) {
      if (mod.workout_id) {
        const workout = this.workouts.find((w) => w.workout_id === mod.workout_id);
        if (workout) {
          results.push(this.createModifyModification(workout, mod.changes));
        }
      } else if (mod.iso_date) {
        const workout = this.workouts.find((w) => w.scheduled_for === mod.iso_date);
        if (workout) {
          results.push(this.createModifyModification(workout, mod.changes));
        }
      }
    }

    return results;
  }

  private createCancelModification(workout: Workout): WorkoutModification {
    return {
      target: {
        workout_id: workout.workout_id,
        iso_date: workout.scheduled_for,
      },
      operation: 'cancel',
      before: {
        workout_id: workout.workout_id,
        iso_date: workout.scheduled_for,
        display_date: this.dateResolver.formatUKDisplay(workout.scheduled_for),
        day_name: this.dateResolver.getDayName(workout.scheduled_for),
        title: workout.title,
        type: workout.type,
        status: workout.status,
        description: workout.description,
        duration: workout.duration,
        distance: workout.distance,
      },
      after: {
        status: 'cancelled',
      },
    };
  }

  private createRescheduleModification(
    workout: Workout,
    newDate: string
  ): WorkoutModification {
    return {
      target: {
        workout_id: workout.workout_id,
        iso_date: workout.scheduled_for,
      },
      operation: 'reschedule',
      before: {
        workout_id: workout.workout_id,
        iso_date: workout.scheduled_for,
        display_date: this.dateResolver.formatUKDisplay(workout.scheduled_for),
        day_name: this.dateResolver.getDayName(workout.scheduled_for),
        title: workout.title,
        type: workout.type,
        status: workout.status,
        description: workout.description,
        duration: workout.duration,
        distance: workout.distance,
      },
      after: {
        scheduled_for: newDate,
      },
    };
  }

  private createModifyModification(
    workout: Workout,
    changes: any
  ): WorkoutModification {
    return {
      target: {
        workout_id: workout.workout_id,
        iso_date: workout.scheduled_for,
      },
      operation: 'modify',
      before: {
        workout_id: workout.workout_id,
        iso_date: workout.scheduled_for,
        display_date: this.dateResolver.formatUKDisplay(workout.scheduled_for),
        day_name: this.dateResolver.getDayName(workout.scheduled_for),
        title: workout.title,
        type: workout.type,
        status: workout.status,
        description: workout.description,
        duration: workout.duration,
        distance: workout.distance,
      },
      after: changes,
    };
  }

  private generateSummary(modifications: WorkoutModification[]) {
    const byOperation: Record<string, number> = {};
    const byStatusChange: Record<string, number> = {};

    for (const mod of modifications) {
      byOperation[mod.operation] = (byOperation[mod.operation] || 0) + 1;

      if (mod.after.status) {
        const change = `${mod.before.status} → ${mod.after.status}`;
        byStatusChange[change] = (byStatusChange[change] || 0) + 1;
      }
    }

    return {
      total_workouts: modifications.length,
      by_operation: byOperation,
      by_status_change: byStatusChange,
    };
  }

  private generateWarnings(modifications: WorkoutModification[]): string[] {
    const warnings: string[] = [];

    const pastModifications = modifications.filter((m) =>
      this.dateResolver.isInPast(m.target.iso_date)
    );
    if (pastModifications.length > 0) {
      warnings.push(
        `${pastModifications.length} workout(s) are in the past and cannot be modified without explicit confirmation.`
      );
    }

    const completedModifications = modifications.filter(
      (m) => m.before.status === 'completed'
    );
    if (completedModifications.length > 0) {
      warnings.push(
        `${completedModifications.length} workout(s) are already completed and cannot be modified.`
      );
    }

    return warnings;
  }

  private checkRequiresConfirmation(modifications: WorkoutModification[]): boolean {
    if (modifications.length >= 2) return true;

    const hasDestructiveOperation = modifications.some(
      (m) => m.operation === 'cancel' && this.dateResolver.isFuture(m.target.iso_date)
    );

    if (hasDestructiveOperation && modifications.length > 1) return true;

    return false;
  }
}
