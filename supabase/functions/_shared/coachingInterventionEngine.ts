/**
 * Coaching Intervention Engine
 *
 * Enforces "human coach" behavior as a state machine.
 * Intervenes before destructive changes and guides users to better choices.
 */

import { DateResolver } from './dateResolverBackend.ts';

export interface InterventionState {
  requires_intervention: boolean;
  reason: 'multiple_cancellations' | 'long_range_cancellation' | 'pattern_concern' | null;
  questions: string[];
  alternatives: string[];
  user_response_received: boolean;
  proceed_to_preview: boolean;
}

export interface InterventionContext {
  operation: string;
  scope: string;
  affected_workout_count: number;
  date_range_days: number;
  user_message: string;
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

    if (context.affected_workout_count >= 2 && context.affected_workout_count <= 3) {
      return this.multipleCancellationIntervention(context);
    }

    if (context.date_range_days >= 7) {
      return this.longRangeCancellationIntervention(context);
    }

    return this.noIntervention();
  }

  private noIntervention(): InterventionState {
    return {
      requires_intervention: false,
      reason: null,
      questions: [],
      alternatives: [],
      user_response_received: false,
      proceed_to_preview: true,
    };
  }

  private multipleCancellationIntervention(context: InterventionContext): InterventionState {
    const questions = [
      `I notice you want to cancel ${context.affected_workout_count} workouts. How are you feeling physically?`,
      'Is there something specific that\'s making training difficult right now?',
    ];

    const alternatives = [
      'Option A: Convert these to easier recovery runs instead of cancelling',
      'Option B: Move these workouts to different days this week',
      'Option C: Cancel them as planned',
    ];

    return {
      requires_intervention: true,
      reason: 'multiple_cancellations',
      questions,
      alternatives,
      user_response_received: false,
      proceed_to_preview: false,
    };
  }

  private longRangeCancellationIntervention(context: InterventionContext): InterventionState {
    const questions = [
      `You're cancelling workouts across ${context.date_range_days} days. That's quite a significant break. What's going on?`,
      'Are you injured, overtraining, or just needing some time off?',
    ];

    const alternatives = [
      'Option A: Take a proper recovery week with light cross-training',
      'Option B: Reduce intensity but keep some movement going',
      'Option C: Full rest as requested',
    ];

    return {
      requires_intervention: true,
      reason: 'long_range_cancellation',
      questions,
      alternatives,
      user_response_received: false,
      proceed_to_preview: false,
    };
  }

  parseUserChoice(userMessage: string): 'A' | 'B' | 'C' | 'proceed' | 'unknown' {
    const normalized = userMessage.toLowerCase().trim();

    if (
      normalized.includes('option a') ||
      normalized.includes('choice a') ||
      normalized === 'a'
    ) {
      return 'A';
    }

    if (
      normalized.includes('option b') ||
      normalized.includes('choice b') ||
      normalized === 'b'
    ) {
      return 'B';
    }

    if (
      normalized.includes('option c') ||
      normalized.includes('choice c') ||
      normalized === 'c' ||
      normalized.includes('as planned') ||
      normalized.includes('cancel them')
    ) {
      return 'C';
    }

    if (
      normalized.includes('proceed') ||
      normalized.includes('yes') ||
      normalized.includes('continue') ||
      normalized.includes('go ahead')
    ) {
      return 'proceed';
    }

    return 'unknown';
  }

  shouldProceedToPreview(userChoice: 'A' | 'B' | 'C' | 'proceed' | 'unknown'): boolean {
    return userChoice === 'C' || userChoice === 'proceed';
  }

  generateAlternativePlan(
    choice: 'A' | 'B',
    context: InterventionContext
  ): { operation: string; modifications: any } {
    if (choice === 'A') {
      return {
        operation: 'modify',
        modifications: {
          scope: context.scope,
          changes: {
            type: 'Easy Run',
            description: 'Recovery run - keep it very easy and comfortable',
            intensity: 'low',
          },
        },
      };
    }

    if (choice === 'B') {
      return {
        operation: 'reschedule',
        modifications: {
          scope: context.scope,
          strategy: 'spread_within_week',
        },
      };
    }

    return { operation: 'cancel', modifications: {} };
  }
}
