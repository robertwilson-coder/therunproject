/**
 * planAction.ts
 *
 * Finite Action System — the only set of operations the chat layer may trigger.
 *
 * The LLM must never generate plan edits directly. Instead it outputs structured
 * JSON selecting one action from this list, and the backend executes it using
 * existing deterministic logic.
 */

export type PlanAction =
  | "CANCEL_SESSION"
  | "SKIP_SESSION"
  | "MOVE_SESSION"
  | "SWAP_SESSIONS"
  | "CONVERT_TO_EASY_RUN"
  | "SOFTEN_WEEK"
  | "REDUCE_WEEK_VOLUME"
  | "TRAVEL_WEEK"
  | "REPEAT_WEEK"
  | "L1_SKIP_WORKOUT"
  | "L2_SOFTEN_WEEK"
  | "L3_REDUCE_WEEK"
  | "L4_INSERT_RECOVERY_WEEK"
  | "CHANGE_TRAINING_DAYS"
  | "MOVE_LONG_RUN_DAY"
  | "ADD_EXTRA_RUN"
  | "REMOVE_TRAINING_DAY"
  | "CHANGE_RACE_GOAL"
  | "CHANGE_RACE_DATE"
  | "ADJUST_TARGET_PACE"
  | "REBUILD_PLAN"
  | "EXPLAIN_WORKOUT"
  | "GENERAL_QUESTION"
  | "RECURRING_MOVE_WEEKDAY"
  | "RECURRING_ADD_WEEKDAY"
  | "RECURRING_REMOVE_WEEKDAY"
  | "CHANGE_PLAN_TIER";

export interface ClassifiedIntent {
  action: PlanAction;
  confidence: number;
  parameters: Record<string, string | number | boolean | null>;
  needs_clarification: boolean;
  clarification_question?: string;
}

export interface ActionResult {
  success: boolean;
  message: string;
  planUpdated: boolean;
  updatedPlanData?: { days: any[] };
  blocked?: boolean;
  blockedReason?: string;
}

export const INFORMATIONAL_ACTIONS: PlanAction[] = [
  "EXPLAIN_WORKOUT",
  "GENERAL_QUESTION",
  "CHANGE_RACE_GOAL",
];

export const STRUCTURAL_ACTIONS: PlanAction[] = [
  "L4_INSERT_RECOVERY_WEEK",
  "REBUILD_PLAN",
  "CHANGE_PLAN_TIER",
];

export const SESSION_EDIT_ACTIONS: PlanAction[] = [
  "CANCEL_SESSION",
  "SKIP_SESSION",
  "MOVE_SESSION",
  "SWAP_SESSIONS",
  "CONVERT_TO_EASY_RUN",
  "SOFTEN_WEEK",
  "REDUCE_WEEK_VOLUME",
  "TRAVEL_WEEK",
  "REPEAT_WEEK",
  "L1_SKIP_WORKOUT",
  "L2_SOFTEN_WEEK",
  "L3_REDUCE_WEEK",
  "CHANGE_TRAINING_DAYS",
  "MOVE_LONG_RUN_DAY",
  "ADD_EXTRA_RUN",
  "REMOVE_TRAINING_DAY",
  "ADJUST_TARGET_PACE",
];

export const RECURRING_WEEKDAY_ACTIONS: PlanAction[] = [
  "RECURRING_MOVE_WEEKDAY",
  "RECURRING_ADD_WEEKDAY",
  "RECURRING_REMOVE_WEEKDAY",
];

export function isRecurringWeekdayAction(action: PlanAction): boolean {
  return RECURRING_WEEKDAY_ACTIONS.includes(action);
}

export function isStructuralAction(action: PlanAction): boolean {
  return STRUCTURAL_ACTIONS.includes(action);
}

export function isInformationalAction(action: PlanAction): boolean {
  return INFORMATIONAL_ACTIONS.includes(action);
}

export function isSessionEditAction(action: PlanAction): boolean {
  return SESSION_EDIT_ACTIONS.includes(action);
}

export const PLAN_ACTION_DESCRIPTIONS: Record<PlanAction, string> = {
  CANCEL_SESSION: "Cancel/remove a specific training session on a given date",
  SKIP_SESSION: "Skip a session (mark as rest, same as cancel for a single day)",
  MOVE_SESSION: "Move a session from one date to another date",
  SWAP_SESSIONS: "Swap two sessions between two different dates",
  CONVERT_TO_EASY_RUN: "Convert a quality/tempo/interval session into an easy run",
  SOFTEN_WEEK: "Soften current week — convert quality session to easy run and reduce long run ~12%",
  REDUCE_WEEK_VOLUME: "Reduce all sessions in current week by ~15%",
  TRAVEL_WEEK: "Adjust a week for travel (reduce volume, simplify sessions)",
  REPEAT_WEEK: "Repeat the current week's structure instead of progressing",
  L1_SKIP_WORKOUT: "Fatigue intervention L1 — skip the next scheduled workout",
  L2_SOFTEN_WEEK: "Fatigue intervention L2 — soften this week (quality to easy, long run -12%)",
  L3_REDUCE_WEEK: "Fatigue intervention L3 — reduce this week volume ~15%",
  L4_INSERT_RECOVERY_WEEK: "Fatigue intervention L4 — full structural recovery week rebuild",
  CHANGE_TRAINING_DAYS: "Change which days of the week the runner trains",
  MOVE_LONG_RUN_DAY: "Move the long run to a different day of the week",
  ADD_EXTRA_RUN: "Add an additional easy run to a specific date",
  REMOVE_TRAINING_DAY: "Remove a training day from the weekly schedule",
  CHANGE_RACE_GOAL: "Change the runner's race goal or target time (informational, no plan edit)",
  CHANGE_RACE_DATE: "Change the race date and rebuild the plan accordingly",
  ADJUST_TARGET_PACE: "Adjust the target training paces",
  REBUILD_PLAN: "Full plan rebuild from current position",
  EXPLAIN_WORKOUT: "Explain a specific workout or training concept",
  GENERAL_QUESTION: "Answer a general training question — no plan modification",
  RECURRING_MOVE_WEEKDAY: "Move ALL future workouts from one weekday to another (e.g., 'move all Fridays to Thursday', 'move all future Wednesday workouts to Thursday')",
  RECURRING_ADD_WEEKDAY: "Add a workout to ALL future occurrences of a weekday (e.g., 'add a run to all Mondays', 'add a workout every Monday')",
  RECURRING_REMOVE_WEEKDAY: "Remove/cancel ALL future workouts on a specific weekday (e.g., 'remove all Tuesday workouts', 'cancel all future Friday runs')",
  CHANGE_PLAN_TIER: "Change plan tier/ambition level between Base, Performance, or Competitive (e.g., 'upgrade to competitive', 'move to performance tier', 'switch from base to competitive', 'change my tier')",
};
