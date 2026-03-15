import { DateResolver } from './dateResolverBackend.ts';

export interface InterventionState {
  requires_intervention: boolean;
  reason: 'multiple_cancellations' | 'long_range_cancellation' | null;
  message: string;
  suggested_intent: 'insert_recovery_week' | 'suggest_pause' | null;
}

export interface InterventionContext {
  operation: string;
  affected_workout_count: number;
  date_range_days: number;
}

export class CoachingInterventionEngine {
  private dateResolver: DateResolver;

  constructor(referenceDateISO?: string) {
    this.dateResolver = new DateResolver(referenceDateISO);
  }

  evaluateIntervention(context: InterventionContext): InterventionState {
    if (context.operation !== 'cancel') {
      return this.noIntervention();
    }

    if (context.affected_workout_count === 1) {
      return this.noIntervention();
    }

    if (context.date_range_days >= 7) {
      return {
        requires_intervention: true,
        reason: 'long_range_cancellation',
        message: `You are cancelling workouts across ${context.date_range_days} days. This looks like it may warrant a pause or recovery week rather than individual cancellations. If you are ill or injured, consider using the pause option instead.`,
        suggested_intent: 'suggest_pause',
      };
    }

    if (context.affected_workout_count >= 2 && context.affected_workout_count <= 3) {
      return {
        requires_intervention: true,
        reason: 'multiple_cancellations',
        message: `You are cancelling ${context.affected_workout_count} workouts. If fatigue or life demands are building up, a recovery week may serve you better than individual cancellations.`,
        suggested_intent: 'insert_recovery_week',
      };
    }

    return this.noIntervention();
  }

  private noIntervention(): InterventionState {
    return {
      requires_intervention: false,
      reason: null,
      message: '',
      suggested_intent: null,
    };
  }
}
