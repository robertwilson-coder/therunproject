/**
 * recoveryRebuild.test.ts
 *
 * Regression tests for the unified baseline fix.
 *
 * These tests verify that recovery rebuild derives baselines from PLANNED
 * workout text only, never from actual_distance. This prevents the skew
 * where missed weekday sessions depress weekly volume while completed
 * long runs preserve a robust LR baseline.
 *
 * The baseline selection now scans multiple recent frozen weeks and selects
 * the most structurally valid one, avoiding atypical weeks (cutbacks, sparse).
 */

import { describe, it, expect } from 'vitest';

const KM_RE = /(\d+(?:\.\d+)?)\s*km/i;
function extractKmFromWorkout(workout: string): number {
  const m = workout.match(KM_RE);
  return m ? parseFloat(m[1]) : 0;
}

function isLongRunWorkout(workout: string): boolean {
  const lower = workout.toLowerCase();
  return lower.includes('long run') || lower.includes('long slow') || lower.includes('lsd') || lower.includes('long easy');
}

const MIN_COHERENT_LR_SHARE = 0.20;
const MAX_COHERENT_LR_SHARE = 0.50;
const DEFAULT_LR_SHARE = 0.32;
const FULL_MARATHON_THRESHOLD_KM = 42;
const KM_PER_MILE = 1.60934;

const MIN_VALID_WEEKLY_KM = 15;
const MIN_VALID_LONG_RUN_KM = 5;
const MIN_VALID_TRAIN_DAYS = 2;
const CANDIDATE_WEEKS_TO_SCAN = 3;
const STRUCTURALLY_VALID_THRESHOLD = 6;

interface UnifiedPlannedBaseline {
  weeklyVolumeKm: number;
  longRunKm: number;
  source: string;
}

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

function applyCoherenceClamping(
  weeklyVolumeKm: number,
  longRunKm: number,
  sourceBase: string,
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

  return {
    weeklyVolumeKm: Math.round(weeklyVolumeKm * 10) / 10,
    longRunKm: finalLongRunKm,
    source,
  };
}

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

  const validCandidates = candidates
    .filter(c => c.validityScore >= STRUCTURALLY_VALID_THRESHOLD)
    .sort((a, b) => a.weekIndex - b.weekIndex);

  if (validCandidates.length > 0) {
    const selected = validCandidates[0];
    return applyCoherenceClamping(
      selected.weeklyVolumeKm,
      selected.longRunKm,
      `frozen_week_${selected.weekIndex}_valid`,
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

      return applyCoherenceClamping(
        medianCandidate.weeklyVolumeKm,
        effectiveLongRun,
        `frozen_week_${medianCandidate.weekIndex}_median`,
      );
    }
  }

  const answersKm = extractAnswersWeeklyKm(answers);
  if (answersKm > 0) {
    const derivedLongRunKm = Math.round(answersKm * DEFAULT_LR_SHARE * 2) / 2;
    return {
      weeklyVolumeKm: answersKm,
      longRunKm: derivedLongRunKm,
      source: 'answers_fallback',
    };
  }

  const isMarathon = raceDistanceKm >= FULL_MARATHON_THRESHOLD_KM;
  const defaultWeekly = isMarathon ? 40 : 25;
  const defaultLongRun = Math.round(defaultWeekly * DEFAULT_LR_SHARE * 2) / 2;

  return {
    weeklyVolumeKm: defaultWeekly,
    longRunKm: defaultLongRun,
    source: 'absolute_fallback',
  };
}

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

describe('Unified Baseline Fix', () => {
  describe('deriveUnifiedPlannedBaseline', () => {
    it('should derive baseline from PLANNED workout text, ignoring actual_distance', () => {
      const frozenDays = [
        { date: '2025-03-01', workout: 'Easy run: 10 km at 5:30 /km', workout_type: 'TRAIN', actual_distance: 0 },
        { date: '2025-03-02', workout: 'Rest', workout_type: 'REST' },
        { date: '2025-03-03', workout: 'Easy run: 8 km at 5:30 /km', workout_type: 'TRAIN', actual_distance: 0 },
        { date: '2025-03-04', workout: 'Tempo: 10 km', workout_type: 'TRAIN', actual_distance: 0 },
        { date: '2025-03-05', workout: 'Easy run: 8 km at 5:30 /km', workout_type: 'TRAIN', actual_distance: 0 },
        { date: '2025-03-06', workout: 'Rest', workout_type: 'REST' },
        { date: '2025-03-07', workout: 'Long run: 18 km at 5:45 /km', workout_type: 'TRAIN', actual_distance: 18 },
      ];

      const baseline = deriveUnifiedPlannedBaseline(
        frozenDays,
        '2025-03-08',
        {},
        42,
      );

      expect(baseline.weeklyVolumeKm).toBe(54);
      expect(baseline.longRunKm).toBe(18);
      expect(baseline.source).toContain('frozen_week_0');
    });

    it('should produce identical baseline regardless of actual_distance values', () => {
      const missedWeekdaysFrozenDays = [
        { date: '2025-03-01', workout: 'Easy run: 10 km', workout_type: 'TRAIN', actual_distance: 0 },
        { date: '2025-03-02', workout: 'Rest', workout_type: 'REST' },
        { date: '2025-03-03', workout: 'Easy run: 8 km', workout_type: 'TRAIN', actual_distance: 0 },
        { date: '2025-03-04', workout: 'Tempo: 10 km', workout_type: 'TRAIN', actual_distance: 0 },
        { date: '2025-03-05', workout: 'Easy run: 8 km', workout_type: 'TRAIN', actual_distance: 0 },
        { date: '2025-03-06', workout: 'Rest', workout_type: 'REST' },
        { date: '2025-03-07', workout: 'Long run: 18 km', workout_type: 'TRAIN', actual_distance: 18 },
      ];

      const completedAllFrozenDays = [
        { date: '2025-03-01', workout: 'Easy run: 10 km', workout_type: 'TRAIN', actual_distance: 10 },
        { date: '2025-03-02', workout: 'Rest', workout_type: 'REST' },
        { date: '2025-03-03', workout: 'Easy run: 8 km', workout_type: 'TRAIN', actual_distance: 8 },
        { date: '2025-03-04', workout: 'Tempo: 10 km', workout_type: 'TRAIN', actual_distance: 10 },
        { date: '2025-03-05', workout: 'Easy run: 8 km', workout_type: 'TRAIN', actual_distance: 8 },
        { date: '2025-03-06', workout: 'Rest', workout_type: 'REST' },
        { date: '2025-03-07', workout: 'Long run: 18 km', workout_type: 'TRAIN', actual_distance: 18 },
      ];

      const baselineMissed = deriveUnifiedPlannedBaseline(missedWeekdaysFrozenDays, '2025-03-08', {}, 42);
      const baselineCompleted = deriveUnifiedPlannedBaseline(completedAllFrozenDays, '2025-03-08', {}, 42);

      expect(baselineMissed.weeklyVolumeKm).toBe(baselineCompleted.weeklyVolumeKm);
      expect(baselineMissed.longRunKm).toBe(baselineCompleted.longRunKm);
    });

    it('should fall back to answers when frozen weeks have insufficient data', () => {
      const insufficientFrozenDays = [
        { date: '2025-03-07', workout: 'Easy run: 5 km', workout_type: 'TRAIN' },
      ];

      const baseline = deriveUnifiedPlannedBaseline(
        insufficientFrozenDays,
        '2025-03-08',
        { currentWeeklyKm: 40 },
        42,
      );

      expect(baseline.weeklyVolumeKm).toBe(40);
      expect(baseline.longRunKm).toBeCloseTo(40 * 0.32, 0);
      expect(baseline.source).toBe('answers_fallback');
    });

    it('should use absolute fallback when no frozen data or answers', () => {
      const baseline = deriveUnifiedPlannedBaseline([], '2025-03-08', {}, 42);

      expect(baseline.weeklyVolumeKm).toBe(40);
      expect(baseline.longRunKm).toBeCloseTo(40 * 0.32, 0);
      expect(baseline.source).toBe('absolute_fallback');
    });

    it('should use lower default weekly for non-marathon', () => {
      const baseline = deriveUnifiedPlannedBaseline([], '2025-03-08', {}, 21);

      expect(baseline.weeklyVolumeKm).toBe(25);
      expect(baseline.source).toBe('absolute_fallback');
    });
  });

  describe('Multi-week candidate selection', () => {
    it('should skip cutback week and use prior normal week when last week is a cutback', () => {
      const frozenDays = [
        { date: '2025-02-22', workout: 'Easy run: 10 km', workout_type: 'TRAIN' },
        { date: '2025-02-24', workout: 'Easy run: 8 km', workout_type: 'TRAIN' },
        { date: '2025-02-25', workout: 'Tempo: 10 km', workout_type: 'TRAIN' },
        { date: '2025-02-26', workout: 'Easy run: 8 km', workout_type: 'TRAIN' },
        { date: '2025-02-28', workout: 'Long run: 20 km', workout_type: 'TRAIN' },
        { date: '2025-03-01', workout: 'Easy run: 6 km', workout_type: 'TRAIN' },
        { date: '2025-03-04', workout: 'Easy run: 5 km', workout_type: 'TRAIN' },
        { date: '2025-03-07', workout: 'Long run: 12 km', workout_type: 'TRAIN' },
      ];

      const baseline = deriveUnifiedPlannedBaseline(frozenDays, '2025-03-08', {}, 42);

      expect(baseline.weeklyVolumeKm).toBeGreaterThanOrEqual(50);
      expect(baseline.longRunKm).toBeGreaterThanOrEqual(18);
      expect(baseline.source).toContain('frozen_week_1');
    });

    it('should skip sparse week and use prior complete week', () => {
      const frozenDays = [
        { date: '2025-02-22', workout: 'Easy run: 10 km', workout_type: 'TRAIN' },
        { date: '2025-02-24', workout: 'Easy run: 8 km', workout_type: 'TRAIN' },
        { date: '2025-02-25', workout: 'Tempo: 10 km', workout_type: 'TRAIN' },
        { date: '2025-02-26', workout: 'Easy run: 8 km', workout_type: 'TRAIN' },
        { date: '2025-02-28', workout: 'Long run: 18 km', workout_type: 'TRAIN' },
        { date: '2025-03-07', workout: 'Easy run: 5 km', workout_type: 'TRAIN' },
      ];

      const baseline = deriveUnifiedPlannedBaseline(frozenDays, '2025-03-08', {}, 42);

      expect(baseline.weeklyVolumeKm).toBeGreaterThanOrEqual(50);
      expect(baseline.longRunKm).toBeGreaterThanOrEqual(16);
      expect(baseline.source).toContain('frozen_week_1');
    });

    it('should use median candidate week (paired baseline) when all recent weeks are weak', () => {
      const frozenDays = [
        { date: '2025-02-15', workout: 'Easy run: 8 km', workout_type: 'TRAIN' },
        { date: '2025-02-17', workout: 'Long run: 10 km', workout_type: 'TRAIN' },
        { date: '2025-02-22', workout: 'Easy run: 6 km', workout_type: 'TRAIN' },
        { date: '2025-02-24', workout: 'Long run: 8 km', workout_type: 'TRAIN' },
        { date: '2025-03-01', workout: 'Easy run: 5 km', workout_type: 'TRAIN' },
        { date: '2025-03-03', workout: 'Long run: 7 km', workout_type: 'TRAIN' },
      ];

      const baseline = deriveUnifiedPlannedBaseline(frozenDays, '2025-03-08', { currentWeeklyKm: 40 }, 42);

      expect(baseline.source).toMatch(/frozen_week_\d+_median|answers_fallback/);
    });

    it('should preserve paired baseline from same candidate week in median fallback', () => {
      const frozenDays = [
        { date: '2025-02-15', workout: 'Easy run: 5 km', workout_type: 'TRAIN' },
        { date: '2025-02-17', workout: 'Long run: 10 km', workout_type: 'TRAIN' },
        { date: '2025-02-22', workout: 'Easy run: 8 km', workout_type: 'TRAIN' },
        { date: '2025-02-24', workout: 'Long run: 12 km', workout_type: 'TRAIN' },
        { date: '2025-03-01', workout: 'Easy run: 10 km', workout_type: 'TRAIN' },
        { date: '2025-03-03', workout: 'Long run: 8 km', workout_type: 'TRAIN' },
      ];

      const baseline = deriveUnifiedPlannedBaseline(frozenDays, '2025-03-08', {}, 42);

      expect(baseline.source).toMatch(/frozen_week_\d+_median/);
      expect(baseline.weeklyVolumeKm).toBe(18);
      expect(baseline.longRunKm).toBe(8);
    });

    it('should prefer most recent valid week over older valid week', () => {
      const frozenDays = [
        { date: '2025-02-15', workout: 'Easy run: 12 km', workout_type: 'TRAIN' },
        { date: '2025-02-17', workout: 'Easy run: 10 km', workout_type: 'TRAIN' },
        { date: '2025-02-18', workout: 'Tempo: 12 km', workout_type: 'TRAIN' },
        { date: '2025-02-19', workout: 'Easy run: 10 km', workout_type: 'TRAIN' },
        { date: '2025-02-21', workout: 'Long run: 22 km', workout_type: 'TRAIN' },
        { date: '2025-02-22', workout: 'Easy run: 10 km', workout_type: 'TRAIN' },
        { date: '2025-02-24', workout: 'Easy run: 8 km', workout_type: 'TRAIN' },
        { date: '2025-02-25', workout: 'Tempo: 10 km', workout_type: 'TRAIN' },
        { date: '2025-02-26', workout: 'Easy run: 8 km', workout_type: 'TRAIN' },
        { date: '2025-02-28', workout: 'Long run: 18 km', workout_type: 'TRAIN' },
        { date: '2025-03-01', workout: 'Easy run: 10 km', workout_type: 'TRAIN' },
        { date: '2025-03-03', workout: 'Easy run: 8 km', workout_type: 'TRAIN' },
        { date: '2025-03-04', workout: 'Tempo: 10 km', workout_type: 'TRAIN' },
        { date: '2025-03-05', workout: 'Easy run: 8 km', workout_type: 'TRAIN' },
        { date: '2025-03-07', workout: 'Long run: 20 km', workout_type: 'TRAIN' },
      ];

      const baseline = deriveUnifiedPlannedBaseline(frozenDays, '2025-03-08', {}, 42);

      expect(baseline.source).toContain('frozen_week_0');
      expect(baseline.weeklyVolumeKm).toBe(56);
      expect(baseline.longRunKm).toBe(20);
    });

    it('should maintain coherent LR share when selecting from candidates', () => {
      const frozenDays = [
        { date: '2025-02-22', workout: 'Easy run: 10 km', workout_type: 'TRAIN' },
        { date: '2025-02-24', workout: 'Easy run: 8 km', workout_type: 'TRAIN' },
        { date: '2025-02-25', workout: 'Tempo: 10 km', workout_type: 'TRAIN' },
        { date: '2025-02-26', workout: 'Easy run: 8 km', workout_type: 'TRAIN' },
        { date: '2025-02-28', workout: 'Long run: 18 km', workout_type: 'TRAIN' },
        { date: '2025-03-01', workout: 'Easy run: 5 km', workout_type: 'TRAIN' },
        { date: '2025-03-07', workout: 'Long run: 12 km', workout_type: 'TRAIN' },
      ];

      const baseline = deriveUnifiedPlannedBaseline(frozenDays, '2025-03-08', {}, 42);
      const share = baseline.longRunKm / baseline.weeklyVolumeKm;

      expect(share).toBeGreaterThanOrEqual(0.20);
      expect(share).toBeLessThanOrEqual(0.50);
    });
  });

  describe('Week validity scoring', () => {
    it('should score a complete normal week highly', () => {
      const candidate: Omit<WeekCandidate, 'validityScore'> = {
        weekIndex: 0,
        weekStartISO: '2025-03-01',
        weeklyVolumeKm: 50,
        longRunKm: 18,
        longRunShare: 0.36,
        trainDayCount: 4,
        hasLongRun: true,
      };

      const score = computeWeekValidityScore(candidate);
      expect(score).toBeGreaterThanOrEqual(STRUCTURALLY_VALID_THRESHOLD);
    });

    it('should score a cutback week lower', () => {
      const candidate: Omit<WeekCandidate, 'validityScore'> = {
        weekIndex: 0,
        weekStartISO: '2025-03-01',
        weeklyVolumeKm: 25,
        longRunKm: 12,
        longRunShare: 0.48,
        trainDayCount: 3,
        hasLongRun: true,
      };

      const score = computeWeekValidityScore(candidate);
      expect(score).toBeLessThan(10);
    });

    it('should score a sparse week very low', () => {
      const candidate: Omit<WeekCandidate, 'validityScore'> = {
        weekIndex: 0,
        weekStartISO: '2025-03-01',
        weeklyVolumeKm: 10,
        longRunKm: 0,
        longRunShare: 0,
        trainDayCount: 1,
        hasLongRun: false,
      };

      const score = computeWeekValidityScore(candidate);
      expect(score).toBeLessThan(STRUCTURALLY_VALID_THRESHOLD);
    });

    it('should penalize older weeks via weekIndex', () => {
      const recentCandidate: Omit<WeekCandidate, 'validityScore'> = {
        weekIndex: 0,
        weekStartISO: '2025-03-01',
        weeklyVolumeKm: 50,
        longRunKm: 18,
        longRunShare: 0.36,
        trainDayCount: 4,
        hasLongRun: true,
      };

      const olderCandidate: Omit<WeekCandidate, 'validityScore'> = {
        ...recentCandidate,
        weekIndex: 2,
        weekStartISO: '2025-02-15',
      };

      const recentScore = computeWeekValidityScore(recentCandidate);
      const olderScore = computeWeekValidityScore(olderCandidate);

      expect(recentScore).toBeGreaterThan(olderScore);
      expect(recentScore - olderScore).toBe(2);
    });
  });

  describe('deriveOriginalWeeklyVolumes (planned-only)', () => {
    it('should derive volumes from workout text, ignoring actual_distance', () => {
      const rebuildDays = [
        { date: '2025-03-08', workout: 'Easy run: 8 km', workout_type: 'TRAIN', actual_distance: 0 },
        { date: '2025-03-09', workout: 'Long run: 16 km', workout_type: 'TRAIN', actual_distance: 16 },
        { date: '2025-03-10', workout: 'Rest', workout_type: 'REST' },
        { date: '2025-03-11', workout: 'Easy run: 8 km', workout_type: 'TRAIN', actual_distance: 0 },
        { date: '2025-03-12', workout: 'Tempo: 10 km', workout_type: 'TRAIN', actual_distance: 0 },
        { date: '2025-03-13', workout: 'Easy run: 8 km', workout_type: 'TRAIN', actual_distance: 0 },
        { date: '2025-03-14', workout: 'Rest', workout_type: 'REST' },
      ];

      const volumes = deriveOriginalWeeklyVolumes(rebuildDays, '2025-03-08', 1);

      expect(volumes[0]).toBe(50);
    });

    it('should not be affected by actual_distance values', () => {
      const rebuildDaysNoActual = [
        { date: '2025-03-08', workout: 'Easy run: 8 km', workout_type: 'TRAIN', actual_distance: 0 },
        { date: '2025-03-09', workout: 'Long run: 16 km', workout_type: 'TRAIN', actual_distance: 0 },
      ];

      const rebuildDaysWithActual = [
        { date: '2025-03-08', workout: 'Easy run: 8 km', workout_type: 'TRAIN', actual_distance: 5 },
        { date: '2025-03-09', workout: 'Long run: 16 km', workout_type: 'TRAIN', actual_distance: 20 },
      ];

      const volumesNoActual = deriveOriginalWeeklyVolumes(rebuildDaysNoActual, '2025-03-08', 1);
      const volumesWithActual = deriveOriginalWeeklyVolumes(rebuildDaysWithActual, '2025-03-08', 1);

      expect(volumesNoActual[0]).toBe(volumesWithActual[0]);
      expect(volumesNoActual[0]).toBe(24);
    });
  });

  describe('deriveOriginalLongRunTargets (planned-only)', () => {
    it('should derive LR targets from workout text, ignoring actual_distance', () => {
      const rebuildDays = [
        { date: '2025-03-08', workout: 'Easy run: 8 km', workout_type: 'TRAIN', actual_distance: 0 },
        { date: '2025-03-09', workout: 'Long run: 16 km', workout_type: 'TRAIN', actual_distance: 20 },
      ];

      const targets = deriveOriginalLongRunTargets(rebuildDays, '2025-03-08', 1);

      expect(targets[0]).toBe(16);
    });

    it('should not be affected by actual_distance values', () => {
      const rebuildDaysNoActual = [
        { date: '2025-03-09', workout: 'Long run: 16 km', workout_type: 'TRAIN', actual_distance: 0 },
      ];

      const rebuildDaysWithActual = [
        { date: '2025-03-09', workout: 'Long run: 16 km', workout_type: 'TRAIN', actual_distance: 20 },
      ];

      const targetsNoActual = deriveOriginalLongRunTargets(rebuildDaysNoActual, '2025-03-08', 1);
      const targetsWithActual = deriveOriginalLongRunTargets(rebuildDaysWithActual, '2025-03-08', 1);

      expect(targetsNoActual[0]).toBe(targetsWithActual[0]);
      expect(targetsNoActual[0]).toBe(16);
    });
  });

  describe('Coherence invariants', () => {
    it('should maintain LR share between 20% and 50% in unified baseline', () => {
      const normalFrozenDays = [
        { date: '2025-03-01', workout: 'Easy run: 10 km', workout_type: 'TRAIN' },
        { date: '2025-03-03', workout: 'Easy run: 8 km', workout_type: 'TRAIN' },
        { date: '2025-03-04', workout: 'Tempo: 10 km', workout_type: 'TRAIN' },
        { date: '2025-03-05', workout: 'Easy run: 8 km', workout_type: 'TRAIN' },
        { date: '2025-03-07', workout: 'Long run: 18 km', workout_type: 'TRAIN' },
      ];

      const baseline = deriveUnifiedPlannedBaseline(normalFrozenDays, '2025-03-08', {}, 42);
      const share = baseline.longRunKm / baseline.weeklyVolumeKm;

      expect(share).toBeGreaterThanOrEqual(0.20);
      expect(share).toBeLessThanOrEqual(0.50);
    });

    it('should clamp excessively high LR share to 40%', () => {
      const highLRShareDays = [
        { date: '2025-03-01', workout: 'Easy run: 5 km', workout_type: 'TRAIN' },
        { date: '2025-03-07', workout: 'Long run: 25 km', workout_type: 'TRAIN' },
      ];

      const baseline = deriveUnifiedPlannedBaseline(highLRShareDays, '2025-03-08', {}, 42);

      expect(baseline.longRunKm).toBe(12);
      expect(baseline.source).toContain('clamped');
    });

    it('should clamp excessively low LR share to 25%', () => {
      const lowLRShareDays = [
        { date: '2025-03-01', workout: 'Easy run: 15 km', workout_type: 'TRAIN' },
        { date: '2025-03-02', workout: 'Easy run: 15 km', workout_type: 'TRAIN' },
        { date: '2025-03-03', workout: 'Easy run: 15 km', workout_type: 'TRAIN' },
        { date: '2025-03-04', workout: 'Easy run: 10 km', workout_type: 'TRAIN' },
        { date: '2025-03-07', workout: 'Long run: 5 km', workout_type: 'TRAIN' },
      ];

      const baseline = deriveUnifiedPlannedBaseline(lowLRShareDays, '2025-03-08', {}, 42);
      const share = baseline.longRunKm / baseline.weeklyVolumeKm;

      expect(share).toBeGreaterThanOrEqual(0.20);
      expect(baseline.source).toContain('clamped');
    });
  });

  describe('Regression: missed weekday sessions + completed long runs', () => {
    it('should NOT depress weekly baseline when weekdays are missed but long runs completed', () => {
      const frozenDays = [
        { date: '2025-03-01', workout: 'Easy run: 10 km', workout_type: 'TRAIN', actual_distance: 0 },
        { date: '2025-03-02', workout: 'Rest', workout_type: 'REST' },
        { date: '2025-03-03', workout: 'Easy run: 8 km', workout_type: 'TRAIN', actual_distance: 0 },
        { date: '2025-03-04', workout: 'Tempo: 10 km', workout_type: 'TRAIN', actual_distance: 0 },
        { date: '2025-03-05', workout: 'Easy run: 8 km', workout_type: 'TRAIN', actual_distance: 0 },
        { date: '2025-03-06', workout: 'Rest', workout_type: 'REST' },
        { date: '2025-03-07', workout: 'Long run: 18 km', workout_type: 'TRAIN', actual_distance: 18 },
      ];

      const baseline = deriveUnifiedPlannedBaseline(frozenDays, '2025-03-08', {}, 42);

      expect(baseline.weeklyVolumeKm).toBe(54);
      expect(baseline.longRunKm).toBe(18);

      const recoveryWeekVolume = Math.round(baseline.weeklyVolumeKm * 0.82 * 10) / 10;
      const recoveryLongRun = Math.round(baseline.longRunKm * 0.75 * 10) / 10;

      expect(recoveryWeekVolume).toBeCloseTo(44.3, 1);
      expect(recoveryLongRun).toBeCloseTo(13.5, 1);

      const weekdayVolume = recoveryWeekVolume - recoveryLongRun;
      const avgWeekdayRun = weekdayVolume / 3;

      expect(avgWeekdayRun).toBeGreaterThan(8);
    });

    it('should produce coherent weekday runs that are not pathologically tiny', () => {
      const frozenDays = [
        { date: '2025-03-01', workout: 'Easy run: 10 km', workout_type: 'TRAIN', actual_distance: 0 },
        { date: '2025-03-03', workout: 'Easy run: 8 km', workout_type: 'TRAIN', actual_distance: 0 },
        { date: '2025-03-04', workout: 'Tempo: 10 km', workout_type: 'TRAIN', actual_distance: 0 },
        { date: '2025-03-05', workout: 'Easy run: 8 km', workout_type: 'TRAIN', actual_distance: 0 },
        { date: '2025-03-07', workout: 'Long run: 18 km', workout_type: 'TRAIN', actual_distance: 18 },
      ];

      const baseline = deriveUnifiedPlannedBaseline(frozenDays, '2025-03-08', {}, 42);

      const recoveryWeekVolume = Math.round(baseline.weeklyVolumeKm * 0.82 * 10) / 10;
      const recoveryLongRun = Math.round(baseline.longRunKm * 0.75 * 10) / 10;

      const easyDayCount = 3;
      const easyDayTotal = recoveryWeekVolume - recoveryLongRun;
      const avgEasyRun = easyDayTotal / easyDayCount;

      expect(avgEasyRun).toBeGreaterThanOrEqual(6);
      expect(avgEasyRun / recoveryLongRun).toBeGreaterThanOrEqual(0.40);
    });
  });
});
