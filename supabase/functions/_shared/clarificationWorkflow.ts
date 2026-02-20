/**
 * Gold Standard Clarification Workflow
 *
 * Handles ambiguous user requests by asking for explicit confirmation
 * before making any plan modifications.
 *
 * NON-NEGOTIABLE INVARIANT: No patches are generated or committed until user clarifies.
 */

export interface ClarificationOption {
  id: string;
  isoDate: string;
  displayDate: string;
  label: string;
  metadata?: Record<string, any>;
}

export interface ClarificationRequest {
  mode: 'clarification_required';
  clarificationId: string;
  question: string;
  options: ClarificationOption[];
  context: {
    originalMessage: string;
    detectedPhrase: string;
  };
}

export interface ClarificationResponse {
  mode: 'clarification_response';
  clarificationId: string;
  selectedOptionId: string;
  selectedDate: string;
}

export interface CoachMessageOnly {
  mode: 'coach_message_only';
  message: string;
  reasoning?: string;
}

export interface PreviewMode {
  mode: 'preview';
  previewId: string;
  previewHash: string;
  operations: PreviewOperation[];
  summary: string;
  affectedDates: string[];
}

export interface PreviewOperation {
  operation: 'cancel' | 'reinstate' | 'move' | 'modify' | 'swap';
  workoutId: string;
  isoDate: string;
  displayDate: string;
  before: WorkoutSnapshot;
  after: WorkoutSnapshot;
  destinationDate?: string;
  destinationDisplayDate?: string;
}

export interface WorkoutSnapshot {
  workout: string;
  distance?: number;
  duration?: number;
  notes?: string;
  status: 'scheduled' | 'cancelled' | 'completed';
}

export interface CommitRequest {
  mode: 'commit';
  previewId: string;
  previewHash: string;
  planId: string;
  planVersion: number;
  confirmedWorkoutIds: string[];
}

export interface CommitResponse {
  mode: 'commit_success' | 'commit_failed';
  message: string;
  newPlanVersion?: number;
  error?: string;
  reason?: 'version_mismatch' | 'workout_mismatch' | 'validation_failed';
}

export type ChatResponse = ClarificationRequest | CoachMessageOnly | PreviewMode | CommitResponse;

export function createClarificationRequest(
  question: string,
  options: ClarificationOption[],
  originalMessage: string,
  detectedPhrase: string
): ClarificationRequest {
  const clarificationId = crypto.randomUUID();

  return {
    mode: 'clarification_required',
    clarificationId,
    question,
    options,
    context: {
      originalMessage,
      detectedPhrase,
    },
  };
}

export function createCoachMessage(message: string, reasoning?: string): CoachMessageOnly {
  return {
    mode: 'coach_message_only',
    message,
    reasoning,
  };
}

export function createPreviewMode(
  operations: PreviewOperation[],
  summary: string
): PreviewMode {
  const previewId = crypto.randomUUID();
  const previewHash = generatePreviewHash(operations);
  const affectedDates = [...new Set(operations.map(op => op.isoDate))];

  return {
    mode: 'preview',
    previewId,
    previewHash,
    operations,
    summary,
    affectedDates,
  };
}

function generatePreviewHash(operations: PreviewOperation[]): string {
  const hashInput = operations
    .map(op => `${op.operation}:${op.workoutId}:${op.isoDate}`)
    .sort()
    .join('|');

  return Array.from(new TextEncoder().encode(hashInput))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
    .substring(0, 16);
}

export function validateCommitRequest(
  commit: CommitRequest,
  preview: PreviewMode
): { valid: boolean; reason?: string } {
  if (commit.previewId !== preview.previewId) {
    return { valid: false, reason: 'Preview ID mismatch' };
  }

  if (commit.previewHash !== preview.previewHash) {
    return { valid: false, reason: 'Preview hash mismatch - operations changed' };
  }

  const previewWorkoutIds = new Set(preview.operations.map(op => op.workoutId));
  const commitWorkoutIds = new Set(commit.confirmedWorkoutIds);

  if (previewWorkoutIds.size !== commitWorkoutIds.size) {
    return { valid: false, reason: 'Workout count mismatch' };
  }

  for (const id of commitWorkoutIds) {
    if (!previewWorkoutIds.has(id)) {
      return { valid: false, reason: `Workout ID ${id} not in preview` };
    }
  }

  return { valid: true };
}
