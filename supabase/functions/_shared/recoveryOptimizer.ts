/**
 * recoveryOptimizer.ts
 *
 * Deterministic optimizer for recovery-week rebuilds.
 * Jointly optimizes weekly volume (V), long run (L), and quality load (Q)
 * while keeping training days fixed and eliminating "intent_blocked" failures
 * caused by hard long-run ratio clipping.
 *
 * Design principles:
 * - Deterministic: same input => same output (no randomness)
 * - Hard constraints: 6% ramp cap, taper monotonicity, max LR (32 km)
 * - Soft constraints: long-run share (L <= 0.60 * V) is a penalty, not a blocker
 * - Objective: minimize deviation from base plan while satisfying hard constraints
 */

import { logger } from './logger.ts';

const MAX_ITERATIONS = 200;
const STEP_SIZE = 0.5;
const CONVERGENCE_EPSILON = 0.001;
const MAX_RAMP_RATE = 1.06;
const MAX_LONG_RUN_KM = 32;
const LONG_RUN_SHARE_TARGET = 0.60;

const W_VOLUME = 1.0;
const W_LONG_RUN = 2.0;
const W_QUALITY = 0.5;
const W_SHARE_PENALTY = 3.0;
const W_SMOOTHNESS_V = 0.3;
const W_SMOOTHNESS_L = 0.3;

export interface OptimizerInput {
  Vbase: number[];
  Lbase: number[];
  Qbase: number[];
  recoveryWeekIndex: number;
  recoveryVolumeRatio: number;
  recoveryLongRunRatio: number;
  taperStartWeek: number;
  taperFrozen: boolean;
}

export interface OptimizerOutput {
  V: number[];
  L: number[];
  Q: number[];
  summary: {
    iterations: number;
    finalCost: number;
    maxShareExceedance: number;
    maxRamp: number;
    peakV: number;
    peakL: number;
    converged: boolean;
  };
}

function round1(x: number): number {
  return Math.round(x * 10) / 10;
}

function clamp(x: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, x));
}

function computeCost(
  V: number[],
  L: number[],
  Q: number[],
  Vbase: number[],
  Lbase: number[],
  Qbase: number[]
): number {
  let cost = 0;
  const n = V.length;

  for (let i = 0; i < n; i++) {
    cost += W_VOLUME * Math.pow(V[i] - Vbase[i], 2);
    cost += W_LONG_RUN * Math.pow(L[i] - Lbase[i], 2);
    cost += W_QUALITY * Math.pow(Q[i] - Qbase[i], 2);

    const shareExceedance = Math.max(0, L[i] - LONG_RUN_SHARE_TARGET * V[i]);
    cost += W_SHARE_PENALTY * Math.pow(shareExceedance, 2);
  }

  for (let i = 0; i < n - 1; i++) {
    cost += W_SMOOTHNESS_V * Math.pow(V[i + 1] - V[i], 2);
    cost += W_SMOOTHNESS_L * Math.pow(L[i + 1] - L[i], 2);
  }

  return cost;
}

function computeGradient(
  V: number[],
  L: number[],
  Q: number[],
  Vbase: number[],
  Lbase: number[],
  Qbase: number[]
): { gradV: number[]; gradL: number[]; gradQ: number[] } {
  const n = V.length;
  const gradV = new Array(n).fill(0);
  const gradL = new Array(n).fill(0);
  const gradQ = new Array(n).fill(0);

  for (let i = 0; i < n; i++) {
    gradV[i] += 2 * W_VOLUME * (V[i] - Vbase[i]);
    gradL[i] += 2 * W_LONG_RUN * (L[i] - Lbase[i]);
    gradQ[i] += 2 * W_QUALITY * (Q[i] - Qbase[i]);

    const shareExceedance = L[i] - LONG_RUN_SHARE_TARGET * V[i];
    if (shareExceedance > 0) {
      gradV[i] += 2 * W_SHARE_PENALTY * shareExceedance * (-LONG_RUN_SHARE_TARGET);
      gradL[i] += 2 * W_SHARE_PENALTY * shareExceedance;
    }
  }

  for (let i = 0; i < n - 1; i++) {
    gradV[i] += 2 * W_SMOOTHNESS_V * (V[i] - V[i + 1]);
    gradV[i + 1] += 2 * W_SMOOTHNESS_V * (V[i + 1] - V[i]);
    gradL[i] += 2 * W_SMOOTHNESS_L * (L[i] - L[i + 1]);
    gradL[i + 1] += 2 * W_SMOOTHNESS_L * (L[i + 1] - L[i]);
  }

  return { gradV, gradL, gradQ };
}

function projectConstraints(
  V: number[],
  L: number[],
  Q: number[],
  Vbase: number[],
  Lbase: number[],
  input: OptimizerInput
): void {
  const n = V.length;
  const { recoveryWeekIndex, taperStartWeek, taperFrozen } = input;

  for (let i = 0; i < n; i++) {
    V[i] = Math.max(5, V[i]);
    L[i] = Math.max(1, L[i]);
    Q[i] = Math.max(0, Q[i]);

    L[i] = Math.min(L[i], MAX_LONG_RUN_KM);
    L[i] = Math.min(L[i], V[i]);
  }

  for (let i = 1; i < n; i++) {
    if (taperFrozen && i >= taperStartWeek) continue;
    if (i === recoveryWeekIndex) continue;

    const maxVFromPrev = V[i - 1] * MAX_RAMP_RATE;
    if (V[i] > maxVFromPrev) {
      V[i] = maxVFromPrev;
    }

    const maxLFromPrev = L[i - 1] * MAX_RAMP_RATE;
    if (L[i] > maxLFromPrev) {
      L[i] = maxLFromPrev;
    }
  }

  if (!taperFrozen && taperStartWeek < n) {
    for (let i = taperStartWeek + 1; i < n; i++) {
      if (V[i] > V[i - 1]) {
        V[i] = V[i - 1] * 0.95;
      }
      if (L[i] >= L[i - 1]) {
        L[i] = L[i - 1] * 0.85;
      }
    }
  }

  for (let i = 0; i < n; i++) {
    if (Vbase[i] > 0) {
      V[i] = Math.min(V[i], Vbase[i]);
    }
    if (Lbase[i] > 0) {
      L[i] = Math.min(L[i], Lbase[i]);
    }
  }
}

export function runRecoveryOptimizer(input: OptimizerInput): OptimizerOutput {
  const { Vbase, Lbase, Qbase, recoveryWeekIndex, recoveryVolumeRatio, recoveryLongRunRatio } = input;
  const n = Vbase.length;

  if (n === 0) {
    return {
      V: [],
      L: [],
      Q: [],
      summary: {
        iterations: 0,
        finalCost: 0,
        maxShareExceedance: 0,
        maxRamp: 0,
        peakV: 0,
        peakL: 0,
        converged: true,
      },
    };
  }

  const V = [...Vbase];
  const L = [...Lbase];
  const Q = [...Qbase];

  if (recoveryWeekIndex >= 0 && recoveryWeekIndex < n) {
    const baseV = recoveryWeekIndex > 0 ? Vbase[recoveryWeekIndex - 1] : Vbase[recoveryWeekIndex];
    const baseL = recoveryWeekIndex > 0 ? Lbase[recoveryWeekIndex - 1] : Lbase[recoveryWeekIndex];
    V[recoveryWeekIndex] = round1(baseV * recoveryVolumeRatio);
    L[recoveryWeekIndex] = round1(baseL * recoveryLongRunRatio);
    Q[recoveryWeekIndex] = 0;

    if (recoveryWeekIndex + 1 < n) {
      V[recoveryWeekIndex + 1] = round1(V[recoveryWeekIndex] * MAX_RAMP_RATE);
      L[recoveryWeekIndex + 1] = round1(L[recoveryWeekIndex] * MAX_RAMP_RATE);
    }
  }

  projectConstraints(V, L, Q, Vbase, Lbase, input);

  let prevCost = computeCost(V, L, Q, Vbase, Lbase, Qbase);
  let iterations = 0;
  let converged = false;

  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    iterations = iter + 1;

    const { gradV, gradL, gradQ } = computeGradient(V, L, Q, Vbase, Lbase, Qbase);

    for (let i = 0; i < n; i++) {
      V[i] -= STEP_SIZE * gradV[i];
      L[i] -= STEP_SIZE * gradL[i];
      Q[i] -= STEP_SIZE * gradQ[i];
    }

    projectConstraints(V, L, Q, Vbase, Lbase, input);

    const cost = computeCost(V, L, Q, Vbase, Lbase, Qbase);
    const improvement = prevCost - cost;

    if (improvement < CONVERGENCE_EPSILON && improvement >= 0) {
      converged = true;
      break;
    }

    prevCost = cost;
  }

  for (let i = 0; i < n; i++) {
    V[i] = round1(V[i]);
    L[i] = round1(L[i]);
    Q[i] = round1(Q[i]);
  }

  let maxShareExceedance = 0;
  for (let i = 0; i < n; i++) {
    const shareExceedance = L[i] - LONG_RUN_SHARE_TARGET * V[i];
    if (shareExceedance > maxShareExceedance) {
      maxShareExceedance = shareExceedance;
    }
  }

  let maxRamp = 0;
  for (let i = 1; i < n; i++) {
    const ramp = V[i - 1] > 0 ? V[i] / V[i - 1] : 1;
    if (ramp > maxRamp) maxRamp = ramp;
  }

  const peakV = Math.max(...V);
  const peakL = Math.max(...L);
  const finalCost = computeCost(V, L, Q, Vbase, Lbase, Qbase);

  logger.info('[RecoveryOptimizer] Optimization complete', {
    iterations,
    finalCost: round1(finalCost),
    maxShareExceedance: round1(maxShareExceedance),
    maxRamp: round1(maxRamp * 100) / 100,
    peakV: round1(peakV),
    peakL: round1(peakL),
    converged,
    inputWeeks: n,
    recoveryWeekIndex,
  });

  return {
    V,
    L,
    Q,
    summary: {
      iterations,
      finalCost: round1(finalCost),
      maxShareExceedance: round1(maxShareExceedance),
      maxRamp: round1(maxRamp * 100) / 100,
      peakV: round1(peakV),
      peakL: round1(peakL),
      converged,
    },
  };
}

export function buildOptimizerInputFromRebuildContext(params: {
  originalWeeklyVolumes: number[];
  originalLongRunTargets: number[];
  recoveryWeekIndex: number;
  stableBaselineWeeklyKm: number;
  baselineLongRunKm: number;
  taperStartWeek: number;
  taperFrozen: boolean;
}): OptimizerInput {
  const {
    originalWeeklyVolumes,
    originalLongRunTargets,
    recoveryWeekIndex,
    taperStartWeek,
    taperFrozen,
  } = params;

  const n = originalWeeklyVolumes.length;
  const Qbase = new Array(n).fill(0);

  for (let i = 0; i < n; i++) {
    if (i === recoveryWeekIndex) {
      Qbase[i] = 0;
    } else if (i >= taperStartWeek) {
      Qbase[i] = 0.5;
    } else {
      Qbase[i] = 1;
    }
  }

  return {
    Vbase: [...originalWeeklyVolumes],
    Lbase: [...originalLongRunTargets],
    Qbase,
    recoveryWeekIndex,
    recoveryVolumeRatio: 0.82,
    recoveryLongRunRatio: 0.75,
    taperStartWeek,
    taperFrozen,
  };
}
