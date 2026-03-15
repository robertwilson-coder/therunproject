import type { TrainingPaces, CalibrationResult, RunnerAnswers } from '../types';

export type PaceSourceKind =
  | 'calibration'
  | 'race_result_recent'
  | 'race_result_historical'
  | 'default_estimated';

export interface PaceSource {
  kind: PaceSourceKind;
  label: string;
  ageWeeks: number | null;
}

export interface PaceAnchorResult {
  paces: TrainingPaces;
  source: PaceSource;
  conflictPct: number | null;
}

const FRESHNESS_DAYS = 42;
const DAYS_IN_MS = 24 * 60 * 60 * 1000;
const WEEKS_IN_MS = 7 * DAYS_IN_MS;

function daysSince(isoDate: string, now: Date): number {
  return (now.getTime() - new Date(isoDate).getTime()) / DAYS_IN_MS;
}

function weeksSince(isoDate: string, now: Date): number {
  return (now.getTime() - new Date(isoDate).getTime()) / WEEKS_IN_MS;
}

function formatPace(secondsPerKm: number): string {
  const mins = Math.floor(secondsPerKm / 60);
  const secs = Math.round(secondsPerKm % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}/km`;
}

function pacesFromSecPerKm(raceSecPerKm: number): TrainingPaces {
  return {
    racePace: formatPace(raceSecPerKm),
    easyPace: formatPace(raceSecPerKm * 1.25),
    longRunPace: formatPace(raceSecPerKm * 1.20),
    tempoPace: formatPace(raceSecPerKm * 1.08),
    intervalPace: formatPace(raceSecPerKm * 0.95),
  };
}

function paceFromCalibration(cal: CalibrationResult): TrainingPaces {
  return pacesFromSecPerKm(cal.averagePaceSecPerKm);
}

function paceFromRaceResult(answers: RunnerAnswers): TrainingPaces | null {
  const { recentRaceDistance, recentRaceHours, recentRaceMinutes, recentRaceSeconds } = answers;
  if (!recentRaceDistance) return null;

  const distances: Record<string, number> = {
    '5K': 5,
    '10K': 10,
    'Half Marathon': 21.0975,
    'Marathon': 42.195,
  };
  const distanceKm = distances[recentRaceDistance];
  if (!distanceKm) return null;

  const totalSeconds = (recentRaceHours || 0) * 3600 + (recentRaceMinutes || 0) * 60 + (recentRaceSeconds || 0);
  if (totalSeconds === 0) return null;

  return pacesFromSecPerKm(totalSeconds / distanceKm);
}

function parseSecPerKm(paceStr: string): number | null {
  const match = paceStr.match(/^(\d+):(\d{2})\/km$/);
  if (!match) return null;
  return parseInt(match[1]) * 60 + parseInt(match[2]);
}

function conflictPercent(secA: number, secB: number): number {
  return Math.abs((secA - secB) / secB) * 100;
}

export const PACE_CHANGE_THRESHOLD = 0.05;

export type PaceUpdateDecision = 'auto' | 'confirm';

export interface PaceChangeResult {
  newAnchor: PaceAnchorResult;
  decision: PaceUpdateDecision;
  changePct: number;
}

export function computePaceChange(
  currentPaces: TrainingPaces | null | undefined,
  newCalibration: CalibrationResult,
  answers: RunnerAnswers | null | undefined,
  now: Date = new Date()
): PaceChangeResult {
  const newAnchor = resolvePaceAnchor(newCalibration, answers, now);

  if (!currentPaces?.racePace) {
    return { newAnchor, decision: 'auto', changePct: 0 };
  }

  const currentSec = parseSecPerKm(currentPaces.racePace);
  const newSec = parseSecPerKm(newAnchor.paces.racePace);

  if (currentSec === null || newSec === null) {
    return { newAnchor, decision: 'auto', changePct: 0 };
  }

  const changePct = conflictPercent(newSec, currentSec);
  const decision: PaceUpdateDecision = changePct > PACE_CHANGE_THRESHOLD * 100 ? 'confirm' : 'auto';

  return { newAnchor, decision, changePct: Math.round(changePct * 10) / 10 };
}

export function resolvePaceAnchor(
  calibrationResult: CalibrationResult | null | undefined,
  answers: RunnerAnswers | null | undefined,
  now: Date = new Date()
): PaceAnchorResult {
  const calAgeDays = calibrationResult?.completedAtISO
    ? daysSince(calibrationResult.completedAtISO, now)
    : null;

  const hasRecentCalibration =
    calibrationResult != null && calAgeDays != null && calAgeDays <= FRESHNESS_DAYS;

  if (hasRecentCalibration && calibrationResult) {
    const paces = paceFromCalibration(calibrationResult);
    const ageWeeks = Math.round((calAgeDays ?? 0) / 7);

    const racePaces = answers ? paceFromRaceResult(answers) : null;
    let conflictPct: number | null = null;

    if (racePaces) {
      const calSec = calibrationResult.averagePaceSecPerKm;
      const raceSec = parseSecPerKm(racePaces.racePace);
      if (raceSec !== null) {
        const pct = conflictPercent(calSec, raceSec);
        conflictPct = pct > 5 ? Math.round(pct) : null;
      }
    }

    return {
      paces,
      source: {
        kind: 'calibration',
        label: `Calibration (${ageWeeks} week${ageWeeks === 1 ? '' : 's'} ago)`,
        ageWeeks,
      },
      conflictPct,
    };
  }

  if (answers) {
    const racePaces = paceFromRaceResult(answers);
    if (racePaces) {
      const kind: PaceSourceKind = 'race_result_recent';
      const label = answers.recentRaceDistance
        ? `${answers.recentRaceDistance} race result`
        : 'Race result';

      return {
        paces: racePaces,
        source: { kind, label, ageWeeks: null },
        conflictPct: null,
      };
    }
  }

  return {
    paces: {
      racePace: '',
      easyPace: '',
      longRunPace: '',
      tempoPace: '',
      intervalPace: '',
    },
    source: { kind: 'default_estimated', label: 'Estimated zones', ageWeeks: null },
    conflictPct: null,
  };
}
