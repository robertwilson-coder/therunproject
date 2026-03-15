/**
 * recoveryRebuild.ts
 *
 * V2 contract — fully deterministic rebuild. No LLM path for week/day structure.
 *
 * Structural rules (non-negotiable):
 *   - All days with date < insertionWeekISO are FROZEN — returned byte-for-byte unchanged.
 *   - insertionWeekISO = Monday of the week containing todayISO (the recovery insertion week).
 *   - Only days with date >= insertionWeekISO are rebuilt.
 *   - Rebuilt days reuse the ORIGINAL PLAN DATES as scaffolding — no new dates are generated.
 *   - Taper days (date >= taperFreezeISO) are FROZEN — returned byte-for-byte unchanged.
 *     taperFreezeISO = Monday of the first taper week, computed from the original plan's end date
 *     and the ambition-tier taper length (base/performance: 2 weeks, competitive: 3 weeks).
 *   - A guard verifies no day with date < insertionWeekISO appears in the rebuilt output;
 *     if any does, intent_blocked("past_weeks_modified") is thrown.
 *   - The normaliser runs as a final audit only.
 */

import { buildStructuralGuidance, parseRaceDistanceKm, StructuralGuidance } from './planStructureBuilder.ts';
import { normalizePlanToStructure, validatePlanStructure } from './planNormalizer.ts';
import { logger } from './logger.ts';
import { computeTaperStartISO, deriveTaperWeeks } from './taperGuard.ts';
import { runRecoveryOptimizer, buildOptimizerInputFromRebuildContext, OptimizerOutput } from './recoveryOptimizer.ts';

const RECOVERY_VOLUME_RATIO = 0.85;
const FULL_MARATHON_THRESHOLD_KM = 42;
const MIN_MARATHON_BUILD_WEEKLY_KM = 30;
const LONG_RUN_VOLUME_CAP = 0.60;
const MIN_MARATHON_LONG_RUN_KM = 14;
const KM_PER_MILE = 1.60934;

const MIN_COHERENT_LR_SHARE = 0.20;
const MAX_COHERENT_LR_SHARE = 0.50;
const DEFAULT_LR_SHARE = 0.32;

const DOW_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// Taper weeks by ambition tier — used both for splitting and for deterministic recomputation
const TAPER_WEEKS_BY_TIER: Record<string, number> = {
  base: 2,
  performance: 2,
  competitive: 3,
};

// Fixed taper multipliers (volume, long run) indexed by taper week position (0 = first taper week)
const TAPER_VOL_MULTS: Record<number, number[]> = {
  2: [0.75, 0.55],
  3: [0.80, 0.65, 0.50],
};
const TAPER_LR_MULTS: Record<number, number[]> = {
  2: [0.70, 0.45],
  3: [0.75, 0.55, 0.40],
};

/**
 * Compute the ISO date of the Monday that starts the taper freeze window.
 * We walk back N taper weeks from the last Monday of the plan.
 */
function computeTaperFreezeISO(allPlanDays: any[], ambitionTier: string): string | null {
  if (allPlanDays.length === 0) return null;
  const taperWeeks = TAPER_WEEKS_BY_TIER[ambitionTier] ?? 2;
  if (taperWeeks <= 0) return null;

  const lastDate = allPlanDays[allPlanDays.length - 1].date as string;
  const lastMs = new Date(lastDate + 'T00:00:00Z').getTime();

  // Find Monday of the week containing the last plan day
  const lastDow = new Date(lastDate + 'T12:00:00Z').getUTCDay();
  const mondayOffset = lastDow === 0 ? -6 : 1 - lastDow;
  const lastWeekMondayMs = lastMs + mondayOffset * 24 * 60 * 60 * 1000;

  // Walk back (taperWeeks - 1) additional weeks from the last week's Monday
  const taperFreezeMs = lastWeekMondayMs - (taperWeeks - 1) * 7 * 24 * 60 * 60 * 1000;
  return new Date(taperFreezeMs).toISOString().split('T')[0];
}

/**
 * Production classifier for long-run workouts. Matches planNormalizer.ts::isLongRun() exactly.
 * This is the authoritative classifier used throughout the recovery rebuild.
 * Text heuristics ("long run", "long slow", "lsd", "long easy") are the fallback if no
 * higher-level classifier exists.
 */
function isLongRunWorkout(workout: string): boolean {
  const lower = workout.toLowerCase();
  return lower.includes('long run') || lower.includes('long slow') || lower.includes('lsd') || lower.includes('long easy');
}

// Predicate matching planNormalizer.ts detectRunDistanceKm() first pattern
const KM_RE = /(\d+(?:\.\d+)?)\s*km/i;
function extractKmFromWorkout(workout: string): number {
  const m = workout.match(KM_RE);
  return m ? parseFloat(m[1]) : 0;
}

/**
 * Unified baseline for recovery rebuild.
 *
 * CRITICAL: Both weeklyVolumeKm and longRunKm MUST come from the SAME source
 * to prevent the skew where missed weekday sessions depress weekly volume
 * while completed long runs preserve the long run baseline.
 */
export interface UnifiedPlannedBaseline {
  weeklyVolumeKm: number;
  longRunKm: number;
  source: string;
}

/**
 * Candidate week for baseline selection.
 * Computed from PLANNED workout text only — never uses actual_distance.
 */
interface WeekCandidate {
  weekIndex: number;
  weekStartISO: string;
  weeklyVolumeKm: number;
  longRunKm: number;
  longRunShare: number;
  trainDayCount: number;
  hasLongRun: boolean;
  validityScore: number;
}

/**
 * Minimum thresholds for a week to be considered structurally valid.
 * These are intentionally conservative to avoid false rejections.
 */
const MIN_VALID_WEEKLY_KM = 15;
const MIN_VALID_LONG_RUN_KM = 5;
const MIN_VALID_TRAIN_DAYS = 2;
const CANDIDATE_WEEKS_TO_SCAN = 3;

/**
 * Compute structural validity score for a candidate week.
 *
 * Scoring policy (higher = better):
 * - Base score: 0
 * - +3 if weeklyVolumeKm >= MIN_VALID_WEEKLY_KM
 * - +3 if hasLongRun and longRunKm >= MIN_VALID_LONG_RUN_KM
 * - +2 if trainDayCount >= 3
 * - +1 if trainDayCount >= MIN_VALID_TRAIN_DAYS
 * - +2 if longRunShare is in healthy range (25%-45%)
 * - -2 if longRunShare is pathological (<20% or >50%)
 * - -1 penalty per week of age (prefer more recent)
 *
 * A week is considered "structurally valid" if score >= 6.
 */
function computeWeekValidityScore(candidate: Omit<WeekCandidate, 'validityScore'>): number {
  let score = 0;

  if (candidate.weeklyVolumeKm >= MIN_VALID_WEEKLY_KM) score += 3;
  if (candidate.hasLongRun && candidate.longRunKm >= MIN_VALID_LONG_RUN_KM) score += 3;
  if (candidate.trainDayCount >= 3) score += 2;
  else if (candidate.trainDayCount >= MIN_VALID_TRAIN_DAYS) score += 1;

  if (candidate.longRunShare >= 0.25 && candidate.longRunShare <= 0.45) {
    score += 2;
  } else if (candidate.longRunShare < MIN_COHERENT_LR_SHARE || candidate.longRunShare > MAX_COHERENT_LR_SHARE) {
    score -= 2;
  }

  score -= candidate.weekIndex;

  return score;
}

const STRUCTURALLY_VALID_THRESHOLD = 6;

/**
 * Extract candidate week metrics from frozen days.
 * Uses ONLY planned km from workout text — never actual_distance.
 */
function extractWeekCandidate(
  frozenDays: any[],
  weekStartMs: number,
  weekEndMs: number,
  weekIndex: number,
): WeekCandidate {
  const weekStartISO = new Date(weekStartMs).toISOString().split('T')[0];

  const weekDays = frozenDays.filter((d: any) => {
    const t = new Date(d.date + 'T00:00:00Z').getTime();
    return t >= weekStartMs && t < weekEndMs;
  });

  let weeklyVolumeKm = 0;
  let longRunKm = 0;
  let trainDayCount = 0;
  let hasLongRun = false;

  for (const d of weekDays) {
    if (d.workout_type === 'REST' || d.workout_type === 'RACE') continue;
    trainDayCount++;
    const plannedKm = extractKmFromWorkout(d.workout ?? '');
    weeklyVolumeKm += plannedKm;
    if (isLongRunWorkout(d.workout ?? '')) {
      hasLongRun = true;
      if (plannedKm > longRunKm) longRunKm = plannedKm;
    }
  }

  weeklyVolumeKm = Math.round(weeklyVolumeKm * 10) / 10;
  const longRunShare = weeklyVolumeKm > 0 ? longRunKm / weeklyVolumeKm : 0;

  const baseCandidate = {
    weekIndex,
    weekStartISO,
    weeklyVolumeKm,
    longRunKm,
    longRunShare,
    trainDayCount,
    hasLongRun,
  };

  return {
    ...baseCandidate,
    validityScore: computeWeekValidityScore(baseCandidate),
  };
}

/**
 * Derive a unified baseline from PLANNED workout text only.
 *
 * This function NEVER uses actual_distance. It extracts km from workout text
 * to ensure both weekly volume and long run baselines come from the same
 * structural reference (the coach's intended plan), not from volatile
 * completion state.
 *
 * BASELINE SELECTION POLICY:
 *
 * 1. Scan the last 3 frozen weeks before insertionWeekISO (week 0 = immediately prior)
 *
 * 2. For each candidate week, compute from PLANNED text only:
 *    - weeklyVolumeKm, longRunKm, longRunShare, trainDayCount, hasLongRun
 *    - validityScore based on structural completeness
 *
 * 3. A week is "structurally valid" if validityScore >= 6, meaning:
 *    - Sufficient weekly volume (>= 15 km)
 *    - Detectable long run (>= 5 km)
 *    - At least 2 training days
 *    - Reasonable LR share (not pathologically skewed)
 *
 * 4. Selection priority:
 *    a) Most recent structurally valid week (prefer recency)
 *    b) If no valid week: use median of candidates that have any data
 *    c) If still insufficient: fall back to answers.currentWeeklyKm
 *    d) Last resort: absolute fallback based on race distance
 *
 * 5. Final coherence clamping: LR share is clamped to [20%, 50%] if needed
 *
 * This avoids using atypical weeks (cutbacks, sparse weeks) as the sole baseline.
 */
function deriveUnifiedPlannedBaseline(
  frozenDays: any[],
  insertionWeekISO: string,
  answers: Record<string, any>,
  raceDistanceKm: number,
): UnifiedPlannedBaseline {
  const insertionMs = new Date(insertionWeekISO + 'T00:00:00Z').getTime();

  const candidates: WeekCandidate[] = [];
  for (let wi = 0; wi < CANDIDATE_WEEKS_TO_SCAN; wi++) {
    const weekEndMs = insertionMs - wi * 7 * 24 * 60 * 60 * 1000;
    const weekStartMs = weekEndMs - 7 * 24 * 60 * 60 * 1000;
    const candidate = extractWeekCandidate(frozenDays, weekStartMs, weekEndMs, wi);
    candidates.push(candidate);
  }

  logger.info('[RecoveryRebuild] Baseline candidates scanned', {
    candidateCount: candidates.length,
    candidates: candidates.map(c => ({
      weekIndex: c.weekIndex,
      weekStartISO: c.weekStartISO,
      weeklyVolumeKm: c.weeklyVolumeKm,
      longRunKm: c.longRunKm,
      longRunShare: Math.round(c.longRunShare * 100),
      trainDayCount: c.trainDayCount,
      hasLongRun: c.hasLongRun,
      validityScore: c.validityScore,
      isValid: c.validityScore >= STRUCTURALLY_VALID_THRESHOLD,
    })),
  });

  const validCandidates = candidates
    .filter(c => c.validityScore >= STRUCTURALLY_VALID_THRESHOLD)
    .sort((a, b) => a.weekIndex - b.weekIndex);

  if (validCandidates.length > 0) {
    const selected = validCandidates[0];
    return applyCoherenceClamping(
      selected.weeklyVolumeKm,
      selected.longRunKm,
      `frozen_week_${selected.weekIndex}_valid`,
      selected.weekIndex,
    );
  }

  const candidatesWithData = candidates.filter(c => c.weeklyVolumeKm > 0 && c.trainDayCount >= 1);
  if (candidatesWithData.length > 0) {
    const sortedByVolume = [...candidatesWithData].sort((a, b) => a.weeklyVolumeKm - b.weeklyVolumeKm);
    const medianIndex = Math.floor(sortedByVolume.length / 2);
    const medianCandidate = sortedByVolume[medianIndex];

    if (medianCandidate.weeklyVolumeKm >= 10) {
      const effectiveLongRun = medianCandidate.longRunKm > 0
        ? medianCandidate.longRunKm
        : Math.round(medianCandidate.weeklyVolumeKm * DEFAULT_LR_SHARE * 2) / 2;

      logger.info('[RecoveryRebuild] Using median candidate week (paired baseline)', {
        candidatesWithDataCount: candidatesWithData.length,
        medianCandidateWeekIndex: medianCandidate.weekIndex,
        medianCandidateWeeklyVolumeKm: medianCandidate.weeklyVolumeKm,
        medianCandidateLongRunKm: medianCandidate.longRunKm,
        effectiveLongRun,
        allCandidateVolumes: candidatesWithData.map(c => c.weeklyVolumeKm),
      });

      return applyCoherenceClamping(
        medianCandidate.weeklyVolumeKm,
        effectiveLongRun,
        `frozen_week_${medianCandidate.weekIndex}_median`,
        medianCandidate.weekIndex,
      );
    }
  }

  const answersKm = extractAnswersWeeklyKm(answers);
  if (answersKm > 0) {
    const derivedLongRunKm = Math.round(answersKm * DEFAULT_LR_SHARE * 2) / 2;
    logger.info('[RecoveryRebuild] Unified baseline from answers fallback', {
      answersKm,
      derivedLongRunKm,
      share: Math.round(DEFAULT_LR_SHARE * 100),
    });
    return {
      weeklyVolumeKm: answersKm,
      longRunKm: derivedLongRunKm,
      source: 'answers_fallback',
    };
  }

  const isMarathon = raceDistanceKm >= FULL_MARATHON_THRESHOLD_KM;
  const defaultWeekly = isMarathon ? 40 : 25;
  const defaultLongRun = Math.round(defaultWeekly * DEFAULT_LR_SHARE * 2) / 2;

  logger.info('[RecoveryRebuild] Unified baseline from absolute fallback', {
    isMarathon,
    defaultWeekly,
    defaultLongRun,
  });

  return {
    weeklyVolumeKm: defaultWeekly,
    longRunKm: defaultLongRun,
    source: 'absolute_fallback',
  };
}

/**
 * Apply coherence clamping to ensure LR share stays within healthy bounds.
 * Returns the final UnifiedPlannedBaseline with clamping applied if needed.
 */
function applyCoherenceClamping(
  weeklyVolumeKm: number,
  longRunKm: number,
  sourceBase: string,
  weekIndex: number,
): UnifiedPlannedBaseline {
  const rawShare = weeklyVolumeKm > 0 ? longRunKm / weeklyVolumeKm : 0;
  let finalLongRunKm = longRunKm;
  let coherenceClamped = false;

  if (rawShare < MIN_COHERENT_LR_SHARE && weeklyVolumeKm > 0) {
    finalLongRunKm = Math.round(weeklyVolumeKm * 0.25 * 2) / 2;
    coherenceClamped = true;
  } else if (rawShare > MAX_COHERENT_LR_SHARE) {
    finalLongRunKm = Math.round(weeklyVolumeKm * 0.40 * 2) / 2;
    coherenceClamped = true;
  }

  const source = coherenceClamped ? `${sourceBase}_clamped` : sourceBase;

  logger.info('[RecoveryRebuild] Unified baseline selected (PLANNED only)', {
    weeklyVolumeKm: Math.round(weeklyVolumeKm * 10) / 10,
    rawLongRunKm: longRunKm,
    finalLongRunKm,
    rawShare: Math.round(rawShare * 100),
    coherenceClamped,
    source,
    selectedWeekIndex: weekIndex,
  });

  return {
    weeklyVolumeKm: Math.round(weeklyVolumeKm * 10) / 10,
    longRunKm: finalLongRunKm,
    source,
  };
}

function extractAnswersWeeklyKm(answers: Record<string, any>): number {
  const kmKeys = ['currentWeeklyKm', 'startingWeeklyKm', 'weeklyVolume'];
  for (const key of kmKeys) {
    const val = answers[key];
    if (typeof val === 'number' && val > 0) return val;
    if (typeof val === 'string') {
      const parsed = parseFloat(val);
      if (!isNaN(parsed) && parsed > 0) return parsed;
    }
  }
  const mileKeys = ['weeklyMileage', 'currentMileage'];
  for (const key of mileKeys) {
    const val = answers[key];
    if (typeof val === 'number' && val > 0) return val * KM_PER_MILE;
    if (typeof val === 'string') {
      const parsed = parseFloat(val);
      if (!isNaN(parsed) && parsed > 0) return parsed * KM_PER_MILE;
    }
  }
  return 0;
}

export interface RebuildParams {
  plan: {
    id: string;
    plan_data: { days: any[] };
    start_date: string;
    race_date: string | null;
    duration_weeks: number;
    answers: Record<string, any>;
    training_paces?: Record<string, string> | null;
  };
  todayISO: string;
  openaiApiKey: string;
  insertionWeekOffset?: number;
}

export interface RebuildResult {
  updatedPlanData: { days: any[] };
  summary: {
    recoveryWeekVolume: number;
    nextWeekVolume: number;
    peakWeekVolume: number;
    weeksRebuilt: number;
    daysPreserved: number;
    insertionWeekISO: string;
  };
}

export async function executeRecoveryRebuild(params: RebuildParams): Promise<RebuildResult> {
  const { plan, todayISO, insertionWeekOffset = 0 } = params;
  const planData = plan.plan_data;
  const allPlanDays: any[] = planData.days;
  const answers = plan.answers ?? {};

  // Compute insertion week Monday (UTC)
  // insertionWeekOffset: 0 = current week, 1 = next week, etc.
  const todayDate = new Date(todayISO + 'T12:00:00Z');
  const dow = todayDate.getUTCDay();
  const mondayOffset = dow === 0 ? -6 : 1 - dow;
  const insertionWeekDate = new Date(todayDate);
  insertionWeekDate.setUTCDate(insertionWeekDate.getUTCDate() + mondayOffset + (insertionWeekOffset * 7));
  const insertionWeekISO = insertionWeekDate.toISOString().split('T')[0];

  if (insertionWeekOffset !== 0) {
    logger.info('[RecoveryRebuild] Using week offset for insertion', {
      insertionWeekOffset,
      todayISO,
      insertionWeekISO,
    });
  }

  // Compute taper freeze boundary using race_date (ISSUE A FIX)
  // Previously used computeTaperFreezeISO which walked back from plan end and caused drift.
  // Now we use computeTaperStartISO(race_date, taperWeeks) as the authoritative source.
  const raceDistanceKm = parseRaceDistanceKm(answers.raceDistance ?? '');
  const taperWeeks = deriveTaperWeeks(raceDistanceKm, plan.duration_weeks ?? 12);
  const taperFreezeISO = plan.race_date
    ? computeTaperStartISO(plan.race_date, taperWeeks)
    : computeTaperFreezeISO(allPlanDays, answers.ambitionTier ?? 'base');

  // Split plan days at the insertion boundary
  const frozenDays = allPlanDays.filter((d: any) => d.date < insertionWeekISO);
  // Taper days: date >= taperFreezeISO (if a freeze boundary exists and lies after insertion week)
  const taperDays: any[] = taperFreezeISO && taperFreezeISO > insertionWeekISO
    ? allPlanDays.filter((d: any) => d.date >= taperFreezeISO)
    : [];
  // Middle block: insertion week up to (but not including) the taper freeze
  const rebuildDays = taperFreezeISO && taperFreezeISO > insertionWeekISO
    ? allPlanDays.filter((d: any) => d.date >= insertionWeekISO && d.date < taperFreezeISO)
    : allPlanDays.filter((d: any) => d.date >= insertionWeekISO);

  logger.info('[RecoveryRebuild] Boundary split', {
    planId: plan.id,
    todayISO,
    insertionWeekISO,
    taperFreezeISO,
    frozenCount: frozenDays.length,
    rebuildCount: rebuildDays.length,
    taperFrozenCount: taperDays.length,
    totalPlanDays: allPlanDays.length,
  });

  if (rebuildDays.length === 0 && taperDays.length === 0) {
    throw new Error('No future days to rebuild — plan may have ended.');
  }

  // UNIFIED BASELINE FIX: Derive both weekly volume and long run from the SAME planned source.
  // This prevents the skew where missed weekday sessions depress weekly volume while
  // completed long runs preserve a robust LR baseline via actual_distance.
  const unifiedBaseline = deriveUnifiedPlannedBaseline(
    frozenDays,
    insertionWeekISO,
    answers,
    raceDistanceKm,
  );

  const stableBaselineWeeklyKm = unifiedBaseline.weeklyVolumeKm;
  const baselineLongRunKm = unifiedBaseline.longRunKm;
  const baselineSource = unifiedBaseline.source;

  const isFullMarathonBuild = raceDistanceKm >= FULL_MARATHON_THRESHOLD_KM;

  // Apply marathon sanity floor if needed
  let safeExistingWeekVolume = stableBaselineWeeklyKm;
  if (isFullMarathonBuild) {
    const floor = MIN_MARATHON_BUILD_WEEKLY_KM;
    if (safeExistingWeekVolume < floor) {
      logger.warn('[RecoveryRebuild] Marathon sanity floor applied to unified baseline', {
        rawWeeklyVolumeKm: stableBaselineWeeklyKm,
        floor,
        source: baselineSource,
      });
      safeExistingWeekVolume = floor;
    }
  }

  // Log the unified baseline with coherence metrics
  const baselineLongRunShare = stableBaselineWeeklyKm > 0
    ? Math.round((baselineLongRunKm / stableBaselineWeeklyKm) * 100)
    : 0;

  logger.info('[RecoveryRebuild] Unified baseline computed (PLANNED-only)', {
    stableBaselineWeeklyKm,
    baselineLongRunKm,
    baselineLongRunShare,
    baselineSource,
    safeExistingWeekVolume,
    raceDistanceKm,
    isFullMarathonBuild,
  });

  // Recovery week volume: 82% of pre-recovery baseline (spec: weeklyVolume = baseline * 0.82)
  const recoveryWeekVolumeKm = Math.round(safeExistingWeekVolume * 0.82 * 10) / 10;

  // Store original insertion week LR for downstream use (from unified baseline)
  const originalInsertionWeekLongRunKm = baselineLongRunKm;

  // Recovery long run: 75% of baseline, clamped to [70%, 85%] of baseline (spec)
  const recoveryLongRunRaw = Math.round(baselineLongRunKm * 0.75 * 10) / 10;
  const recoveryLongRunKm = Math.max(
    Math.round(baselineLongRunKm * 0.70 * 10) / 10,
    Math.min(Math.round(baselineLongRunKm * 0.85 * 10) / 10, recoveryLongRunRaw)
  );

  const weeksRemaining = Math.ceil(rebuildDays.length / 7);

  // Compute original per-week volumes and long run targets from the middle block (rebuildDays).
  // These act as caps: the rebuilt plan must never exceed what was originally planned,
  // ensuring lost recovery-week volume is not redistributed forward.
  const originalWeeklyVolumes = deriveOriginalWeeklyVolumes(rebuildDays, insertionWeekISO, weeksRemaining);
  const originalLongRunTargets = deriveOriginalLongRunTargets(rebuildDays, insertionWeekISO, weeksRemaining);

  logger.info('[RecoveryRebuild] Computed recovery baseline', {
    stableBaselineWeeklyKm,
    recoveryWeekVolumeKm,
    baselineLongRunKm,
    recoveryLongRunKm,
    weeksRemaining,
    insertionWeekISO,
    originalWeeklyVolumes,
  });

  const ambitionTier = (answers.ambitionTier ?? 'base') as 'base' | 'performance' | 'competitive';
  const paceMinPerKm = derivePaceMinPerKm(plan.training_paces);

  // Ramp must resume from the RECOVERY WEEK long run as the new baseline, not the pre-recovery value.
  // We call buildStructuralGuidance for the build weeks AFTER the recovery week (weeksRemaining - 1).
  // Week 0 of guidance corresponds to the first post-recovery build week.
  const buildWeeksAfterRecovery = Math.max(1, weeksRemaining - 1);

  // Next long run target after recovery = recoveryLongRunKm * 1.06 (spec: ramp from recovery baseline)
  const postRecoveryLongRunStart = Math.round(recoveryLongRunKm * 1.06 * 10) / 10;

  const daysPerWeek = answers.daysPerWeek || answers.availableDays?.length || 4;
  const rawBuildGuidance = buildStructuralGuidance({
    startingWeeklyKm: Math.max(safeExistingWeekVolume, 10),
    startingLongestRunKm: Math.max(postRecoveryLongRunStart, 3),
    totalWeeks: buildWeeksAfterRecovery,
    raceDistanceKm,
    paceMinPerKm,
    ambitionTier,
    trainingFocus: (answers.trainingFocus ?? 'durability') as 'durability' | 'performance',
    daysPerWeek,
  });

  // Check for planned cutback within 2 weeks after recovery week — avoid double recovery.
  // If a cutback falls within positions 0 or 1 of the build guidance, promote it to a build week.
  const cutbackWeeksFiltered = rawBuildGuidance.cutbackWeeks.filter(wi => wi > 1);
  const peakWeekAdjusted = rawBuildGuidance.peakWeek > 0 ? rawBuildGuidance.peakWeek : rawBuildGuidance.peakWeek;

  // Rebuild weekly volumes: replace deload at wi=0 or wi=1 with a build step
  const adjustedBuildVolumes = rawBuildGuidance.weeklyVolumes.map((v, wi) => {
    if (wi <= 1 && rawBuildGuidance.cutbackWeeks.includes(wi)) {
      // Convert this deload back to a build week: use structural volume (undo deload drop)
      return Math.round(safeExistingWeekVolume * Math.pow(1.06, wi + 1) * 10) / 10;
    }
    return v;
  });
  const adjustedBuildLongRuns = rawBuildGuidance.longRunTargets.map((v, wi) => {
    if (wi <= 1 && rawBuildGuidance.cutbackWeeks.includes(wi)) {
      return Math.round(postRecoveryLongRunStart * Math.pow(1.06, wi) * 10) / 10;
    }
    return v;
  });

  // Prepend the recovery week as week 0, then shift build weeks to positions 1..N
  const rawGuidance: typeof rawBuildGuidance = {
    ...rawBuildGuidance,
    weeklyVolumes: [recoveryWeekVolumeKm, ...adjustedBuildVolumes],
    longRunTargets: [recoveryLongRunKm, ...adjustedBuildLongRuns],
    cutbackWeeks: cutbackWeeksFiltered.map(wi => wi + 1),
    peakWeek: peakWeekAdjusted + 1,
    taperStartWeek: rawBuildGuidance.taperStartWeek + 1,
  };

  // V2: Use deterministic optimizer instead of hard clipping.
  // The optimizer treats long-run share (L <= 0.60 * V) as a soft penalty rather than
  // a hard constraint, eliminating "intent_blocked" failures from ratio violations.
  // Hard constraints (6% ramp, taper monotonicity, max LR) are still enforced.
  const taperFrozen = !!(taperFreezeISO && taperFreezeISO > insertionWeekISO);

  const optimizerInput = buildOptimizerInputFromRebuildContext({
    originalWeeklyVolumes,
    originalLongRunTargets,
    recoveryWeekIndex: 0,
    stableBaselineWeeklyKm: safeExistingWeekVolume,
    baselineLongRunKm,
    taperStartWeek: rawGuidance.taperStartWeek,
    taperFrozen,
  });

  const optimizerResult: OptimizerOutput = runRecoveryOptimizer(optimizerInput);

  const guidance: typeof rawGuidance = {
    ...rawGuidance,
    weeklyVolumes: optimizerResult.V,
    longRunTargets: optimizerResult.L,
  };

  logger.info('[RecoveryRebuild] Optimizer-based guidance computed', {
    rawWeeklyVolumes: rawGuidance.weeklyVolumes,
    optimizedWeeklyVolumes: guidance.weeklyVolumes,
    rawLongRunTargets: rawGuidance.longRunTargets,
    optimizedLongRunTargets: guidance.longRunTargets,
    cutbackWeeks: guidance.cutbackWeeks,
    peakWeek: guidance.peakWeek,
    taperStartWeek: guidance.taperStartWeek,
    preRecoveryBaseline: safeExistingWeekVolume,
    recoveryWeekVolumeKm,
    baselineLongRunKm,
    recoveryLongRunKm,
    postRecoveryLongRunStart,
    optimizerSummary: optimizerResult.summary,
  });

  const trainingDayNames = resolveTrainingDays(answers, rebuildDays);

  // Detect the original long run day from ALL plan days (frozen + rebuild) so the
  // preference-list in pickLongRunDay doesn't override the runner's established day.
  const originalLongRunDow = detectOriginalLongRunDow(allPlanDays);

  logger.info('[RecoveryRebuild] Training day names resolved', {
    trainingDayNames,
    originalLongRunDow,
    source: Array.isArray(answers.availableDays) && answers.availableDays.length > 0
      ? 'answers.availableDays'
      : rebuildDays.some((d: any) => d.workout_type === 'TRAIN')
      ? 'derived_from_rebuild_days'
      : 'default_by_daysPerWeek',
  });

  const paces = plan.training_paces ?? null;

  // COHERENCE GUARD: Verify optimizer output maintains coherent LR/weekly ratios.
  // If any week has LR share > 60%, log warning and soft-clamp to prevent pathological
  // distributions where weekdays become tiny relative to long runs.
  for (let wi = 0; wi < guidance.weeklyVolumes.length; wi++) {
    const v = guidance.weeklyVolumes[wi];
    const l = guidance.longRunTargets[wi];
    if (v > 0) {
      const share = l / v;
      if (share > 0.60) {
        const clampedL = Math.round(v * 0.55 * 10) / 10;
        logger.warn('[RecoveryRebuild] Coherence guard: LR share exceeded 60%', {
          weekIndex: wi,
          weeklyVolume: v,
          originalLongRun: l,
          share: Math.round(share * 100),
          clampedLongRun: clampedL,
          action: 'soft_clamping_to_55_percent',
        });
        guidance.longRunTargets[wi] = clampedL;
      }
    }
  }

  // Build using original plan dates as scaffolding
  const builtDays = buildDeterministicWeeks(
    rebuildDays,
    guidance,
    trainingDayNames,
    paceMinPerKm,
    paces,
    insertionWeekISO,
    originalInsertionWeekLongRunKm,
    originalLongRunDow,
    raceDistanceKm,
    originalWeeklyVolumes,
  );

  // Guard: no rebuilt day may have date < insertionWeekISO
  const pastModified = builtDays.filter((d: DayTemplate) => d.date < insertionWeekISO);
  if (pastModified.length > 0) {
    logger.error('[RecoveryRebuild] past_weeks_modified guard triggered', {
      violatingDates: pastModified.map(d => d.date),
      insertionWeekISO,
    });
    throw new Error(`intent_blocked: past_weeks_modified — rebuild touched ${pastModified.length} day(s) before insertion week (${insertionWeekISO})`);
  }

  // Guard: rebuilt plan must only train on days that are in the resolved training day set.
  // We compare against trainingDayNames (the canonical list derived from answers.availableDays
  // or inferred from the plan) rather than the original future days, because the original
  // future days are sparse — a valid training DOW may simply have no sessions in the
  // remaining taper/recovery weeks.
  const allowedTrainDows = new Set(
    trainingDayNames.map(n => n.charAt(0).toUpperCase() + n.slice(1).toLowerCase())
  );
  const rebuiltTrainDows = new Set(
    builtDays
      .filter((d: DayTemplate) => d.workout_type === 'TRAIN')
      .map((d: DayTemplate) => d.dow)
  );
  const extraDows = [...rebuiltTrainDows].filter(dow => !allowedTrainDows.has(dow));
  if (extraDows.length > 0) {
    logger.error('[RecoveryRebuild] training_day_mismatch guard triggered', {
      allowedTrainDows: [...allowedTrainDows],
      rebuiltTrainDows: [...rebuiltTrainDows],
      extraDows,
    });
    throw new Error(`intent_blocked: training_day_mismatch — rebuilt plan introduced training on ${extraDows.join(', ')} which are not in the resolved training days (${[...allowedTrainDows].join(', ')})`);
  }

  // If rebuildDays is empty (insertion is right at the taper boundary), skip build entirely
  const normDays: any[] = [];
  if (builtDays.length > 0) {
    assertWeekIntegrity(builtDays, guidance, insertionWeekISO);

    const normResult = normalizePlanToStructure(
      builtDays,
      guidance,
      insertionWeekISO,
      { defaultPaceMinPerKm: paceMinPerKm, softLongRunShareEnforcement: true }
    );

    // Log share exceedance warnings (informational only, never blocks in soft mode)
    if (normResult.debug.shareExceedanceWarnings.length > 0) {
      logger.info('[RecoveryRebuild] Share exceedance warnings (soft mode - allowed)', {
        warnings: normResult.debug.shareExceedanceWarnings,
      });
    }

    if (normResult.needsRegeneration) {
      // Log detailed diagnostics server-side but do NOT expose to user
      logger.error('[RecoveryRebuild] Post-build invariant check failed', {
        adjustments: normResult.debug.weeklyAdjustments,
        weekDiagnostics: normResult.debug.weekDiagnostics,
      });
      // User-facing error is generic - no internal diagnostics leaked
      throw new Error(
        'intent_blocked: Recovery rebuild failed structural validation. Please try again or contact support.'
      );
    }

    logger.info('[RecoveryRebuild] Invariants passed', {
      preNormalizePeakLongRun: normResult.debug.preNormalizePeakLongRun,
      postNormalizePeakLongRun: normResult.debug.postNormalizePeakLongRun,
    });

    // Structural validation: training days, roles, long run count, taper monotonicity
    if (originalLongRunDow) {
      const structuralValidation = validatePlanStructure(
        normResult.days as any,
        guidance,
        insertionWeekISO,
        trainingDayNames,
        originalLongRunDow,
        paceMinPerKm,
      );
      if (!structuralValidation.valid) {
        const msgs = structuralValidation.violations.map(v => v.message);
        // Log detailed diagnostics server-side but do NOT expose to user
        logger.error('[RecoveryRebuild] Structural validation failed', { violations: msgs });
        // User-facing error is generic - no internal diagnostics leaked
        throw new Error(
          'intent_blocked: Recovery rebuild failed structural validation. Please try again or contact support.'
        );
      }
      logger.info('[RecoveryRebuild] Structural validation passed', {
        violationCount: structuralValidation.violations.length,
      });
    }

    normDays.push(...normResult.days);
  }

  // Taper days are FROZEN — copied from the original plan byte-for-byte.
  // We never recompute taper weeks; any recomputation risks corrupting the
  // monotonic decrease (e.g. 30 → 24 → 16 becoming 25 → 19 → 13 → 17).
  logger.info('[RecoveryRebuild] Taper frozen (original plan preserved)', {
    taperFreezeISO,
    taperDayCount: taperDays.length,
    taperDayDates: taperDays.slice(0, 4).map((d: any) => d.date),
  });

  // Final output: frozen past + rebuilt middle + frozen taper
  const updatedDays = [...frozenDays, ...normDays, ...taperDays];

  // Spec section 12: Final output must be sorted ascending by date
  updatedDays.sort((a, b) => a.date.localeCompare(b.date));

  // Spec section 12: Final output must contain exactly one day per original plan date
  const originalDates = new Set(allPlanDays.map((d: any) => d.date));
  const outputDates = new Set(updatedDays.map((d: any) => d.date));
  const missingDates = [...originalDates].filter(d => !outputDates.has(d));
  const extraDates = [...outputDates].filter(d => !originalDates.has(d));
  const duplicateDates = updatedDays
    .map((d: any) => d.date)
    .filter((date, idx, arr) => arr.indexOf(date) !== idx);

  if (missingDates.length > 0 || extraDates.length > 0 || duplicateDates.length > 0) {
    logger.error('[RecoveryRebuild] Output integrity check failed', {
      missingDates,
      extraDates,
      duplicateDates: [...new Set(duplicateDates)],
      originalCount: allPlanDays.length,
      outputCount: updatedDays.length,
    });
    throw new Error(
      `intent_blocked: Output integrity violation — missing: ${missingDates.length}, extra: ${extraDates.length}, duplicate: ${duplicateDates.length}`
    );
  }

  const recoveryWeekVolume = guidance.weeklyVolumes[0] ?? recoveryWeekVolumeKm;
  const nextWeekVolume = guidance.weeklyVolumes[1] ?? recoveryWeekVolume;
  const peakWeekVolume = Math.max(...guidance.weeklyVolumes);

  return {
    updatedPlanData: {
      ...planData,
      days: updatedDays,
      meta: {
        ...(planData.meta || {}),
      },
    },
    summary: {
      recoveryWeekVolume,
      nextWeekVolume,
      peakWeekVolume,
      weeksRebuilt: Math.ceil(builtDays.length / 7),
      daysPreserved: frozenDays.length,
      insertionWeekISO,
    },
  };
}

// ---------------------------------------------------------------------------
// [REMOVED] buildDeterministicTaper — taper weeks are now frozen verbatim from the
// original plan. Recomputing taper from math caused monotonic-decrease violations
// (e.g. 30→24→16 becoming 25→19→13→17). See executeRecoveryRebuild for freeze logic.
// ---------------------------------------------------------------------------

// Keeping the TAPER_VOL_MULTS / TAPER_LR_MULTS constants above in case they are
// needed by future features; the function below is intentionally removed.

// ---------------------------------------------------------------------------
// Per-week integrity assertion with diagnostic logs
// ---------------------------------------------------------------------------

function assertWeekIntegrity(
  builtDays: DayTemplate[],
  guidance: StructuralGuidance,
  insertionWeekISO: string,
): void {
  const weekStartMs = new Date(insertionWeekISO + 'T00:00:00Z').getTime();

  const weekMap = new Map<number, DayTemplate[]>();
  for (const day of builtDays) {
    const dayMs = new Date(day.date + 'T00:00:00Z').getTime();
    const wi = Math.floor((dayMs - weekStartMs) / (7 * 24 * 60 * 60 * 1000));
    if (!weekMap.has(wi)) weekMap.set(wi, []);
    weekMap.get(wi)!.push(day);
  }

  const errors: string[] = [];

  for (let wi = 0; wi < guidance.weeklyVolumes.length; wi++) {
    const weekDays = weekMap.get(wi) ?? [];
    const targetVolume = guidance.weeklyVolumes[wi];
    const trainDays = weekDays.filter(d => d.workout_type === 'TRAIN');

    const actualVolume = trainDays.reduce((sum, d) => sum + extractKmFromWorkout(d.workout), 0);
    const longRunDay = trainDays.find(d => isLongRunWorkout(d.workout));
    const longRunKm = longRunDay ? extractKmFromWorkout(longRunDay.workout) : 0;
    const longRunFound = !!longRunDay;

    logger.info('[RecoveryRebuild] Week integrity check', {
      weekIndex: wi,
      targetVolume,
      actualVolume: Math.round(actualVolume * 10) / 10,
      longRunFound,
      longRunKm,
      longRunWorkout: longRunDay?.workout?.slice(0, 80) ?? null,
      trainDayCount: trainDays.length,
      totalDays: weekDays.length,
      isTaper: wi >= guidance.taperStartWeek,
    });

    if (weekDays.length === 0) {
      errors.push(`W${wi + 1}: no days generated (original plan may have fewer weeks than guidance)`);
      continue;
    }

    // If this week has no training days at all (rest-only week — e.g. partial boundary week
    // where no plan dates fall on the resolved training DOWs), skip volume checks entirely.
    if (trainDays.length === 0) {
      logger.warn('[RecoveryRebuild] Week integrity: rest-only week — skipping volume/long-run checks', {
        weekIndex: wi,
        targetVolume,
        weekDayDows: weekDays.map(d => d.dow),
      });
      continue;
    }

    if (!longRunFound) {
      errors.push(`W${wi + 1}: no long run found — schema mismatch. trainDays workouts: ${trainDays.map(d => d.workout.slice(0, 40)).join(' | ')}`);
    }

    if (actualVolume === 0 && targetVolume > 0) {
      errors.push(`W${wi + 1}: actualVolume=0 but targetVolume=${targetVolume} — km field not being written`);
    }
  }

  if (errors.length > 0) {
    logger.error('[RecoveryRebuild] Week integrity assertion FAILED', { errors });
    throw new Error(
      `intent_blocked: Week generation failed integrity checks. ${errors.join('; ')}`
    );
  }
}

// ---------------------------------------------------------------------------
// Deterministic week skeleton builder — uses original plan dates as scaffolding
// ---------------------------------------------------------------------------

type WorkoutLabel = 'long_run' | 'easy' | 'tempo' | 'rest';

interface DayTemplate {
  date: string;
  dow: string;
  workout: string;
  tips: string[];
  workout_type: 'TRAIN' | 'REST';
  label: WorkoutLabel;
}

function buildDeterministicWeeks(
  originalFutureDays: any[],
  guidance: StructuralGuidance,
  trainingDayNames: string[],
  paceMinPerKm: number,
  paces: Record<string, string> | null,
  insertionWeekISO: string,
  originalInsertionWeekLongRunKm: number,
  originalLongRunDow: string | undefined,
  raceDistanceKm: number,
  originalWeeklyVolumes: number[],
): DayTemplate[] {
  const result: DayTemplate[] = [];
  const insertionWeekMs = new Date(insertionWeekISO + 'T00:00:00Z').getTime();

  const normalisedTrainingDays = trainingDayNames.map(n =>
    n.charAt(0).toUpperCase() + n.slice(1).toLowerCase()
  );

  // Group the original plan dates into week buckets by their distance from insertionWeekISO.
  // Also keep the original day objects so we can pass them through unchanged when needed.
  const weekBuckets = new Map<number, { date: string; dow: string }[]>();
  const weekOriginalDays = new Map<number, any[]>();
  for (const d of originalFutureDays) {
    const dayMs = new Date(d.date + 'T00:00:00Z').getTime();
    const wi = Math.floor((dayMs - insertionWeekMs) / (7 * 24 * 60 * 60 * 1000));
    if (wi < 0) continue;
    if (!weekBuckets.has(wi)) weekBuckets.set(wi, []);
    if (!weekOriginalDays.has(wi)) weekOriginalDays.set(wi, []);
    weekBuckets.get(wi)!.push({
      date: d.date,
      dow: DOW_NAMES[new Date(d.date + 'T12:00:00Z').getUTCDay()],
    });
    weekOriginalDays.get(wi)!.push(d);
  }

  for (let wi = 0; wi < guidance.weeklyVolumes.length; wi++) {
    const weekDates = weekBuckets.get(wi);
    if (!weekDates || weekDates.length === 0) {
      logger.warn('[RecoveryRebuild] No original plan dates for guidance week — skipping', { weekIndex: wi });
      continue;
    }

    // FIX 3: if no plan dates in this week fall on a training DOW, pass the original
    // days through unchanged — do NOT run volume enforcement, long run enforcement,
    // or session injection.
    const trainingDaysInWeek = weekDates.filter(d => normalisedTrainingDays.includes(d.dow));
    if (trainingDaysInWeek.length === 0) {
      const origDays = weekOriginalDays.get(wi) ?? [];
      logger.warn('[RecoveryRebuild] rebuild_skip_week_no_training_days — passing original days through', {
        weekIndex: wi,
        weekStartDate: weekDates[0]?.date ?? 'unknown',
        trainingDayNames: normalisedTrainingDays,
        weekDayDows: weekDates.map(d => d.dow),
      });
      result.push(...origDays as DayTemplate[]);
      continue;
    }

    let weekTargetKm = guidance.weeklyVolumes[wi];
    const isRecoveryWeek = wi === 0;
    const structuralLongRunTarget = guidance.longRunTargets[wi];
    let longRunTargetKm = isRecoveryWeek && originalInsertionWeekLongRunKm > 0
      ? Math.min(structuralLongRunTarget * RECOVERY_VOLUME_RATIO, originalInsertionWeekLongRunKm)
      : structuralLongRunTarget;
    const isDeload = guidance.cutbackWeeks.includes(wi);
    const isTaper = wi >= guidance.taperStartWeek;

    const isFullMarathon = raceDistanceKm >= FULL_MARATHON_THRESHOLD_KM;
    if (isFullMarathon && !isTaper && !isRecoveryWeek && !isDeload) {
      const volumeCapLongRun = weekTargetKm * LONG_RUN_VOLUME_CAP;
      if (longRunTargetKm > volumeCapLongRun && volumeCapLongRun < MIN_MARATHON_LONG_RUN_KM) {
        const originalWeekCap = originalWeeklyVolumes[wi] > 0 ? originalWeeklyVolumes[wi] : Infinity;
        const requiredWeeklyVolume = Math.ceil(longRunTargetKm / LONG_RUN_VOLUME_CAP);
        const guardedWeeklyVolume = Math.min(requiredWeeklyVolume, originalWeekCap);
        logger.warn('[RecoveryRebuild] Marathon long run clipping guard triggered', {
          weekIndex: wi,
          originalWeekTargetKm: weekTargetKm,
          longRunTargetKm,
          volumeCapLongRun: Math.round(volumeCapLongRun * 10) / 10,
          minMarathonLongRunKm: MIN_MARATHON_LONG_RUN_KM,
          requiredWeeklyVolume,
          originalWeekCap,
          guardedWeeklyVolume,
          action: guardedWeeklyVolume > weekTargetKm ? 'raising_weekly_volume_to_preserve_long_run' : 'guard_skipped_due_to_original_cap',
        });
        if (guardedWeeklyVolume > weekTargetKm) {
          weekTargetKm = Math.round(guardedWeeklyVolume * 10) / 10;
        }
      }
    }

    const weekTemplateDays = buildWeekTemplate(
      weekDates,
      trainingDayNames,
      weekTargetKm,
      longRunTargetKm,
      paceMinPerKm,
      paces,
      isRecoveryWeek,
      isDeload,
      isTaper,
      wi,
      originalLongRunDow,
    );

    result.push(...weekTemplateDays);
  }

  return result;
}

function buildWeekTemplate(
  weekDays: { date: string; dow: string }[],
  trainingDayNames: string[],
  weekTargetKm: number,
  longRunTargetKm: number,
  paceMinPerKm: number,
  paces: Record<string, string> | null,
  isRecoveryWeek: boolean,
  isDeload: boolean,
  isTaper: boolean,
  weekIndex: number,
  originalLongRunDow?: string,
): DayTemplate[] {
  const easyPaceStr = paces?.easyPace ?? formatPace(paceMinPerKm);
  const longRunPaceStr = paces?.longRunPace ?? paces?.easyPace ?? formatPace(paceMinPerKm + 0.3);
  const tempoPaceStr = paces?.tempoPace ?? formatPace(paceMinPerKm - 0.5);

  // Normalise training day names to title case
  const normalisedTrainingDays = trainingDayNames.map(n =>
    n.charAt(0).toUpperCase() + n.slice(1).toLowerCase()
  );

  let trainingDays = weekDays.filter(d => normalisedTrainingDays.includes(d.dow));
  let restDays = weekDays.filter(d => !normalisedTrainingDays.includes(d.dow));

  // If no plan dates in this week match the runner's training DOWs, mark all as rest.
  // Do NOT introduce training on days outside normalisedTrainingDays — that would violate
  // the training-day guard.
  if (trainingDays.length === 0) {
    const weekStartDate = weekDays.length > 0 ? weekDays[0].date : 'unknown';
    logger.warn('[RecoveryRebuild] rebuild_skip_week_no_training_days', {
      weekIndex,
      weekStartDate,
      trainingDayNames: normalisedTrainingDays,
      weekDayDows: weekDays.map(d => d.dow),
    });
    return weekDays.map(d => makeRestDay(d));
  }

  const longRunDay = pickLongRunDay(trainingDays, originalLongRunDow);
  const otherTrainingDays = trainingDays.filter(d => d.date !== longRunDay.date);

  // Compute the actual km that will be written into the long run workout string
  // (same rounding as makeLongRunDay uses). This must be done BEFORE distributing
  // remaining volume to other days, otherwise cap-induced discrepancies cause total
  // weekly volume to undershoot targetVolume.
  const actualLongRunKm = Math.max(1, Math.round(longRunTargetKm * 2) / 2);
  const longRunCapped = actualLongRunKm < longRunTargetKm - 0.01;

  // Remaining volume = target - what the long run actually writes
  const easyKmTotal = Math.max(0, weekTargetKm - actualLongRunKm);
  const easyRunCount = otherTrainingDays.length;

  // Recovery week: keep the workout day as a reduced-intensity session (4×400m strides),
  // not an easy run. Only applies when there are at least 3 training days (long + workout + easy).
  const useRecoveryWorkout = isRecoveryWeek && easyRunCount >= 2;
  const useQuality = !isRecoveryWeek && !isDeload && !isTaper && easyRunCount >= 2;
  const qualityTemplate = useQuality ? pickQualityTemplate(weekIndex) : null;
  const qualityVolumeKm = qualityTemplate ? qualityTemplate.volumeKm : 0;

  const reservedWorkoutSlots = (useRecoveryWorkout ? 1 : 0) + (qualityTemplate ? 1 : 0);
  const easyOnlyRunCount = Math.max(0, easyRunCount - reservedWorkoutSlots);
  const easyKmAfterQuality = Math.max(0, easyKmTotal - qualityVolumeKm);
  const rawBaseEasyKm = easyOnlyRunCount > 0
    ? easyKmAfterQuality / easyOnlyRunCount
    : 0;
  // Clamp each easy run: must not exceed longRun × 0.75 or weeklyVolume × 0.40
  const longRunCap = actualLongRunKm > 0 ? actualLongRunKm * 0.75 : Infinity;
  const volumeCap = weekTargetKm > 0 ? weekTargetKm * 0.40 : Infinity;
  const easyRunCap = Math.min(longRunCap, volumeCap);
  const baseEasyKm = Math.round(Math.min(rawBaseEasyKm, easyRunCap) * 10) / 10;

  const nonLongRunKm = (baseEasyKm * easyOnlyRunCount) + qualityVolumeKm;
  logger.info('[RecoveryRebuild] buildWeekTemplate volume distribution', {
    weekIndex,
    weekLabel: `W${weekIndex + 1}`,
    targetVolume: weekTargetKm,
    longRunTarget: longRunTargetKm,
    actualLongRunKm,
    longRunCapped,
    capDeltaKm: longRunCapped ? Math.round((longRunTargetKm - actualLongRunKm) * 10) / 10 : 0,
    easyKmTotal,
    easyRunCount,
    useRecoveryWorkout,
    qualitySession: qualityTemplate?.label ?? 'none',
    qualityVolumeKm,
    baseEasyKm,
    easyOnlyRunCount,
    nonLongRunKm: Math.round(nonLongRunKm * 10) / 10,
    projectedTotalKm: Math.round((actualLongRunKm + nonLongRunKm) * 10) / 10,
    isRecoveryWeek,
    isDeload,
    isTaper,
  });

  const result: DayTemplate[] = [];

  result.push(makeLongRunDay(longRunDay, longRunTargetKm, longRunPaceStr, isRecoveryWeek || isDeload || isTaper));

  // Pick the workout day as the middle session among the other training days
  const recoveryWorkoutDayIndex = useRecoveryWorkout ? Math.floor(otherTrainingDays.length / 2) : -1;

  let qualityAssigned = 0;
  let recoveryWorkoutAssigned = false;
  for (let i = 0; i < otherTrainingDays.length; i++) {
    const d = otherTrainingDays[i];
    const isQuality = qualityTemplate && qualityAssigned === 0 && i === Math.floor(otherTrainingDays.length / 2);
    const isRecoveryWorkoutSlot = useRecoveryWorkout && !recoveryWorkoutAssigned && i === recoveryWorkoutDayIndex;

    if (isRecoveryWorkoutSlot) {
      recoveryWorkoutAssigned = true;
      result.push(makeRecoveryWorkoutDay(d, easyPaceStr));
    } else if (isQuality && qualityTemplate) {
      qualityAssigned++;
      result.push(makeQualityDay(d, qualityTemplate, tempoPaceStr, paces));
    } else {
      result.push(makeEasyDay(d, baseEasyKm, easyPaceStr));
    }
  }

  for (const d of restDays) {
    result.push(makeRestDay(d));
  }

  result.sort((a, b) => a.date.localeCompare(b.date));

  return result;
}

function pickLongRunDay(
  trainingDays: { date: string; dow: string }[],
  originalLongRunDow?: string,
): { date: string; dow: string } {
  if (originalLongRunDow) {
    const match = trainingDays.find(d => d.dow === originalLongRunDow);
    if (match) return match;
  }
  const preference = ['Saturday', 'Sunday', 'Friday', 'Thursday', 'Wednesday', 'Tuesday', 'Monday'];
  for (const preferred of preference) {
    const match = trainingDays.find(d => d.dow === preferred);
    if (match) return match;
  }
  return trainingDays[trainingDays.length - 1];
}

function detectOriginalLongRunDow(allPlanDays: any[]): string | undefined {
  const longRunDayCounts = new Map<string, number>();
  for (const d of allPlanDays) {
    if (
      d.workout_type === 'TRAIN' &&
      typeof d.workout === 'string' &&
      d.workout.toLowerCase().includes('long run')
    ) {
      const dow = DOW_NAMES[new Date(d.date + 'T12:00:00Z').getUTCDay()];
      longRunDayCounts.set(dow, (longRunDayCounts.get(dow) ?? 0) + 1);
    }
  }
  if (longRunDayCounts.size === 0) return undefined;
  let best: string | undefined;
  let bestCount = 0;
  for (const [dow, count] of longRunDayCounts) {
    if (count > bestCount) {
      bestCount = count;
      best = dow;
    }
  }
  return best;
}

// "Long run:" prefix — matches isLongRun() in planNormalizer: lower.includes('long run')
function makeLongRunDay(d: { date: string; dow: string }, km: number, paceStr: string, easyOnly: boolean): DayTemplate {
  const roundedKm = Math.max(1, Math.round(km * 2) / 2);
  const workout = easyOnly
    ? `Long run: ${roundedKm} km easy at ${paceStr} /km\nWarm up: 5 min walk | Work: ${roundedKm} km easy effort (conversational pace) | Cool down: 5 min walk + stretch`
    : `Long run: ${roundedKm} km at ${paceStr} /km\nWarm up: 10 min easy | Work: ${roundedKm} km steady aerobic effort | Cool down: 10 min easy + stretch`;

  const tips = easyOnly
    ? ['Keep effort fully conversational — no pushing today', 'Focus on time on feet, not pace', 'Hydrate well and keep RPE 2–3']
    : ['Aim for steady aerobic effort throughout', 'Keep first half comfortably easy, finish at same pace or slightly faster', 'Fuel and hydrate every 20–30 min if over 75 min'];

  return { date: d.date, dow: d.dow, workout, tips, workout_type: 'TRAIN', label: 'long_run' };
}

function makeEasyDay(d: { date: string; dow: string }, km: number, paceStr: string): DayTemplate {
  const roundedKm = Math.max(3, Math.round(km * 2) / 2);
  const workout = `Easy run: ${roundedKm} km at ${paceStr} /km\nWarm up: 5 min walk | Work: ${roundedKm} km easy (conversational) | Cool down: 5 min walk`;
  const tips = ['Fully conversational pace — if you can\'t hold a conversation, slow down', 'This run builds aerobic base — resist the urge to push', 'Focus on relaxed form and easy breathing'];
  return { date: d.date, dow: d.dow, workout, tips, workout_type: 'TRAIN', label: 'easy' };
}

function makeRecoveryWorkoutDay(d: { date: string; dow: string }, easyPaceStr: string): DayTemplate {
  const workout = `Interval session: 4 × 400 m relaxed strides at ${easyPaceStr} /km\nWarm up: 10 min easy | Work: 4 × 400 m relaxed strides (not sprinting — smooth form, RPE 5–6) with 90 sec walk recovery | Cool down: 10 min easy + stretch`;
  const tips = ['These are relaxed strides — not hard intervals', 'Focus on smooth form and turnover, not speed', 'RPE 5–6 maximum — this is a recovery week'];
  return { date: d.date, dow: d.dow, workout, tips, workout_type: 'TRAIN', label: 'tempo' };
}

interface QualityTemplate {
  label: string;
  volumeKm: number;
  workoutText: (tempoPaceStr: string, intervalPaceStr: string) => string;
  tips: string[];
}

const QUALITY_TEMPLATES: QualityTemplate[] = [
  {
    label: '5x1km',
    volumeKm: 8,
    workoutText: (_, intervalPaceStr) =>
      `Interval session: 5 × 1 km at ${intervalPaceStr} /km\nWarm up: 15 min easy | Work: 5 × 1 km at ${intervalPaceStr} /km with 90 sec jog recovery | Cool down: 10 min easy + stretch`,
    tips: ['Target pace should feel hard but controlled', '90 sec recovery jog between reps — do not stand still', 'If pace slips badly on rep 4–5, cut to 4 reps'],
  },
  {
    label: '6x800m',
    volumeKm: 7.5,
    workoutText: (_, intervalPaceStr) =>
      `Interval session: 6 × 800 m at ${intervalPaceStr} /km\nWarm up: 15 min easy | Work: 6 × 800 m at ${intervalPaceStr} /km with 75 sec jog recovery | Cool down: 10 min easy + stretch`,
    tips: ['Keep each rep consistent — even splits are the goal', '75 sec recovery jog between reps', 'Controlled effort — RPE 8 on each rep'],
  },
  {
    label: 'tempo_4km',
    volumeKm: 8,
    workoutText: (tempoPaceStr) =>
      `Tempo run: 4 km at ${tempoPaceStr} /km\nWarm up: 15 min easy | Work: 4 km continuous at comfortably hard tempo pace (${tempoPaceStr} /km) | Cool down: 10 min easy + stretch`,
    tips: ['Tempo pace = comfortably hard, RPE 7–8', 'You should be able to speak only a few words at a time', 'If feeling off, drop to easy effort — do not force quality'],
  },
  {
    label: '3x2km',
    volumeKm: 9,
    workoutText: (tempoPaceStr) =>
      `Cruise intervals: 3 × 2 km at ${tempoPaceStr} /km\nWarm up: 15 min easy | Work: 3 × 2 km at tempo effort (${tempoPaceStr} /km) with 2 min jog recovery | Cool down: 10 min easy + stretch`,
    tips: ['Cruise intervals build lactate threshold', '2 min jog recovery between reps', 'Aim for even effort across all 3 reps'],
  },
  {
    label: 'tempo_5km',
    volumeKm: 9,
    workoutText: (tempoPaceStr) =>
      `Tempo run: 5 km at ${tempoPaceStr} /km\nWarm up: 15 min easy | Work: 5 km continuous at comfortably hard tempo pace (${tempoPaceStr} /km) | Cool down: 10 min easy + stretch`,
    tips: ['Steady comfortably hard effort throughout', 'RPE 7–8 — challenging but sustainable', 'Focus on consistent pace, not splits'],
  },
];

function pickQualityTemplate(weekIndex: number): QualityTemplate {
  return QUALITY_TEMPLATES[weekIndex % QUALITY_TEMPLATES.length];
}

function makeQualityDay(
  d: { date: string; dow: string },
  template: QualityTemplate,
  tempoPaceStr: string,
  paces: Record<string, string> | null,
): DayTemplate {
  const intervalPaceStr = paces?.intervalPace ?? paces?.tempoPace ?? tempoPaceStr;
  const workout = template.workoutText(tempoPaceStr, intervalPaceStr);
  return { date: d.date, dow: d.dow, workout, tips: template.tips, workout_type: 'TRAIN', label: 'tempo' };
}

function makeRestDay(d: { date: string; dow: string }): DayTemplate {
  return {
    date: d.date,
    dow: d.dow,
    workout: 'Rest',
    tips: ['Rest and recovery is where adaptation happens', 'Light walking or gentle stretching is fine'],
    workout_type: 'REST',
    label: 'rest',
  };
}

// ---------------------------------------------------------------------------
// Training day resolution
// ---------------------------------------------------------------------------

const ABBREV_TO_FULL: Record<string, string> = {
  'Mon': 'Monday',
  'Tue': 'Tuesday',
  'Wed': 'Wednesday',
  'Thu': 'Thursday',
  'Fri': 'Friday',
  'Sat': 'Saturday',
  'Sun': 'Sunday',
};

function expandDayName(name: string): string {
  const titled = name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
  return ABBREV_TO_FULL[titled] ?? titled;
}

function resolveTrainingDays(answers: Record<string, any>, futureDays: any[]): string[] {
  if (Array.isArray(answers.availableDays) && answers.availableDays.length > 0) {
    return (answers.availableDays as string[]).map(expandDayName);
  }

  const dayCounts = new Map<string, number>();
  for (const d of futureDays) {
    if (d.workout_type === 'TRAIN') {
      const name = DOW_NAMES[new Date(d.date + 'T12:00:00Z').getUTCDay()];
      dayCounts.set(name, (dayCounts.get(name) ?? 0) + 1);
    }
  }

  if (dayCounts.size > 0) {
    const sorted = [...dayCounts.entries()].sort((a, b) => b[1] - a[1]);
    const totalWeeks = Math.max(1, Math.ceil(futureDays.length / 7));
    const threshold = Math.max(1, Math.floor(totalWeeks * 0.4));
    const filtered = sorted.filter(([, count]) => count >= threshold).map(([name]) => name);
    if (filtered.length > 0) return filtered;
  }

  // No answers.availableDays and no derivable DOW pattern from the plan.
  // Return empty — the rebuild will mark all days in unresolvable weeks as rest
  // rather than introducing training days not present in the runner's schedule.
  logger.warn('[RecoveryRebuild] resolveTrainingDays: no availableDays in answers and no TRAIN DOW pattern derivable from plan — returning empty');
  return [];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatPace(minPerKm: number): string {
  const mins = Math.floor(minPerKm);
  const secs = Math.round((minPerKm - mins) * 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Extract per-week volumes from original plan days in the middle block.
 * Week index 0 = insertion week. Returns 0 for weeks with no data.
 *
 * CRITICAL: Uses ONLY planned km from workout text, NEVER actual_distance.
 * This ensures "original" caps represent the coach's intended structure,
 * not volatile completion state that could be depressed by missed sessions.
 */
function deriveOriginalWeeklyVolumes(
  rebuildDays: any[],
  insertionWeekISO: string,
  weeksCount: number,
): number[] {
  const insertionMs = new Date(insertionWeekISO + 'T00:00:00Z').getTime();
  const result: number[] = new Array(weeksCount).fill(0);
  for (const d of rebuildDays) {
    if (d.workout_type === 'REST' || d.workout_type === 'RACE') continue;
    const dayMs = new Date(d.date + 'T00:00:00Z').getTime();
    const wi = Math.floor((dayMs - insertionMs) / (7 * 24 * 60 * 60 * 1000));
    if (wi < 0 || wi >= weeksCount) continue;
    const km = extractKmFromWorkout(d.workout ?? '');
    result[wi] = Math.round((result[wi] + km) * 10) / 10;
  }
  return result;
}

/**
 * Extract per-week long run targets from original plan days (spec section 8).
 *
 * originalPlanLongRunKm(mondayISO) is defined as:
 * - Find all days in the original plan where calendarWeekISO(day.date) === mondayISO
 *   and isLongRunWorkout(day.workout) === true.
 * - For each such day, extract planned km from workout text.
 * - Tie-break: If multiple long-run candidates exist with parsable km, return the MAXIMUM planned km.
 * - If no long-run days exist for that week, or none have parsable km: return undefined (represented as 0).
 *
 * CRITICAL: Uses ONLY planned km from workout text, NEVER actual_distance.
 * This ensures "original" caps represent the coach's intended structure,
 * not volatile completion state.
 *
 * Returns an array where result[wi] = max planned km for that week, or 0 if none found.
 */
function deriveOriginalLongRunTargets(
  rebuildDays: any[],
  insertionWeekISO: string,
  weeksCount: number,
): number[] {
  const insertionMs = new Date(insertionWeekISO + 'T00:00:00Z').getTime();
  const result: number[] = new Array(weeksCount).fill(0);
  for (const d of rebuildDays) {
    if (d.workout_type === 'REST' || d.workout_type === 'RACE') continue;
    if (!isLongRunWorkout(d.workout ?? '')) continue;
    const dayMs = new Date(d.date + 'T00:00:00Z').getTime();
    const wi = Math.floor((dayMs - insertionMs) / (7 * 24 * 60 * 60 * 1000));
    if (wi < 0 || wi >= weeksCount) continue;
    const km = extractKmFromWorkout(d.workout ?? '');
    if (km > result[wi]) result[wi] = Math.round(km * 10) / 10;
  }
  return result;
}

/**
 * Determine which week indices have at least one day present in rebuildDays.
 * Used to skip cap enforcement for weeks with no original data.
 */
function deriveHasAnyDayInWeek(
  rebuildDays: any[],
  insertionWeekISO: string,
  weeksCount: number,
): boolean[] {
  const insertionMs = new Date(insertionWeekISO + 'T00:00:00Z').getTime();
  const result: boolean[] = new Array(weeksCount).fill(false);
  for (const d of rebuildDays) {
    const dayMs = new Date(d.date + 'T00:00:00Z').getTime();
    const wi = Math.floor((dayMs - insertionMs) / (7 * 24 * 60 * 60 * 1000));
    if (wi >= 0 && wi < weeksCount) {
      result[wi] = true;
    }
  }
  return result;
}

function deriveWeekVolume(days: any[], weekIndex: number, startDate: string | null): number {
  if (!startDate) return 30;
  const weekStartMs = new Date(startDate + 'T00:00:00Z').getTime() + weekIndex * 7 * 24 * 60 * 60 * 1000;
  const weekEndMs = weekStartMs + 7 * 24 * 60 * 60 * 1000;
  const weekDays = days.filter((d: any) => {
    const t = new Date(d.date + 'T00:00:00Z').getTime();
    return t >= weekStartMs && t < weekEndMs;
  });
  return deriveVolumeFromDays(weekDays);
}

/**
 * Derive volume from days using ONLY planned km from workout text.
 * CRITICAL: Never uses actual_distance to prevent mutable completion state
 * from affecting structural baseline calculations.
 */
function deriveVolumeFromDays(days: any[]): number {
  let total = 0;
  for (const d of days) {
    if (d.workout_type === 'REST' || d.workout_type === 'RACE') continue;
    const km = extractKmFromWorkout(d.workout ?? '');
    total += km;
  }
  return Math.round(total * 10) / 10;
}

function derivePaceMinPerKm(paces: Record<string, string> | null | undefined): number {
  if (!paces?.easyPace) return 6.0;
  const m = paces.easyPace.match(/(\d+):(\d+)/);
  if (!m) return 6.0;
  return parseInt(m[1]) + parseInt(m[2]) / 60;
}
