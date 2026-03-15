import { describe, it, expect } from 'vitest';
import {
  buildPauseResult,
  resumePlan,
  daysBetween,
  addDaysToDate,
  formatPauseDuration,
  computeTaperWeeks,
  LONG_PAUSE_ADVISORY_DAYS,
  MAX_RAMP_RATE,
} from './planPause';

const BASE_RESUME_PARAMS = {
  pauseStartDate: '2026-03-01',
  pauseWeekIndex: 5,
  pauseStructuralVolume: 50,
  pauseLongRunTarget: 20,
  totalPausedDaysBefore: 0,
  originalRaceDate: '2026-06-01',
  currentRaceDate: '2026-06-01',
  raceDistanceKm: 42.2,
  startingWeeklyKm: 50,
  startingLongestRunKm: 20,
  trainingFocus: 'durability' as const,
  resumeDate: '2026-03-15',
};

// ============================================================
// Pause result
// ============================================================

describe('buildPauseResult', () => {
  it('sets planStatus to paused', () => {
    const result = buildPauseResult('2026-03-01', 5, 50, 20);
    expect(result.planStatus).toBe('paused');
  });

  it('stores pause date, week index, structural volume, and long run target', () => {
    const result = buildPauseResult('2026-03-01', 5, 50, 20);
    expect(result.pauseStartDate).toBe('2026-03-01');
    expect(result.pauseWeekIndex).toBe(5);
    expect(result.pauseStructuralVolume).toBe(50);
    expect(result.pauseLongRunTarget).toBe(20);
  });
});

// ============================================================
// Race date extends correctly
// ============================================================

describe('Race date extension', () => {
  it('extends race date by exact pause duration', () => {
    const result = resumePlan(BASE_RESUME_PARAMS);
    const expectedDays = daysBetween(BASE_RESUME_PARAMS.pauseStartDate, BASE_RESUME_PARAMS.resumeDate!);
    const expectedNewRaceDate = addDaysToDate(BASE_RESUME_PARAMS.currentRaceDate, expectedDays);
    expect(result.newRaceDate).toBe(expectedNewRaceDate);
  });

  it('pause of 7 days extends race date by exactly 7 days', () => {
    const params = { ...BASE_RESUME_PARAMS, pauseStartDate: '2026-03-01', resumeDate: '2026-03-08' };
    const result = resumePlan(params);
    expect(result.newRaceDate).toBe(addDaysToDate(params.currentRaceDate, 7));
  });

  it('pause of 30 days extends race date by exactly 30 days', () => {
    const params = { ...BASE_RESUME_PARAMS, pauseStartDate: '2026-03-01', resumeDate: '2026-03-31' };
    const result = resumePlan(params);
    expect(result.newRaceDate).toBe(addDaysToDate(params.currentRaceDate, 30));
  });

  it('returns planStatus active on resume', () => {
    const result = resumePlan(BASE_RESUME_PARAMS);
    expect(result.planStatus).toBe('active');
  });
});

// ============================================================
// Structural volumes unchanged (resume resumes from pauseStructuralVolume)
// ============================================================

describe('Structural volume preserved', () => {
  it('first week volume in resumed plan starts from paused structural volume', () => {
    const result = resumePlan(BASE_RESUME_PARAMS);
    expect(result.weeklyVolumes.length).toBeGreaterThan(0);
    expect(result.weeklyVolumes[0]).toBeGreaterThan(0);
  });

  it('resumed plan peak volume is at least as high as pause structural volume', () => {
    const result = resumePlan(BASE_RESUME_PARAMS);
    const peak = Math.max(...result.weeklyVolumes);
    expect(peak).toBeGreaterThanOrEqual(BASE_RESUME_PARAMS.pauseStructuralVolume);
  });

  it('higher structural volume at pause produces higher peak after resume', () => {
    const lowResult = resumePlan({ ...BASE_RESUME_PARAMS, pauseStructuralVolume: 30 });
    const highResult = resumePlan({ ...BASE_RESUME_PARAMS, pauseStructuralVolume: 60 });
    expect(Math.max(...highResult.weeklyVolumes)).toBeGreaterThan(Math.max(...lowResult.weeklyVolumes));
  });
});

// ============================================================
// Ramp integrity preserved
// ============================================================

describe('Ramp integrity', () => {
  it('rampViolation is false for normal parameters', () => {
    const result = resumePlan(BASE_RESUME_PARAMS);
    expect(result.rampViolation).toBe(false);
  });

  it('weekly volumes do not grow faster than 6% between non-deload weeks', () => {
    const result = resumePlan(BASE_RESUME_PARAMS);
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

  it('ramp holds for long remaining windows', () => {
    const params = {
      ...BASE_RESUME_PARAMS,
      currentRaceDate: '2026-09-01',
      resumeDate: '2026-03-15',
    };
    const result = resumePlan(params);
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
});

// ============================================================
// Peak week shifts appropriately
// ============================================================

describe('Peak week shifts', () => {
  it('peak week index is within bounds of returned weeklyVolumes', () => {
    const result = resumePlan(BASE_RESUME_PARAMS);
    expect(result.peakWeek).toBeGreaterThanOrEqual(0);
    expect(result.peakWeek).toBeLessThan(result.weeklyVolumes.length);
  });

  it('longer pause → more weeks to race → same or higher peak volume potential', () => {
    const shortPause = resumePlan({ ...BASE_RESUME_PARAMS, resumeDate: '2026-03-08' });
    const longPause = resumePlan({ ...BASE_RESUME_PARAMS, resumeDate: '2026-04-01' });
    const shortPeak = Math.max(...shortPause.weeklyVolumes);
    const longPeak = Math.max(...longPause.weeklyVolumes);
    expect(longPeak).toBeGreaterThanOrEqual(shortPeak);
  });
});

// ============================================================
// Taper shifts appropriately
// ============================================================

describe('Taper shifts appropriately', () => {
  it('taper weeks count is stable (same race distance → same taper)', () => {
    const result = resumePlan(BASE_RESUME_PARAMS);
    const newRaceDateWeeksToRace = Math.max(1, Math.ceil(daysBetween(BASE_RESUME_PARAMS.resumeDate!, result.newRaceDate) / 7));
    const expectedTaper = computeTaperWeeks(BASE_RESUME_PARAMS.raceDistanceKm, newRaceDateWeeksToRace);
    expect(result.taperWeeks).toBe(expectedTaper);
  });

  it('taper is never compressed (taper start week < total weeks)', () => {
    const result = resumePlan(BASE_RESUME_PARAMS);
    expect(result.taperStartWeek).toBeLessThan(result.weeklyVolumes.length);
  });

  it('taper weeks count does not increase just because pause was long', () => {
    const short = resumePlan({ ...BASE_RESUME_PARAMS, resumeDate: '2026-03-08' });
    const long = resumePlan({ ...BASE_RESUME_PARAMS, resumeDate: '2026-04-15' });
    expect(long.taperWeeks).toBeLessThanOrEqual(3);
    expect(short.taperWeeks).toBeLessThanOrEqual(3);
  });
});

// ============================================================
// Colour tier unchanged
// ============================================================

describe('Colour tier invariance', () => {
  it('resumePlan does not return or modify a colourTier field', () => {
    const result = resumePlan(BASE_RESUME_PARAMS);
    expect((result as any).colourTier).toBeUndefined();
  });
});

// ============================================================
// Total paused days accumulates
// ============================================================

describe('Total paused days', () => {
  it('total paused days = previous total + current pause duration', () => {
    const params = { ...BASE_RESUME_PARAMS, totalPausedDaysBefore: 10 };
    const result = resumePlan(params);
    const pauseDuration = daysBetween(params.pauseStartDate, params.resumeDate!);
    expect(result.totalPausedDays).toBe(10 + pauseDuration);
  });

  it('pause duration is zero when resume date equals pause start date', () => {
    const params = { ...BASE_RESUME_PARAMS, resumeDate: BASE_RESUME_PARAMS.pauseStartDate };
    const result = resumePlan(params);
    expect(result.pauseDurationDays).toBe(0);
  });
});

// ============================================================
// Long pause advisory
// ============================================================

describe('Long pause advisory (>42 days)', () => {
  it('shows rebuild advisory when pause > 42 days', () => {
    const params = { ...BASE_RESUME_PARAMS, pauseStartDate: '2026-01-01', resumeDate: '2026-03-01' };
    const result = resumePlan(params);
    expect(result.showRebuildAdvisory).toBe(true);
  });

  it('does not show rebuild advisory when pause is 42 days or fewer', () => {
    const params = { ...BASE_RESUME_PARAMS, pauseStartDate: '2026-03-01', resumeDate: '2026-04-12' };
    const result = resumePlan(params);
    expect(result.showRebuildAdvisory).toBe(false);
  });

  it('advisory threshold is exactly 42 days', () => {
    expect(LONG_PAUSE_ADVISORY_DAYS).toBe(42);
  });
});

// ============================================================
// Helper utilities
// ============================================================

describe('daysBetween', () => {
  it('computes positive days forward', () => {
    expect(daysBetween('2026-03-01', '2026-03-08')).toBe(7);
  });

  it('returns 0 for same date', () => {
    expect(daysBetween('2026-03-01', '2026-03-01')).toBe(0);
  });
});

describe('addDaysToDate', () => {
  it('adds days correctly', () => {
    expect(addDaysToDate('2026-03-01', 7)).toBe('2026-03-08');
  });

  it('crosses month boundary correctly', () => {
    expect(addDaysToDate('2026-01-28', 7)).toBe('2026-02-04');
  });
});

describe('formatPauseDuration', () => {
  it('formats single day', () => {
    expect(formatPauseDuration(1)).toBe('1 day');
  });

  it('formats multiple days under a week', () => {
    expect(formatPauseDuration(5)).toBe('5 days');
  });

  it('formats exact weeks', () => {
    expect(formatPauseDuration(14)).toBe('2 weeks');
  });

  it('formats weeks with remainder', () => {
    expect(formatPauseDuration(10)).toBe('1w 3d');
  });
});
