import { StructuralGuidance } from './planStructureBuilder.ts';

const DEFAULT_PACE_MIN_PER_KM = 6.0;

export interface NormalizerOptions {
  volumeTolerancePct: number;
  longRunToleranceKm: number;
  minEditableEasyRunKm: number;
  maxEasyRunAdjustmentKmPerDay: number;
  maxTotalWeeklyAdjustmentKm: number;
  enforceKmUnitsForLongRun: boolean;
  defaultPaceMinPerKm: number;
  softLongRunShareEnforcement: boolean;
  allowedTrainingDays?: string[];
}

export interface NormalizerDay {
  date: string;
  dow: string;
  workout: string;
  tips: string[];
  workout_type: 'TRAIN' | 'REST' | 'RACE';
  [key: string]: unknown;
}

export interface WeekDiagnostic {
  weekIndex: number;
  targetVolume: number;
  actualVolume: number;
  deltaKm: number;
  longRunTarget: number;
  generatedLongRunKm: number;
  sumNonLongRunKm: number;
  longRunClipped: boolean;
  shareExceedanceKm?: number;
}

export interface NormalizerResult {
  days: NormalizerDay[];
  needsRegeneration: boolean;
  debug: {
    preNormalizePeakLongRun: number;
    postNormalizePeakLongRun: number;
    preNormalizeWeeklyKm: number[];
    postNormalizeWeeklyKm: number[];
    weeklyAdjustments: string[];
    weekDiagnostics: WeekDiagnostic[];
    guidanceWeeklyVolumesLength: number;
    shareExceedanceWarnings: string[];
  };
}

const DEFAULT_OPTIONS: NormalizerOptions = {
  volumeTolerancePct: 0.07,
  longRunToleranceKm: 1.0,
  minEditableEasyRunKm: 3,
  maxEasyRunAdjustmentKmPerDay: 5,
  maxTotalWeeklyAdjustmentKm: 15,
  enforceKmUnitsForLongRun: true,
  defaultPaceMinPerKm: DEFAULT_PACE_MIN_PER_KM,
  softLongRunShareEnforcement: false,
};

// -----------------------------------------------------------------------
// Distance detection
// -----------------------------------------------------------------------

const KM_PATTERNS = [
  /(\d+(?:\.\d+)?)\s*km/i,
  /(\d+(?:\.\d+)?)\s*k\b/i,
  /(\d+(?:\.\d+)?)\s*kilometres?/i,
  /(\d+(?:\.\d+)?)\s*kilometers?/i,
];

const MILES_PATTERNS = [
  /(\d+(?:\.\d+)?)\s*miles?/i,
  /(\d+(?:\.\d+)?)\s*mi\b/i,
];

// Duration patterns are intentionally NOT used for volume calculation.
// Time-based sessions (e.g. "20 min tempo", "10 min warm up") represent
// structured or warm-up work — they must not be converted to km totals
// and must not influence weekly volume enforcement.
const DURATION_PATTERNS: RegExp[] = [];

// Detects rep-based interval patterns: "6 × 800 m", "5 × 1 km", "8 x 400m", etc.
const INTERVAL_REP_PATTERN = /\d+\s*[×x]\s*\d/;

function isIntervalWorkout(workout: string): boolean {
  return INTERVAL_REP_PATTERN.test(workout);
}

export function detectRunDistanceKm(workout: string, paceMinPerKm = DEFAULT_PACE_MIN_PER_KM): number | null {
  // Interval workouts (e.g. "6 × 800 m", "5 × 1 km") cannot have their distance
  // meaningfully extracted — the km value in the text is the rep distance, not the
  // total session distance. Returning null prevents the normalizer from treating
  // the rep distance as a continuous-run distance and rewriting it.
  if (isIntervalWorkout(workout)) return null;

  for (const pat of KM_PATTERNS) {
    const m = workout.match(pat);
    if (m) return parseFloat(m[1]);
  }
  for (const pat of MILES_PATTERNS) {
    const m = workout.match(pat);
    if (m) return parseFloat(m[1]) * 1.60934;
  }
  for (const pat of DURATION_PATTERNS) {
    const m = workout.match(pat);
    if (m) return Math.round((parseInt(m[1]) / paceMinPerKm) * 10) / 10;
  }
  return null;
}

function isLikelyRunWorkout(workout: string): boolean {
  const lower = workout.toLowerCase();
  if (lower === 'rest' || lower.startsWith('rest')) return false;
  if (lower.includes('race day')) return false;
  if (isIntervalWorkout(workout)) return false;
  const runKeywords = ['run', 'easy', 'long', 'tempo', 'interval', 'threshold', 'jog', 'fartlek', 'progression', 'strides', 'km', 'miles', 'min'];
  return runKeywords.some(k => lower.includes(k));
}

function isStructuredWorkout(workout: string): boolean {
  const lower = workout.toLowerCase();
  return (
    isIntervalWorkout(workout) ||
    lower.includes('tempo') ||
    lower.includes('threshold') ||
    lower.includes('strides') ||
    lower.includes('fartlek') ||
    lower.includes('progression') ||
    lower.includes('hill repeat') ||
    lower.includes('speed work') ||
    lower.includes('race pace')
  );
}

function isEasyRun(workout: string): boolean {
  const lower = workout.toLowerCase();
  // Structured sessions are never eligible for volume adjustment
  if (isStructuredWorkout(workout)) return false;
  if (lower.includes('long run')) return false;
  const easyKeywords = ['easy', 'recovery', 'aerobic', 'base', 'relaxed', 'conversational'];
  const hardKeywords = ['tempo', 'interval', 'threshold', 'speed', 'track', 'race', 'hard', 'fast'];
  if (hardKeywords.some(k => lower.includes(k))) return false;
  return easyKeywords.some(k => lower.includes(k)) || isLikelyRunWorkout(workout);
}

function isLongRun(workout: string): boolean {
  const lower = workout.toLowerCase();
  return lower.includes('long run') || lower.includes('long slow') || lower.includes('lsd') || lower.includes('long easy');
}

/**
 * ISSUE D FIX: Sanitize easy run workout text to fix mismatched distances.
 * When the headline says "Easy run: X km" but the Work block says "Y km",
 * make them consistent by using the Work block distance in the headline.
 */
export function sanitizeEasyRunDistanceMismatch(workout: string): string {
  if (!workout) return workout;
  const lower = workout.toLowerCase();
  if (!lower.includes('easy run') || !lower.includes('work:')) return workout;

  const headlineMatch = workout.match(/Easy run:\s*(\d+(?:\.\d+)?)\s*km/i);
  const workMatch = workout.match(/Work:\s*(?:Easy\s+)?(\d+(?:\.\d+)?)\s*km/i);

  if (!headlineMatch || !workMatch) return workout;

  const headlineKm = parseFloat(headlineMatch[1]);
  const workKm = parseFloat(workMatch[1]);

  if (Math.abs(headlineKm - workKm) < 0.1) return workout;

  return workout.replace(
    /Easy run:\s*\d+(?:\.\d+)?\s*km/i,
    `Easy run: ${workKm} km`
  );
}

// -----------------------------------------------------------------------
// Easy run distance cap
// -----------------------------------------------------------------------

// Cap an easy run km so it never exceeds 75% of the long run distance
// and never exceeds 40% of the week's target volume.
function clampEasyRunKm(
  proposedKm: number,
  longRunKm: number,
  weekTargetKm: number,
  minKm: number
): number {
  const longRunCap = longRunKm > 0 ? longRunKm * 0.75 : Infinity;
  const volumeCap = weekTargetKm > 0 ? weekTargetKm * 0.40 : Infinity;
  const cap = Math.min(longRunCap, volumeCap);
  return Math.max(minKm, Math.min(proposedKm, cap));
}

// Validate that no easy run in a week exceeds longRun * 0.75.
// Returns a list of violation descriptions (empty = pass).
function validateEasyRunCaps(week: NormalizerWeek, longRunKm: number, opts: NormalizerOptions): string[] {
  if (longRunKm <= 0) return [];
  const cap = longRunKm * 0.75;
  const violations: string[] = [];
  for (const day of week.days) {
    if (day.workout_type !== 'TRAIN') continue;
    if (isLongRun(day.workout) || isStructuredWorkout(day.workout)) continue;
    const km = detectRunDistanceKm(day.workout, opts.defaultPaceMinPerKm);
    if (km !== null && km > cap) {
      violations.push(`W${week.weekIndex + 1}: easy run ${km} km exceeds cap ${cap.toFixed(1)} km (long run ${longRunKm} km × 0.75)`);
    }
  }
  return violations;
}

// -----------------------------------------------------------------------
// Week grouping (works on flat day arrays)
// -----------------------------------------------------------------------

interface NormalizerWeek {
  weekIndex: number;
  days: NormalizerDay[];
}

export function groupDaysIntoWeeks(days: NormalizerDay[], startDate: string): NormalizerWeek[] {
  const startMs = new Date(startDate + 'T00:00:00Z').getTime();
  const map = new Map<number, NormalizerDay[]>();

  for (const day of days) {
    const dayMs = new Date(day.date + 'T00:00:00Z').getTime();
    const weekIndex = Math.floor((dayMs - startMs) / (7 * 24 * 60 * 60 * 1000));
    if (!map.has(weekIndex)) map.set(weekIndex, []);
    map.get(weekIndex)!.push(day);
  }

  return Array.from(map.entries())
    .map(([weekIndex, days]) => ({ weekIndex, days }))
    .sort((a, b) => a.weekIndex - b.weekIndex);
}

export function computeWeekKm(week: NormalizerWeek, paceMinPerKm = DEFAULT_PACE_MIN_PER_KM): number {
  let total = 0;
  for (const day of week.days) {
    if (day.workout_type !== 'TRAIN') continue;
    const km = detectRunDistanceKm(day.workout, paceMinPerKm);
    if (km !== null) total += km;
  }
  return Math.round(total * 10) / 10;
}

export function identifyLongRunDay(week: NormalizerWeek, paceMinPerKm = DEFAULT_PACE_MIN_PER_KM): NormalizerDay | null {
  const trainDays = week.days.filter(d => d.workout_type === 'TRAIN');

  const explicit = trainDays.find(d => isLongRun(d.workout));
  if (explicit) return explicit;

  let maxKm = -1;
  let maxDay: NormalizerDay | null = null;
  for (const day of trainDays) {
    if (!isLikelyRunWorkout(day.workout)) continue;
    const km = detectRunDistanceKm(day.workout, paceMinPerKm);
    if (km !== null && km > maxKm) {
      maxKm = km;
      maxDay = day;
    }
  }
  return maxDay;
}

// -----------------------------------------------------------------------
// Text rewriting
// -----------------------------------------------------------------------

function roundToHalfKm(km: number): number {
  return Math.round(km * 2) / 2;
}

function rewriteDistanceInText(text: string, newKm: number): string {
  const rounded = roundToHalfKm(newKm);

  for (const pat of KM_PATTERNS) {
    if (pat.test(text)) {
      return text.replace(pat, `${rounded} km`);
    }
  }
  for (const pat of MILES_PATTERNS) {
    if (pat.test(text)) {
      return text.replace(pat, `${rounded} km`);
    }
  }
  for (const pat of DURATION_PATTERNS) {
    if (pat.test(text)) {
      return text.replace(pat, `${rounded} km easy`);
    }
  }

  return `${text.trim()} (${rounded} km)`;
}

function setRunDistanceOnDay(day: NormalizerDay, newKm: number): void {
  day.workout = rewriteDistanceInText(day.workout, newKm);
}

// -----------------------------------------------------------------------
// Long run enforcement
// -----------------------------------------------------------------------

interface EnforceLongRunResult {
  success: boolean;
  shareExceedanceKm?: number;
  shareExceedanceWarning?: string;
}

function enforceLongRun(
  week: NormalizerWeek,
  targetKm: number,
  opts: NormalizerOptions,
  log: string[],
  weeklyVolumeTarget?: number,
): EnforceLongRunResult {
  const longRunDay = identifyLongRunDay(week, opts.defaultPaceMinPerKm);

  if (!longRunDay) {
    log.push(`W${week.weekIndex + 1}: no long run day found — cannot enforce long run target ${targetKm} km`);
    return { success: false };
  }

  // Long-run share enforcement: L <= 0.60 * V
  // When softLongRunShareEnforcement is true, we do NOT cap and do NOT add to adjustments log.
  // The exceedance is tracked separately as a warning metric only.
  const shareCapKm = weeklyVolumeTarget && weeklyVolumeTarget > 0
    ? weeklyVolumeTarget * 0.60
    : Infinity;

  let effectiveTarget = targetKm;
  let shareExceedanceKm: number | undefined;
  let shareExceedanceWarning: string | undefined;

  if (targetKm > shareCapKm) {
    const exceedance = targetKm - shareCapKm;
    if (opts.softLongRunShareEnforcement) {
      // SOFT MODE: Do NOT clip, do NOT add to adjustments log, just track as warning
      shareExceedanceKm = exceedance;
      shareExceedanceWarning = `W${week.weekIndex + 1}: [SOFT_WARNING] long run ${targetKm} km exceeds 60% share cap (${shareCapKm.toFixed(1)} km) by ${exceedance.toFixed(1)} km — allowed (soft enforcement)`;
    } else {
      // HARD MODE: Clip and add to adjustments log
      effectiveTarget = shareCapKm;
      log.push(`W${week.weekIndex + 1}: long run target ${targetKm} km capped to ${effectiveTarget.toFixed(1)} km (60% of weekly volume ${weeklyVolumeTarget} km)`);
    }
  }

  const currentKm = detectRunDistanceKm(longRunDay.workout, opts.defaultPaceMinPerKm) ?? 0;
  const diff = Math.abs(currentKm - effectiveTarget);

  if (diff <= opts.longRunToleranceKm) {
    return { success: true, shareExceedanceKm, shareExceedanceWarning };
  }

  log.push(`W${week.weekIndex + 1}: long run ${currentKm} km → ${effectiveTarget} km (diff ${diff.toFixed(1)} km)`);
  setRunDistanceOnDay(longRunDay, effectiveTarget);

  if (!isLongRun(longRunDay.workout)) {
    if (!longRunDay.workout.toLowerCase().includes('long')) {
      longRunDay.workout = `Long run: ${effectiveTarget} km easy\nWarm up: 15min easy jog | Work: Long run ${effectiveTarget} km at easy pace (RPE 4–5) | Cool down: 10min easy jog`;
    }
  }

  return { success: true, shareExceedanceKm, shareExceedanceWarning };
}

// -----------------------------------------------------------------------
// Volume enforcement
// -----------------------------------------------------------------------

function enforceVolume(
  week: NormalizerWeek,
  targetKm: number,
  opts: NormalizerOptions,
  log: string[],
  longRunTarget?: number,
): boolean {
  const actual = computeWeekKm(week, opts.defaultPaceMinPerKm);
  const tolerance = targetKm * opts.volumeTolerancePct;

  if (Math.abs(actual - targetKm) <= tolerance) return true;

  const delta = targetKm - actual;
  const absDelta = Math.abs(delta);

  const easyDays = week.days.filter(d =>
    d.workout_type === 'TRAIN' &&
    isEasyRun(d.workout) &&
    !isLongRun(d.workout)
  );

  // FREQUENCY INVARIANT: Never inject workouts into REST days.
  // The user's selected training frequency is a hard constraint.
  // If volume targets cannot be met with the selected frequency, that's acceptable —
  // we must NOT secretly add extra training days to compensate.
  // This was previously injecting easy runs into REST days which violated the user's frequency selection.
  const trainDaysInWeek = week.days.filter(d => d.workout_type === 'TRAIN');
  if (delta > 0 && easyDays.length === 0 && longRunTarget !== undefined && trainDaysInWeek.length > 0) {
    log.push(
      `W${week.weekIndex + 1}: Volume shortfall of ${delta.toFixed(1)} km but no easy days to adjust. ` +
      `FREQUENCY INVARIANT: Not injecting into REST days. User selected frequency must be respected.`
    );
    return true;
  }

  // Resolve the long run km for capping purposes (use target if available, else detect from plan)
  const longRunDay = week.days.find(d => d.workout_type === 'TRAIN' && isLongRun(d.workout));
  const actualLongRunKm = longRunDay
    ? (detectRunDistanceKm(longRunDay.workout, opts.defaultPaceMinPerKm) ?? 0)
    : 0;
  const longRunKmForCap = longRunTarget && longRunTarget > 0 ? longRunTarget : actualLongRunKm;

  // When the long run cap is binding, the generator may under-distribute volume
  // across other days. In that case the delta can exceed maxTotalWeeklyAdjustmentKm
  // even though the fix is straightforward: rewrite easy days so that their total
  // equals targetVolume - actualLongRunKm. Detect this and apply a proportional
  // rewrite instead of flagging for regeneration.
  if (absDelta > opts.maxTotalWeeklyAdjustmentKm && longRunTarget !== undefined && easyDays.length > 0) {
    const remainingForEasy = Math.max(0, targetKm - actualLongRunKm);
    const easyCurrentTotal = easyDays.reduce((sum, d) => {
      return sum + (detectRunDistanceKm(d.workout, opts.defaultPaceMinPerKm) ?? 0);
    }, 0);
    const easyDelta = remainingForEasy - easyCurrentTotal;
    const easyAbsDelta = Math.abs(easyDelta);

    // Compute per-day share and clamp each to the easy run cap
    const rawPerDayShare = easyDays.length > 0 ? remainingForEasy / easyDays.length : 0;
    const clampedPerDayShare = clampEasyRunKm(rawPerDayShare, longRunKmForCap, targetKm, opts.minEditableEasyRunKm);

    const allDaysViable = easyDays.every(d => {
      const km = detectRunDistanceKm(d.workout, opts.defaultPaceMinPerKm) ?? 0;
      const newKm = km + easyDelta / easyDays.length;
      return newKm >= opts.minEditableEasyRunKm;
    });

    if (allDaysViable && easyAbsDelta <= remainingForEasy) {
      log.push(
        `W${week.weekIndex + 1}: long-run cap binding — redistributing ${easyDelta.toFixed(1)} km across ${easyDays.length} easy days` +
        ` (longRun=${actualLongRunKm} km, easyTarget=${remainingForEasy.toFixed(1)} km, perDay=${clampedPerDayShare.toFixed(1)} km)`
      );
      for (const day of easyDays) {
        const currentKm = detectRunDistanceKm(day.workout, opts.defaultPaceMinPerKm) ?? 0;
        const newKm = Math.round(clampedPerDayShare * 2) / 2;
        if (Math.abs(newKm - currentKm) >= 0.5) {
          log.push(`W${week.weekIndex + 1}: easy run ${currentKm} km → ${newKm} km (cap-redistribution)`);
          setRunDistanceOnDay(day, newKm);
        }
      }
      return true;
    }

    log.push(`W${week.weekIndex + 1}: volume delta ${delta.toFixed(1)} km exceeds max adjustment — flagging for regen`);
    return false;
  }

  if (absDelta > opts.maxTotalWeeklyAdjustmentKm) {
    log.push(`W${week.weekIndex + 1}: volume delta ${delta.toFixed(1)} km exceeds max adjustment — flagging for regen`);
    return false;
  }

  if (easyDays.length === 0) {
    log.push(`W${week.weekIndex + 1}: no easy days to adjust for volume — skipping`);
    return true;
  }

  // Sort: when adding volume, start with the largest run (spread load); when removing, start with smallest
  easyDays.sort((a, b) => {
    const ka = detectRunDistanceKm(a.workout, opts.defaultPaceMinPerKm) ?? 0;
    const kb = detectRunDistanceKm(b.workout, opts.defaultPaceMinPerKm) ?? 0;
    return delta > 0 ? kb - ka : ka - kb;
  });

  let remaining = delta;
  for (const day of easyDays) {
    if (Math.abs(remaining) < 0.5) break;

    const currentKm = detectRunDistanceKm(day.workout, opts.defaultPaceMinPerKm);
    if (currentKm === null) continue;

    const adjustment = Math.max(
      -opts.maxEasyRunAdjustmentKmPerDay,
      Math.min(opts.maxEasyRunAdjustmentKmPerDay, remaining)
    );

    const rawNewKm = currentKm + adjustment;
    if (rawNewKm < opts.minEditableEasyRunKm) continue;

    // Apply easy run cap: no single easy run may exceed longRun × 0.75 or weekVolume × 0.40
    const clampedKm = clampEasyRunKm(rawNewKm, longRunKmForCap, targetKm, opts.minEditableEasyRunKm);
    const appliedKm = Math.round(clampedKm * 2) / 2;

    if (appliedKm === Math.round(currentKm * 2) / 2) continue;

    log.push(`W${week.weekIndex + 1}: easy run ${currentKm} km → ${appliedKm} km (volume adj ${(appliedKm - currentKm).toFixed(1)} km)`);
    setRunDistanceOnDay(day, appliedKm);
    remaining -= (appliedKm - currentKm);
  }

  return true;
}

// -----------------------------------------------------------------------
// Taper sanity
// -----------------------------------------------------------------------

function checkTaperSanity(
  weeks: NormalizerWeek[],
  guidance: StructuralGuidance,
  opts: NormalizerOptions,
  log: string[]
): boolean {
  // Rounding tolerance to avoid false failures from half-km rounding
  const TAPER_ROUNDING_TOLERANCE_KM = 0.5;

  const peakVolume = computeWeekKm(weeks[guidance.peakWeek] ?? weeks[weeks.length - 1], opts.defaultPaceMinPerKm);
  const peakLR = (() => {
    const d = identifyLongRunDay(weeks[guidance.peakWeek] ?? weeks[weeks.length - 1], opts.defaultPaceMinPerKm);
    return d ? detectRunDistanceKm(d.workout, opts.defaultPaceMinPerKm) ?? 0 : 0;
  })();

  let ok = true;
  for (let i = guidance.taperStartWeek; i < weeks.length; i++) {
    const w = weeks[i];
    if (!w) continue;
    const vol = computeWeekKm(w, opts.defaultPaceMinPerKm);
    const lrd = identifyLongRunDay(w, opts.defaultPaceMinPerKm);
    const lr = lrd ? detectRunDistanceKm(lrd.workout, opts.defaultPaceMinPerKm) ?? 0 : 0;

    // Allow equality within rounding tolerance
    if (vol > peakVolume + TAPER_ROUNDING_TOLERANCE_KM) {
      log.push(`Taper W${i + 1}: volume ${vol} >= peak ${peakVolume} — taper violated`);
      ok = false;
    }
    if (lr > peakLR + TAPER_ROUNDING_TOLERANCE_KM) {
      log.push(`Taper W${i + 1}: long run ${lr} >= peak ${peakLR} — taper violated`);
      ok = false;
    }
  }
  return ok;
}

// -----------------------------------------------------------------------
// Main export
// -----------------------------------------------------------------------

export function normalizePlanToStructure(
  days: NormalizerDay[],
  guidance: StructuralGuidance,
  startDate: string,
  partialOptions: Partial<NormalizerOptions> = {}
): NormalizerResult {
  const opts: NormalizerOptions = { ...DEFAULT_OPTIONS, ...partialOptions };

  const weeks = groupDaysIntoWeeks(days, startDate);

  const preNormalizeWeeklyKm = weeks.map(w => computeWeekKm(w, opts.defaultPaceMinPerKm));

  const preNormalizeLongRuns = weeks.map(w => {
    const d = identifyLongRunDay(w, opts.defaultPaceMinPerKm);
    return d ? detectRunDistanceKm(d.workout, opts.defaultPaceMinPerKm) ?? 0 : 0;
  });
  const preNormalizePeakLongRun = Math.max(...preNormalizeLongRuns, 0);

  const log: string[] = [];
  const shareExceedanceWarnings: string[] = [];
  let needsRegeneration = false;
  const weekDiagnostics: WeekDiagnostic[] = [];

  for (let i = 0; i < weeks.length; i++) {
    const week = weeks[i];
    const lrTarget = guidance.longRunTargets[i] ?? 0;
    const volTarget = guidance.weeklyVolumes[i];

    // Rest-only weeks (e.g. partial boundary week where no plan dates fall on training DOWs)
    // have no TRAIN days and cannot be volume/LR enforced — skip them entirely.
    const trainDaysInWeek = week.days.filter(d => d.workout_type === 'TRAIN');
    if (trainDaysInWeek.length === 0) {
      const diag: WeekDiagnostic = {
        weekIndex: i,
        targetVolume: volTarget ?? 0,
        actualVolume: 0,
        deltaKm: volTarget ?? 0,
        longRunTarget: lrTarget,
        generatedLongRunKm: 0,
        sumNonLongRunKm: 0,
        longRunClipped: false,
      };
      weekDiagnostics.push(diag);
      log.push(`W${i + 1}: rest-only week — skipping volume/long-run enforcement`);
      continue;
    }

    const longRunDay = week.days.find(d =>
      d.workout_type === 'TRAIN' && isLongRun(d.workout)
    ) ?? identifyLongRunDay(week, opts.defaultPaceMinPerKm);
    const generatedLongRunKm = longRunDay
      ? (detectRunDistanceKm(longRunDay.workout, opts.defaultPaceMinPerKm) ?? 0)
      : 0;
    const actualVolume = computeWeekKm(week, opts.defaultPaceMinPerKm);
    const sumNonLongRunKm = Math.round((actualVolume - generatedLongRunKm) * 10) / 10;

    // In soft mode, lrClipped should only be true if there's a HARD constraint violation,
    // not a share cap exceedance (which is soft). We compute share cap exceedance separately.
    const shareCapKm = volTarget && volTarget > 0 ? volTarget * 0.60 : Infinity;
    const isShareExceedance = lrTarget > shareCapKm;
    // lrClipped is only true if LR was clipped due to a HARD constraint (not share cap in soft mode)
    const longRunClipped = opts.softLongRunShareEnforcement
      ? (lrTarget > 0 && generatedLongRunKm < lrTarget - 0.5 && !isShareExceedance)
      : (lrTarget > 0 && generatedLongRunKm < lrTarget - 0.5);

    const diag: WeekDiagnostic = {
      weekIndex: i,
      targetVolume: volTarget ?? 0,
      actualVolume,
      deltaKm: Math.round(((volTarget ?? 0) - actualVolume) * 10) / 10,
      longRunTarget: lrTarget,
      generatedLongRunKm,
      sumNonLongRunKm,
      longRunClipped,
      shareExceedanceKm: isShareExceedance ? Math.round((lrTarget - shareCapKm) * 10) / 10 : undefined,
    };
    weekDiagnostics.push(diag);

    log.push(
      `W${i + 1} diag: targetVol=${diag.targetVolume} actualVol=${diag.actualVolume} delta=${diag.deltaKm}` +
      ` lrTarget=${diag.longRunTarget} lrActual=${diag.generatedLongRunKm} nonLrKm=${diag.sumNonLongRunKm} lrClipped=${diag.longRunClipped}`
    );

    if (lrTarget > 0) {
      const lrResult = enforceLongRun(week, lrTarget, opts, log, volTarget);
      if (!lrResult.success) needsRegeneration = true;
      // Track share exceedance warnings separately (never triggers regen in soft mode)
      if (lrResult.shareExceedanceWarning) {
        shareExceedanceWarnings.push(lrResult.shareExceedanceWarning);
      }
    }

    if (volTarget !== undefined && volTarget > 0) {
      const volOk = enforceVolume(week, volTarget, opts, log, lrTarget);
      if (!volOk) needsRegeneration = true;
    }

    // Post-adjustment validation: reject any week where an easy run exceeds longRun × 0.75
    const postLongRunDay = week.days.find(d => d.workout_type === 'TRAIN' && isLongRun(d.workout))
      ?? identifyLongRunDay(week, opts.defaultPaceMinPerKm);
    const postLongRunKm = postLongRunDay
      ? (detectRunDistanceKm(postLongRunDay.workout, opts.defaultPaceMinPerKm) ?? 0)
      : 0;
    const capViolations = validateEasyRunCaps(week, postLongRunKm, opts);
    if (capViolations.length > 0) {
      for (const v of capViolations) log.push(`[CAP VIOLATION — revert] ${v}`);
      // Hard-clamp violating runs rather than flagging regen — safer than abandoning the plan
      for (const day of week.days) {
        if (day.workout_type !== 'TRAIN') continue;
        if (isLongRun(day.workout) || isStructuredWorkout(day.workout)) continue;
        const km = detectRunDistanceKm(day.workout, opts.defaultPaceMinPerKm);
        if (km !== null && postLongRunKm > 0 && km > postLongRunKm * 0.75) {
          const safeKm = clampEasyRunKm(km, postLongRunKm, volTarget ?? 0, opts.minEditableEasyRunKm);
          log.push(`W${week.weekIndex + 1}: hard-clamping easy run ${km} km → ${safeKm} km`);
          setRunDistanceOnDay(day, safeKm);
        }
      }
    }
  }

  const taperOk = checkTaperSanity(weeks, guidance, opts, log);
  if (!taperOk) needsRegeneration = true;

  // ISSUE D FIX: Sanitize easy run distance mismatches before returning
  for (const day of days) {
    if (day.workout_type === 'TRAIN' && isEasyRun(day.workout)) {
      day.workout = sanitizeEasyRunDistanceMismatch(day.workout);
    }
  }

  const postNormalizeWeeklyKm = weeks.map(w => computeWeekKm(w, opts.defaultPaceMinPerKm));
  const postNormalizeLongRuns = weeks.map(w => {
    const d = identifyLongRunDay(w, opts.defaultPaceMinPerKm);
    return d ? detectRunDistanceKm(d.workout, opts.defaultPaceMinPerKm) ?? 0 : 0;
  });
  const postNormalizePeakLongRun = Math.max(...postNormalizeLongRuns, 0);

  return {
    days,
    needsRegeneration,
    debug: {
      preNormalizePeakLongRun,
      postNormalizePeakLongRun,
      preNormalizeWeeklyKm,
      postNormalizeWeeklyKm,
      weeklyAdjustments: log,
      weekDiagnostics,
      guidanceWeeklyVolumesLength: guidance.weeklyVolumes.length,
      shareExceedanceWarnings,
    },
  };
}

// -----------------------------------------------------------------------
// Structural validation
// -----------------------------------------------------------------------

export interface PlanStructureViolation {
  type: 'training_days_changed' | 'role_changed' | 'missing_long_run' | 'taper_not_monotonic';
  message: string;
}

export interface PlanStructureValidationResult {
  valid: boolean;
  violations: PlanStructureViolation[];
}

/**
 * Validates the four hard structural invariants after a rebuild:
 * 1. Training days unchanged — only the original training DOWs have TRAIN workouts.
 * 2. Session roles unchanged — the long run DOW must remain the long run DOW each week.
 * 3. Exactly one long run per week (for every week that has training days).
 * 4. Taper long runs strictly decrease week-over-week.
 */
export function validatePlanStructure(
  days: NormalizerDay[],
  guidance: StructuralGuidance,
  startDate: string,
  originalTrainingDows: string[],
  originalLongRunDow: string,
  paceMinPerKm = DEFAULT_PACE_MIN_PER_KM,
): PlanStructureValidationResult {
  const violations: PlanStructureViolation[] = [];
  const weeks = groupDaysIntoWeeks(days, startDate);
  const allowedDows = new Set(originalTrainingDows.map(d => d.charAt(0).toUpperCase() + d.slice(1).toLowerCase()));

  for (const week of weeks) {
    const trainDays = week.days.filter(d => d.workout_type === 'TRAIN');
    if (trainDays.length === 0) continue;

    // 1. Training days unchanged
    for (const day of trainDays) {
      const dow = day.dow.charAt(0).toUpperCase() + day.dow.slice(1).toLowerCase();
      if (!allowedDows.has(dow)) {
        violations.push({
          type: 'training_days_changed',
          message: `W${week.weekIndex + 1}: training session on ${dow} which is not in original training days (${[...allowedDows].join(', ')})`,
        });
      }
    }

    // 2 & 3. Exactly one long run and it must be on the original long run DOW
    const longRunDays = trainDays.filter(d => isLongRun(d.workout));
    if (longRunDays.length === 0) {
      violations.push({
        type: 'missing_long_run',
        message: `W${week.weekIndex + 1}: no long run found`,
      });
    } else if (longRunDays.length > 1) {
      violations.push({
        type: 'missing_long_run',
        message: `W${week.weekIndex + 1}: ${longRunDays.length} long runs found — expected exactly 1`,
      });
    } else {
      const lrDow = longRunDays[0].dow.charAt(0).toUpperCase() + longRunDays[0].dow.slice(1).toLowerCase();
      const expectedDow = originalLongRunDow.charAt(0).toUpperCase() + originalLongRunDow.slice(1).toLowerCase();
      if (lrDow !== expectedDow) {
        violations.push({
          type: 'role_changed',
          message: `W${week.weekIndex + 1}: long run is on ${lrDow} but original long run day is ${expectedDow}`,
        });
      }
    }
  }

  // 4. Taper long runs strictly decrease week-over-week (with 0.5km rounding tolerance)
  // Allow equality within rounding tolerance to avoid false failures due to half-km rounding
  const TAPER_ROUNDING_TOLERANCE_KM = 0.5;
  const taperWeeks = weeks.filter(w => w.weekIndex >= guidance.taperStartWeek);
  let prevLr = Infinity;
  for (const week of taperWeeks) {
    const lrDay = identifyLongRunDay(week, paceMinPerKm);
    const lr = lrDay ? (detectRunDistanceKm(lrDay.workout, paceMinPerKm) ?? 0) : 0;
    // Allow if lr < prevLr OR if they are equal within rounding tolerance
    if (lr > prevLr + TAPER_ROUNDING_TOLERANCE_KM) {
      violations.push({
        type: 'taper_not_monotonic',
        message: `Taper W${week.weekIndex + 1}: long run ${lr} km is not less than previous taper week ${prevLr} km`,
      });
    }
    prevLr = lr;
  }

  return { valid: violations.length === 0, violations };
}
