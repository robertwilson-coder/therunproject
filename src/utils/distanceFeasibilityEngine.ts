import { fetchPlanProjections } from '../services/planProjectionService';

const DEFAULT_PACE_MIN_PER_KM = 6.0;
const MARATHON_THRESHOLD_KM = 21;
const MAX_LONG_RUN_KM = 32;
const MAX_DURATION_MINUTES = 180;

function round1(x: number): number {
  return Math.round(x * 10) / 10;
}

function clamp(x: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, x));
}

function isMarathonLikeRace(raceDistanceKm: number): boolean {
  return raceDistanceKm > MARATHON_THRESHOLD_KM;
}

export type ReadinessTier = "green" | "orange" | "dark_orange" | "red";

export interface FeasibilityParams {
  currentWeeklyVolume: number;
  currentLongestRun: number;
  raceDistance: number;
  weeksToRace: number;
  assumedPaceMinPerKm?: number;
}

export interface FeasibilityResult {
  projectedPeakVolume: number;
  projectedPeakLongestRun: number;
  readinessTier: ReadinessTier;
}

function getLongRunGreenFactor(raceDistance: number): number {
  return clamp(1.05 - 0.01 * raceDistance, 0.62, 1.00);
}

export function getRequiredThresholds(raceDistance: number, paceMinPerKm = DEFAULT_PACE_MIN_PER_KM): {
  green: { peakVolume: number; longestRun: number };
  orange: { peakVolume: number; longestRun: number };
  dark_orange: { peakVolume: number; longestRun: number };
} {
  const lrGreenFactor = getLongRunGreenFactor(raceDistance);
  const lrOrangeFactor = lrGreenFactor - 0.10;
  const lrDarkFactor = lrGreenFactor - 0.20;

  const maxDistFrom3Hours = MAX_DURATION_MINUTES / paceMinPerKm;

  const lrGreen = Math.min(raceDistance * lrGreenFactor, MAX_LONG_RUN_KM, maxDistFrom3Hours);
  const lrOrange = Math.min(raceDistance * lrOrangeFactor, MAX_LONG_RUN_KM, maxDistFrom3Hours);
  const lrDark = Math.min(raceDistance * lrDarkFactor, MAX_LONG_RUN_KM, maxDistFrom3Hours);

  const vGreen = raceDistance * 1.0;
  const vOrange = vGreen * 0.85;
  const vDark = vGreen * 0.70;

  return {
    green: {
      peakVolume: round1(vGreen),
      longestRun: round1(lrGreen),
    },
    orange: {
      peakVolume: round1(vOrange),
      longestRun: round1(lrOrange),
    },
    dark_orange: {
      peakVolume: round1(vDark),
      longestRun: round1(lrDark),
    },
  };
}

export function deriveReadinessTier(
  projectedPeakVolume: number,
  projectedPeakLongestRun: number,
  raceDistance: number,
  paceMinPerKm = DEFAULT_PACE_MIN_PER_KM
): ReadinessTier {
  const thresholds = getRequiredThresholds(raceDistance, paceMinPerKm);
  const isLongRace = isMarathonLikeRace(raceDistance);

  const lrGreen = thresholds.green.longestRun;
  const lrOrange = thresholds.orange.longestRun;
  const lrDark = thresholds.dark_orange.longestRun;
  const vGreen = thresholds.green.peakVolume;
  const vOrange = thresholds.orange.peakVolume;
  const vDark = thresholds.dark_orange.peakVolume;

  if (isLongRace) {
    if (projectedPeakLongestRun < lrDark) {
      return "red";
    }

    if (projectedPeakLongestRun >= lrGreen) {
      if (projectedPeakVolume >= vGreen) return "green";
      if (projectedPeakVolume >= vOrange) return "orange";
      return "dark_orange";
    }

    if (projectedPeakLongestRun >= lrOrange) {
      if (projectedPeakVolume >= vOrange) return "orange";
      if (projectedPeakVolume >= vDark) return "dark_orange";
      return "red";
    }

    if (projectedPeakVolume >= vDark) return "dark_orange";
    return "red";
  }

  if (projectedPeakVolume >= vGreen && projectedPeakLongestRun >= lrGreen) {
    return "green";
  }

  if (projectedPeakVolume >= vOrange && projectedPeakLongestRun >= lrOrange) {
    return "orange";
  }

  if (projectedPeakVolume >= vDark && projectedPeakLongestRun >= lrDark) {
    return "dark_orange";
  }

  return "red";
}

export async function calculateRaceFeasibilityAsync(params: FeasibilityParams): Promise<FeasibilityResult> {
  const {
    currentWeeklyVolume,
    currentLongestRun,
    raceDistance,
    weeksToRace,
    assumedPaceMinPerKm = DEFAULT_PACE_MIN_PER_KM,
  } = params;

  const projection = await fetchPlanProjections({
    startingWeeklyKm: currentWeeklyVolume,
    startingLongestRunKm: currentLongestRun,
    totalWeeks: weeksToRace,
    raceDistanceKm: raceDistance,
    paceMinPerKm: assumedPaceMinPerKm,
    ambitionTier: 'base',
  });

  const readinessTier = deriveReadinessTier(
    projection.projectedPeakVolume,
    projection.projectedPeakLongRun,
    raceDistance,
    assumedPaceMinPerKm
  );

  return {
    projectedPeakVolume: projection.projectedPeakVolume,
    projectedPeakLongestRun: projection.projectedPeakLongRun,
    readinessTier,
  };
}

/**
 * LIGHTWEIGHT SYNC APPROXIMATION for UI hints only.
 *
 * This function provides a rough estimate for client-side UI purposes
 * (e.g., finding how many weeks until "green" tier). It is NOT used
 * for actual plan generation - that uses the server via calculateRaceFeasibilityAsync().
 *
 * The authoritative math lives on the server in planStructureBuilder.ts
 */
export function calculateRaceFeasibility(params: FeasibilityParams): FeasibilityResult {
  const {
    currentWeeklyVolume,
    currentLongestRun,
    raceDistance,
    weeksToRace,
    assumedPaceMinPerKm = DEFAULT_PACE_MIN_PER_KM,
  } = params;

  const isEstablished = currentWeeklyVolume >= 50 && currentLongestRun >= 24;
  const rampRate = isEstablished ? 0.02 : 0.06;

  let projectedPeakVolume = currentWeeklyVolume;
  for (let w = 1; w < weeksToRace - 2; w++) {
    if ((w + 1) % 4 === 0) continue;
    projectedPeakVolume = projectedPeakVolume * (1 + rampRate);
  }
  projectedPeakVolume = round1(projectedPeakVolume);

  let projectedPeakLongestRun = currentLongestRun;
  const targetLr = Math.min(raceDistance * 0.75, MAX_LONG_RUN_KM, MAX_DURATION_MINUTES / assumedPaceMinPerKm);
  const buildWeeks = Math.max(1, weeksToRace - 2);
  const stepPerWeek = (targetLr - currentLongestRun) / buildWeeks;
  for (let w = 1; w < buildWeeks; w++) {
    if ((w + 1) % 4 === 0) continue;
    projectedPeakLongestRun = Math.min(projectedPeakLongestRun + stepPerWeek, targetLr);
  }
  projectedPeakLongestRun = round1(projectedPeakLongestRun);

  const readinessTier = deriveReadinessTier(
    projectedPeakVolume,
    projectedPeakLongestRun,
    raceDistance,
    assumedPaceMinPerKm
  );

  return {
    projectedPeakVolume,
    projectedPeakLongestRun,
    readinessTier,
  };
}
