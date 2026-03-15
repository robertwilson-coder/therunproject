/**
 * fatigueInterventionPlanner.ts
 *
 * Generates graded fatigue intervention options when a runner requests
 * a recovery/deload week or expresses fatigue.
 *
 * Two-stage fatigue flow for marathon plans:
 *   Stage 1: Ask if runner wants to keep the long run (unless they explicitly requested recovery week/deload)
 *   Stage 2: Apply the selected intervention level
 *
 * Long Run Preservation Options (Feature 1):
 *   Option 1 — Keep long run, soften quality sessions only (recommended)
 *   Option 2 — Keep long run but shorten by 10%, reduce other sessions
 *   Option 3 — Skip/replace long run too (bigger cutback)
 *   Option 4 — Full recovery week (rebuild) — only if user explicitly wants this
 *
 * Intervention levels (lightest → heaviest):
 *   L1 — Skip next workout  (minimal, next session only)
 *   L2 — Soften the week    (convert workout → easy, PRESERVE long run by default)
 *   L3 — Reduced week       (volume ~15% down, PRESERVE but shorten long run ~10%)
 *   L4 — Full recovery week (current engine behaviour — insert_recovery_week)
 *
 * This module only generates descriptions and consequence text.
 * L1-L3 produce session-level diff descriptions (no structural rebuild).
 * L4 routes to the existing insert_recovery_week engine pathway.
 */

export type InterventionLevel = 'L1' | 'L2' | 'L3' | 'L4';

export type LongRunPreservationOption = 1 | 2 | 3 | 4;

export interface FatigueInterventionOption {
  level: InterventionLevel;
  label: string;
  shortLabel: string;
  description: string;
  consequence: string;
  intent: 'skip_next_workout' | 'soften_week' | 'reduced_week' | 'insert_recovery_week';
  requiresStructuralRebuild: boolean;
}

export interface FatigueInterventionContext {
  currentWeekVolume?: number;
  currentLongRunKm?: number;
  nextWorkoutTitle?: string;
  weeksToRace?: number;
  isInTaper: boolean;
  raceDistanceKm?: number;
}

export interface LongRunPreservationChoice {
  optionId: LongRunPreservationOption;
  label: string;
  description: string;
  preservesLongRun: boolean;
  longRunReduction: number;
  mapsToLevel: InterventionLevel;
}

export interface FatigueClarificationResponse {
  mode: 'fatigue_long_run_choice';
  message: string;
  options: LongRunPreservationChoice[];
  context: {
    currentLongRunKm?: number;
    isMarathon: boolean;
  };
}

/**
 * Phrases that signal a fatigue/deload request.
 * Used by the edge function to detect this intent before sending to LLM.
 */
export const FATIGUE_REQUEST_PATTERNS: RegExp[] = [
  /\badd\s+(?:a\s+)?recovery\s+week\b/i,
  /\binsert\s+(?:a\s+)?recovery\s+week\b/i,
  /\btake\s+(?:a\s+)?recovery\s+week\b/i,
  /\bhave\s+(?:a\s+)?recovery\s+week\b/i,
  /\bdo\s+(?:a\s+)?recovery\s+week\b/i,
  /\brecovery\s+week\s+(?:this|next)\s+week\b/i,
  /\bdeload\s+week\b/i,
  /\bdeload\b/i,
  /\bdown\s+week\b/i,
  /\brest\s+week\b/i,
  /\bi(?:'m|'m|\s+am|m)\s+(?:super\s+|very\s+|really\s+|so\s+)?(?:exhausted|fatigued|tired|burnt?\s*out|wiped\s+out)\b/i,
  /\bim\s+(?:super\s+|very\s+|really\s+|so\s+)?(?:exhausted|fatigued|tired|burnt?\s*out|wiped\s+out)\b/i,
  /\bi\s+need\s+(?:a\s+)?rest\s+week\b/i,
  /\bneed\s+(?:a\s+)?recovery\b/i,
  /\breduce\s+(?:my\s+)?(?:training|volume|mileage|workouts?)\s+(?:this|next)\s+week\b/i,
  /\breduce\s+this\s+weeks?\s+(?:training|volume|mileage|workouts?)\b/i,
  /\blighter\s+week\b/i,
  /\bease\s+(?:off|up|back)\b/i,
  /\bback\s+off\b/i,
  /\btoo\s+tired\b/i,
  /\bfeeling\s+(?:super\s+|really\s+|very\s+)?(?:tired|fatigued|exhausted|run\s*down)\b/i,
  /\b(?:super|really|very|so)\s+tired\b/i,
  /\bcan\s+you\s+(?:reduce|cut\s+back|lower|ease)\s+(?:this\s+weeks?\s+)?(?:my\s+)?(?:training|volume|mileage|workouts?|load)\b/i,
];

export function isFatigueRequest(message: string): boolean {
  return FATIGUE_REQUEST_PATTERNS.some(p => p.test(message));
}

const EXPLICIT_RECOVERY_WEEK_PATTERNS: RegExp[] = [
  /\brecovery\s+week\b/i,
  /\bdeload\s+week\b/i,
  /\bdeload\b/i,
  /\bdown\s+week\b/i,
  /\brest\s+week\b/i,
  /\bfull\s+recovery\b/i,
  /\binsert\s+(?:a\s+)?recovery/i,
  /\badd\s+(?:a\s+)?recovery/i,
  /\btake\s+(?:a\s+)?recovery/i,
];

export function isExplicitRecoveryWeekRequest(message: string): boolean {
  return EXPLICIT_RECOVERY_WEEK_PATTERNS.some(p => p.test(message));
}

const SHOW_OPTIONS_PATTERNS: RegExp[] = [
  /\bshow\s+(?:me\s+)?(?:the\s+)?options\b/i,
  /\bwhat\s+(?:are\s+)?(?:the\s+|my\s+)?options\b/i,
  /\bsee\s+(?:the\s+)?options\b/i,
  /\bshow\s+(?:me\s+)?(?:the\s+)?(?:intervention|fatigue|recovery)\s+options\b/i,
  /\blist\s+(?:the\s+)?options\b/i,
  /\bwhat\s+can\s+(?:i|you)\s+do\b/i,
];

const RECENT_FATIGUE_IN_HISTORY_PATTERNS: RegExp[] = [
  /tired|fatigued|exhausted|recovery\s+week|deload|rest\s+week|reduce.*volume|lighter\s+week/i,
];

export function isFatigueOptionsFollowUp(
  message: string,
  chatHistory: Array<{ role: string; content: string }>,
): boolean {
  if (!SHOW_OPTIONS_PATTERNS.some(p => p.test(message))) return false;
  const recentMessages = chatHistory.slice(-6);
  return recentMessages.some(
    m => RECENT_FATIGUE_IN_HISTORY_PATTERNS.some(p => p.test(m.content))
  );
}

/**
 * Check if race distance is marathon (42km) or half-marathon (21km) — used for long run preservation flow.
 */
export function isMarathonDistance(raceDistanceKm?: number): boolean {
  if (!raceDistanceKm) return false;
  return raceDistanceKm >= 21;
}

/**
 * Generate the long run preservation choices for marathon fatigue flow.
 * Only called when user says "I'm tired" but did NOT explicitly request recovery week/deload.
 */
export function generateLongRunPreservationChoices(
  ctx: FatigueInterventionContext,
): LongRunPreservationChoice[] {
  const { currentLongRunKm } = ctx;

  const shortenedLongRun = currentLongRunKm
    ? Math.round(currentLongRunKm * 0.90 * 2) / 2
    : undefined;

  const choices: LongRunPreservationChoice[] = [
    {
      optionId: 1,
      label: 'Yes, keep the long run (recommended)',
      description: currentLongRunKm
        ? `Keep your ${currentLongRunKm} km long run unchanged. Quality sessions become easy runs.`
        : 'Keep your long run unchanged. Quality sessions become easy runs.',
      preservesLongRun: true,
      longRunReduction: 0,
      mapsToLevel: 'L2',
    },
    {
      optionId: 2,
      label: 'Keep it but shorten it slightly',
      description: shortenedLongRun
        ? `Shorten long run to ${shortenedLongRun} km (10% reduction). Other sessions also reduced.`
        : 'Shorten long run by 10%. Other sessions also reduced.',
      preservesLongRun: true,
      longRunReduction: 0.10,
      mapsToLevel: 'L3',
    },
    {
      optionId: 3,
      label: 'Skip the long run too (bigger cutback)',
      description: 'Replace long run with an easy short run or rest. Significant volume reduction this week.',
      preservesLongRun: false,
      longRunReduction: 1.0,
      mapsToLevel: 'L3',
    },
    {
      optionId: 4,
      label: 'Full recovery week (rebuild)',
      description: 'Insert a full recovery week with structural rebuild. This affects the entire remaining plan.',
      preservesLongRun: false,
      longRunReduction: 0.25,
      mapsToLevel: 'L4',
    },
  ];

  return choices;
}

/**
 * Build the coaching message for long run preservation clarification.
 */
export function buildLongRunPreservationMessage(ctx: FatigueInterventionContext): string {
  return "It sounds like you need some recovery this week. For marathon training, keeping the long run is usually the right call. Do you want to keep your long run this week?";
}

/**
 * Parse user response to long run preservation question.
 * Handles: "1", "option 1", "yes", "keep", "shorten", "skip", "recovery week", etc.
 * Returns null if no clear match.
 */
export function parseLongRunPreservationResponse(message: string): LongRunPreservationOption | null {
  const lower = message.toLowerCase().trim();

  if (/^1$|^option\s*1$|^yes|^keep\s+(?:the\s+)?long\s+run|^keep\s+it\s+unchanged|^recommended/i.test(lower)) {
    return 1;
  }

  if (/^2$|^option\s*2$|^shorten|^keep\s+(?:it\s+)?but\s+shorten|^slightly/i.test(lower)) {
    return 2;
  }

  if (/^3$|^option\s*3$|^skip|^bigger|^cutback|^skip\s+(?:the\s+)?long/i.test(lower)) {
    return 3;
  }

  if (/^4$|^option\s*4$|^full|^recovery\s+week|^rebuild/i.test(lower)) {
    return 4;
  }

  return null;
}

/**
 * Map long run preservation option to intervention level with appropriate flags.
 */
export function mapPreservationOptionToLevel(
  option: LongRunPreservationOption
): { level: InterventionLevel; preserveLongRun: boolean; skipLongRun: boolean } {
  switch (option) {
    case 1:
      return { level: 'L2', preserveLongRun: true, skipLongRun: false };
    case 2:
      return { level: 'L3', preserveLongRun: true, skipLongRun: false };
    case 3:
      return { level: 'L3', preserveLongRun: false, skipLongRun: true };
    case 4:
      return { level: 'L4', preserveLongRun: false, skipLongRun: false };
  }
}

/**
 * Generate the four intervention options, contextualised to the runner's current plan state.
 */
export function generateFatigueOptions(
  ctx: FatigueInterventionContext,
): FatigueInterventionOption[] {
  const { currentWeekVolume, currentLongRunKm, nextWorkoutTitle, weeksToRace, isInTaper } = ctx;

  const softenedLongRun = currentLongRunKm
    ? Math.round(currentLongRunKm * 0.88 * 2) / 2
    : undefined;

  const reducedVolume = currentWeekVolume
    ? Math.round(currentWeekVolume * 0.85 * 10) / 10
    : undefined;

  const reducedLongRun = currentLongRunKm
    ? Math.round(currentLongRunKm * 0.88 * 2) / 2
    : undefined;

  const l1: FatigueInterventionOption = {
    level: 'L1',
    label: 'Skip your next workout',
    shortLabel: 'Skip next session',
    description: nextWorkoutTitle
      ? `Convert "${nextWorkoutTitle}" into a rest day. All other sessions unchanged.`
      : 'Convert your next scheduled workout into a rest day. All other sessions unchanged.',
    consequence: 'Minimal impact on your overall training progression. Suitable if fatigue is temporary or one-off.',
    intent: 'skip_next_workout',
    requiresStructuralRebuild: false,
  };

  const l2: FatigueInterventionOption = {
    level: 'L2',
    label: 'Soften this week',
    shortLabel: 'Soften the week',
    description: softenedLongRun
      ? `Convert quality workout → easy run. Reduce long run to ~${softenedLongRun} km. Easy runs unchanged.`
      : 'Convert quality workout → easy run. Reduce long run by ~10–15%. Easy runs unchanged.',
    consequence: 'Training load decreases slightly this week. Peak long run potential remains similar — you can build back next week.',
    intent: 'soften_week',
    requiresStructuralRebuild: false,
  };

  const l3: FatigueInterventionOption = {
    level: 'L3',
    label: 'Reduce this week',
    shortLabel: 'Reduced week',
    description: (reducedVolume && reducedLongRun)
      ? `Weekly volume reduced to ~${reducedVolume} km. Long run reduced to ~${reducedLongRun} km. Quality session kept but at reduced intensity.`
      : 'Weekly volume reduced ~15%. Long run reduced ~10–15%. Quality session kept but at lower intensity.',
    consequence: 'Small reduction in trajectory impact. Peak long run may be 1–2 km lower later in the plan, depending on remaining weeks.',
    intent: 'reduced_week',
    requiresStructuralRebuild: false,
  };

  const l4Consequence = weeksToRace !== undefined && weeksToRace < 6
    ? 'This will likely reduce your peak long run. With only a few weeks to race, a full recovery week will compress your remaining build time. Consider a lighter option if the fatigue is manageable.'
    : 'This may reduce your peak long run slightly later in the plan as the engine rebalances volume across the remaining weeks. Recovery weeks are valuable but use them intentionally.';

  const l4: FatigueInterventionOption = {
    level: 'L4',
    label: 'Insert a full recovery week',
    shortLabel: 'Full recovery week',
    description: 'Full structural rebuild. This week becomes a recovery week (~80–85% volume, ~70–75% long run, strides instead of workout session). All subsequent weeks are recomputed.',
    consequence: l4Consequence,
    intent: 'insert_recovery_week',
    requiresStructuralRebuild: true,
  };

  if (isInTaper) {
    return [l1, l2];
  }

  return [l1, l2, l3, l4];
}

/**
 * Build the coaching message that presents the options.
 * Used by the edge function to compose the response without an LLM call.
 */
export function buildFatigueInterventionMessage(
  options: FatigueInterventionOption[],
  ctx: FatigueInterventionContext,
): string {
  const intro = ctx.isInTaper
    ? "It sounds like you're feeling fatigued. Since you're in the taper period, a full recovery week isn't appropriate — but I can still lighten the load."
    : "It sounds like you need some recovery. A full recovery week is one option, but there are lighter adjustments we can try first.";

  const suffix = "Have a look at the options below and select whichever works best for you.";

  return `${intro} ${suffix}`;
}
