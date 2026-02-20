import { ResolvedTarget } from './dateResolver.ts';

export interface ValidationContext {
  planData: any;
  completedWorkouts: Set<string>;
  todayISO: string;
}

export interface ValidationError {
  code: string;
  message: string;
  target?: ResolvedTarget;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  requiresConfirmation: boolean;
  confirmationMessage?: string;
}

export class ProposalValidator {
  private planData: any;
  private completedWorkouts: Set<string>;
  private todayDate: Date;
  private validDates: Set<string>;

  constructor(context: ValidationContext) {
    this.planData = context.planData;
    this.completedWorkouts = context.completedWorkouts;
    this.todayDate = new Date(context.todayISO + 'T00:00:00Z');
    this.validDates = this.buildValidDatesSet();
  }

  validateTargets(targets: ResolvedTarget[], operation: string): ValidationResult {
    const errors: ValidationError[] = [];
    let requiresConfirmation = false;
    let confirmationMessage: string | undefined;

    for (const target of targets) {
      if (!this.validDates.has(target.isoDate)) {
        errors.push({
          code: 'INVALID_DATE',
          message: `Date ${target.isoDate} does not exist in your training plan`,
          target
        });
        continue;
      }

      if (target.isCompleted && operation !== 'view') {
        errors.push({
          code: 'COMPLETED_WORKOUT_IMMUTABLE',
          message: `Cannot modify completed workout on ${target.humanLabel}`,
          target
        });
        continue;
      }

      if (target.relative === 'PAST' && !target.isCompleted && operation !== 'view') {
        if (operation === 'cancel' || operation === 'delete') {
          requiresConfirmation = true;
          confirmationMessage = `This will retroactively cancel your workout on ${target.humanLabel}. Continue?`;
        } else {
          errors.push({
            code: 'PAST_WORKOUT_REQUIRES_EXPLICIT',
            message: `Cannot modify past workout on ${target.humanLabel} without explicit confirmation`,
            target
          });
        }
      }
    }

    const backToBackHardSessions = this.detectBackToBackHardSessions(targets);
    if (backToBackHardSessions.length > 0) {
      errors.push({
        code: 'BACK_TO_BACK_HARD_SESSIONS',
        message: `This would create back-to-back hard sessions: ${backToBackHardSessions.join(', ')}`
      });
    }

    const backToBackLongRuns = this.detectBackToBackLongRuns(targets);
    if (backToBackLongRuns.length > 0) {
      errors.push({
        code: 'BACK_TO_BACK_LONG_RUNS',
        message: `This would create back-to-back long runs: ${backToBackLongRuns.join(', ')}`
      });
    }

    return {
      valid: errors.length === 0,
      errors,
      requiresConfirmation,
      confirmationMessage
    };
  }

  validateOperation(target: ResolvedTarget, operation: string, newWorkout?: string): ValidationResult {
    const errors: ValidationError[] = [];

    if (operation === 'replace' && (!newWorkout || newWorkout.trim() === '')) {
      errors.push({
        code: 'REPLACE_REQUIRES_WORKOUT',
        message: 'Replace operation requires a non-empty workout description',
        target
      });
    }

    if (operation === 'reinstate') {
      const dayData = this.getDayData(target.isoDate);
      if (!dayData || !dayData.status || dayData.status !== 'cancelled') {
        errors.push({
          code: 'REINSTATE_REQUIRES_CANCELLED',
          message: `Cannot reinstate workout on ${target.humanLabel} - it was not cancelled`,
          target
        });
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      requiresConfirmation: false
    };
  }

  private buildValidDatesSet(): Set<string> {
    const dates = new Set<string>();

    if (this.planData.days && Array.isArray(this.planData.days)) {
      this.planData.days.forEach((day: any) => {
        if (day.date) {
          dates.add(day.date);
        }
      });
    }

    return dates;
  }

  private getDayData(isoDate: string): any {
    if (this.planData.days && Array.isArray(this.planData.days)) {
      return this.planData.days.find((day: any) => day.date === isoDate);
    }
    return null;
  }

  private detectBackToBackHardSessions(targets: ResolvedTarget[]): string[] {
    const problematic: string[] = [];

    const sortedTargets = [...targets].sort((a, b) =>
      new Date(a.isoDate).getTime() - new Date(b.isoDate).getTime()
    );

    for (let i = 0; i < sortedTargets.length - 1; i++) {
      const current = sortedTargets[i];
      const next = sortedTargets[i + 1];

      const currentDate = new Date(current.isoDate);
      const nextDate = new Date(next.isoDate);
      const daysDiff = Math.floor((nextDate.getTime() - currentDate.getTime()) / (1000 * 60 * 60 * 24));

      if (daysDiff === 1) {
        const currentDay = this.getDayData(current.isoDate);
        const nextDay = this.getDayData(next.isoDate);

        if (this.isHardSession(currentDay?.workout) && this.isHardSession(nextDay?.workout)) {
          problematic.push(`${current.humanLabel} and ${next.humanLabel}`);
        }
      }
    }

    return problematic;
  }

  private detectBackToBackLongRuns(targets: ResolvedTarget[]): string[] {
    const problematic: string[] = [];

    const sortedTargets = [...targets].sort((a, b) =>
      new Date(a.isoDate).getTime() - new Date(b.isoDate).getTime()
    );

    for (let i = 0; i < sortedTargets.length - 1; i++) {
      const current = sortedTargets[i];
      const next = sortedTargets[i + 1];

      const currentDate = new Date(current.isoDate);
      const nextDate = new Date(next.isoDate);
      const daysDiff = Math.floor((nextDate.getTime() - currentDate.getTime()) / (1000 * 60 * 60 * 24));

      if (daysDiff === 1) {
        const currentDay = this.getDayData(current.isoDate);
        const nextDay = this.getDayData(next.isoDate);

        if (this.isLongRun(currentDay?.workout) && this.isLongRun(nextDay?.workout)) {
          problematic.push(`${current.humanLabel} and ${next.humanLabel}`);
        }
      }
    }

    return problematic;
  }

  private isHardSession(workout: string | undefined): boolean {
    if (!workout) return false;
    const lower = workout.toLowerCase();
    return lower.includes('interval') ||
           lower.includes('tempo') ||
           lower.includes('threshold') ||
           lower.includes('speed') ||
           lower.includes('track') ||
           lower.includes('race');
  }

  private isLongRun(workout: string | undefined): boolean {
    if (!workout) return false;
    const lower = workout.toLowerCase();
    return lower.includes('long run') || lower.includes('long easy');
  }
}
