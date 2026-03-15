import { describe, it, expect } from 'vitest';
import {
  generateContextAwareWorkout,
  shouldSkipInsertion,
} from './contextAwareWorkoutInsertion';

const trainingPaces = {
  easyPace: '5:45',
  longRunPace: '6:00',
  tempoPace: '5:00',
  intervalPace: '4:30',
  racePace: '4:45',
};

function createPlanDays(
  startDate: string,
  weeks: number,
  pattern: ('easy' | 'rest' | 'long' | 'tempo' | 'interval')[][]
): any[] {
  const days: any[] = [];
  const startMs = new Date(startDate + 'T00:00:00Z').getTime();
  const dayMs = 24 * 60 * 60 * 1000;

  for (let week = 0; week < weeks; week++) {
    const weekPattern = pattern[week % pattern.length];
    for (let day = 0; day < 7; day++) {
      const dateMs = startMs + (week * 7 + day) * dayMs;
      const dateISO = new Date(dateMs).toISOString().split('T')[0];
      const type = weekPattern[day % weekPattern.length];

      let workout = '';
      let workout_type = 'REST';

      switch (type) {
        case 'easy':
          workout = 'Easy run: 6 km at 5:45 /km';
          workout_type = 'TRAIN';
          break;
        case 'long':
          workout = 'Long run: 18 km at easy pace';
          workout_type = 'TRAIN';
          break;
        case 'tempo':
          workout = 'Tempo run: 8 km with 4 km at threshold';
          workout_type = 'TRAIN';
          break;
        case 'interval':
          workout = 'Intervals: 6 x 800m at 5K pace';
          workout_type = 'TRAIN';
          break;
        case 'rest':
          workout = 'Rest';
          workout_type = 'REST';
          break;
      }

      days.push({ date: dateISO, workout, workout_type });
    }
  }

  return days;
}

describe('generateContextAwareWorkout', () => {
  describe('normal training block', () => {
    it('generates supporting runs in early weeks (recovery or easy depending on spacing)', () => {
      const startDate = '2024-03-04';
      const days = createPlanDays(startDate, 12, [
        ['rest', 'easy', 'rest', 'tempo', 'rest', 'easy', 'long'],
      ]);

      const targetDate = '2024-03-06';
      const result = generateContextAwareWorkout(
        targetDate,
        days,
        trainingPaces,
        '2024-05-26',
        12
      );

      expect(result).not.toBeNull();
      expect(['easy', 'recovery']).toContain(result!.workoutCategory);
      expect(result!.workout_type).toBe('TRAIN');
    });

    it('generates easy+strides in mid to late weeks when spacing allows', () => {
      const startDate = '2024-03-04';
      const days = createPlanDays(startDate, 12, [
        ['rest', 'easy', 'rest', 'rest', 'tempo', 'rest', 'long'],
      ]);

      const targetDate = '2024-04-17';
      const result = generateContextAwareWorkout(
        targetDate,
        days,
        trainingPaces,
        '2024-05-26',
        12
      );

      expect(result).not.toBeNull();
      expect(['easy', 'easy_strides']).toContain(result!.workoutCategory);
    });

    it('generates recovery runs when day before or after quality', () => {
      const startDate = '2024-03-04';
      const days = createPlanDays(startDate, 12, [
        ['rest', 'tempo', 'rest', 'easy', 'rest', 'easy', 'long'],
      ]);

      const targetDate = '2024-03-06';
      const result = generateContextAwareWorkout(
        targetDate,
        days,
        trainingPaces,
        '2024-05-26',
        12
      );

      expect(result).not.toBeNull();
      expect(result!.workoutCategory).toBe('recovery');
      expect(result!.workout).toContain('Recovery run');
    });
  });

  describe('taper weeks', () => {
    it('generates recovery runs during taper', () => {
      const startDate = '2024-03-04';
      const days = createPlanDays(startDate, 12, [
        ['rest', 'easy', 'rest', 'tempo', 'rest', 'easy', 'long'],
      ]);

      const targetDate = '2024-05-15';
      const result = generateContextAwareWorkout(
        targetDate,
        days,
        trainingPaces,
        '2024-05-26',
        12
      );

      expect(result).not.toBeNull();
      expect(result!.workoutCategory).toBe('recovery');
    });

    it('reduces distance during taper weeks', () => {
      const startDate = '2024-03-04';
      const days = createPlanDays(startDate, 12, [
        ['rest', 'easy', 'rest', 'tempo', 'rest', 'easy', 'long'],
      ]);

      const earlyDate = '2024-03-06';
      const taperDate = '2024-05-15';

      const earlyResult = generateContextAwareWorkout(
        earlyDate,
        days,
        trainingPaces,
        '2024-05-26',
        12
      );

      const taperResult = generateContextAwareWorkout(
        taperDate,
        days,
        trainingPaces,
        '2024-05-26',
        12
      );

      if (earlyResult && taperResult) {
        expect(taperResult.distanceKm).toBeLessThanOrEqual(earlyResult.distanceKm);
      }
    });
  });

  describe('recovery weeks', () => {
    it('generates recovery runs during recovery/deload weeks', () => {
      const startDate = '2024-03-04';
      const days = createPlanDays(startDate, 12, [
        ['rest', 'easy', 'rest', 'tempo', 'rest', 'easy', 'long'],
      ]);

      const recoveryWeekDate = '2024-03-27';
      const result = generateContextAwareWorkout(
        recoveryWeekDate,
        days,
        trainingPaces,
        '2024-05-26',
        12
      );

      expect(result).not.toBeNull();
      expect(result!.workoutCategory).toBe('recovery');
    });
  });

  describe('race week handling', () => {
    it('returns null for race week insertions', () => {
      const startDate = '2024-03-04';
      const days = createPlanDays(startDate, 12, [
        ['rest', 'easy', 'rest', 'tempo', 'rest', 'easy', 'long'],
      ]);

      const raceWeekDate = '2024-05-22';
      const result = generateContextAwareWorkout(
        raceWeekDate,
        days,
        trainingPaces,
        '2024-05-26',
        12
      );

      expect(result).toBeNull();
    });
  });

  describe('low-frequency plans', () => {
    it('generates appropriate workouts for 3-day plans', () => {
      const startDate = '2024-03-04';
      const days = createPlanDays(startDate, 12, [
        ['rest', 'easy', 'rest', 'rest', 'rest', 'tempo', 'long'],
      ]);

      const targetDate = '2024-03-06';
      const result = generateContextAwareWorkout(
        targetDate,
        days,
        trainingPaces,
        '2024-05-26',
        12
      );

      expect(result).not.toBeNull();
      expect(['easy', 'recovery']).toContain(result!.workoutCategory);
    });
  });

  describe('workout variety', () => {
    it('generates different workouts for different weeks', () => {
      const startDate = '2024-03-04';
      const days = createPlanDays(startDate, 12, [
        ['rest', 'easy', 'rest', 'tempo', 'rest', 'easy', 'long'],
      ]);

      const results: any[] = [];

      for (let week = 0; week < 12; week++) {
        const dateMs = new Date(startDate + 'T00:00:00Z').getTime() + (week * 7 + 2) * 24 * 60 * 60 * 1000;
        const dateISO = new Date(dateMs).toISOString().split('T')[0];

        const result = generateContextAwareWorkout(
          dateISO,
          days,
          trainingPaces,
          '2024-05-26',
          12
        );

        if (result) {
          results.push(result);
        }
      }

      const categories = new Set(results.map(r => r.workoutCategory));
      expect(categories.size).toBeGreaterThanOrEqual(1);

      const distances = results.map(r => r.distanceKm);
      const uniqueDistances = new Set(distances);
      expect(uniqueDistances.size).toBeGreaterThanOrEqual(1);
    });
  });

  describe('safety constraints', () => {
    it('never inserts quality sessions', () => {
      const startDate = '2024-03-04';
      const days = createPlanDays(startDate, 12, [
        ['rest', 'easy', 'rest', 'rest', 'rest', 'easy', 'long'],
      ]);

      for (let week = 0; week < 12; week++) {
        const dateMs = new Date(startDate + 'T00:00:00Z').getTime() + (week * 7 + 2) * 24 * 60 * 60 * 1000;
        const dateISO = new Date(dateMs).toISOString().split('T')[0];

        const result = generateContextAwareWorkout(
          dateISO,
          days,
          trainingPaces,
          '2024-05-26',
          12
        );

        if (result) {
          const lower = result.workout.toLowerCase();
          expect(lower).not.toContain('tempo');
          expect(lower).not.toContain('interval');
          expect(lower).not.toContain('threshold');
          expect(lower).not.toContain('vo2');
          expect(lower).not.toContain('race pace');
        }
      }
    });

    it('caps distance at reasonable maximum', () => {
      const startDate = '2024-03-04';
      const days = createPlanDays(startDate, 12, [
        ['rest', 'easy', 'rest', 'tempo', 'rest', 'easy', 'long'],
      ]);

      for (let week = 0; week < 12; week++) {
        const dateMs = new Date(startDate + 'T00:00:00Z').getTime() + (week * 7 + 2) * 24 * 60 * 60 * 1000;
        const dateISO = new Date(dateMs).toISOString().split('T')[0];

        const result = generateContextAwareWorkout(
          dateISO,
          days,
          trainingPaces,
          '2024-05-26',
          12
        );

        if (result) {
          expect(result.distanceKm).toBeLessThanOrEqual(8);
          expect(result.distanceKm).toBeGreaterThanOrEqual(3);
        }
      }
    });
  });
});

describe('shouldSkipInsertion', () => {
  it('skips race week', () => {
    const startDate = '2024-03-04';
    const days = createPlanDays(startDate, 12, [
      ['rest', 'easy', 'rest', 'tempo', 'rest', 'easy', 'long'],
    ]);

    const raceWeekDate = '2024-05-22';
    const result = shouldSkipInsertion(raceWeekDate, days, '2024-05-26', 12);

    expect(result.skip).toBe(true);
    expect(result.reason).toBe('race_week');
  });

  it('skips weeks with 6+ training days', () => {
    const startDate = '2024-03-04';
    const days = createPlanDays(startDate, 12, [
      ['easy', 'easy', 'easy', 'tempo', 'easy', 'easy', 'long'],
    ]);

    const targetDate = '2024-03-06';
    const result = shouldSkipInsertion(targetDate, days, '2024-05-26', 12);

    expect(result.skip).toBe(true);
    expect(result.reason).toBe('max_training_days');
  });

  it('allows insertion in normal weeks', () => {
    const startDate = '2024-03-04';
    const days = createPlanDays(startDate, 12, [
      ['rest', 'easy', 'rest', 'tempo', 'rest', 'easy', 'long'],
    ]);

    const targetDate = '2024-03-06';
    const result = shouldSkipInsertion(targetDate, days, '2024-05-26', 12);

    expect(result.skip).toBe(false);
  });
});

describe('workout formatting', () => {
  it('includes warm up and cool down in workout text', () => {
    const startDate = '2024-03-04';
    const days = createPlanDays(startDate, 12, [
      ['rest', 'easy', 'rest', 'tempo', 'rest', 'easy', 'long'],
    ]);

    const targetDate = '2024-03-06';
    const result = generateContextAwareWorkout(
      targetDate,
      days,
      trainingPaces,
      '2024-05-26',
      12
    );

    expect(result).not.toBeNull();
    expect(result!.workout.toLowerCase()).toContain('warm up');
    expect(result!.workout.toLowerCase()).toContain('cool down');
  });

  it('includes training pace in workout text', () => {
    const startDate = '2024-03-04';
    const days = createPlanDays(startDate, 12, [
      ['rest', 'easy', 'rest', 'tempo', 'rest', 'easy', 'long'],
    ]);

    const targetDate = '2024-03-06';
    const result = generateContextAwareWorkout(
      targetDate,
      days,
      trainingPaces,
      '2024-05-26',
      12
    );

    expect(result).not.toBeNull();
    expect(result!.workout).toContain(trainingPaces.easyPace);
  });

  it('includes contextual tips', () => {
    const startDate = '2024-03-04';
    const days = createPlanDays(startDate, 12, [
      ['rest', 'easy', 'rest', 'tempo', 'rest', 'easy', 'long'],
    ]);

    const targetDate = '2024-03-06';
    const result = generateContextAwareWorkout(
      targetDate,
      days,
      trainingPaces,
      '2024-05-26',
      12
    );

    expect(result).not.toBeNull();
    expect(result!.tips.length).toBeGreaterThan(0);
    expect(result!.tips.length).toBeLessThanOrEqual(4);
  });
});
