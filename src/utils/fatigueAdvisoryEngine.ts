import type { FatigueSignals, FatigueLevel } from './fatigueEngine';
import type { TrainingPaces } from '../types';

export type AdvisoryDecision =
  | 'reduce_intensity'
  | 'bring_deload_forward'
  | 'continue'
  | 'dismissed';

export interface FatigueAdvisoryState {
  shouldShow: boolean;
  fatigueLevel: FatigueLevel;
  triggerReason: string;
  signals: FatigueSignals;
}

export interface IntensityAdjustment {
  adjustedPaces: TrainingPaces;
  adjustmentPct: number;
  expiresAfterDays: number;
}

export const INTENSITY_REDUCTION_PCT = 0.03;
export const ADVISORY_COOLDOWN_DAYS = 7;
export const DISMISSED_COOLDOWN_DAYS = 5;

function daysSince(isoDate: string, now: Date): number {
  return (now.getTime() - new Date(isoDate).getTime()) / (1000 * 60 * 60 * 24);
}

export function shouldShowAdvisory(
  signals: FatigueSignals,
  lastShownAt: string | null,
  lastDecision: AdvisoryDecision | null,
  now: Date = new Date()
): boolean {
  if (signals.fatigueLevel === 'low') return false;

  if (lastShownAt !== null) {
    const daysSinceShown = daysSince(lastShownAt, now);

    if (daysSinceShown < ADVISORY_COOLDOWN_DAYS) return false;

    if (lastDecision === 'dismissed' && daysSinceShown < DISMISSED_COOLDOWN_DAYS) {
      return false;
    }
  }

  return true;
}

export function buildAdvisoryState(
  signals: FatigueSignals,
  lastShownAt: string | null,
  lastDecision: AdvisoryDecision | null,
  now: Date = new Date()
): FatigueAdvisoryState {
  const shouldShow = shouldShowAdvisory(signals, lastShownAt, lastDecision, now);

  const reasons: string[] = [];
  if (signals.highRPEStreak >= 1) reasons.push(`highRPEStreak: ${signals.highRPEStreak}`);
  if (signals.loadRatio > 1.1) reasons.push(`loadRatio: ${signals.loadRatio}`);
  if (signals.missedSessions14d > 0) reasons.push(`missedSessions14d: ${signals.missedSessions14d}`);

  return {
    shouldShow,
    fatigueLevel: signals.fatigueLevel,
    triggerReason: reasons.join(', ') || 'fatigue threshold reached',
    signals,
  };
}

function parsePaceSecPerKm(paceStr: string): number | null {
  const match = paceStr.match(/^(\d+):(\d{2})\/km$/);
  if (!match) return null;
  return parseInt(match[1]) * 60 + parseInt(match[2]);
}

function formatPace(secondsPerKm: number): string {
  const floored = Math.round(secondsPerKm);
  const mins = Math.floor(floored / 60);
  const secs = floored % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}/km`;
}

export function applyIntensityReduction(
  paces: TrainingPaces,
  reductionPct: number = INTENSITY_REDUCTION_PCT
): IntensityAdjustment {
  const adjust = (paceStr: string): string => {
    const sec = parsePaceSecPerKm(paceStr);
    if (sec === null) return paceStr;
    return formatPace(sec * (1 + reductionPct));
  };

  return {
    adjustedPaces: {
      racePace: adjust(paces.racePace),
      easyPace: adjust(paces.easyPace),
      longRunPace: adjust(paces.longRunPace),
      tempoPace: adjust(paces.tempoPace),
      intervalPace: adjust(paces.intervalPace),
      paceSourceLabel: paces.paceSourceLabel,
      paceConflictPct: paces.paceConflictPct,
    },
    adjustmentPct: reductionPct * 100,
    expiresAfterDays: 7,
  };
}

export interface DeloadWeekResult {
  deloadWeekNumber: number;
  affectedWeeks: number[];
}

export function findNextDeloadWeek(
  planWeeks: Array<{ week: number; label?: string; focus?: string }>,
  currentWeek: number
): number | null {
  const deloadPatterns = /deload|recovery|easy|rest week/i;

  for (const w of planWeeks) {
    if (w.week <= currentWeek) continue;
    const text = `${w.label ?? ''} ${w.focus ?? ''}`;
    if (deloadPatterns.test(text)) return w.week;
  }

  for (const w of planWeeks) {
    if (w.week <= currentWeek) continue;
    if (w.week % 4 === 0) return w.week;
  }

  return null;
}

export function buildDeloadShiftPlan(
  currentWeek: number,
  nextDeloadWeek: number | null,
  totalWeeks: number
): DeloadWeekResult | null {
  if (nextDeloadWeek === null || nextDeloadWeek <= currentWeek) return null;

  const targetDeloadWeek = currentWeek;
  const affected: number[] = [];

  for (let w = targetDeloadWeek; w <= Math.min(nextDeloadWeek + 1, totalWeeks); w++) {
    affected.push(w);
  }

  return { deloadWeekNumber: targetDeloadWeek, affectedWeeks: affected };
}
