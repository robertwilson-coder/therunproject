/*
 * Workout Selector
 *
 * Deterministic engine that selects the best workout from the library
 * for each week's structural context.
 *
 * SELECTION PRINCIPLES:
 * 1. Filter to valid candidates (family, phase, tier, archetype)
 * 2. Prefer higher progressionVariantLevel as the plan matures
 * 3. Enforce anti-repeat: avoid the same antiRepeatCategory in consecutive weeks
 * 4. Respect difficulty budget: if long run is demanding, prefer lower-cost quality
 * 5. Prefer workoutPurpose alignment with the week's primary purpose
 * 6. Fall back gracefully — always return something valid
 *
 * The selector is deterministic given the same inputs. It does not use
 * random selection — it scores candidates and picks the highest scorer.
 */

import {
  WORKOUT_LIBRARY,
  QUALITY_WORKOUTS,
  getLongRunWorkoutFor,
  getSupportWorkoutFor,
  type WorkoutEntry,
  type WorkoutCategory,
} from './workoutLibrary.ts';

import type {
  RaceFamily,
  AmbitionTier,
  ArchetypePhase,
  PlanArchetype,
  QualitySessionBlueprint,
  SupportRunRole,
  LongRunFlavour,
  WorkoutPurpose,
} from './planStructureBuilder.ts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WeekWorkoutSelection {
  primaryQualityWorkoutId: string;
  primaryQualityWorkout: WorkoutEntry;
  secondaryQualityWorkoutId?: string;
  secondaryQualityWorkout?: WorkoutEntry;
  longRunWorkoutId: string;
  longRunWorkout: WorkoutEntry;
  supportRunWorkoutId: string;
  supportRunWorkout: WorkoutEntry;
}

export interface WorkoutSelectionContext {
  weekIndex: number;
  totalWeeks: number;
  raceFamily: RaceFamily;
  phase: ArchetypePhase;
  tier: AmbitionTier;
  archetype: PlanArchetype;
  longRunFlavour: LongRunFlavour;
  supportRunRole: SupportRunRole;
  primaryQualityBlueprint: QualitySessionBlueprint;
  secondaryQualityBlueprint?: QualitySessionBlueprint;
  primaryWorkoutPurpose: WorkoutPurpose;
  secondaryWorkoutPurpose?: WorkoutPurpose;
  qualitySessionsThisWeek: number;
  difficultyBudgetUsed: 'demanding' | 'moderate' | 'light';
  phaseProgressPercent: number;

  // History for anti-repeat
  recentPrimaryCategories: WorkoutCategory[];  // last 3 weeks
  recentSecondaryCategories: WorkoutCategory[];
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

function scoreCandidate(
  workout: WorkoutEntry,
  ctx: WorkoutSelectionContext,
  isPrimary: boolean,
  usedPrimaryId?: string
): number {
  let score = 0;

  // Blueprint alignment: strong match scores highly
  if (isPrimary && workout.qualityBlueprint === ctx.primaryQualityBlueprint) score += 30;
  if (!isPrimary && workout.qualityBlueprint === ctx.secondaryQualityBlueprint) score += 30;

  // Purpose alignment
  const targetPurpose = isPrimary ? ctx.primaryWorkoutPurpose : ctx.secondaryWorkoutPurpose;
  if (targetPurpose && workout.workoutPurposesServed.includes(targetPurpose)) score += 20;

  // Progression variant: prefer higher variants as plan matures
  const planProgress = ctx.totalWeeks > 1 ? ctx.weekIndex / (ctx.totalWeeks - 1) : 1;
  const idealVariant = planProgress < 0.35 ? 1 : planProgress < 0.65 ? 2 : 3;
  if (workout.progressionVariantLevel === idealVariant) score += 15;
  else if (Math.abs(workout.progressionVariantLevel - idealVariant) === 1) score += 8;

  // Difficulty budget: if long run is demanding, prefer low-cost quality
  if (ctx.difficultyBudgetUsed === 'demanding') {
    if (workout.difficultyBudgetCost <= 2) score += 10;
    if (workout.difficultyBudgetCost >= 4) score -= 15;
  } else if (ctx.difficultyBudgetUsed === 'moderate') {
    if (workout.difficultyBudgetCost <= 3) score += 5;
  }

  // Anti-repeat: hard-block if same category appeared in last 2 weeks; penalise for last 4
  const recentAll = isPrimary
    ? ctx.recentPrimaryCategories
    : ctx.recentSecondaryCategories;
  const last4 = recentAll.slice(-4);
  const last2 = recentAll.slice(-2);
  if (last2.includes(workout.antiRepeatCategory)) {
    score -= 60; // strong penalty — effectively blocks unless no other option
  } else if (last4.includes(workout.antiRepeatCategory)) {
    const occurrences = last4.filter(c => c === workout.antiRepeatCategory).length;
    score -= occurrences * 15;
  }

  // Avoid same workout as primary when selecting secondary
  if (!isPrimary && usedPrimaryId) {
    if (workout.workoutId === usedPrimaryId) score -= 100;
    // Also avoid same blueprint as primary
    const primaryEntry = WORKOUT_LIBRARY.find(w => w.workoutId === usedPrimaryId);
    if (primaryEntry && workout.qualityBlueprint === primaryEntry.qualityBlueprint) score -= 20;
    // Prefer different antiRepeatCategory
    if (primaryEntry && workout.antiRepeatCategory === primaryEntry.antiRepeatCategory) score -= 15;
  }

  // Phase progression: prefer workouts that match phase intent
  if (ctx.phase === 'aerobic_reset' && workout.progressionVariantLevel === 1) score += 5;
  if (ctx.phase === 'race_specificity' && workout.progressionVariantLevel >= 2) score += 5;
  if (ctx.phase === 'taper' && workout.difficultyBudgetCost <= 2) score += 10;

  return score;
}

// ---------------------------------------------------------------------------
// Main selector
// ---------------------------------------------------------------------------

export function selectWeekWorkouts(ctx: WorkoutSelectionContext): WeekWorkoutSelection {
  // 1. Select long run
  const longRunWorkout = selectLongRun(ctx);

  // 2. Select primary quality session
  const primaryQuality = selectQualitySession(ctx, true);

  // 3. Select secondary quality session (only if week has 2 quality sessions)
  let secondaryQuality: WorkoutEntry | undefined;
  if (ctx.qualitySessionsThisWeek >= 2) {
    secondaryQuality = selectQualitySession(ctx, false, primaryQuality.workoutId);
  }

  // 4. Select support run
  const supportRun = getSupportWorkoutFor(ctx.supportRunRole, ctx.raceFamily, ctx.tier);

  return {
    primaryQualityWorkoutId: primaryQuality.workoutId,
    primaryQualityWorkout: primaryQuality,
    secondaryQualityWorkoutId: secondaryQuality?.workoutId,
    secondaryQualityWorkout: secondaryQuality,
    longRunWorkoutId: longRunWorkout.workoutId,
    longRunWorkout,
    supportRunWorkoutId: supportRun.workoutId,
    supportRunWorkout: supportRun,
  };
}

function selectLongRun(ctx: WorkoutSelectionContext): WorkoutEntry {
  const match = getLongRunWorkoutFor(
    ctx.longRunFlavour,
    ctx.raceFamily,
    ctx.phase,
    ctx.tier
  );
  if (match) return match;

  // Fallback: any long run for this family
  const fallback = WORKOUT_LIBRARY.find(w =>
    w.sessionType === 'long_run' && w.raceFamiliesAllowed.includes(ctx.raceFamily)
  );
  return fallback ?? WORKOUT_LIBRARY.find(w => w.sessionType === 'long_run')!;
}

function selectQualitySession(
  ctx: WorkoutSelectionContext,
  isPrimary: boolean,
  usedPrimaryId?: string
): WorkoutEntry {
  // Get valid candidates
  const candidates = QUALITY_WORKOUTS.filter(w =>
    w.raceFamiliesAllowed.includes(ctx.raceFamily) &&
    w.phasesAllowed.includes(ctx.phase) &&
    w.tiersAllowed.includes(ctx.tier) &&
    w.archetypesAllowed.includes(ctx.archetype)
  );

  if (candidates.length === 0) {
    // Ultimate fallback
    return QUALITY_WORKOUTS.find(w =>
      w.raceFamiliesAllowed.includes(ctx.raceFamily)
    ) ?? QUALITY_WORKOUTS[0];
  }

  // Score all candidates
  const scored = candidates.map(w => ({
    workout: w,
    score: scoreCandidate(w, ctx, isPrimary, usedPrimaryId),
  }));

  // Sort descending by score
  scored.sort((a, b) => b.score - a.score);

  return scored[0].workout;
}

// ---------------------------------------------------------------------------
// History tracker helper
// ---------------------------------------------------------------------------

export function buildRecentCategoryHistory(
  previousSelections: Array<{ primaryCategory: WorkoutCategory; secondaryCategory?: WorkoutCategory }>,
  windowSize = 5
): { recentPrimary: WorkoutCategory[]; recentSecondary: WorkoutCategory[] } {
  const recent = previousSelections.slice(-windowSize);
  return {
    recentPrimary: recent.map(s => s.primaryCategory),
    recentSecondary: recent.flatMap(s => s.secondaryCategory ? [s.secondaryCategory] : []),
  };
}

// ---------------------------------------------------------------------------
// Rendering hint builder
// Called by promptBuilder to inject workout identity into per-week instructions
// ---------------------------------------------------------------------------

export interface WorkoutRenderingHint {
  workoutName: string;
  aiRenderingNotes: string;
  effortDescription: string;
  tipCue: string;
  repStructureSummary?: string;
}

export function buildRenderingHint(workout: WorkoutEntry): WorkoutRenderingHint {
  let repStructureSummary: string | undefined;
  if (workout.repStructure) {
    const r = workout.repStructure;
    if (r.distanceKm) {
      repStructureSummary = `${r.reps} × ${r.distanceKm} km`;
    } else if (r.durationMin) {
      repStructureSummary = r.reps > 1
        ? `${r.reps} × ${r.durationMin} min`
        : `${r.durationMin} min continuous`;
    }
    if (r.recoveryDescription) {
      repStructureSummary += ` (recovery: ${r.recoveryDescription})`;
    }
  }

  return {
    workoutName: workout.workoutName,
    aiRenderingNotes: workout.aiRenderingNotes,
    effortDescription: workout.effortDescription,
    tipCue: workout.tipCue,
    repStructureSummary,
  };
}
