import { fetchPlanProjections } from '../services/planProjectionService';
import { logger } from './logger';

export const LONG_PAUSE_ADVISORY_DAYS = 42;
export const MAX_RAMP_RATE = 0.06;

export interface PauseResult {
  planStatus: 'paused';
  pauseStartDate: string;
  pauseWeekIndex: number;
  pauseStructuralVolume: number;
  pauseLongRunTarget: number;
}

export interface ResumeResult {
  planStatus: 'active';
  newRaceDate: string;
  pauseDurationDays: number;
  totalPausedDays: number;
  weeklyVolumes: number[];
  longRunTargets: number[];
  cutbackWeeks: number[];
  peakWeek: number;
  taperWeeks: number;
  taperStartWeek: number;
  showRebuildAdvisory: boolean;
  rampViolation: boolean;
}

export interface ResumePlanParams {
  pauseStartDate: string;
  pauseWeekIndex: number;
  pauseStructuralVolume: number;
  pauseLongRunTarget: number;
  totalPausedDaysBefore: number;
  originalRaceDate: string;
  currentRaceDate: string;
  raceDistanceKm: number;
  startingWeeklyKm: number;
  startingLongestRunKm: number;
  paceMinPerKm?: number;
  trainingFocus?: 'durability' | 'performance';
  resumeDate?: string;
}

export function buildPauseResult(
  currentDate: string,
  weekIndex: number,
  structuralVolume: number,
  longRunTarget: number
): PauseResult {
  return {
    planStatus: 'paused',
    pauseStartDate: currentDate,
    pauseWeekIndex: weekIndex,
    pauseStructuralVolume: structuralVolume,
    pauseLongRunTarget: longRunTarget,
  };
}

export function daysBetween(isoA: string, isoB: string): number {
  const a = new Date(isoA);
  const b = new Date(isoB);
  return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

export function addDaysToDate(isoDate: string, days: number): string {
  const d = new Date(isoDate);
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

export function computeTaperWeeks(raceDistanceKm: number, totalWeeks: number): number {
  const raw = Math.round(raceDistanceKm / 21);
  const clamped = Math.max(1, Math.min(3, raw));
  const maxByDuration = Math.max(1, Math.floor(totalWeeks * 0.2));
  return Math.min(clamped, maxByDuration);
}

export async function resumePlanAsync(params: ResumePlanParams): Promise<ResumeResult> {
  const {
    pauseStartDate,
    pauseWeekIndex,
    pauseStructuralVolume,
    pauseLongRunTarget,
    totalPausedDaysBefore,
    currentRaceDate,
    raceDistanceKm,
    paceMinPerKm = 6.0,
    resumeDate,
  } = params;

  const today = resumeDate ?? new Date().toISOString().split('T')[0];
  const pauseDurationDays = Math.max(0, daysBetween(pauseStartDate, today));
  const totalPausedDays = totalPausedDaysBefore + pauseDurationDays;

  const newRaceDate = addDaysToDate(currentRaceDate, pauseDurationDays);

  const weeksToRace = Math.max(1, Math.ceil(daysBetween(today, newRaceDate) / 7));
  const taperWeeks = raceDistanceKm > 0 ? computeTaperWeeks(raceDistanceKm, weeksToRace) : 0;
  const buildWeeksRemaining = Math.max(1, weeksToRace - taperWeeks);

  const guidance = await fetchPlanProjections({
    startingWeeklyKm: pauseStructuralVolume,
    startingLongestRunKm: pauseLongRunTarget,
    totalWeeks: buildWeeksRemaining + taperWeeks,
    raceDistanceKm,
    paceMinPerKm,
  });

  let rampViolation = false;
  const vols = guidance.weeklyVolumes;
  for (let i = 2; i < vols.length; i++) {
    const prev = vols[i - 1];
    const curr = vols[i];
    const prevPrev = vols[i - 2];
    const isDeloadBounce = prev < prevPrev;
    if (!isDeloadBounce && prev > 0 && curr > prev) {
      const rate = (curr - prev) / prev;
      if (rate > MAX_RAMP_RATE + 0.001) {
        rampViolation = true;
        break;
      }
    }
  }

  const showRebuildAdvisory = pauseDurationDays > LONG_PAUSE_ADVISORY_DAYS;

  logger.info('[PlanPause] Plan resumed', {
    pauseDurationDays,
    totalPausedDays,
    pauseWeekIndex,
    newRaceDate,
    weeksToRace,
    taperWeeks,
    newProjectedPeakVolume: Math.max(...guidance.weeklyVolumes),
    showRebuildAdvisory,
    rampViolation,
  });

  return {
    planStatus: 'active',
    newRaceDate,
    pauseDurationDays,
    totalPausedDays,
    weeklyVolumes: guidance.weeklyVolumes,
    longRunTargets: guidance.longRunTargets,
    cutbackWeeks: guidance.cutbackWeeks,
    peakWeek: guidance.peakWeek,
    taperWeeks,
    taperStartWeek: guidance.taperStartWeek,
    showRebuildAdvisory,
    rampViolation,
  };
}

/**
 * LIGHTWEIGHT SYNC APPROXIMATION for tests only.
 *
 * Production code uses resumePlanAsync() which calls the server.
 * This sync version provides a rough approximation for unit tests.
 * The authoritative math lives on the server in planStructureBuilder.ts
 */
export function resumePlan(params: ResumePlanParams): ResumeResult {
  const {
    pauseStartDate,
    pauseStructuralVolume,
    pauseLongRunTarget,
    totalPausedDaysBefore,
    currentRaceDate,
    raceDistanceKm,
    resumeDate,
  } = params;

  const today = resumeDate ?? new Date().toISOString().split('T')[0];
  const pauseDurationDays = Math.max(0, daysBetween(pauseStartDate, today));
  const totalPausedDays = totalPausedDaysBefore + pauseDurationDays;

  const newRaceDate = addDaysToDate(currentRaceDate, pauseDurationDays);

  const weeksToRace = Math.max(1, Math.ceil(daysBetween(today, newRaceDate) / 7));
  const taperWeeks = raceDistanceKm > 0 ? computeTaperWeeks(raceDistanceKm, weeksToRace) : 0;
  const buildWeeksRemaining = Math.max(1, weeksToRace - taperWeeks);
  const totalWeeks = buildWeeksRemaining + taperWeeks;

  const isEstablished = pauseStructuralVolume >= 50 && pauseLongRunTarget >= 24;
  const rampRate = isEstablished ? 0.02 : 0.06;

  const weeklyVolumes: number[] = [];
  const longRunTargets: number[] = [];
  const cutbackWeeks: number[] = [];
  let vol = pauseStructuralVolume;
  let lr = pauseLongRunTarget;
  const targetLr = Math.min(raceDistanceKm * 0.75, 32);
  const lrStep = (targetLr - pauseLongRunTarget) / Math.max(1, buildWeeksRemaining);

  for (let w = 0; w < totalWeeks; w++) {
    const isDeload = (w + 1) % 4 === 0;
    const isTaper = w >= buildWeeksRemaining;

    if (isTaper) {
      const taperIdx = w - buildWeeksRemaining;
      const taperMult = [0.8, 0.55][taperIdx] ?? 0.55;
      weeklyVolumes.push(Math.round(vol * taperMult * 10) / 10);
      longRunTargets.push(Math.round(lr * taperMult * 10) / 10);
    } else if (isDeload) {
      weeklyVolumes.push(Math.round(vol * 0.88 * 10) / 10);
      longRunTargets.push(Math.round(lr * 10) / 10);
      cutbackWeeks.push(w);
    } else {
      vol = vol * (1 + rampRate);
      lr = Math.min(lr + lrStep, targetLr);
      weeklyVolumes.push(Math.round(vol * 10) / 10);
      longRunTargets.push(Math.round(lr * 10) / 10);
    }
  }

  let rampViolation = false;
  for (let i = 2; i < weeklyVolumes.length; i++) {
    const prev = weeklyVolumes[i - 1];
    const curr = weeklyVolumes[i];
    const prevPrev = weeklyVolumes[i - 2];
    const isDeloadBounce = prev < prevPrev;
    if (!isDeloadBounce && prev > 0 && curr > prev) {
      const rate = (curr - prev) / prev;
      if (rate > MAX_RAMP_RATE + 0.001) {
        rampViolation = true;
        break;
      }
    }
  }

  const showRebuildAdvisory = pauseDurationDays > LONG_PAUSE_ADVISORY_DAYS;
  const peakWeek = weeklyVolumes.indexOf(Math.max(...weeklyVolumes.slice(0, buildWeeksRemaining)));

  return {
    planStatus: 'active',
    newRaceDate,
    pauseDurationDays,
    totalPausedDays,
    weeklyVolumes,
    longRunTargets,
    cutbackWeeks,
    peakWeek: peakWeek >= 0 ? peakWeek : buildWeeksRemaining - 1,
    taperWeeks,
    taperStartWeek: buildWeeksRemaining,
    showRebuildAdvisory,
    rampViolation,
  };
}

export function formatPauseDuration(days: number): string {
  if (days === 1) return '1 day';
  if (days < 7) return `${days} days`;
  const weeks = Math.floor(days / 7);
  const remainder = days % 7;
  if (remainder === 0) return weeks === 1 ? '1 week' : `${weeks} weeks`;
  return `${weeks}w ${remainder}d`;
}
