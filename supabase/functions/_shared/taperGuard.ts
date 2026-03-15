/**
 * Taper Guard
 *
 * Hard backend gate enforcing taper protection invariants.
 * Source of truth: race_date on the training plan.
 * Taper window: taper_start = race_date - (taper_weeks * 7 days)
 *
 * Invariants enforced:
 * 1. No structural rebuilds (insert_recovery_week) once inside taper.
 * 2. Recovery week insertion is blocked if it leaves fewer than 3 build weeks before taper start.
 */

const MIN_BUILD_WEEKS_BEFORE_TAPER = 3;

export interface TaperGuardResult {
  allowed: boolean;
  reason: string | null;
}

/**
 * Compute taper start date ISO string from race_date and taper_weeks.
 * Returns null if race_date is not set.
 * Uses UTC noon parsing for stable cross-environment date math.
 */
export function computeTaperStartISO(raceDateISO: string | null, taperWeeks: number): string | null {
  if (!raceDateISO) return null;
  const raceDate = new Date(raceDateISO + 'T12:00:00Z');
  if (isNaN(raceDate.getTime())) return null;
  const taperStart = new Date(raceDate);
  taperStart.setUTCDate(taperStart.getUTCDate() - taperWeeks * 7);
  return taperStart.toISOString().split('T')[0];
}

/**
 * Derive taper_weeks from race distance using the same formula as the training engine.
 * raceDistanceKm=42.2 → 2 weeks, 21.1 → 1 week, clamped 1–3.
 */
export function deriveTaperWeeks(raceDistanceKm: number, totalWeeks: number): number {
  const raw = Math.round(raceDistanceKm / 21);
  const clamped = Math.max(1, Math.min(3, raw));
  const maxByDuration = Math.max(1, Math.floor(totalWeeks * 0.2));
  return Math.min(clamped, maxByDuration);
}

/**
 * Guard: block structural rebuilds (insert_recovery_week / suggest_pause) if today is inside the taper window.
 */
export function guardStructuralRebuildInTaper(
  todayISO: string,
  taperStartISO: string | null
): TaperGuardResult {
  if (!taperStartISO) {
    return { allowed: true, reason: null };
  }

  if (todayISO >= taperStartISO) {
    return {
      allowed: false,
      reason: `Structural plan changes are not permitted during the taper period (taper started ${taperStartISO}). Focus on your race preparation.`,
    };
  }

  return { allowed: true, reason: null };
}

/**
 * Guard: block recovery week insertion if it would leave fewer than MIN_BUILD_WEEKS_BEFORE_TAPER
 * build weeks remaining before taper start.
 *
 * currentWeekStartISO: the Monday of the week where the recovery week would be inserted.
 */
export function guardRecoveryInsertionLeavesEnoughBuild(
  currentWeekStartISO: string,
  taperStartISO: string | null
): TaperGuardResult {
  if (!taperStartISO) {
    return { allowed: true, reason: null };
  }

  const insertionDate = new Date(currentWeekStartISO);
  const taperDate = new Date(taperStartISO);

  const msPerWeek = 7 * 24 * 60 * 60 * 1000;
  const weeksAfterInsertion = Math.floor((taperDate.getTime() - insertionDate.getTime()) / msPerWeek) - 1;

  if (weeksAfterInsertion < MIN_BUILD_WEEKS_BEFORE_TAPER) {
    return {
      allowed: false,
      reason: `Inserting a recovery week here would leave only ${weeksAfterInsertion} build week(s) before taper. A minimum of ${MIN_BUILD_WEEKS_BEFORE_TAPER} build weeks is required. Consider a pause instead.`,
    };
  }

  return { allowed: true, reason: null };
}
