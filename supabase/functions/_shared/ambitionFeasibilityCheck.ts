/**
 * ambitionFeasibilityCheck.ts
 *
 * Post-L4 recovery week feasibility check for competitive tier warning.
 *
 * After inserting a full recovery week (L4), checks if the chosen ambition tier
 * (especially "competitive") is still achievable given:
 *   - Remaining build weeks before taper
 *   - Achievable peak long run under 6% ramp constraint
 *   - Achievable peak weekly volume
 *
 * CRITICAL: This module NEVER silently downgrades ambition tier.
 * It only warns and offers explicit choices to the runner.
 */

import { logger } from './logger.ts';

export type AmbitionTier = 'base' | 'performance' | 'competitive';

export interface AmbitionThresholds {
  minPeakLongRunKm: number;
  minPeakVolumeMultiplier: number;
  minBuildWeeksBeforeTaper: number;
}

export const MARATHON_THRESHOLDS: Record<AmbitionTier, AmbitionThresholds> = {
  competitive: {
    minPeakLongRunKm: 30,
    minPeakVolumeMultiplier: 1.25,
    minBuildWeeksBeforeTaper: 3,
  },
  performance: {
    minPeakLongRunKm: 28,
    minPeakVolumeMultiplier: 1.15,
    minBuildWeeksBeforeTaper: 2,
  },
  base: {
    minPeakLongRunKm: 24,
    minPeakVolumeMultiplier: 1.05,
    minBuildWeeksBeforeTaper: 1,
  },
};

export type FeasibilityReasonCode =
  | 'PEAK_LONG_RUN_TOO_LOW'
  | 'PEAK_VOLUME_TOO_LOW'
  | 'INSUFFICIENT_BUILD_WEEKS';

export interface FeasibilityCheckResult {
  stillSupported: boolean;
  reasonCodes: FeasibilityReasonCode[];
  currentTier: AmbitionTier;
  recommendedTier?: AmbitionTier;
  metrics: {
    peakLongRunKm: number;
    peakWeeklyVolumeKm: number;
    buildWeeksRemaining: number;
    startingWeeklyVolumeKm: number;
  };
}

export interface AmbitionAdvisoryChoice {
  optionId: number;
  label: string;
  description: string;
  action: 'keep_competitive' | 'downgrade_performance' | 'downgrade_base' | 'undo_recovery_week';
  newTier?: AmbitionTier;
}

export interface AmbitionAdvisoryResponse {
  mode: 'ambition_advisory';
  message: string;
  options: AmbitionAdvisoryChoice[];
  feasibilityResult: FeasibilityCheckResult;
}

function computePeakLongRunKm(days: any[]): number {
  let maxLongRun = 0;
  for (const d of days) {
    if (d.workout_type !== 'TRAIN') continue;
    const workout = (d.workout ?? '').toLowerCase();
    if (!workout.includes('long run')) continue;
    const match = workout.match(/(\d+(?:\.\d+)?)\s*km/i);
    if (match) {
      const km = parseFloat(match[1]);
      if (km > maxLongRun) maxLongRun = km;
    }
  }
  return Math.round(maxLongRun * 10) / 10;
}

function computeWeeklyVolumes(days: any[], startDateISO: string): number[] {
  const startMs = new Date(startDateISO + 'T00:00:00Z').getTime();
  const weekVolumes = new Map<number, number>();

  for (const d of days) {
    if (d.workout_type === 'REST' || d.workout_type === 'RACE') continue;
    const dayMs = new Date(d.date + 'T00:00:00Z').getTime();
    const weekIndex = Math.floor((dayMs - startMs) / (7 * 24 * 60 * 60 * 1000));
    if (weekIndex < 0) continue;

    const match = (d.workout ?? '').match(/(\d+(?:\.\d+)?)\s*km/i);
    const km = match ? parseFloat(match[1]) : 0;
    weekVolumes.set(weekIndex, (weekVolumes.get(weekIndex) ?? 0) + km);
  }

  const maxWeek = Math.max(...weekVolumes.keys(), 0);
  const result: number[] = [];
  for (let i = 0; i <= maxWeek; i++) {
    result.push(Math.round((weekVolumes.get(i) ?? 0) * 10) / 10);
  }
  return result;
}

function computePeakWeeklyVolume(weeklyVolumes: number[]): number {
  if (weeklyVolumes.length === 0) return 0;
  return Math.max(...weeklyVolumes);
}

function computeBuildWeeksRemaining(
  todayISO: string,
  raceDateISO: string | null,
  taperWeeks: number,
): number {
  if (!raceDateISO) return 12;

  const todayMs = new Date(todayISO + 'T00:00:00Z').getTime();
  const raceMs = new Date(raceDateISO + 'T00:00:00Z').getTime();
  const totalWeeksRemaining = Math.floor((raceMs - todayMs) / (7 * 24 * 60 * 60 * 1000));

  return Math.max(0, totalWeeksRemaining - taperWeeks);
}

export function checkAmbitionFeasibility(
  updatedPlanDays: any[],
  startDateISO: string,
  todayISO: string,
  raceDateISO: string | null,
  currentTier: AmbitionTier,
  startingWeeklyVolumeKm: number,
): FeasibilityCheckResult {
  const thresholds = MARATHON_THRESHOLDS[currentTier];
  const taperWeeks = currentTier === 'competitive' ? 3 : 2;

  const peakLongRunKm = computePeakLongRunKm(updatedPlanDays);
  const weeklyVolumes = computeWeeklyVolumes(updatedPlanDays, startDateISO);
  const peakWeeklyVolumeKm = computePeakWeeklyVolume(weeklyVolumes);
  const buildWeeksRemaining = computeBuildWeeksRemaining(todayISO, raceDateISO, taperWeeks);

  const reasonCodes: FeasibilityReasonCode[] = [];

  const requiredPeakVolume = startingWeeklyVolumeKm * thresholds.minPeakVolumeMultiplier;
  if (peakWeeklyVolumeKm < requiredPeakVolume) {
    reasonCodes.push('PEAK_VOLUME_TOO_LOW');
  }

  if (buildWeeksRemaining < thresholds.minBuildWeeksBeforeTaper) {
    reasonCodes.push('INSUFFICIENT_BUILD_WEEKS');
  }

  if (peakLongRunKm < thresholds.minPeakLongRunKm) {
    reasonCodes.push('PEAK_LONG_RUN_TOO_LOW');
  }

  const stillSupported = reasonCodes.length === 0;

  let recommendedTier: AmbitionTier | undefined;
  if (!stillSupported && currentTier === 'competitive') {
    if (
      peakLongRunKm >= MARATHON_THRESHOLDS.performance.minPeakLongRunKm &&
      buildWeeksRemaining >= MARATHON_THRESHOLDS.performance.minBuildWeeksBeforeTaper
    ) {
      recommendedTier = 'performance';
    } else {
      recommendedTier = 'base';
    }
  } else if (!stillSupported && currentTier === 'performance') {
    recommendedTier = 'base';
  }

  logger.info('[AmbitionFeasibility] Check completed', {
    currentTier,
    stillSupported,
    reasonCodes,
    recommendedTier,
    peakLongRunKm,
    peakWeeklyVolumeKm,
    buildWeeksRemaining,
    startingWeeklyVolumeKm,
  });

  return {
    stillSupported,
    reasonCodes,
    currentTier,
    recommendedTier,
    metrics: {
      peakLongRunKm,
      peakWeeklyVolumeKm,
      buildWeeksRemaining,
      startingWeeklyVolumeKm,
    },
  };
}

export function buildAmbitionAdvisoryMessage(result: FeasibilityCheckResult): string {
  const { metrics, currentTier } = result;
  const tierName = currentTier.charAt(0).toUpperCase() + currentTier.slice(1);
  const thresholds = MARATHON_THRESHOLDS[currentTier];
  const requiredPeakVolume = Math.round(metrics.startingWeeklyVolumeKm * thresholds.minPeakVolumeMultiplier);

  const lines: string[] = [
    'Recovery week inserted.',
    'This reduces your achievable peak volume before taper. Under the safety limits, ' + tierName + ' may no longer be achievable.',
    '',
    'Your current mode: ' + tierName,
    'New projected peak weekly volume: ' + metrics.peakWeeklyVolumeKm + ' km (starting: ' + metrics.startingWeeklyVolumeKm + ' km, target: ' + requiredPeakVolume + ' km)',
    'Build weeks remaining: ' + metrics.buildWeeksRemaining,
    '',
    'Choose:',
  ];

  return lines.join('\n');
}

export function generateAmbitionAdvisoryChoices(result: FeasibilityCheckResult): AmbitionAdvisoryChoice[] {
  const tierName = result.currentTier.charAt(0).toUpperCase() + result.currentTier.slice(1);

  const choices: AmbitionAdvisoryChoice[] = [
    {
      optionId: 1,
      label: '1. Keep ' + tierName + ' anyway (no further changes)',
      description: 'Continue with your current plan. You may not reach ideal peak volume but can still race well.',
      action: 'keep_competitive',
    },
    {
      optionId: 2,
      label: '2. Downgrade to Performance (rebuild from today)',
      description: 'Rebuild plan with Performance tier targets. More achievable peaks with current timeline.',
      action: 'downgrade_performance',
      newTier: 'performance',
    },
    {
      optionId: 3,
      label: '3. Downgrade to Base (rebuild from today)',
      description: 'Rebuild plan with Base tier targets. Most conservative approach for safe completion.',
      action: 'downgrade_base',
      newTier: 'base',
    },
    {
      optionId: 4,
      label: '4. Undo recovery week (soften or reduce instead)',
      description: 'Revert the recovery week and apply a lighter adjustment that preserves more build time.',
      action: 'undo_recovery_week',
    },
  ];

  if (result.currentTier === 'performance') {
    return choices.filter(c => c.optionId !== 2);
  }

  if (result.currentTier === 'base') {
    return choices.filter(c => c.optionId !== 2 && c.optionId !== 3);
  }

  return choices;
}

export function parseAmbitionAdvisoryResponse(message: string): number | null {
  const lower = message.toLowerCase().trim();

  if (/^1$|^option\s*1$|^keep|^competitive|^no\s+(?:further\s+)?changes?/i.test(lower)) {
    return 1;
  }

  if (/^2$|^option\s*2$|^performance|^downgrade\s+(?:to\s+)?performance/i.test(lower)) {
    return 2;
  }

  if (/^3$|^option\s*3$|^base|^downgrade\s+(?:to\s+)?base/i.test(lower)) {
    return 3;
  }

  if (/^4$|^option\s*4$|^undo|^revert|^soften|^reduce/i.test(lower)) {
    return 4;
  }

  return null;
}

export function buildAmbitionAdvisoryResponse(result: FeasibilityCheckResult): AmbitionAdvisoryResponse {
  return {
    mode: 'ambition_advisory',
    message: buildAmbitionAdvisoryMessage(result),
    options: generateAmbitionAdvisoryChoices(result),
    feasibilityResult: result,
  };
}
