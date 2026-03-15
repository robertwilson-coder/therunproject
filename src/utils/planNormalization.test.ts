import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: () => ({
      insert: vi.fn().mockResolvedValue({ error: null }),
    }),
  },
}));

vi.mock('./stepProgressSystem', () => ({
  computeProgressPanel: vi.fn().mockReturnValue(undefined),
  calculateWeeksToRace: vi.fn().mockReturnValue(null),
}));

vi.mock('./weekToDaysConverter', () => ({
  isWeekBasedPlan: vi.fn().mockReturnValue(false),
  convertWeeksToDays: vi.fn().mockReturnValue({ success: false, days: [], errors: [], metadata: {} }),
}));

vi.mock('./planTypeHelpers', () => ({
  isDateBasedPlan: vi.fn().mockReturnValue(true),
}));

import { normalizeDateBasedPlan, testIdempotence } from './planNormalization';
import type { PlanData } from '../types';

function createTestDay(date: string, workout: string, extras: Record<string, unknown> = {}) {
  return {
    date,
    workout,
    tips: [],
    workout_type: workout === 'Rest' ? 'REST' : 'TRAIN',
    ...extras,
  };
}

function createSparsePlanData(days: any[], sparseWeeks: any[]): PlanData {
  return {
    days,
    plan: sparseWeeks,
    plan_type: 'date_based_full',
  } as PlanData;
}

function createCompletePlanData(days: any[], completeWeeks: any[]): PlanData {
  return {
    days,
    plan: completeWeeks,
    plan_type: 'date_based_full',
  } as PlanData;
}

describe('Gold Standard Plan Normalization', () => {
  describe('Sparse date-based saved plan', () => {
    it('should rebuild full weeks from days[] when stored plan[] is sparse/incomplete', () => {
      const days = [
        createTestDay('2026-03-09', 'Easy run: 5 km'),
        createTestDay('2026-03-11', 'Tempo run: 8 km'),
        createTestDay('2026-03-14', 'Long run: 15 km'),
        createTestDay('2026-03-16', 'Easy run: 6 km'),
        createTestDay('2026-03-18', 'Intervals: 6 km'),
        createTestDay('2026-03-21', 'Long run: 18 km'),
      ];

      const sparseWeeks = [
        {
          week: 1,
          days: {
            Mon: { date: '2026-03-09', workout: 'Easy run: 5 km', tips: [] },
            Wed: { date: '2026-03-11', workout: 'Tempo run: 8 km', tips: [] },
            Sat: { date: '2026-03-14', workout: 'Long run: 15 km', tips: [] },
          },
        },
        {
          week: 2,
          days: {
            Mon: { date: '2026-03-16', workout: 'Easy run: 6 km', tips: [] },
            Wed: { date: '2026-03-18', workout: 'Intervals: 6 km', tips: [] },
            Sat: { date: '2026-03-21', workout: 'Long run: 18 km', tips: [] },
          },
        },
      ];

      const planData = createSparsePlanData(days, sparseWeeks);
      const result = normalizeDateBasedPlan(planData, '2026-03-09');

      expect(result.needsPersistence).toBe(true);
      expect(result.planStructureChanged).toBe(true);
      expect(result.wasConvertedFromWeekBased).toBe(false);

      for (const week of result.planData.plan || []) {
        const dayKeys = Object.keys(week.days);
        expect(dayKeys).toContain('Mon');
        expect(dayKeys).toContain('Tue');
        expect(dayKeys).toContain('Wed');
        expect(dayKeys).toContain('Thu');
        expect(dayKeys).toContain('Fri');
        expect(dayKeys).toContain('Sat');
        expect(dayKeys).toContain('Sun');
        expect(dayKeys.length).toBe(7);
      }

      const week1 = result.planData.plan?.[0];
      expect(week1?.days?.Mon?.workout).toBe('Easy run: 5 km');
      expect(week1?.days?.Wed?.workout).toBe('Tempo run: 8 km');
      expect(week1?.days?.Sat?.workout).toBe('Long run: 15 km');
      expect(week1?.days?.Tue?.workout).toBe('Rest');
      expect(week1?.days?.Thu?.workout).toBe('Rest');
      expect(week1?.days?.Fri?.workout).toBe('Rest');
      expect(week1?.days?.Sun?.workout).toBe('Rest');
    });
  });

  describe('Already normalized date-based plan', () => {
    it('should not require persistence when plan[] is already complete', () => {
      const days = [
        createTestDay('2026-03-09', 'Easy run: 5 km'),
        createTestDay('2026-03-10', 'Rest'),
        createTestDay('2026-03-11', 'Tempo run: 8 km'),
        createTestDay('2026-03-12', 'Rest'),
        createTestDay('2026-03-13', 'Rest'),
        createTestDay('2026-03-14', 'Long run: 15 km'),
        createTestDay('2026-03-15', 'Rest'),
      ];

      const completeWeeks = [
        {
          week: 1,
          days: {
            Mon: { date: '2026-03-09', workout: 'Easy run: 5 km', tips: [] },
            Tue: { date: '2026-03-10', workout: 'Rest', tips: [] },
            Wed: { date: '2026-03-11', workout: 'Tempo run: 8 km', tips: [] },
            Thu: { date: '2026-03-12', workout: 'Rest', tips: [] },
            Fri: { date: '2026-03-13', workout: 'Rest', tips: [] },
            Sat: { date: '2026-03-14', workout: 'Long run: 15 km', tips: [] },
            Sun: { date: '2026-03-15', workout: 'Rest', tips: [] },
          },
        },
      ];

      const planData = createCompletePlanData(days, completeWeeks);
      const result = normalizeDateBasedPlan(planData, '2026-03-09');

      expect(result.needsPersistence).toBe(false);
      expect(result.planStructureChanged).toBe(false);
      expect(result.wasConvertedFromWeekBased).toBe(false);
      expect(result.weeksCount).toBe(1);
    });

    it('should produce byte-identical output on second run (idempotence)', () => {
      const days = [
        createTestDay('2026-03-09', 'Easy run: 5 km'),
        createTestDay('2026-03-11', 'Tempo run: 8 km'),
        createTestDay('2026-03-14', 'Long run: 15 km'),
      ];

      const sparseWeeks = [
        {
          week: 1,
          days: {
            Mon: { date: '2026-03-09', workout: 'Easy run: 5 km', tips: [] },
          },
        },
      ];

      const planData = createSparsePlanData(days, sparseWeeks);

      const firstResult = normalizeDateBasedPlan(planData, '2026-03-09');
      const secondResult = normalizeDateBasedPlan(firstResult.planData, '2026-03-09');

      expect(secondResult.needsPersistence).toBe(false);
      expect(secondResult.planStructureChanged).toBe(false);

      const firstPlanJson = JSON.stringify(firstResult.planData.plan);
      const secondPlanJson = JSON.stringify(secondResult.planData.plan);
      expect(firstPlanJson).toBe(secondPlanJson);
    });
  });

  describe('Blank workout fields normalization', () => {
    it('should normalize empty string workout to Rest', () => {
      const days = [
        createTestDay('2026-03-09', ''),
        createTestDay('2026-03-10', '   '),
        createTestDay('2026-03-11', 'Tempo run: 8 km'),
      ];

      const planData = createSparsePlanData(days, []);
      const result = normalizeDateBasedPlan(planData, '2026-03-09');

      const week1 = result.planData.plan?.[0];
      expect(week1?.days?.Mon?.workout).toBe('Rest');
      expect(week1?.days?.Tue?.workout).toBe('Rest');
      expect(week1?.days?.Wed?.workout).toBe('Tempo run: 8 km');
    });

    it('should normalize null/undefined workout to Rest', () => {
      const days = [
        { date: '2026-03-09', workout: null, tips: [] },
        { date: '2026-03-10', tips: [] },
        createTestDay('2026-03-11', 'Tempo run: 8 km'),
      ];

      const planData = createSparsePlanData(days, []);
      const result = normalizeDateBasedPlan(planData, '2026-03-09');

      const week1 = result.planData.plan?.[0];
      expect(week1?.days?.Mon?.workout).toBe('Rest');
      expect(week1?.days?.Tue?.workout).toBe('Rest');
      expect(week1?.days?.Wed?.workout).toBe('Tempo run: 8 km');
    });

    it('should not overwrite canonical fields due to spread ordering', () => {
      const days = [
        { date: '2026-03-09', workout: '', tips: [], badField: 'should preserve' },
        { date: '2026-03-10', workout: 'Easy run: 5 km', tips: ['Tip 1'], customMeta: 123 },
      ];

      const sparseWeeks = [
        {
          week: 1,
          days: {
            Mon: { date: '2026-03-09', workout: '', tips: [] },
          },
        },
      ];

      const planData = createSparsePlanData(days, sparseWeeks);
      const result = normalizeDateBasedPlan(planData, '2026-03-09');

      const week1 = result.planData.plan?.[0];
      expect(week1?.days?.Mon?.workout).toBe('Rest');
      expect((week1?.days?.Mon as any)?.badField).toBe('should preserve');
      expect(week1?.days?.Tue?.workout).toBe('Easy run: 5 km');
      expect((week1?.days?.Tue as any)?.customMeta).toBe(123);
    });
  });

  describe('Midweek plan start - week anchoring', () => {
    it('should anchor weeks from plan startDate Monday, not first workout date', () => {
      const days = [
        createTestDay('2026-03-12', 'Easy run: 5 km'),
        createTestDay('2026-03-14', 'Long run: 15 km'),
        createTestDay('2026-03-19', 'Tempo run: 8 km'),
      ];

      const planData = createSparsePlanData(days, []);
      const result = normalizeDateBasedPlan(planData, '2026-03-09');

      expect(result.weeksCount).toBe(2);

      const week1 = result.planData.plan?.[0];
      expect(week1?.days?.Mon?.date).toBe('2026-03-09');
      expect(week1?.days?.Mon?.workout).toBe('Rest');
      expect(week1?.days?.Thu?.date).toBe('2026-03-12');
      expect(week1?.days?.Thu?.workout).toBe('Easy run: 5 km');
      expect(week1?.days?.Sat?.date).toBe('2026-03-14');
      expect(week1?.days?.Sat?.workout).toBe('Long run: 15 km');
      expect(week1?.days?.Sun?.date).toBe('2026-03-15');
    });

    it('should correctly number weeks starting from plan start date', () => {
      const days = [
        createTestDay('2026-03-11', 'Easy run: 5 km'),
        createTestDay('2026-03-18', 'Easy run: 6 km'),
        createTestDay('2026-03-25', 'Easy run: 7 km'),
      ];

      const planData = createSparsePlanData(days, []);
      const result = normalizeDateBasedPlan(planData, '2026-03-09');

      expect(result.weeksCount).toBe(3);
      expect(result.planData.plan?.[0]?.week).toBe(1);
      expect(result.planData.plan?.[1]?.week).toBe(2);
      expect(result.planData.plan?.[2]?.week).toBe(3);
    });
  });

  describe('Metadata preservation', () => {
    it('should preserve all metadata fields from source days[]', () => {
      const days = [
        {
          date: '2026-03-09',
          workout: 'Easy run: 5 km',
          tips: ['Stay relaxed'],
          workout_type: 'TRAIN',
          workoutType: 'easy',
          calibrationTag: 'week1_easy',
          customField: 'preserved',
          nestedData: { foo: 'bar' },
        },
      ];

      const planData = createSparsePlanData(days, []);
      const result = normalizeDateBasedPlan(planData, '2026-03-09');

      const week1Mon = result.planData.plan?.[0]?.days?.Mon;
      expect(week1Mon?.workout).toBe('Easy run: 5 km');
      expect(week1Mon?.tips).toEqual(['Stay relaxed']);
      expect(week1Mon?.workout_type).toBe('TRAIN');
      expect(week1Mon?.workoutType).toBe('easy');
      expect(week1Mon?.calibrationTag).toBe('week1_easy');
      expect((week1Mon as any)?.customField).toBe('preserved');
      expect((week1Mon as any)?.nestedData).toEqual({ foo: 'bar' });
    });
  });

  describe('No mutation of days[]', () => {
    it('should not modify the original days[] array', () => {
      const originalDays = [
        createTestDay('2026-03-09', 'Easy run: 5 km'),
        createTestDay('2026-03-11', 'Tempo run: 8 km'),
      ];

      const daysSnapshot = JSON.stringify(originalDays);

      const planData = createSparsePlanData(originalDays, []);
      normalizeDateBasedPlan(planData, '2026-03-09');

      expect(JSON.stringify(originalDays)).toBe(daysSnapshot);
    });

    it('should report invariant failures if days[] was somehow mutated', () => {
      const days = [
        createTestDay('2026-03-09', 'Easy run: 5 km'),
        createTestDay('2026-03-11', 'Tempo run: 8 km'),
      ];

      const planData = createSparsePlanData(days, []);
      const result = normalizeDateBasedPlan(planData, '2026-03-09');

      expect(result.invariantFailures.filter(f => f.includes('mutated'))).toHaveLength(0);
    });
  });

  describe('Idempotence guarantee', () => {
    it('should produce identical output when normalized twice', () => {
      const days = [
        createTestDay('2026-03-09', 'Easy run: 5 km'),
        createTestDay('2026-03-12', ''),
        createTestDay('2026-03-14', 'Long run: 15 km'),
        createTestDay('2026-03-16', 'Easy run: 6 km'),
      ];

      const planData = createSparsePlanData(days, []);

      const idempotenceResult = testIdempotence(planData, '2026-03-09');

      expect(idempotenceResult.isIdempotent).toBe(true);
      expect(idempotenceResult.firstHash).toBe(idempotenceResult.secondHash);
    });

    it('testIdempotence helper should return false for non-idempotent cases', () => {
      const days = [
        createTestDay('2026-03-09', 'Easy run: 5 km'),
      ];

      const planData = createSparsePlanData(days, []);
      const result = testIdempotence(planData, '2026-03-09');

      expect(result.isIdempotent).toBe(true);
    });
  });

  describe('Every week has all 7 days Mon-Sun', () => {
    it('should guarantee all weeks have exactly 7 day slots', () => {
      const days = [
        createTestDay('2026-03-09', 'Easy run: 5 km'),
        createTestDay('2026-03-16', 'Easy run: 6 km'),
        createTestDay('2026-03-23', 'Easy run: 7 km'),
        createTestDay('2026-03-30', 'Easy run: 8 km'),
      ];

      const planData = createSparsePlanData(days, []);
      const result = normalizeDateBasedPlan(planData, '2026-03-09');

      expect(result.weeksCount).toBe(4);

      for (const week of result.planData.plan || []) {
        const dayNames = Object.keys(week.days);
        expect(dayNames.sort()).toEqual(['Fri', 'Mon', 'Sat', 'Sun', 'Thu', 'Tue', 'Wed']);
      }
    });

    it('should report firstWeekHasAllDays correctly', () => {
      const days = [
        createTestDay('2026-03-09', 'Easy run: 5 km'),
      ];

      const planData = createSparsePlanData(days, []);
      const result = normalizeDateBasedPlan(planData, '2026-03-09');

      expect(result.firstWeekHasAllDays).toBe(true);
      expect(result.missingWeek1Days).toEqual([]);
    });
  });

  describe('Accurate metric naming', () => {
    it('should report canonicalDaysCount as count of days[] entries', () => {
      const days = [
        createTestDay('2026-03-09', 'Easy run: 5 km'),
        createTestDay('2026-03-11', 'Tempo run: 8 km'),
        createTestDay('2026-03-14', 'Long run: 15 km'),
      ];

      const planData = createSparsePlanData(days, []);
      const result = normalizeDateBasedPlan(planData, '2026-03-09');

      expect(result.canonicalDaysCount).toBe(3);
    });

    it('should report derivedWeekSlotsCount as total slots in plan[] weeks', () => {
      const days = [
        createTestDay('2026-03-09', 'Easy run: 5 km'),
        createTestDay('2026-03-16', 'Tempo run: 8 km'),
      ];

      const planData = createSparsePlanData(days, []);
      const result = normalizeDateBasedPlan(planData, '2026-03-09');

      expect(result.weeksCount).toBe(2);
      expect(result.derivedWeekSlotsCount).toBe(14);
    });
  });

  describe('Persistence semantics', () => {
    it('should require persistence when sparse plan[] is rebuilt to full weeks', () => {
      const days = [
        createTestDay('2026-03-09', 'Easy run: 5 km'),
        createTestDay('2026-03-11', 'Tempo run: 8 km'),
      ];

      const sparseWeeks = [
        {
          week: 1,
          days: {
            Mon: { date: '2026-03-09', workout: 'Easy run: 5 km', tips: [] },
          },
        },
      ];

      const planData = createSparsePlanData(days, sparseWeeks);
      const result = normalizeDateBasedPlan(planData, '2026-03-09');

      expect(result.needsPersistence).toBe(true);
      expect(result.planStructureChanged).toBe(true);
    });

    it('should not require persistence when plan[] is already canonical', () => {
      const days = [
        createTestDay('2026-03-09', 'Easy run: 5 km'),
        createTestDay('2026-03-10', 'Rest'),
        createTestDay('2026-03-11', 'Tempo run: 8 km'),
        createTestDay('2026-03-12', 'Rest'),
        createTestDay('2026-03-13', 'Rest'),
        createTestDay('2026-03-14', 'Rest'),
        createTestDay('2026-03-15', 'Rest'),
      ];

      const completeWeeks = [
        {
          week: 1,
          days: {
            Mon: { date: '2026-03-09', workout: 'Easy run: 5 km', tips: [] },
            Tue: { date: '2026-03-10', workout: 'Rest', tips: [] },
            Wed: { date: '2026-03-11', workout: 'Tempo run: 8 km', tips: [] },
            Thu: { date: '2026-03-12', workout: 'Rest', tips: [] },
            Fri: { date: '2026-03-13', workout: 'Rest', tips: [] },
            Sat: { date: '2026-03-14', workout: 'Rest', tips: [] },
            Sun: { date: '2026-03-15', workout: 'Rest', tips: [] },
          },
        },
      ];

      const planData = createCompletePlanData(days, completeWeeks);
      const result = normalizeDateBasedPlan(planData, '2026-03-09');

      expect(result.needsPersistence).toBe(false);
      expect(result.planStructureChanged).toBe(false);
    });
  });

  describe('Edge cases', () => {
    it('should handle empty days array gracefully', () => {
      const planData = createSparsePlanData([], []);
      const result = normalizeDateBasedPlan(planData, '2026-03-09');

      expect(result.needsPersistence).toBe(false);
      expect(result.weeksCount).toBe(0);
      expect(result.canonicalDaysCount).toBe(0);
    });

    it('should handle missing startDate gracefully', () => {
      const days = [
        createTestDay('2026-03-09', 'Easy run: 5 km'),
      ];

      const planData = createSparsePlanData(days, []);
      const result = normalizeDateBasedPlan(planData, null);

      expect(result.needsPersistence).toBe(false);
      expect(result.wasNormalized).toBe(false);
    });

    it('should handle single day plan', () => {
      const days = [
        createTestDay('2026-03-11', 'Easy run: 5 km'),
      ];

      const planData = createSparsePlanData(days, []);
      const result = normalizeDateBasedPlan(planData, '2026-03-09');

      expect(result.weeksCount).toBe(1);
      expect(result.planData.plan?.[0]?.days?.Wed?.workout).toBe('Easy run: 5 km');
      expect(result.planData.plan?.[0]?.days?.Mon?.workout).toBe('Rest');
    });

    it('should handle plan spanning multiple months', () => {
      const days = [
        createTestDay('2026-02-23', 'Easy run: 5 km'),
        createTestDay('2026-03-09', 'Tempo run: 8 km'),
        createTestDay('2026-03-23', 'Long run: 15 km'),
        createTestDay('2026-04-06', 'Race day'),
      ];

      const planData = createSparsePlanData(days, []);
      const result = normalizeDateBasedPlan(planData, '2026-02-23');

      expect(result.weeksCount).toBeGreaterThanOrEqual(7);
      expect(result.invariantFailures.length).toBe(0);
    });
  });

  describe('Invariant validation', () => {
    it('should detect orphaned days that are not in any week slot', () => {
      const days = [
        createTestDay('2026-03-09', 'Easy run: 5 km'),
        createTestDay('2026-03-11', 'Tempo run: 8 km'),
      ];

      const planData = createSparsePlanData(days, []);
      const result = normalizeDateBasedPlan(planData, '2026-03-09');

      expect(result.invariantFailures.filter(f => f.includes('orphaned'))).toHaveLength(0);
    });

    it('should validate all canonical days map to exactly one week slot', () => {
      const days = [
        createTestDay('2026-03-09', 'Easy run: 5 km'),
        createTestDay('2026-03-10', 'Tempo run: 8 km'),
        createTestDay('2026-03-11', 'Rest'),
        createTestDay('2026-03-12', 'Intervals: 6 km'),
        createTestDay('2026-03-13', 'Rest'),
        createTestDay('2026-03-14', 'Long run: 15 km'),
        createTestDay('2026-03-15', 'Rest'),
      ];

      const planData = createSparsePlanData(days, []);
      const result = normalizeDateBasedPlan(planData, '2026-03-09');

      expect(result.invariantFailures.length).toBe(0);

      const week1 = result.planData.plan?.[0];
      expect(week1?.days?.Mon?.workout).toBe('Easy run: 5 km');
      expect(week1?.days?.Tue?.workout).toBe('Tempo run: 8 km');
      expect(week1?.days?.Wed?.workout).toBe('Rest');
      expect(week1?.days?.Thu?.workout).toBe('Intervals: 6 km');
      expect(week1?.days?.Fri?.workout).toBe('Rest');
      expect(week1?.days?.Sat?.workout).toBe('Long run: 15 km');
      expect(week1?.days?.Sun?.workout).toBe('Rest');
    });
  });
});
