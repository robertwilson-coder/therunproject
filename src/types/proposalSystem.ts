/**
 * Gold Standard Proposal System Types
 *
 * Defines the Draft → Preview → Commit pipeline for workout modifications
 * Guarantees transactional integrity and preview-commit consistency
 */

export type WorkoutStatus = 'scheduled' | 'cancelled' | 'completed';

export type OperationType =
  | 'cancel'
  | 'reschedule'
  | 'modify'
  | 'swap'
  | 'add'
  | 'restore';

export interface WorkoutTarget {
  workout_id: string;
  iso_date: string;
}

export interface WorkoutSnapshot {
  workout_id: string;
  iso_date: string;
  display_date: string;
  day_name: string;
  title: string;
  type: string;
  status: WorkoutStatus;
  description?: string;
  duration?: string;
  distance?: string;
}

export interface WorkoutModification {
  target: WorkoutTarget;
  operation: OperationType;

  before: WorkoutSnapshot;

  after: Partial<WorkoutSnapshot>;

  reason?: string;
}

export interface DraftProposal {
  proposal_id: string;
  intent: string;
  scope: string;
  requires_coaching_intervention: boolean;
  coaching_questions?: string[];
  modifications: WorkoutModification[];
  created_at: string;
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
    by_operation: Record<OperationType, number>;
    by_status_change: Record<string, number>;
  };

  warnings: string[];

  requires_confirmation: boolean;

  created_at: string;
  expires_at: string;
}

export interface CommitRequest {
  preview_id: string;
  plan_id: string;
  plan_version: number;

  confirmed_workout_ids: string[];

  user_confirmation: boolean;
}

export interface CommitResult {
  success: boolean;
  committed_workout_ids: string[];
  new_plan_version: number;

  error?: string;
  expired?: boolean;
  version_mismatch?: boolean;
}

export interface CoachingInterventionState {
  requires_intervention: boolean;
  reason: 'multiple_cancellations' | 'long_range_cancellation' | 'pattern_concern' | null;
  questions: string[];
  alternatives: string[];
  user_response_received: boolean;
  proceed_to_preview: boolean;
}

export interface SafetyInvariants {
  no_past_modifications_without_confirmation: boolean;
  no_completed_workout_modifications: boolean;
  target_exists_in_plan: boolean;
  scope_resolved_deterministically: boolean;
  preview_matches_commit: boolean;
}
