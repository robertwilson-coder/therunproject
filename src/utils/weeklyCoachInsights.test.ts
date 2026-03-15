import { describe, it, expect } from 'vitest';
import {
  selectWeeklyInsight,
  InsightSelectionContext,
  estimateLongRunMinutes,
  detectQualityWorkouts,
  extractLongRunKm,
  calculateRecentMissRate,
  detectRPETrend,
  getWeekMondayISO,
  daysBetween,
  INSIGHT_LIBRARY,
} from './weeklyCoachInsights';

describe('selectWeeklyInsight', () => {
  const baseContext: InsightSelectionContext = {
    daysToRace: null,
    longRunMinutes: null,
    hasQualityWorkout: false,
    recentMissRate: 0,
    recentRPETrend: 'normal',
    weekNumber: 5,
    totalWeeks: 12,
    phase: 'build',
  };

  describe('race/taper priority', () => {
    it('selects trust_the_taper when race is within 14 days', () => {
      const result = selectWeeklyInsight({
        ...baseContext,
        daysToRace: 10,
        phase: 'taper',
      });

      expect(result).not.toBeNull();
      expect(result!.insight.key).toBe('trust_the_taper');
    });

    it('selects practice_race_habits when race is 15-42 days away', () => {
      const result = selectWeeklyInsight({
        ...baseContext,
        daysToRace: 28,
        phase: 'peak',
      });

      expect(result).not.toBeNull();
      expect(result!.insight.key).toBe('practice_race_habits');
    });
  });

  describe('long run priority', () => {
    it('selects fuel_before_you_fade for 90+ minute long runs', () => {
      const result = selectWeeklyInsight({
        ...baseContext,
        longRunMinutes: 100,
      });

      expect(result).not.toBeNull();
      expect(result!.insight.key).toBe('fuel_before_you_fade');
    });

    it('selects start_slower_than_you_want_to for 75-89 minute long runs', () => {
      const result = selectWeeklyInsight({
        ...baseContext,
        longRunMinutes: 80,
      });

      expect(result).not.toBeNull();
      expect(result!.insight.key).toBe('start_slower_than_you_want_to');
    });
  });

  describe('elevated RPE priority', () => {
    it('selects recovery insight when RPE trend is elevated', () => {
      const result = selectWeeklyInsight({
        ...baseContext,
        recentRPETrend: 'elevated',
      });

      expect(result).not.toBeNull();
      expect(['recovery_is_part_of_training', 'sleep_protects_adaptation']).toContain(
        result!.insight.key
      );
    });
  });

  describe('missed workouts priority', () => {
    it('selects dont_try_to_catch_up when miss rate is high', () => {
      const result = selectWeeklyInsight({
        ...baseContext,
        recentMissRate: 0.4,
      });

      expect(result).not.toBeNull();
      expect(result!.insight.key).toBe('dont_try_to_catch_up_missed_runs');
    });
  });

  describe('quality workout priority', () => {
    it('selects workout discipline insight when quality workout scheduled', () => {
      const result = selectWeeklyInsight({
        ...baseContext,
        hasQualityWorkout: true,
      });

      expect(result).not.toBeNull();
      expect(['dont_race_your_workouts', 'finish_with_good_form']).toContain(
        result!.insight.key
      );
    });
  });

  describe('default/fallback behavior', () => {
    it('selects protect_the_easy_run in base phase', () => {
      const result = selectWeeklyInsight({
        ...baseContext,
        phase: 'base',
        weekNumber: 2,
      });

      expect(result).not.toBeNull();
      expect(result!.insight.key).toBe('protect_the_easy_run');
    });

    it('selects consistency_beats_hero_days when no other conditions apply', () => {
      const result = selectWeeklyInsight({
        ...baseContext,
        phase: 'build',
      });

      expect(result).not.toBeNull();
      expect(result!.insight.key).toBe('consistency_beats_hero_days');
    });
  });

  describe('priority ordering', () => {
    it('prioritizes taper over long run', () => {
      const result = selectWeeklyInsight({
        ...baseContext,
        daysToRace: 10,
        longRunMinutes: 100,
        phase: 'taper',
      });

      expect(result).not.toBeNull();
      expect(result!.insight.key).toBe('trust_the_taper');
    });

    it('prioritizes long run over quality workout', () => {
      const result = selectWeeklyInsight({
        ...baseContext,
        longRunMinutes: 95,
        hasQualityWorkout: true,
      });

      expect(result).not.toBeNull();
      expect(result!.insight.key).toBe('fuel_before_you_fade');
    });
  });
});

describe('estimateLongRunMinutes', () => {
  it('calculates minutes from km and pace', () => {
    expect(estimateLongRunMinutes(16, 6.0)).toBe(96);
    expect(estimateLongRunMinutes(20, 5.5)).toBe(110);
    expect(estimateLongRunMinutes(10, 6.0)).toBe(60);
  });

  it('uses default pace when not provided', () => {
    expect(estimateLongRunMinutes(15)).toBe(90);
  });
});

describe('detectQualityWorkouts', () => {
  it('detects tempo workouts', () => {
    expect(detectQualityWorkouts(['Tempo run: 8km with 4km at threshold'])).toBe(true);
  });

  it('detects interval workouts', () => {
    expect(detectQualityWorkouts(['Intervals: 6x800m at 5K pace'])).toBe(true);
  });

  it('detects hill workouts', () => {
    expect(detectQualityWorkouts(['Hills: 8x45s uphill hard'])).toBe(true);
  });

  it('does not flag easy runs', () => {
    expect(detectQualityWorkouts(['Easy run: 6km at easy pace'])).toBe(false);
  });

  it('does not flag long runs', () => {
    expect(detectQualityWorkouts(['Long run: 18km at easy pace'])).toBe(false);
  });

  it('handles multiple workouts', () => {
    expect(detectQualityWorkouts([
      'Easy run: 5km',
      'Rest',
      'Tempo run: 8km threshold',
    ])).toBe(true);
  });
});

describe('extractLongRunKm', () => {
  it('extracts distance from long run workout', () => {
    expect(extractLongRunKm(['Long run: 18 km at easy pace'])).toBe(18);
    expect(extractLongRunKm(['Long run: 22.5 km'])).toBe(22.5);
  });

  it('returns 0 when no long run found', () => {
    expect(extractLongRunKm(['Easy run: 6km', 'Tempo: 8km'])).toBe(0);
  });

  it('handles LSD notation', () => {
    expect(extractLongRunKm(['LSD: 16 km easy effort'])).toBe(16);
  });
});

describe('calculateRecentMissRate', () => {
  function getRecentDate(daysAgo: number): string {
    const d = new Date();
    d.setDate(d.getDate() - daysAgo);
    return d.toISOString().split('T')[0];
  }

  it('calculates miss rate correctly', () => {
    const completions = [
      { completed: true, date: getRecentDate(2) },
      { completed: false, date: getRecentDate(4) },
      { completed: true, date: getRecentDate(6) },
      { completed: false, date: getRecentDate(8) },
    ];
    expect(calculateRecentMissRate(completions, 14)).toBe(0.5);
  });

  it('returns 0 for empty completions', () => {
    expect(calculateRecentMissRate([], 14)).toBe(0);
  });

  it('returns 0 for all completed', () => {
    const completions = [
      { completed: true, date: getRecentDate(2) },
      { completed: true, date: getRecentDate(4) },
    ];
    expect(calculateRecentMissRate(completions, 14)).toBe(0);
  });
});

describe('detectRPETrend', () => {
  it('detects elevated trend', () => {
    const rpes = [
      { rpe: 8, expectedRPE: 5 },
      { rpe: 7, expectedRPE: 5 },
      { rpe: 9, expectedRPE: 5 },
    ];
    expect(detectRPETrend(rpes)).toBe('elevated');
  });

  it('detects low trend', () => {
    const rpes = [
      { rpe: 3, expectedRPE: 6 },
      { rpe: 2, expectedRPE: 5 },
      { rpe: 3, expectedRPE: 6 },
    ];
    expect(detectRPETrend(rpes)).toBe('low');
  });

  it('returns normal for balanced RPEs', () => {
    const rpes = [
      { rpe: 5, expectedRPE: 5 },
      { rpe: 6, expectedRPE: 5 },
      { rpe: 4, expectedRPE: 5 },
    ];
    expect(detectRPETrend(rpes)).toBe('normal');
  });

  it('returns normal for insufficient data', () => {
    expect(detectRPETrend([{ rpe: 8, expectedRPE: 5 }])).toBe('normal');
    expect(detectRPETrend([])).toBe('normal');
  });
});

describe('getWeekMondayISO', () => {
  it('returns Monday for a Wednesday', () => {
    expect(getWeekMondayISO('2024-03-06')).toBe('2024-03-04');
  });

  it('returns same date for a Monday', () => {
    expect(getWeekMondayISO('2024-03-04')).toBe('2024-03-04');
  });

  it('returns previous Monday for a Sunday', () => {
    expect(getWeekMondayISO('2024-03-10')).toBe('2024-03-04');
  });
});

describe('daysBetween', () => {
  it('calculates days between dates', () => {
    expect(daysBetween('2024-03-01', '2024-03-15')).toBe(14);
    expect(daysBetween('2024-03-15', '2024-03-01')).toBe(-14);
    expect(daysBetween('2024-03-01', '2024-03-01')).toBe(0);
  });
});

describe('INSIGHT_LIBRARY', () => {
  it('contains 12 insights', () => {
    expect(INSIGHT_LIBRARY.length).toBe(12);
  });

  it('all insights have required fields', () => {
    for (const insight of INSIGHT_LIBRARY) {
      expect(insight.key).toBeTruthy();
      expect(insight.title).toBeTruthy();
      expect(insight.category).toBeTruthy();
      expect(insight.body.length).toBeGreaterThan(50);
      expect(insight.action.length).toBeGreaterThan(20);
      expect(typeof insight.priority).toBe('number');
    }
  });

  it('has unique keys', () => {
    const keys = INSIGHT_LIBRARY.map(i => i.key);
    const uniqueKeys = new Set(keys);
    expect(uniqueKeys.size).toBe(keys.length);
  });

  it('has unique priorities', () => {
    const priorities = INSIGHT_LIBRARY.map(i => i.priority);
    const uniquePriorities = new Set(priorities);
    expect(uniquePriorities.size).toBe(priorities.length);
  });
});
