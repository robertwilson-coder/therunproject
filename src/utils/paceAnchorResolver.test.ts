import { describe, it, expect } from 'vitest';
import { resolvePaceAnchor, computePaceChange } from './paceAnchorResolver';
import type { CalibrationResult } from '../types';
import type { RunnerAnswers } from '../types';

const NOW = new Date('2026-02-27T12:00:00Z');

function makeCalibration(overrides: Partial<CalibrationResult> = {}): CalibrationResult {
  return {
    testType: '10K',
    completedAtISO: '2026-02-20T10:00:00Z',
    workSegmentDurationMinutes: 50,
    workSegmentDistanceMeters: 10000,
    averagePaceSecPerKm: 300,
    pausedTimeSeconds: 0,
    elevationGainMeters: 0,
    validity: 'high',
    pacingQuality: 'good',
    confidence: 'high',
    ...overrides,
  };
}

function makeRaceAnswers(overrides: Partial<RunnerAnswers> = {}): RunnerAnswers {
  return {
    recentRaceDistance: '10K',
    recentRaceHours: 0,
    recentRaceMinutes: 50,
    recentRaceSeconds: 0,
    ...overrides,
  };
}

describe('resolvePaceAnchor — priority selection', () => {
  it('selects calibration when completed within 6 weeks', () => {
    const cal = makeCalibration({ completedAtISO: '2026-02-20T10:00:00Z' });
    const result = resolvePaceAnchor(cal, makeRaceAnswers(), NOW);
    expect(result.source.kind).toBe('calibration');
  });

  it('falls back to race result when calibration is older than 6 weeks', () => {
    const cal = makeCalibration({ completedAtISO: '2026-01-01T10:00:00Z' });
    const result = resolvePaceAnchor(cal, makeRaceAnswers(), NOW);
    expect(result.source.kind).toBe('race_result_recent');
  });

  it('selects race result when no calibration exists', () => {
    const result = resolvePaceAnchor(null, makeRaceAnswers(), NOW);
    expect(result.source.kind).toBe('race_result_recent');
  });

  it('returns default_estimated when no calibration and no race result', () => {
    const result = resolvePaceAnchor(null, {}, NOW);
    expect(result.source.kind).toBe('default_estimated');
  });

  it('returns default_estimated when answers are null', () => {
    const result = resolvePaceAnchor(null, null, NOW);
    expect(result.source.kind).toBe('default_estimated');
  });
});

describe('resolvePaceAnchor — pace values', () => {
  it('derives correct pace zones from calibration averagePaceSecPerKm', () => {
    const cal = makeCalibration({ averagePaceSecPerKm: 300 });
    const result = resolvePaceAnchor(cal, null, NOW);
    expect(result.paces.racePace).toBe('5:00/km');
    expect(result.paces.easyPace).toBe('6:15/km');
    expect(result.paces.longRunPace).toBe('6:00/km');
    expect(result.paces.tempoPace).toBe('5:24/km');
    expect(result.paces.intervalPace).toBe('4:45/km');
  });

  it('derives correct pace zones from race result', () => {
    const answers = makeRaceAnswers({ recentRaceDistance: '10K', recentRaceMinutes: 50, recentRaceSeconds: 0 });
    const result = resolvePaceAnchor(null, answers, NOW);
    expect(result.paces.racePace).toBe('5:00/km');
  });
});

describe('resolvePaceAnchor — source label', () => {
  it('includes weeks ago in calibration label', () => {
    const cal = makeCalibration({ completedAtISO: '2026-02-20T10:00:00Z' });
    const result = resolvePaceAnchor(cal, null, NOW);
    expect(result.source.label).toMatch(/Calibration \(\d+ week/);
  });

  it('includes distance in race result label', () => {
    const result = resolvePaceAnchor(null, makeRaceAnswers(), NOW);
    expect(result.source.label).toContain('10K');
  });
});

describe('resolvePaceAnchor — conflict detection', () => {
  it('sets conflictPct when calibration and race paces differ by more than 5%', () => {
    const cal = makeCalibration({ averagePaceSecPerKm: 300 });
    const answers = makeRaceAnswers({
      recentRaceDistance: '10K',
      recentRaceMinutes: 45,
      recentRaceSeconds: 0,
    });
    const result = resolvePaceAnchor(cal, answers, NOW);
    expect(result.conflictPct).not.toBeNull();
    expect(result.conflictPct!).toBeGreaterThan(5);
  });

  it('does not set conflictPct when difference is 5% or less', () => {
    const cal = makeCalibration({ averagePaceSecPerKm: 300 });
    const answers = makeRaceAnswers({
      recentRaceDistance: '10K',
      recentRaceMinutes: 50,
      recentRaceSeconds: 0,
    });
    const result = resolvePaceAnchor(cal, answers, NOW);
    expect(result.conflictPct).toBeNull();
  });

  it('does not set conflictPct when no race result to compare', () => {
    const cal = makeCalibration({ averagePaceSecPerKm: 300 });
    const result = resolvePaceAnchor(cal, {}, NOW);
    expect(result.conflictPct).toBeNull();
  });
});

describe('resolvePaceAnchor — structural independence', () => {
  it('changing paces does not affect colour tier inputs', () => {
    const calA = makeCalibration({ averagePaceSecPerKm: 270 });
    const calB = makeCalibration({ averagePaceSecPerKm: 360 });
    const answers = makeRaceAnswers();

    const resultA = resolvePaceAnchor(calA, answers, NOW);
    const resultB = resolvePaceAnchor(calB, answers, NOW);

    expect(resultA.source.kind).toBe(resultB.source.kind);
    expect(resultA.paces.racePace).not.toBe(resultB.paces.racePace);
  });

  it('returns a new object each call — no mutation', () => {
    const cal = makeCalibration();
    const answers = makeRaceAnswers();
    const r1 = resolvePaceAnchor(cal, answers, NOW);
    const r2 = resolvePaceAnchor(cal, answers, NOW);
    expect(r1).not.toBe(r2);
    expect(r1.paces).not.toBe(r2.paces);
  });
});

describe('computePaceChange — auto-update vs confirm decision', () => {
  const currentPaces = {
    racePace: '5:00/km',
    easyPace: '6:15/km',
    longRunPace: '6:00/km',
    tempoPace: '5:24/km',
    intervalPace: '4:45/km',
  };

  it('returns auto when change is exactly 5%', () => {
    const newCal = makeCalibration({ averagePaceSecPerKm: 300 * 1.05 });
    const result = computePaceChange(currentPaces, newCal, null, NOW);
    expect(result.decision).toBe('auto');
  });

  it('returns auto when change is less than 5%', () => {
    const newCal = makeCalibration({ averagePaceSecPerKm: 300 * 1.03 });
    const result = computePaceChange(currentPaces, newCal, null, NOW);
    expect(result.decision).toBe('auto');
  });

  it('returns confirm when change exceeds 5%', () => {
    const newCal = makeCalibration({ averagePaceSecPerKm: 300 * 1.08 });
    const result = computePaceChange(currentPaces, newCal, null, NOW);
    expect(result.decision).toBe('confirm');
  });

  it('returns confirm when change is significantly larger', () => {
    const newCal = makeCalibration({ averagePaceSecPerKm: 300 * 1.15 });
    const result = computePaceChange(currentPaces, newCal, null, NOW);
    expect(result.decision).toBe('confirm');
    expect(result.changePct).toBeGreaterThan(5);
  });

  it('returns auto when no current paces exist', () => {
    const newCal = makeCalibration({ averagePaceSecPerKm: 250 });
    const result = computePaceChange(null, newCal, null, NOW);
    expect(result.decision).toBe('auto');
    expect(result.changePct).toBe(0);
  });

  it('new anchor paces are set from calibration', () => {
    const newCal = makeCalibration({ averagePaceSecPerKm: 300 });
    const result = computePaceChange(currentPaces, newCal, null, NOW);
    expect(result.newAnchor.paces.racePace).toBe('5:00/km');
  });

  it('does not mutate currentPaces', () => {
    const copy = { ...currentPaces };
    const newCal = makeCalibration({ averagePaceSecPerKm: 280 });
    computePaceChange(currentPaces, newCal, null, NOW);
    expect(currentPaces).toEqual(copy);
  });
});

describe('computePaceChange — structural invariants', () => {
  it('changing paces does not change the source kind selection logic', () => {
    const cal1 = makeCalibration({ averagePaceSecPerKm: 240 });
    const cal2 = makeCalibration({ averagePaceSecPerKm: 360 });
    const current = { racePace: '5:00/km', easyPace: '6:15/km', longRunPace: '6:00/km', tempoPace: '5:24/km', intervalPace: '4:45/km' };

    const r1 = computePaceChange(current, cal1, null, NOW);
    const r2 = computePaceChange(current, cal2, null, NOW);

    expect(r1.newAnchor.source.kind).toBe(r2.newAnchor.source.kind);
    expect(r1.newAnchor.paces.racePace).not.toBe(r2.newAnchor.paces.racePace);
  });
});
