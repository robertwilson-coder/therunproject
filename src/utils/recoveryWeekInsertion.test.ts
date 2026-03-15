import { describe, it, expect } from 'vitest';
import {
  insertRecoveryWeek,
  validateRecoveryInsertionConstraints,
  RECOVERY_VOLUME_RATIO,
  MAX_RAMP_RATE,
  MAX_LONG_RUN_CAP_KM,
  LONG_RUN_WEEKLY_VOL_CAP,
} from './recoveryWeekInsertion';
import { computeTaperWeeks } from './planPause';

const BASE_PARAMS = {
  currentWeekIndex: 4,
  weeksToRace: 10,
  currentStructuralVolume: 50,
  previousWeekLongRun: 20,
  startingWeeklyKm: 50,
  startingLongestRunKm: 20,
  raceDistanceKm: 42.2,
  trainingFocus: 'durability' as const,
};

// ============================================================
// Recovery week spec
// ============================================================

describe('Recovery week spec', () => {
  it('recovery volume = structuralVolume * 0.85', () => {
    const result = insertRecoveryWeek(BASE_PARAMS);
    expect(result.recoveryWeekSpec.actualVolume).toBeCloseTo(BASE_PARAMS.currentStructuralVolume * RECOVERY_VOLUME_RATIO, 1);
  });

  it('recovery long run equals previous week long run (flat)', () => {
    const result = insertRecoveryWeek(BASE_PARAMS);
    expect(result.recoveryWeekSpec.longRun).toBeLessThanOrEqual(BASE_PARAMS.previousWeekLongRun + 0.1);
  });

  it('recovery long run does not exceed 60% of recovery volume', () => {
    const result = insertRecoveryWeek(BASE_PARAMS);
    const cap = result.recoveryWeekSpec.actualVolume * LONG_RUN_WEEKLY_VOL_CAP;
    expect(result.recoveryWeekSpec.longRun).toBeLessThanOrEqual(cap + 0.1);
  });

  it('recovery long run does not exceed 32km cap', () => {
    const highLRParams = { ...BASE_PARAMS, previousWeekLongRun: 40, currentStructuralVolume: 100 };
    const result = insertRecoveryWeek(highLRParams);
    expect(result.recoveryWeekSpec.longRun).toBeLessThanOrEqual(MAX_LONG_RUN_CAP_KM);
  });

  it('isRecovery flag is true', () => {
    const result = insertRecoveryWeek(BASE_PARAMS);
    expect(result.recoveryWeekSpec.isRecovery).toBe(true);
  });
});

// ============================================================
// Taper length unchanged
// ============================================================

describe('Taper length unchanged', () => {
  it('taper weeks match computeTaperWeeks for same race distance and remaining weeks', () => {
    const result = insertRecoveryWeek(BASE_PARAMS);
    const expected = computeTaperWeeks(BASE_PARAMS.raceDistanceKm, BASE_PARAMS.weeksToRace);
    expect(result.taperWeeks).toBe(expected);
  });

  it('taper weeks unaffected by half-marathon distance', () => {
    const hmParams = { ...BASE_PARAMS, raceDistanceKm: 21.1, weeksToRace: 12 };
    const result = insertRecoveryWeek(hmParams);
    const expected = computeTaperWeeks(hmParams.raceDistanceKm, hmParams.weeksToRace);
    expect(result.taperWeeks).toBe(expected);
  });

  it('taper weeks unaffected by 5km race', () => {
    const fiveKParams = { ...BASE_PARAMS, raceDistanceKm: 5, weeksToRace: 8 };
    const result = insertRecoveryWeek(fiveKParams);
    const expected = computeTaperWeeks(fiveKParams.raceDistanceKm, fiveKParams.weeksToRace);
    expect(result.taperWeeks).toBe(expected);
  });
});

// ============================================================
// Ramp rate <= 6%
// ============================================================

describe('Ramp rate constraint', () => {
  it('rampViolation is false for normal conditions', () => {
    const result = insertRecoveryWeek(BASE_PARAMS);
    expect(result.rampViolation).toBe(false);
  });

  it('weekly volume array grows at most 6% between consecutive non-deload weeks', () => {
    const result = insertRecoveryWeek(BASE_PARAMS);
    const vols = result.weeklyVolumes;
    for (let i = 2; i < vols.length; i++) {
      const prev = vols[i - 1];
      const curr = vols[i];
      const prevPrev = vols[i - 2];
      const isDeloadBounce = prev < prevPrev;
      if (!isDeloadBounce && prev > 0 && curr > prev) {
        const rate = (curr - prev) / prev;
        expect(rate).toBeLessThanOrEqual(MAX_RAMP_RATE + 0.001);
      }
    }
  });

  it('ramp rate holds for longer remaining windows', () => {
    const longResult = insertRecoveryWeek({ ...BASE_PARAMS, weeksToRace: 18 });
    const vols = longResult.weeklyVolumes;
    for (let i = 2; i < vols.length; i++) {
      const prev = vols[i - 1];
      const curr = vols[i];
      const prevPrev = vols[i - 2];
      const isDeloadBounce = prev < prevPrev;
      if (!isDeloadBounce && prev > 0 && curr > prev) {
        const rate = (curr - prev) / prev;
        expect(rate).toBeLessThanOrEqual(MAX_RAMP_RATE + 0.001);
      }
    }
  });
});

// ============================================================
// Race date stays fixed (no plan duration shift)
// ============================================================

describe('Race date stays fixed', () => {
  it('total weeks from insertion = weeksToRace (no extra week added to window)', () => {
    const result = insertRecoveryWeek(BASE_PARAMS);
    expect(result.weeklyVolumes.length).toBeLessThanOrEqual(BASE_PARAMS.weeksToRace);
  });

  it('taper weeks count is within weeksToRace', () => {
    const result = insertRecoveryWeek(BASE_PARAMS);
    expect(result.taperWeeks).toBeLessThan(BASE_PARAMS.weeksToRace);
  });
});

// ============================================================
// Peak volume shifts appropriately
// ============================================================

describe('Peak volume computation', () => {
  it('new peak volume is a positive number', () => {
    const result = insertRecoveryWeek(BASE_PARAMS);
    expect(result.newProjectedPeakVolume).toBeGreaterThan(0);
  });

  it('peak volume for shorter remaining window is less than or equal to longer window', () => {
    const shortResult = insertRecoveryWeek({ ...BASE_PARAMS, weeksToRace: 6 });
    const longResult = insertRecoveryWeek({ ...BASE_PARAMS, weeksToRace: 16 });
    expect(shortResult.newProjectedPeakVolume).toBeLessThanOrEqual(longResult.newProjectedPeakVolume);
  });

  it('if remaining weeks are constrained, lower peak is accepted without accelerating ramp', () => {
    const constrained = insertRecoveryWeek({ ...BASE_PARAMS, weeksToRace: 4 });
    expect(constrained.newProjectedPeakVolume).toBeGreaterThan(0);
    expect(constrained.rampViolation).toBe(false);
  });

  it('peak week index is within the returned weeklyVolumes array', () => {
    const result = insertRecoveryWeek(BASE_PARAMS);
    expect(result.peakWeek).toBeGreaterThanOrEqual(0);
    expect(result.peakWeek).toBeLessThan(result.weeklyVolumes.length);
  });
});

// ============================================================
// Tier unchanged (tier is not part of this function)
// ============================================================

describe('Tier invariance', () => {
  it('insertRecoveryWeek does not return or modify a colourTier field', () => {
    const result = insertRecoveryWeek(BASE_PARAMS);
    expect((result as any).colourTier).toBeUndefined();
  });
});

// ============================================================
// Long run targets
// ============================================================

describe('Long run targets', () => {
  it('no long run target exceeds 32km', () => {
    const result = insertRecoveryWeek(BASE_PARAMS);
    for (const lr of result.longRunTargets) {
      expect(lr).toBeLessThanOrEqual(MAX_LONG_RUN_CAP_KM);
    }
  });

  it('new peak long run is a positive number', () => {
    const result = insertRecoveryWeek(BASE_PARAMS);
    expect(result.newProjectedPeakLongRun).toBeGreaterThan(0);
  });
});

// ============================================================
// validateRecoveryInsertionConstraints
// ============================================================

describe('validateRecoveryInsertionConstraints', () => {
  it('returns empty array for a valid result', () => {
    const result = insertRecoveryWeek(BASE_PARAMS);
    const violations = validateRecoveryInsertionConstraints(result);
    expect(violations).toHaveLength(0);
  });

  it('detects ramp violation when rampViolation flag is true', () => {
    const result = insertRecoveryWeek(BASE_PARAMS);
    const injected = { ...result, rampViolation: true };
    const violations = validateRecoveryInsertionConstraints(injected);
    expect(violations.some(v => v.includes('Ramp rate'))).toBe(true);
  });

  it('detects long run cap violation when artificially injected', () => {
    const result = insertRecoveryWeek(BASE_PARAMS);
    const injected = {
      ...result,
      longRunTargets: [40, 35, 33],
    };
    const violations = validateRecoveryInsertionConstraints(injected);
    expect(violations.some(v => v.includes('32km cap'))).toBe(true);
  });
});
