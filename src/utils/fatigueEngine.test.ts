import { describe, it, expect } from 'vitest';
import { computeFatigueSignals, type WorkoutHistoryEntry } from './fatigueEngine';

const TODAY = '2026-02-27';

function daysAgo(n: number): string {
  const d = new Date(TODAY);
  d.setDate(d.getDate() - n);
  return d.toISOString().split('T')[0];
}

function entry(
  daysBack: number,
  rpe: number,
  distanceKm: number,
  completed = true,
  durationMin = 40
): WorkoutHistoryEntry {
  return { date: daysAgo(daysBack), rpe, distanceKm, durationMin, completed };
}

// ─── SUITE 1: HIGH RPE STREAK ─────────────────────────────────────────────────

describe('highRPEStreak', () => {
  it('counts completed sessions with RPE >= 8 in last 7 days', () => {
    const history = [
      entry(1, 9, 10),
      entry(2, 8, 10),
      entry(3, 7, 10),
      entry(5, 8, 10),
      entry(8, 9, 10),
    ];
    const signals = computeFatigueSignals(history, TODAY);
    expect(signals.highRPEStreak).toBe(3);
  });

  it('excludes sessions older than 7 days', () => {
    const history = [
      entry(8, 9, 10),
      entry(9, 8, 10),
    ];
    const signals = computeFatigueSignals(history, TODAY);
    expect(signals.highRPEStreak).toBe(0);
  });

  it('excludes incomplete sessions', () => {
    const history = [
      entry(1, 9, 10, false),
      entry(2, 8, 10, false),
    ];
    const signals = computeFatigueSignals(history, TODAY);
    expect(signals.highRPEStreak).toBe(0);
  });

  it('RPE exactly 8 qualifies', () => {
    const history = [entry(1, 8, 10)];
    const signals = computeFatigueSignals(history, TODAY);
    expect(signals.highRPEStreak).toBe(1);
  });

  it('RPE 7 does not qualify', () => {
    const history = [entry(1, 7, 10)];
    const signals = computeFatigueSignals(history, TODAY);
    expect(signals.highRPEStreak).toBe(0);
  });
});

// ─── SUITE 2: LOAD RATIO ──────────────────────────────────────────────────────

describe('loadRatio', () => {
  it('returns 1.0 when last 7d matches prior 3-week weekly average', () => {
    const history = [
      entry(1, 5, 10),
      entry(2, 5, 10),
      entry(3, 5, 10),
      entry(8, 5, 10),
      entry(9, 5, 10),
      entry(10, 5, 10),
      entry(15, 5, 10),
      entry(16, 5, 10),
      entry(17, 5, 10),
      entry(22, 5, 10),
      entry(23, 5, 10),
      entry(24, 5, 10),
    ];
    const signals = computeFatigueSignals(history, TODAY);
    expect(signals.loadRatio).toBeCloseTo(1.0, 1);
  });

  it('returns > 1 when last 7d volume exceeds prior average', () => {
    const history = [
      entry(1, 5, 30),
      entry(8, 5, 10),
      entry(15, 5, 10),
      entry(22, 5, 10),
    ];
    const signals = computeFatigueSignals(history, TODAY);
    expect(signals.loadRatio).toBeGreaterThan(1);
  });

  it('returns < 1 when last 7d volume is lower than prior average', () => {
    const history = [
      entry(1, 5, 5),
      entry(8, 5, 20),
      entry(15, 5, 20),
      entry(22, 5, 20),
    ];
    const signals = computeFatigueSignals(history, TODAY);
    expect(signals.loadRatio).toBeLessThan(1);
  });

  it('returns 0 when no history at all', () => {
    const signals = computeFatigueSignals([], TODAY);
    expect(signals.loadRatio).toBe(0);
  });

  it('returns 1.0 when prior 3 weeks are empty but last 7d has runs', () => {
    const history = [entry(1, 5, 10)];
    const signals = computeFatigueSignals(history, TODAY);
    expect(signals.loadRatio).toBe(1.0);
  });
});

// ─── SUITE 3: EASY RUN RPE TREND ─────────────────────────────────────────────

describe('easyRunRPETrend', () => {
  it('returns stable when fewer than 6 easy runs', () => {
    const history = [
      entry(3, 4, 8),
      entry(6, 5, 8),
      entry(10, 4, 8),
    ];
    const signals = computeFatigueSignals(history, TODAY);
    expect(signals.easyRunRPETrend).toBe('stable');
  });

  it('returns upward when recent easy runs have higher RPE than previous', () => {
    const history = [
      entry(30, 3, 8),
      entry(27, 3, 8),
      entry(24, 3, 8),
      entry(10, 5, 8),
      entry(7, 5, 8),
      entry(4, 5, 8),
    ];
    const signals = computeFatigueSignals(history, TODAY);
    expect(signals.easyRunRPETrend).toBe('upward');
  });

  it('returns downward when recent easy runs have lower RPE than previous', () => {
    const history = [
      entry(30, 5, 8),
      entry(27, 5, 8),
      entry(24, 5, 8),
      entry(10, 3, 8),
      entry(7, 3, 8),
      entry(4, 3, 8),
    ];
    const signals = computeFatigueSignals(history, TODAY);
    expect(signals.easyRunRPETrend).toBe('downward');
  });

  it('returns stable when difference is within ±0.5', () => {
    const history = [
      entry(30, 4, 8),
      entry(27, 4, 8),
      entry(24, 4, 8),
      entry(10, 4, 8),
      entry(7, 4, 8),
      entry(4, 4, 8),
    ];
    const signals = computeFatigueSignals(history, TODAY);
    expect(signals.easyRunRPETrend).toBe('stable');
  });

  it('excludes hard runs (RPE > 5) from trend calculation', () => {
    const history = [
      entry(30, 3, 8),
      entry(27, 3, 8),
      entry(24, 3, 8),
      entry(10, 5, 8),
      entry(7, 5, 8),
      entry(4, 5, 8),
      entry(2, 9, 12),
      entry(1, 8, 12),
    ];
    const signals = computeFatigueSignals(history, TODAY);
    expect(signals.easyRunRPETrend).toBe('upward');
  });
});

// ─── SUITE 4: FATIGUE LEVEL CLASSIFICATION ───────────────────────────────────

describe('fatigueLevel', () => {
  it('elevated when highRPEStreak >= 3', () => {
    const history = [
      entry(1, 9, 10),
      entry(2, 8, 10),
      entry(3, 8, 10),
    ];
    const signals = computeFatigueSignals(history, TODAY);
    expect(signals.fatigueLevel).toBe('elevated');
  });

  it('elevated when loadRatio > 1.3', () => {
    const history = [
      entry(1, 5, 50),
      entry(8, 5, 10),
      entry(15, 5, 10),
      entry(22, 5, 10),
    ];
    const signals = computeFatigueSignals(history, TODAY);
    expect(signals.loadRatio).toBeGreaterThan(1.3);
    expect(signals.fatigueLevel).toBe('elevated');
  });

  it('moderate when highRPEStreak >= 1 and loadRatio <= 1.3', () => {
    const history = [
      entry(1, 8, 10),
      entry(8, 5, 10),
      entry(15, 5, 10),
      entry(22, 5, 10),
    ];
    const signals = computeFatigueSignals(history, TODAY);
    expect(signals.highRPEStreak).toBeGreaterThanOrEqual(1);
    expect(signals.fatigueLevel).toBe('moderate');
  });

  it('moderate when loadRatio > 1.1 and highRPEStreak = 0', () => {
    const history = [
      entry(1, 5, 12),
      entry(8, 5, 10),
      entry(15, 5, 10),
      entry(22, 5, 10),
    ];
    const signals = computeFatigueSignals(history, TODAY);
    expect(signals.highRPEStreak).toBe(0);
    expect(signals.loadRatio).toBeGreaterThan(1.1);
    expect(signals.fatigueLevel).toBe('moderate');
  });

  it('low when no stress signals', () => {
    const history = [
      entry(1, 5, 10),
      entry(8, 5, 10),
      entry(15, 5, 10),
      entry(22, 5, 10),
    ];
    const signals = computeFatigueSignals(history, TODAY);
    expect(signals.fatigueLevel).toBe('low');
  });

  it('low with empty history', () => {
    const signals = computeFatigueSignals([], TODAY);
    expect(signals.fatigueLevel).toBe('low');
  });
});

// ─── SUITE 5: MISSED SESSIONS & STRAIN INDEX ─────────────────────────────────

describe('missedSessions14d', () => {
  it('counts incomplete sessions within last 14 days', () => {
    const history = [
      entry(1, 5, 0, false),
      entry(7, 5, 0, false),
      entry(13, 5, 0, false),
      entry(15, 5, 0, false),
    ];
    const signals = computeFatigueSignals(history, TODAY);
    expect(signals.missedSessions14d).toBe(3);
  });

  it('excludes missed sessions older than 14 days', () => {
    const history = [
      entry(15, 5, 0, false),
      entry(20, 5, 0, false),
    ];
    const signals = computeFatigueSignals(history, TODAY);
    expect(signals.missedSessions14d).toBe(0);
  });
});

describe('subjectiveStrainIndex', () => {
  it('is 0 with no history', () => {
    const signals = computeFatigueSignals([], TODAY);
    expect(signals.subjectiveStrainIndex).toBe(0);
  });

  it('is weighted combination of avgRPE7d and missedSessions14d', () => {
    const history = [
      entry(1, 8, 10),
      entry(2, 6, 10),
      entry(6, 5, 0, false),
    ];
    const signals = computeFatigueSignals(history, TODAY);
    const expectedAvgRPE = (8 + 6) / 2;
    const expectedSSI = Math.round((expectedAvgRPE * 0.6 + 1 * 0.4) * 100) / 100;
    expect(signals.subjectiveStrainIndex).toBeCloseTo(expectedSSI, 1);
  });
});
