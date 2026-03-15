interface PlanDay {
  date: string;
  workout?: string;
  workout_type?: string;
  tips?: string[];
}

interface TrainingPaces {
  easyPace?: string;
  longRunPace?: string;
  tempoPace?: string;
  intervalPace?: string;
  racePace?: string;
}

interface WorkoutInsertionContext {
  weekIndex: number;
  totalWeeks: number;
  weekVolumeKm: number;
  weekTrainDays: number;
  hasQualitySession: boolean;
  hasLongRun: boolean;
  longRunKm: number;
  daysFromLongRun: number;
  daysFromQuality: number;
  isRecoveryWeek: boolean;
  isTaperWeek: boolean;
  isRaceWeek: boolean;
  targetDayWorkouts: string[];
}

export interface GeneratedWorkout {
  workout: string;
  workout_type: string;
  tips: string[];
  distanceKm: number;
  workoutCategory: 'recovery' | 'easy' | 'easy_strides' | 'short_steady';
}

const WORKOUT_TEMPLATES = {
  recovery: (distanceKm: number, pace: string) => ({
    workout: `Recovery run: ${distanceKm} km at ${pace} /km or slower\nWarm up: 3-5 min walk | Work: ${distanceKm} km very easy (can chat easily) | Cool down: 3-5 min walk`,
    tips: [
      'Keep this genuinely easy — slower than your normal easy pace',
      'Focus on relaxed form and easy breathing',
      'This is active recovery, not a training stimulus',
    ],
    workoutCategory: 'recovery' as const,
  }),

  easy: (distanceKm: number, pace: string) => ({
    workout: `Easy run: ${distanceKm} km at ${pace} /km\nWarm up: 5 min walk | Work: ${distanceKm} km easy (conversational) | Cool down: 5 min walk`,
    tips: [
      'Keep effort fully conversational',
      'This run supports your weekly volume without adding fatigue',
      'If legs feel heavy, slow down further',
    ],
    workoutCategory: 'easy' as const,
  }),

  easy_strides: (distanceKm: number, pace: string) => ({
    workout: `Easy run with strides: ${distanceKm} km at ${pace} /km + 4-6 × 20s strides\nWarm up: 5 min walk | Work: ${distanceKm} km easy | Strides: 4-6 × 20s fast with full recovery | Cool down: 5 min walk`,
    tips: [
      'Run the main portion at easy conversational pace',
      'Strides are short accelerations — smooth, not straining',
      'Full recovery (60-90s walk/jog) between strides',
    ],
    workoutCategory: 'easy_strides' as const,
  }),

  short_steady: (distanceKm: number, pace: string, steadyPace: string) => ({
    workout: `Easy run with steady finish: ${distanceKm} km\nWarm up: 5 min walk | Work: ${Math.round((distanceKm * 0.7) * 10) / 10} km easy at ${pace} /km | Finish: ${Math.round((distanceKm * 0.3) * 10) / 10} km steady at ${steadyPace} /km | Cool down: 5 min walk`,
    tips: [
      'Start easy and relaxed for the first 70%',
      'Steady finish should feel controlled but purposeful',
      'Do not push hard — this is still primarily aerobic',
    ],
    workoutCategory: 'short_steady' as const,
  }),
};

function isLongRunDay(workout: string): boolean {
  const lower = workout.toLowerCase();
  return lower.includes('long run') || lower.includes('long slow') || lower.includes('lsd') || lower.includes('long easy');
}

function isQualitySession(workout: string): boolean {
  const lower = workout.toLowerCase();
  const qualityIndicators = [
    'tempo', 'threshold', 'interval', 'vo2', 'fartlek', 'race pace',
    'speed', 'track', 'hills', 'repetition', 'cruise',
  ];
  return qualityIndicators.some(ind => lower.includes(ind));
}

function extractDistanceKm(workout: string): number {
  const kmMatch = workout.match(/(\d+(?:\.\d+)?)\s*km/i);
  if (kmMatch) return parseFloat(kmMatch[1]);
  const miMatch = workout.match(/(\d+(?:\.\d+)?)\s*mi/i);
  if (miMatch) return parseFloat(miMatch[1]) * 1.60934;
  return 0;
}

function getWeekMondayISO(dateISO: string): string {
  const d = new Date(dateISO + 'T12:00:00Z');
  const dow = d.getUTCDay();
  const mondayOffset = dow === 0 ? -6 : 1 - dow;
  const mondayMs = d.getTime() + mondayOffset * 24 * 60 * 60 * 1000;
  return new Date(mondayMs).toISOString().split('T')[0];
}

function daysBetween(date1: string, date2: string): number {
  const d1 = new Date(date1 + 'T00:00:00Z').getTime();
  const d2 = new Date(date2 + 'T00:00:00Z').getTime();
  return Math.round((d2 - d1) / (24 * 60 * 60 * 1000));
}

function analyzeWeekContext(
  targetDate: string,
  allDays: PlanDay[],
  weekIndex: number,
  totalWeeks: number,
  raceDateISO: string | null,
): WorkoutInsertionContext {
  const weekMonday = getWeekMondayISO(targetDate);
  const weekSundayMs = new Date(weekMonday + 'T00:00:00Z').getTime() + 7 * 24 * 60 * 60 * 1000;
  const weekSundayISO = new Date(weekSundayMs).toISOString().split('T')[0];

  const weekDays = allDays.filter(d => d.date >= weekMonday && d.date < weekSundayISO);

  let weekVolumeKm = 0;
  let weekTrainDays = 0;
  let hasQualitySession = false;
  let hasLongRun = false;
  let longRunKm = 0;
  let nearestLongRunDate: string | null = null;
  let nearestQualityDate: string | null = null;

  for (const day of weekDays) {
    const workout = day.workout || '';
    const workoutType = day.workout_type || '';
    const isRest = workoutType === 'REST' || workout.toLowerCase() === 'rest' || workout === '';

    if (!isRest && workoutType !== 'REST') {
      weekTrainDays++;
      weekVolumeKm += extractDistanceKm(workout);

      if (isLongRunDay(workout)) {
        hasLongRun = true;
        longRunKm = extractDistanceKm(workout);
        nearestLongRunDate = day.date;
      }

      if (isQualitySession(workout)) {
        hasQualitySession = true;
        nearestQualityDate = day.date;
      }
    }
  }

  let daysFromLongRun = 999;
  let daysFromQuality = 999;

  for (const day of allDays) {
    const workout = day.workout || '';
    if (isLongRunDay(workout)) {
      const dist = Math.abs(daysBetween(targetDate, day.date));
      if (dist < daysFromLongRun) {
        daysFromLongRun = dist;
        nearestLongRunDate = day.date;
      }
    }
    if (isQualitySession(workout)) {
      const dist = Math.abs(daysBetween(targetDate, day.date));
      if (dist < daysFromQuality) {
        daysFromQuality = dist;
        nearestQualityDate = day.date;
      }
    }
  }

  const isRecoveryWeek = (weekIndex + 1) % 4 === 0;

  let isTaperWeek = false;
  let isRaceWeek = false;

  if (raceDateISO) {
    const weeksToRace = Math.ceil(daysBetween(targetDate, raceDateISO) / 7);
    isTaperWeek = weeksToRace <= 3 && weeksToRace > 0;
    isRaceWeek = weeksToRace <= 1;
  }

  const targetDayWorkouts: string[] = [];

  return {
    weekIndex,
    totalWeeks,
    weekVolumeKm,
    weekTrainDays,
    hasQualitySession,
    hasLongRun,
    longRunKm,
    daysFromLongRun,
    daysFromQuality,
    isRecoveryWeek,
    isTaperWeek,
    isRaceWeek,
    targetDayWorkouts,
  };
}

function determineWorkoutCategory(ctx: WorkoutInsertionContext): 'recovery' | 'easy' | 'easy_strides' | 'short_steady' | 'skip' {
  if (ctx.isRaceWeek) {
    return 'skip';
  }

  if (ctx.isTaperWeek) {
    return 'recovery';
  }

  if (ctx.isRecoveryWeek) {
    return 'recovery';
  }

  if (ctx.daysFromQuality === 1 || ctx.daysFromLongRun === 1) {
    return 'recovery';
  }

  if (ctx.weekTrainDays >= 5) {
    return 'recovery';
  }

  const inLateBlock = ctx.weekIndex >= ctx.totalWeeks * 0.6;
  const midBlock = ctx.weekIndex >= ctx.totalWeeks * 0.3 && ctx.weekIndex < ctx.totalWeeks * 0.6;

  if (inLateBlock && ctx.daysFromQuality >= 2 && ctx.daysFromLongRun >= 2) {
    if (ctx.weekTrainDays <= 3) {
      return 'easy_strides';
    }
    return 'easy';
  }

  if (midBlock && ctx.daysFromQuality >= 2 && ctx.daysFromLongRun >= 2 && ctx.weekTrainDays <= 4) {
    return 'easy_strides';
  }

  return 'easy';
}

function determineDistance(ctx: WorkoutInsertionContext, category: 'recovery' | 'easy' | 'easy_strides' | 'short_steady'): number {
  let baseDistanceKm: number;

  if (ctx.weekVolumeKm > 0 && ctx.weekTrainDays > 0) {
    const avgSessionKm = ctx.weekVolumeKm / ctx.weekTrainDays;
    baseDistanceKm = Math.round(avgSessionKm * 0.8 * 2) / 2;
  } else {
    baseDistanceKm = 5;
  }

  baseDistanceKm = Math.max(3, Math.min(8, baseDistanceKm));

  switch (category) {
    case 'recovery':
      return Math.max(3, Math.round((baseDistanceKm * 0.7) * 2) / 2);

    case 'easy':
      return baseDistanceKm;

    case 'easy_strides':
      return Math.max(4, Math.round((baseDistanceKm * 0.9) * 2) / 2);

    case 'short_steady':
      return Math.max(5, baseDistanceKm);
  }
}

function applyTaperAdjustment(distanceKm: number, ctx: WorkoutInsertionContext, raceDateISO: string | null): number {
  if (!raceDateISO || !ctx.isTaperWeek) return distanceKm;

  const weeksToRace = Math.ceil(daysBetween(ctx.weekIndex.toString(), raceDateISO) / 7);

  if (weeksToRace === 3) {
    return Math.round(distanceKm * 0.8 * 2) / 2;
  } else if (weeksToRace === 2) {
    return Math.round(distanceKm * 0.65 * 2) / 2;
  } else if (weeksToRace === 1) {
    return Math.round(distanceKm * 0.5 * 2) / 2;
  }

  return distanceKm;
}

function applyRecoveryWeekAdjustment(distanceKm: number, ctx: WorkoutInsertionContext): number {
  if (!ctx.isRecoveryWeek) return distanceKm;
  return Math.round(distanceKm * 0.85 * 2) / 2;
}

export function generateContextAwareWorkout(
  targetDate: string,
  allDays: PlanDay[],
  trainingPaces: TrainingPaces,
  raceDateISO: string | null,
  totalWeeks: number,
): GeneratedWorkout | null {
  const targetDateObj = new Date(targetDate + 'T12:00:00Z');
  const planStartDate = allDays.length > 0 ? allDays[0].date : targetDate;
  const planStartObj = new Date(planStartDate + 'T12:00:00Z');
  const weekIndex = Math.floor((targetDateObj.getTime() - planStartObj.getTime()) / (7 * 24 * 60 * 60 * 1000));

  const ctx = analyzeWeekContext(targetDate, allDays, weekIndex, totalWeeks, raceDateISO);

  const category = determineWorkoutCategory(ctx);

  if (category === 'skip') {
    return null;
  }

  let distanceKm = determineDistance(ctx, category);
  distanceKm = applyRecoveryWeekAdjustment(distanceKm, ctx);
  distanceKm = applyTaperAdjustment(distanceKm, ctx, raceDateISO);

  distanceKm = Math.max(3, Math.min(8, distanceKm));
  distanceKm = Math.round(distanceKm * 2) / 2;

  const easyPace = trainingPaces.easyPace || '6:00';
  const tempoPace = trainingPaces.tempoPace || '5:15';

  let template;
  switch (category) {
    case 'recovery':
      template = WORKOUT_TEMPLATES.recovery(distanceKm, easyPace);
      break;
    case 'easy':
      template = WORKOUT_TEMPLATES.easy(distanceKm, easyPace);
      break;
    case 'easy_strides':
      template = WORKOUT_TEMPLATES.easy_strides(distanceKm, easyPace);
      break;
    case 'short_steady':
      template = WORKOUT_TEMPLATES.short_steady(distanceKm, easyPace, tempoPace);
      break;
  }

  const contextualTips = [...template.tips];

  if (ctx.isRecoveryWeek) {
    contextualTips.push('This is a recovery week — keep all efforts genuinely easy');
  }

  if (ctx.isTaperWeek) {
    contextualTips.push('You\'re in taper — maintain leg turnover without adding fatigue');
  }

  if (ctx.daysFromLongRun === 2) {
    contextualTips.push('This run helps shake out the legs after your long run');
  }

  if (ctx.daysFromQuality === 2) {
    contextualTips.push('Keep this easy to allow full recovery from your quality session');
  }

  return {
    workout: template.workout,
    workout_type: 'TRAIN',
    tips: contextualTips.slice(0, 4),
    distanceKm,
    workoutCategory: template.workoutCategory,
  };
}

export function shouldSkipInsertion(
  targetDate: string,
  allDays: PlanDay[],
  raceDateISO: string | null,
  totalWeeks: number,
): { skip: boolean; reason?: string } {
  const targetDateObj = new Date(targetDate + 'T12:00:00Z');
  const planStartDate = allDays.length > 0 ? allDays[0].date : targetDate;
  const planStartObj = new Date(planStartDate + 'T12:00:00Z');
  const weekIndex = Math.floor((targetDateObj.getTime() - planStartObj.getTime()) / (7 * 24 * 60 * 60 * 1000));

  const ctx = analyzeWeekContext(targetDate, allDays, weekIndex, totalWeeks, raceDateISO);

  if (ctx.isRaceWeek) {
    return { skip: true, reason: 'race_week' };
  }

  if (ctx.weekTrainDays >= 6) {
    return { skip: true, reason: 'max_training_days' };
  }

  return { skip: false };
}
