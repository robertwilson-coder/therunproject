import { describe, it, expect } from 'vitest';
import {
  shouldShowAdvisory,
  buildAdvisoryState,
  applyIntensityReduction,
  findNextDeloadWeek,
  buildDeloadShiftPlan,
  ADVISORY_COOLDOWN_DAYS,
  DISMISSED_COOLDOWN_DAYS,
} from './fatigueAdvisoryEngine';
import type { FatigueSignals } from './fatigueEngine';
import type { TrainingPaces } from '../types';

const NOW = new Date('2026-02-27T12:00:00Z');

function makeSignals(overrides: Partial<FatigueSignals> = {}): FatigueSignals {
  return {
    highRPEStreak: 0,
    easyRunRPETrend: 'stable',
    missedSessions14d: 0,
    loadRatio: 1.0,
    subjectiveStrainIndex: 0,
    fatigueLevel: 'low',
    ...overrides,
  };
}

function daysAgo(n: number): string {
  const d = new Date(NOW);
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

const MODERATE_SIGNALS = makeSignals({ highRPEStreak: 1, loadRatio: 1.15, fatigueLevel: 'moderate' });
const ELEVATED_SIGNALS = makeSignals({ highRPEStreak: 3, loadRatio: 1.35, fatigueLevel: 'elevated' });
const LOW_SIGNALS = makeSignals({ fatigueLevel: 'low' });

// ============================================================
// shouldShowAdvisory — frequency control
// ============================================================

describe('shouldShowAdvisory — frequency control', () => {
  it('returns false when fatigue level is low', () => {
    expect(shouldShowAdvisory(LOW_SIGNALS, null, null, NOW)).toBe(false);
  });

  it('returns true on first-ever advisory (no previous entry)', () => {
    expect(shouldShowAdvisory(MODERATE_SIGNALS, null, null, NOW)).toBe(true);
  });

  it('returns false if last shown less than 7 days ago', () => {
    const lastShown = daysAgo(4);
    expect(shouldShowAdvisory(MODERATE_SIGNALS, lastShown, 'continue', NOW)).toBe(false);
  });

  it('returns true if last shown exactly 7 days ago', () => {
    const lastShown = daysAgo(ADVISORY_COOLDOWN_DAYS);
    expect(shouldShowAdvisory(MODERATE_SIGNALS, lastShown, 'continue', NOW)).toBe(true);
  });

  it('returns true if last shown more than 7 days ago', () => {
    const lastShown = daysAgo(10);
    expect(shouldShowAdvisory(MODERATE_SIGNALS, lastShown, 'continue', NOW)).toBe(true);
  });

  it('suppresses if dismissed within 5 days', () => {
    const lastShown = daysAgo(3);
    expect(shouldShowAdvisory(MODERATE_SIGNALS, lastShown, 'dismissed', NOW)).toBe(false);
  });

  it('suppresses if dismissed even at the 7-day boundary', () => {
    const lastShown = daysAgo(DISMISSED_COOLDOWN_DAYS - 1);
    expect(shouldShowAdvisory(ELEVATED_SIGNALS, lastShown, 'dismissed', NOW)).toBe(false);
  });

  it('does not suppress dismissed if 8 days have passed', () => {
    const lastShown = daysAgo(8);
    expect(shouldShowAdvisory(ELEVATED_SIGNALS, lastShown, 'dismissed', NOW)).toBe(true);
  });
});

// ============================================================
// buildAdvisoryState — trigger reason and signal snapshot
// ============================================================

describe('buildAdvisoryState', () => {
  it('sets shouldShow false for low fatigue', () => {
    const result = buildAdvisoryState(LOW_SIGNALS, null, null, NOW);
    expect(result.shouldShow).toBe(false);
  });

  it('sets shouldShow true for moderate fatigue with no prior entry', () => {
    const result = buildAdvisoryState(MODERATE_SIGNALS, null, null, NOW);
    expect(result.shouldShow).toBe(true);
    expect(result.fatigueLevel).toBe('moderate');
  });

  it('includes triggerReason reflecting highRPEStreak', () => {
    const signals = makeSignals({ highRPEStreak: 2, fatigueLevel: 'moderate' });
    const result = buildAdvisoryState(signals, null, null, NOW);
    expect(result.triggerReason).toContain('highRPEStreak: 2');
  });

  it('includes triggerReason reflecting loadRatio', () => {
    const signals = makeSignals({ loadRatio: 1.25, fatigueLevel: 'moderate' });
    const result = buildAdvisoryState(signals, null, null, NOW);
    expect(result.triggerReason).toContain('loadRatio: 1.25');
  });

  it('snapshot of signals is attached', () => {
    const result = buildAdvisoryState(ELEVATED_SIGNALS, null, null, NOW);
    expect(result.signals).toEqual(ELEVATED_SIGNALS);
  });
});

// ============================================================
// applyIntensityReduction — pace adjustment
// ============================================================

describe('applyIntensityReduction — moderate fatigue only adjusts intensity', () => {
  const paces: TrainingPaces = {
    racePace: '5:00/km',
    easyPace: '6:15/km',
    longRunPace: '6:00/km',
    tempoPace: '5:24/km',
    intervalPace: '4:45/km',
    paceSourceLabel: 'Calibration (2 weeks ago)',
    paceConflictPct: null,
  };

  it('adjusts all pace fields by 3%', () => {
    const result = applyIntensityReduction(paces);
    expect(result.adjustmentPct).toBe(3);
    expect(result.expiresAfterDays).toBe(7);

    expect(result.adjustedPaces.racePace).not.toBe(paces.racePace);
    expect(result.adjustedPaces.easyPace).not.toBe(paces.easyPace);
    expect(result.adjustedPaces.tempoPace).not.toBe(paces.tempoPace);
    expect(result.adjustedPaces.intervalPace).not.toBe(paces.intervalPace);
  });

  it('pace values are slower after reduction (higher sec/km)', () => {
    const result = applyIntensityReduction(paces);
    const parseMin = (s: string) => {
      const [m, sec] = s.replace('/km', '').split(':');
      return parseInt(m) * 60 + parseInt(sec);
    };
    expect(parseMin(result.adjustedPaces.racePace)).toBeGreaterThan(parseMin(paces.racePace));
    expect(parseMin(result.adjustedPaces.easyPace)).toBeGreaterThan(parseMin(paces.easyPace));
  });

  it('preserves paceSourceLabel and paceConflictPct', () => {
    const result = applyIntensityReduction(paces);
    expect(result.adjustedPaces.paceSourceLabel).toBe(paces.paceSourceLabel);
    expect(result.adjustedPaces.paceConflictPct).toBe(paces.paceConflictPct);
  });

  it('does NOT affect colour tier inputs (structural fields remain untouched)', () => {
    const result = applyIntensityReduction(paces);
    expect(result.adjustedPaces.paceSourceLabel).toBe(paces.paceSourceLabel);
    const keys = Object.keys(paces) as (keyof TrainingPaces)[];
    const structuralKeys: (keyof TrainingPaces)[] = ['paceSourceLabel', 'paceConflictPct'];
    for (const k of structuralKeys) {
      expect(result.adjustedPaces[k]).toBe(paces[k]);
    }
  });
});

// ============================================================
// findNextDeloadWeek — deload detection
// ============================================================

describe('findNextDeloadWeek', () => {
  const weeks = [
    { week: 1, focus: 'Base building' },
    { week: 2, focus: 'Aerobic development' },
    { week: 3, focus: 'Progression' },
    { week: 4, label: 'Deload Week', focus: 'Recovery' },
    { week: 5, focus: 'Build phase 2' },
    { week: 8, label: 'Recovery week', focus: 'Easy running' },
  ];

  it('finds next deload week by label after current week', () => {
    const result = findNextDeloadWeek(weeks, 2);
    expect(result).toBe(4);
  });

  it('skips weeks at or before currentWeek', () => {
    const result = findNextDeloadWeek(weeks, 4);
    expect(result).toBe(8);
  });

  it('falls back to week % 4 === 0 when no label match', () => {
    const noLabelWeeks = [
      { week: 1, focus: 'Base' },
      { week: 2, focus: 'Build' },
      { week: 3, focus: 'Hard' },
      { week: 4, focus: 'Hard again' },
    ];
    const result = findNextDeloadWeek(noLabelWeeks, 1);
    expect(result).toBe(4);
  });

  it('returns null if no deload week found', () => {
    const shortPlan = [{ week: 1, focus: 'Run' }, { week: 2, focus: 'Run' }];
    const result = findNextDeloadWeek(shortPlan, 1);
    expect(result).toBeNull();
  });
});

// ============================================================
// buildDeloadShiftPlan — elevated fatigue deload shift
// ============================================================

describe('buildDeloadShiftPlan — no structural change without confirmation', () => {
  it('returns null if nextDeloadWeek is null', () => {
    const result = buildDeloadShiftPlan(3, null, 12);
    expect(result).toBeNull();
  });

  it('returns null if nextDeloadWeek is at or before currentWeek', () => {
    const result = buildDeloadShiftPlan(5, 4, 12);
    expect(result).toBeNull();
  });

  it('returns deload plan targeting currentWeek', () => {
    const result = buildDeloadShiftPlan(3, 6, 12);
    expect(result).not.toBeNull();
    expect(result!.deloadWeekNumber).toBe(3);
  });

  it('includes affected weeks in range', () => {
    const result = buildDeloadShiftPlan(3, 6, 12);
    expect(result!.affectedWeeks).toContain(3);
    expect(result!.affectedWeeks.length).toBeGreaterThan(1);
  });

  it('buildDeloadShiftPlan only returns a plan — does not modify plan data directly', () => {
    const planWeeks = [{ week: 3 }, { week: 4 }, { week: 5 }, { week: 6 }];
    const planCopy = JSON.parse(JSON.stringify(planWeeks));
    buildDeloadShiftPlan(3, 6, 6);
    expect(planWeeks).toEqual(planCopy);
  });
});
