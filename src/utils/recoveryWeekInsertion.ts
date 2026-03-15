import { logger } from './logger';

export const RECOVERY_VOLUME_RATIO = 0.85;
export const MAX_RAMP_RATE = 0.06;
export const MAX_LONG_RUN_CAP_KM = 32;
export const LONG_RUN_WEEKLY_VOL_CAP = 0.60;

export interface RecoveryWeekSpec {
  weekIndex: number;
  actualVolume: number;
  structuralVolume: number;
  longRun: number;
  isRecovery: true;
}

export interface RecoveryInsertionResult {
  triggerWeek: number;
  newProjectedPeakVolume: number;
  newProjectedPeakLongRun: number;
  taperWeeks: number;
  weeklyVolumes: number[];
  longRunTargets: number[];
  cutbackWeeks: number[];
  peakWeek: number;
  recoveryWeekSpec: RecoveryWeekSpec;
  rampViolation: boolean;
}

export interface RecoveryInsertionParams {
  currentWeekIndex: number;
  weeksToRace: number;
  currentStructuralVolume: number;
  previousWeekLongRun: number;
  startingWeeklyKm: number;
  startingLongestRunKm: number;
  raceDistanceKm: number;
  paceMinPerKm?: number;
  trainingFocus?: 'durability' | 'performance';
  colourTier?: string;
}

function computeTaperWeeksLocal(raceDistanceKm: number, totalWeeks: number): number {
  const raw = Math.round(raceDistanceKm / 21);
  const clamped = Math.max(1, Math.min(3, raw));
  const maxByDuration = Math.max(1, Math.floor(totalWeeks * 0.2));
  return Math.min(clamped, maxByDuration);
}

export function insertRecoveryWeek(params: RecoveryInsertionParams): RecoveryInsertionResult {
  const {
    currentWeekIndex,
    weeksToRace,
    currentStructuralVolume,
    previousWeekLongRun,
    raceDistanceKm,
    paceMinPerKm = 6.0,
  } = params;

  const recoveryActualVolume = Math.round(currentStructuralVolume * RECOVERY_VOLUME_RATIO * 10) / 10;

  const recoveryLongRun = Math.min(
    previousWeekLongRun,
    recoveryActualVolume * LONG_RUN_WEEKLY_VOL_CAP,
    MAX_LONG_RUN_CAP_KM
  );
  const recoveryLongRunRounded = Math.round(recoveryLongRun * 10) / 10;

  const recoveryWeekSpec: RecoveryWeekSpec = {
    weekIndex: currentWeekIndex,
    actualVolume: recoveryActualVolume,
    structuralVolume: currentStructuralVolume,
    longRun: recoveryLongRunRounded,
    isRecovery: true,
  };

  const taperWeeks = raceDistanceKm > 0
    ? computeTaperWeeksLocal(raceDistanceKm, weeksToRace)
    : 0;

  const buildWeeksRemaining = Math.max(1, weeksToRace - taperWeeks);
  const totalWeeks = buildWeeksRemaining + taperWeeks;

  const isEstablished = currentStructuralVolume >= 50 && recoveryLongRunRounded >= 24;
  const rampRate = isEstablished ? 0.02 : 0.06;
  const targetLr = Math.min(raceDistanceKm * 0.75, MAX_LONG_RUN_CAP_KM, 180 / paceMinPerKm);
  const lrStep = (targetLr - recoveryLongRunRounded) / Math.max(1, buildWeeksRemaining);

  const weeklyVolumes: number[] = [];
  const longRunTargets: number[] = [];
  const cutbackWeeks: number[] = [];
  let vol = currentStructuralVolume;
  let lr = recoveryLongRunRounded;

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
      longRunTargets.push(Math.round(Math.min(lr, vol * LONG_RUN_WEEKLY_VOL_CAP, MAX_LONG_RUN_CAP_KM) * 10) / 10);
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

  const buildVolumes = weeklyVolumes.slice(0, buildWeeksRemaining);
  const buildLongRuns = longRunTargets.slice(0, buildWeeksRemaining);
  const newProjectedPeakVolume = buildVolumes.length > 0 ? Math.max(...buildVolumes) : currentStructuralVolume;
  const newProjectedPeakLongRun = buildLongRuns.length > 0 ? Math.max(...buildLongRuns) : recoveryLongRunRounded;
  const peakWeek = buildVolumes.indexOf(newProjectedPeakVolume);

  logger.info('[RecoveryInsertion] Recovery week inserted', {
    triggerWeek: currentWeekIndex + 1,
    weeksToRace,
    taperWeeks,
    recoveryActualVolume,
    recoveryLongRun: recoveryLongRunRounded,
    newProjectedPeakVolume,
    newProjectedPeakLongRun,
    rampViolation,
  });

  return {
    triggerWeek: currentWeekIndex + 1,
    newProjectedPeakVolume,
    newProjectedPeakLongRun,
    taperWeeks,
    weeklyVolumes,
    longRunTargets,
    cutbackWeeks,
    peakWeek: peakWeek >= 0 ? peakWeek : buildWeeksRemaining - 1,
    recoveryWeekSpec,
    rampViolation,
  };
}

export function parseRaceDistanceKmFromAnswers(raceDistance: string | undefined): number {
  if (!raceDistance) return 0;
  const s = raceDistance.toLowerCase().trim();
  if (s.includes('half marathon') || s.includes('half')) return 21.1;
  if (s.includes('marathon')) return 42.2;
  const match = s.match(/(\d+(\.\d+)?)/);
  if (match) return parseFloat(match[1]);
  return 0;
}

const MIN_BUILD_WEEKS_BEFORE_TAPER = 3;

export function guardRecoveryInsertion(params: {
  raceDateISO: string | null;
  taperWeeks: number;
  currentWeekStartISO: string;
  todayISO: string;
}): string | null {
  const { raceDateISO, taperWeeks, currentWeekStartISO, todayISO } = params;

  if (!raceDateISO) return null;

  const raceDate = new Date(raceDateISO);
  if (isNaN(raceDate.getTime())) return null;

  const taperStart = new Date(raceDate);
  taperStart.setDate(taperStart.getDate() - taperWeeks * 7);
  const taperStartISO = taperStart.toISOString().split('T')[0];

  if (todayISO >= taperStartISO) {
    return `Structural plan changes are not permitted during the taper period (taper started ${taperStartISO}). Focus on your race preparation.`;
  }

  const msPerWeek = 7 * 24 * 60 * 60 * 1000;
  const insertionDate = new Date(currentWeekStartISO);
  const weeksAfterInsertion = Math.floor((taperStart.getTime() - insertionDate.getTime()) / msPerWeek) - 1;

  if (weeksAfterInsertion < MIN_BUILD_WEEKS_BEFORE_TAPER) {
    return `Inserting a recovery week here would leave only ${weeksAfterInsertion} build week(s) before taper. A minimum of ${MIN_BUILD_WEEKS_BEFORE_TAPER} build weeks is required. Consider a pause instead.`;
  }

  return null;
}

export function validateRecoveryInsertionConstraints(result: RecoveryInsertionResult): string[] {
  const violations: string[] = [];

  if (result.rampViolation) {
    violations.push(`Ramp rate exceeds ${MAX_RAMP_RATE * 100}% in recomputed weeks`);
  }

  for (const lr of result.longRunTargets) {
    if (lr > MAX_LONG_RUN_CAP_KM) {
      violations.push(`Long run target ${lr}km exceeds ${MAX_LONG_RUN_CAP_KM}km cap`);
      break;
    }
  }

  for (let i = 0; i < result.weeklyVolumes.length; i++) {
    const vol = result.weeklyVolumes[i];
    const lr = result.longRunTargets[i];
    if (vol > 0 && lr / vol > LONG_RUN_WEEKLY_VOL_CAP + 0.01) {
      violations.push(`Long run ${lr}km exceeds 60% of weekly volume ${vol}km at week ${i + 1}`);
      break;
    }
  }

  return violations;
}
