import type { DayWorkoutWithDate } from '../types';

export interface DateSkeletonOptions {
  startDate: string;
  endDate: string;
  availableDays: string[];
  raceDate: string;
}

const DAYS_OF_WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function buildDateSkeleton(options: DateSkeletonOptions): DayWorkoutWithDate[] {
  const { startDate, endDate, availableDays, raceDate } = options;

  const start = new Date(startDate);
  const end = new Date(endDate);
  const race = new Date(raceDate);

  start.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);
  race.setHours(0, 0, 0, 0);

  const skeleton: DayWorkoutWithDate[] = [];
  const currentDate = new Date(start);

  while (currentDate <= end) {
    const dateStr = formatDateISO(currentDate);
    const dayOfWeek = DAYS_OF_WEEK[currentDate.getDay()];

    if (dateStr === raceDate) {
      skeleton.push({
        date: dateStr,
        dow: dayOfWeek,
        workout: '',
        tips: [],
        workout_type: 'RACE'
      });
    } else if (availableDays.includes(dayOfWeek)) {
      skeleton.push({
        date: dateStr,
        dow: dayOfWeek,
        workout: '',
        tips: [],
        workout_type: 'TRAIN'
      });
    } else {
      skeleton.push({
        date: dateStr,
        dow: dayOfWeek,
        workout: '',
        tips: [],
        workout_type: 'REST'
      });
    }

    currentDate.setDate(currentDate.getDate() + 1);
  }

  return skeleton;
}

export function build14DaySkeleton(startDate: string, availableDays: string[], raceDate?: string): DayWorkoutWithDate[] {
  const start = new Date(startDate);
  start.setHours(0, 0, 0, 0);

  const end = new Date(start);
  end.setDate(end.getDate() + 13);

  const endDateStr = formatDateISO(end);

  return buildDateSkeleton({
    startDate,
    endDate: endDateStr,
    availableDays,
    raceDate: raceDate || '9999-12-31'
  });
}

export function getTrainDates(skeleton: DayWorkoutWithDate[]): string[] {
  return skeleton
    .filter(day => day.workout_type === 'TRAIN')
    .map(day => day.date);
}

export function getRaceDates(skeleton: DayWorkoutWithDate[]): string[] {
  return skeleton
    .filter(day => day.workout_type === 'RACE')
    .map(day => day.date);
}

export function assignRestWorkouts(skeleton: DayWorkoutWithDate[]): void {
  skeleton.forEach((day, index) => {
    if (day.workout_type === 'REST') {
      const isActiveRecovery = index % 3 === 1;
      if (isActiveRecovery) {
        day.workout = 'Active Recovery\n\nEasy 20-30 minute walk, gentle yoga, or very light cycling. Keep your heart rate low and focus on movement without stress.';
        day.tips = [
          'Active recovery helps flush out metabolic waste',
          'Keep the effort extremely easy',
          'Focus on mobility and relaxation'
        ];
      } else {
        day.workout = 'Rest\n\nComplete rest day. Focus on recovery, hydration, nutrition, and sleep.';
        day.tips = [
          'Rest is when your body adapts and gets stronger',
          'Stay hydrated and eat well',
          'Get 7-9 hours of quality sleep'
        ];
      }
    }
  });
}

export function assignRaceWorkout(skeleton: DayWorkoutWithDate[], raceDistance: string): void {
  skeleton.forEach(day => {
    if (day.workout_type === 'RACE') {
      day.workout = `RACE DAY: ${raceDistance}\n\nThis is your goal race! Trust your training, stick to your race plan, and enjoy the experience.`;
      day.tips = [
        'Start conservatively and build into your pace',
        'Stick to your fueling and hydration plan',
        'Stay mentally positive throughout',
        'Remember why you trained for this!'
      ];
    }
  });
}

function formatDateISO(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function convertSkeletonToWeeks(skeleton: DayWorkoutWithDate[]): Array<{
  week: number;
  days: Record<string, { workout: string; tips: string[]; date: string }>;
}> {
  const weeks: Array<{
    week: number;
    days: Record<string, { workout: string; tips: string[]; date: string }>;
  }> = [];

  const groupedByWeek = new Map<number, DayWorkoutWithDate[]>();

  skeleton.forEach(day => {
    const date = new Date(day.date);
    const startDate = new Date(skeleton[0].date);

    date.setHours(0, 0, 0, 0);
    startDate.setHours(0, 0, 0, 0);

    const daysSinceStart = Math.floor((date.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    const weekNumber = Math.floor(daysSinceStart / 7) + 1;

    if (!groupedByWeek.has(weekNumber)) {
      groupedByWeek.set(weekNumber, []);
    }
    groupedByWeek.get(weekNumber)!.push(day);
  });

  groupedByWeek.forEach((days, weekNumber) => {
    const weekDays: Record<string, { workout: string; tips: string[]; date: string }> = {
      Mon: { workout: '', tips: [], date: '' },
      Tue: { workout: '', tips: [], date: '' },
      Wed: { workout: '', tips: [], date: '' },
      Thu: { workout: '', tips: [], date: '' },
      Fri: { workout: '', tips: [], date: '' },
      Sat: { workout: '', tips: [], date: '' },
      Sun: { workout: '', tips: [], date: '' }
    };

    days.forEach(day => {
      weekDays[day.dow] = {
        workout: day.workout,
        tips: day.tips,
        date: day.date
      };
    });

    weeks.push({
      week: weekNumber,
      days: weekDays
    });
  });

  weeks.sort((a, b) => a.week - b.week);

  return weeks;
}
