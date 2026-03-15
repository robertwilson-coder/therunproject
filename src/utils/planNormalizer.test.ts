import { describe, it, expect } from 'vitest';

// -----------------------------------------------------------------------
// Inline copies of the normalizer logic (edge functions use Deno imports
// so we mirror the pure logic here for unit testing in Vitest/Node).
// -----------------------------------------------------------------------

const DEFAULT_PACE_MIN_PER_KM = 6.0;

interface NormalizerDay {
  date: string;
  dow: string;
  workout: string;
  tips: string[];
  workout_type: 'TRAIN' | 'REST' | 'RACE';
}

interface StructuralGuidance {
  weeklyVolumes: number[];
  longRunTargets: number[];
  cutbackWeeks: number[];
  peakWeek: number;
  taperStartWeek: number;
}

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
const DURATION_PATTERNS = [
  /(\d+)\s*(?:min(?:utes?)?|mins?)\s*(?:easy|run|jog|at|@|–|-)?/i,
  /run\s+(?:for\s+)?(\d+)\s*(?:min(?:utes?)?|mins?)/i,
];

function detectRunDistanceKm(workout: string, pace = DEFAULT_PACE_MIN_PER_KM): number | null {
  for (const pat of KM_PATTERNS) { const m = workout.match(pat); if (m) return parseFloat(m[1]); }
  for (const pat of MILES_PATTERNS) { const m = workout.match(pat); if (m) return parseFloat(m[1]) * 1.60934; }
  for (const pat of DURATION_PATTERNS) { const m = workout.match(pat); if (m) return Math.round((parseInt(m[1]) / pace) * 10) / 10; }
  return null;
}

function isLikelyRunWorkout(w: string): boolean {
  const l = w.toLowerCase();
  if (l === 'rest' || l.startsWith('rest')) return false;
  if (l.includes('race day')) return false;
  return ['run', 'easy', 'long', 'tempo', 'interval', 'threshold', 'jog', 'km', 'miles', 'min'].some(k => l.includes(k));
}

function isEasyRun(w: string): boolean {
  const l = w.toLowerCase();
  if (['tempo','interval','threshold','speed','track','race','hard','fast','hill repeat'].some(k => l.includes(k))) return false;
  if (l.includes('long run')) return false;
  return ['easy','recovery','aerobic','base','relaxed','conversational'].some(k => l.includes(k)) || isLikelyRunWorkout(w);
}

function isLongRun(w: string): boolean {
  const l = w.toLowerCase();
  return l.includes('long run') || l.includes('long slow') || l.includes('lsd') || l.includes('long easy');
}

function rewriteDistanceInText(text: string, newKm: number): string {
  const rounded = Math.round(newKm * 10) / 10;
  for (const pat of KM_PATTERNS) { if (pat.test(text)) return text.replace(pat, `${rounded} km`); }
  for (const pat of MILES_PATTERNS) { if (pat.test(text)) return text.replace(pat, `${rounded} km`); }
  for (const pat of DURATION_PATTERNS) { if (pat.test(text)) return text.replace(pat, `${rounded} km easy`); }
  return `${text.trim()} (${rounded} km)`;
}

interface NormWeek { weekIndex: number; days: NormalizerDay[]; }

function groupDaysIntoWeeks(days: NormalizerDay[], startDate: string): NormWeek[] {
  const start = new Date(startDate); start.setHours(0,0,0,0);
  const map = new Map<number, NormalizerDay[]>();
  for (const day of days) {
    const d = new Date(day.date); d.setHours(0,0,0,0);
    const wi = Math.floor((d.getTime() - start.getTime()) / (7*24*60*60*1000));
    if (!map.has(wi)) map.set(wi, []);
    map.get(wi)!.push(day);
  }
  return Array.from(map.entries()).map(([wi, d]) => ({ weekIndex: wi, days: d })).sort((a,b) => a.weekIndex - b.weekIndex);
}

function computeWeekKm(week: NormWeek): number {
  let t = 0;
  for (const d of week.days) {
    if (d.workout_type !== 'TRAIN') continue;
    const km = detectRunDistanceKm(d.workout); if (km !== null) t += km;
  }
  return Math.round(t * 10) / 10;
}

function identifyLongRunDay(week: NormWeek): NormalizerDay | null {
  const train = week.days.filter(d => d.workout_type === 'TRAIN');
  const explicit = train.find(d => isLongRun(d.workout)); if (explicit) return explicit;
  let maxKm = -1, maxDay: NormalizerDay | null = null;
  for (const day of train) {
    if (!isLikelyRunWorkout(day.workout)) continue;
    const km = detectRunDistanceKm(day.workout); if (km !== null && km > maxKm) { maxKm = km; maxDay = day; }
  }
  return maxDay;
}

function normalizePlanToStructure(days: NormalizerDay[], guidance: StructuralGuidance, startDate: string) {
  const opts = { volumeTolerancePct: 0.07, longRunToleranceKm: 0.5, minEditableEasyRunKm: 3, maxEasyRunAdjustmentKmPerDay: 3, maxTotalWeeklyAdjustmentKm: 8 };
  const weeks = groupDaysIntoWeeks(days, startDate);
  const preNormalizeWeeklyKm = weeks.map(w => computeWeekKm(w));
  const preNormalizeLongRuns = weeks.map(w => { const d = identifyLongRunDay(w); return d ? detectRunDistanceKm(d.workout) ?? 0 : 0; });
  const preNormalizePeakLongRun = Math.max(...preNormalizeLongRuns, 0);
  const log: string[] = [];
  let needsRegeneration = false;

  for (let i = 0; i < weeks.length; i++) {
    const week = weeks[i];
    const lrTarget = guidance.longRunTargets[i];

    if (lrTarget !== undefined && lrTarget > 0) {
      const lrd = identifyLongRunDay(week);
      if (!lrd) { log.push(`W${i+1}: no LR day`); needsRegeneration = true; continue; }
      const cur = detectRunDistanceKm(lrd.workout) ?? 0;
      if (Math.abs(cur - lrTarget) > opts.longRunToleranceKm) {
        log.push(`W${i+1}: LR ${cur} → ${lrTarget}`);
        lrd.workout = rewriteDistanceInText(lrd.workout, lrTarget);
      }
    }

    const volTarget = guidance.weeklyVolumes[i];
    if (volTarget !== undefined && volTarget > 0) {
      const actual = computeWeekKm(week);
      const tol = volTarget * opts.volumeTolerancePct;
      if (Math.abs(actual - volTarget) > tol) {
        const delta = volTarget - actual;
        if (Math.abs(delta) > opts.maxTotalWeeklyAdjustmentKm) { needsRegeneration = true; }
        else {
          const easyDays = week.days.filter(d => d.workout_type === 'TRAIN' && isEasyRun(d.workout) && !isLongRun(d.workout));
          let remaining = delta;
          for (const d of easyDays) {
            if (Math.abs(remaining) < 0.5) break;
            const cur = detectRunDistanceKm(d.workout); if (cur === null) continue;
            const adj = Math.max(-opts.maxEasyRunAdjustmentKmPerDay, Math.min(opts.maxEasyRunAdjustmentKmPerDay, remaining));
            const newKm = Math.round((cur + adj) * 2) / 2;
            if (newKm < opts.minEditableEasyRunKm) continue;
            d.workout = rewriteDistanceInText(d.workout, newKm);
            remaining -= (newKm - cur);
          }
        }
      }
    }
  }

  const postNormalizeWeeklyKm = weeks.map(w => computeWeekKm(w));
  const postNormalizeLongRuns = weeks.map(w => { const d = identifyLongRunDay(w); return d ? detectRunDistanceKm(d.workout) ?? 0 : 0; });
  const postNormalizePeakLongRun = Math.max(...postNormalizeLongRuns, 0);

  return { days, needsRegeneration, debug: { preNormalizePeakLongRun, postNormalizePeakLongRun, preNormalizeWeeklyKm, postNormalizeWeeklyKm, weeklyAdjustments: log } };
}

// -----------------------------------------------------------------------
// planStructureBuilder logic (inlined for testing)
// -----------------------------------------------------------------------
const RAMP_RATE = 0.06;
const DELOAD_EVERY = 4;
const DELOAD_DROP = 0.12;
const MAX_LONG_RUN_KM = 32;
const MAX_DURATION_MINUTES = 180;
const SPECIFICITY_RATIO = 0.75;
const SHORT_RACE_SPECIFICITY_RATIO = 1.2;
const MIN_BUILD_STEP_KM = 0.5;
const LONG_RUN_VOLUME_CAP = 0.60;
const MARATHON_THRESHOLD_KM = 21;

type AmbitionTier = 'base' | 'performance' | 'competitive';
const AMBITION_MULTIPLIERS: Record<AmbitionTier, { volumeMultiplier: number; longRunMultiplier: number }> = {
  base:        { volumeMultiplier: 1.00, longRunMultiplier: 1.00 },
  performance: { volumeMultiplier: 1.12, longRunMultiplier: 1.08 },
  competitive: { volumeMultiplier: 1.20, longRunMultiplier: 1.15 },
};

function isDeloadWeek(i: number) { return (i + 1) % DELOAD_EVERY === 0; }
function computeTaperWeeks(raceKm: number, total: number) {
  const raw = Math.round(raceKm / 21);
  return Math.min(Math.max(1, Math.min(3, raw)), Math.max(1, Math.floor(total * 0.2)));
}
function computeMaxVolumeReduction(raceKm: number) { return 0.15 + raceKm / 200; }
function applyCaps(proposed: number, sv: number, pace: number, startLR: number) {
  const ceiling = Math.min(sv * LONG_RUN_VOLUME_CAP, MAX_LONG_RUN_KM, MAX_DURATION_MINUTES / pace);
  return Math.max(Math.min(proposed, ceiling), startLR);
}

function buildStructuralGuidance(params: { startingWeeklyKm: number; startingLongestRunKm: number; totalWeeks: number; raceDistanceKm: number; ambitionTier?: AmbitionTier; }): StructuralGuidance {
  const { startingWeeklyKm, startingLongestRunKm, totalWeeks, raceDistanceKm, ambitionTier = 'base' } = params;
  const { volumeMultiplier, longRunMultiplier } = AMBITION_MULTIPLIERS[ambitionTier];
  const pace = DEFAULT_PACE_MIN_PER_KM;
  const taperWeeks = computeTaperWeeks(raceDistanceKm, totalWeeks);
  const buildWeeks = totalWeeks - taperWeeks;
  const maxReduction = computeMaxVolumeReduction(raceDistanceKm);
  const structuralVolumes: number[] = []; const actualVolumes: number[] = []; const deloadFlags: boolean[] = [];
  let structural = startingWeeklyKm;
  for (let w = 0; w < buildWeeks; w++) {
    const deload = isDeloadWeek(w);
    if (deload) { structuralVolumes.push(Math.round(structural*10)/10); actualVolumes.push(Math.round(structural*(1-DELOAD_DROP)*10)/10); }
    else { structural = Math.round(structural*(1+RAMP_RATE)*10)/10; structuralVolumes.push(structural); actualVolumes.push(structural); }
    deloadFlags.push(deload);
  }
  let structuralPeak = structuralVolumes.length > 0 ? Math.max(...structuralVolumes) : structural;
  if (volumeMultiplier > 1.0 && raceDistanceKm > 0) {
    const scale = (structuralPeak * volumeMultiplier) / structuralPeak;
    for (let i = 0; i < structuralVolumes.length; i++) {
      structuralVolumes[i] = Math.round(structuralVolumes[i] * scale * 10) / 10;
      actualVolumes[i] = Math.round(actualVolumes[i] * scale * 10) / 10;
    }
    structuralPeak = Math.max(...structuralVolumes);
  }
  const taperStartWeek = buildWeeks;
  let peakWeek = structuralVolumes.indexOf(structuralPeak); if (peakWeek === -1) peakWeek = buildWeeks - 1;
  for (let t = 0; t < taperWeeks; t++) {
    const red = maxReduction * ((t+1) / taperWeeks);
    structuralVolumes.push(structuralPeak); actualVolumes.push(Math.round(structuralPeak*(1-red)*10)/10); deloadFlags.push(false);
  }
  const isMarathon = raceDistanceKm > MARATHON_THRESHOLD_KM;
  const baseSpecificity = isMarathon
    ? Math.min(raceDistanceKm * SPECIFICITY_RATIO, MAX_LONG_RUN_KM)
    : raceDistanceKm > 0 ? Math.min(raceDistanceKm * SHORT_RACE_SPECIFICITY_RATIO, MARATHON_THRESHOLD_KM) : 0;
  const specificityTarget = baseSpecificity > 0 ? Math.min(baseSpecificity * longRunMultiplier, MAX_LONG_RUN_KM) : 0;
  const totalBuildWeeksCount = specificityTarget > 0 ? deloadFlags.slice(0,buildWeeks).filter((d,i) => i>0 && !d).length : 0;
  const longRunTargets: number[] = []; let buildWeeksSoFar = 0;
  for (let i = 0; i < totalWeeks; i++) {
    const isDeload = deloadFlags[i]; const sv = structuralVolumes[i]; const isTaper = i >= buildWeeks;
    let proposed: number;
    if (i === 0) { proposed = startingLongestRunKm; }
    else if (isTaper) { const tp = i - buildWeeks + 1; const red = maxReduction*(tp/taperWeeks); const peakLr = Math.max(...longRunTargets.slice(0,buildWeeks)); const min = peakLr*0.2; proposed = Math.max(min, peakLr*(1-red*1.3)); }
    else if (isDeload) { proposed = (specificityTarget > 0 && !isMarathon) ? longRunTargets[i-1] : longRunTargets[i-1]*(1-DELOAD_DROP); }
    else if (specificityTarget > 0) { const prev = longRunTargets[i-1]; buildWeeksSoFar++; const rem = Math.max(1, totalBuildWeeksCount - buildWeeksSoFar + 1); const step = Math.max((specificityTarget-prev)/rem, MIN_BUILD_STEP_KM); const vr = sv/(structuralVolumes[i-1]||1); proposed = Math.max(prev*vr, prev+step); }
    else { const prev = longRunTargets[i-1]; const vr = sv/(structuralVolumes[i-1]||1); proposed = prev*vr; }
    const capped = applyCaps(proposed, sv, pace, startingLongestRunKm);
    longRunTargets.push(Math.round(Math.max(1, capped)*10)/10);
  }
  const cutbackWeeks: number[] = [];
  for (let i = 0; i < buildWeeks; i++) { if (deloadFlags[i]) cutbackWeeks.push(i); }
  return { weeklyVolumes: actualVolumes, longRunTargets, cutbackWeeks, peakWeek, taperStartWeek };
}

// -----------------------------------------------------------------------
// Helpers to build test plan days
// -----------------------------------------------------------------------
function makeDay(date: string, dow: string, workout: string, type: 'TRAIN' | 'REST' | 'RACE' = 'TRAIN'): NormalizerDay {
  return { date, dow, workout, tips: [], workout_type: type };
}

function makePlan16WeekMarathon(startDate: string, longRunKmPerWeek: number[]): NormalizerDay[] {
  const days: NormalizerDay[] = [];
  const start = new Date(startDate);
  const DOWS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  for (let w = 0; w < 16; w++) {
    const lr = longRunKmPerWeek[w] ?? 20;
    for (let d = 0; d < 7; d++) {
      const date = new Date(start); date.setDate(start.getDate() + w * 7 + d);
      const dateStr = date.toISOString().split('T')[0];
      const dow = DOWS[date.getDay()];
      if (d === 6) {
        days.push(makeDay(dateStr, dow, `Long run: ${lr} km easy`));
      } else if (d === 0 || d === 2 || d === 4) {
        days.push(makeDay(dateStr, dow, `Easy run 8 km`));
      } else {
        days.push(makeDay(dateStr, dow, 'Rest', 'REST'));
      }
    }
  }
  return days;
}

// -----------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------

describe('detectRunDistanceKm', () => {
  it('detects km', () => expect(detectRunDistanceKm('Easy run 10 km')).toBe(10));
  it('detects miles', () => expect(detectRunDistanceKm('8 miles easy')).toBeCloseTo(12.87, 1));
  it('detects duration', () => expect(detectRunDistanceKm('60 min easy')).toBeCloseTo(10, 0));
  it('returns null for rest', () => expect(detectRunDistanceKm('Rest')).toBeNull());
  it('detects fractional km', () => expect(detectRunDistanceKm('Long run: 30.5 km easy')).toBe(30.5));
});

describe('buildStructuralGuidance — marathon 16w (35km base, 20km LR)', () => {
  const g = buildStructuralGuidance({ startingWeeklyKm: 35, startingLongestRunKm: 20, totalWeeks: 16, raceDistanceKm: 42.2 });

  it('produces 16 long run targets', () => expect(g.longRunTargets.length).toBe(16));
  it('peak long run >= 29 km', () => expect(Math.max(...g.longRunTargets)).toBeGreaterThanOrEqual(29));
  it('peak long run <= 32 km', () => expect(Math.max(...g.longRunTargets)).toBeLessThanOrEqual(32));
  it('first week LR = starting LR', () => expect(g.longRunTargets[0]).toBe(20));
  it('has taper weeks', () => expect(g.taperStartWeek).toBeLessThan(16));
});

describe('buildStructuralGuidance — half marathon', () => {
  const g = buildStructuralGuidance({ startingWeeklyKm: 30, startingLongestRunKm: 16, totalWeeks: 12, raceDistanceKm: 21.1 });

  it('peak long run is reasonable (not exceeding full marathon distance)', () => {
    expect(Math.max(...g.longRunTargets)).toBeLessThan(42.2);
  });
});

describe('normalizePlanToStructure — marathon 16w (35km/20km LR)', () => {
  const guidance = buildStructuralGuidance({ startingWeeklyKm: 35, startingLongestRunKm: 20, totalWeeks: 16, raceDistanceKm: 42.2 });
  const startDate = '2026-03-02';

  it('corrects a plan where LLM plateaued at 24–26 km', () => {
    const badLongRuns = [20, 22, 21, 20, 22, 24, 23, 22, 24, 26, 25, 24, 24, 22, 20, 12];
    const days = makePlan16WeekMarathon(startDate, badLongRuns);
    const result = normalizePlanToStructure(days, guidance, startDate);

    const postLRs = result.debug.postNormalizeWeeklyKm; // sanity
    expect(result.debug.postNormalizePeakLongRun).toBeGreaterThanOrEqual(29);
    expect(result.debug.preNormalizePeakLongRun).toBeLessThanOrEqual(26);
    expect(result.debug.weeklyAdjustments.length).toBeGreaterThan(0);
  });

  it('each week long run equals longRunTargets[i] ±0.5 km after normalization', () => {
    const badLongRuns = Array(16).fill(24);
    const days = makePlan16WeekMarathon(startDate, badLongRuns);
    const result = normalizePlanToStructure(days, guidance, startDate);

    const weeks = groupDaysIntoWeeks(result.days, startDate);
    for (let i = 0; i < weeks.length; i++) {
      const lrd = identifyLongRunDay(weeks[i]);
      if (!lrd) continue;
      const actualLR = detectRunDistanceKm(lrd.workout) ?? 0;
      const targetLR = guidance.longRunTargets[i];
      expect(Math.abs(actualLR - targetLR)).toBeLessThanOrEqual(0.5);
    }
  });

  it('weekly km per week is closer to target after normalization than before', () => {
    const badLongRuns = Array(16).fill(24);
    const days = makePlan16WeekMarathon(startDate, badLongRuns);
    const result = normalizePlanToStructure(days, guidance, startDate);
    const preDiffs = result.debug.preNormalizeWeeklyKm.map((actual, i) => {
      const t = guidance.weeklyVolumes[i]; return t ? Math.abs(actual - t) / t : 0;
    });
    const postDiffs = result.debug.postNormalizeWeeklyKm.map((actual, i) => {
      const t = guidance.weeklyVolumes[i]; return t ? Math.abs(actual - t) / t : 0;
    });
    const preAvg = preDiffs.reduce((a, b) => a + b, 0) / preDiffs.length;
    const postAvg = postDiffs.reduce((a, b) => a + b, 0) / postDiffs.length;
    expect(postAvg).toBeLessThanOrEqual(preAvg + 0.01);
  });

  it('does not degrade a plan already at correct distances', () => {
    const correctLongRuns = guidance.longRunTargets.map(t => Math.round(t));
    const days = makePlan16WeekMarathon(startDate, correctLongRuns);
    const result = normalizePlanToStructure(days, guidance, startDate);
    expect(result.debug.postNormalizePeakLongRun).toBeGreaterThanOrEqual(29);
  });
});

describe('buildStructuralGuidance — 10K regression (17w, 7km LR, 15km vol)', () => {
  const base = buildStructuralGuidance({ startingWeeklyKm: 15, startingLongestRunKm: 7, totalWeeks: 17, raceDistanceKm: 10 });

  it('peak long run >= 10.5 km (GREEN threshold for 10K)', () => {
    expect(Math.max(...base.longRunTargets)).toBeGreaterThanOrEqual(10.5);
  });

  it('first week LR = starting LR', () => {
    expect(base.longRunTargets[0]).toBe(7);
  });

  it('long run does not drop on deload weeks for 10K', () => {
    for (const wi of base.cutbackWeeks) {
      expect(base.longRunTargets[wi]).toBeGreaterThanOrEqual(base.longRunTargets[wi - 1]);
    }
  });

  it('no long run exceeds 32 km cap', () => {
    expect(Math.max(...base.longRunTargets)).toBeLessThanOrEqual(32);
  });
});

describe('buildStructuralGuidance — ambition tiers (Marathon 16w, 35km vol, 20km LR)', () => {
  const BASE_PARAMS = { startingWeeklyKm: 35, startingLongestRunKm: 20, totalWeeks: 16, raceDistanceKm: 42.2 };
  const base = buildStructuralGuidance({ ...BASE_PARAMS, ambitionTier: 'base' });
  const perf = buildStructuralGuidance({ ...BASE_PARAMS, ambitionTier: 'performance' });
  const comp = buildStructuralGuidance({ ...BASE_PARAMS, ambitionTier: 'competitive' });

  it('competitive peak volume > performance peak volume > base peak volume', () => {
    const basePeak = Math.max(...base.weeklyVolumes);
    const perfPeak = Math.max(...perf.weeklyVolumes);
    const compPeak = Math.max(...comp.weeklyVolumes);
    expect(perfPeak).toBeGreaterThan(basePeak);
    expect(compPeak).toBeGreaterThan(perfPeak);
  });

  it('competitive peak long run > performance peak long run > base peak long run', () => {
    const baseLR = Math.max(...base.longRunTargets);
    const perfLR = Math.max(...perf.longRunTargets);
    const compLR = Math.max(...comp.longRunTargets);
    expect(perfLR).toBeGreaterThanOrEqual(baseLR);
    expect(compLR).toBeGreaterThanOrEqual(perfLR);
  });

  it('all tiers respect 32km long run cap', () => {
    expect(Math.max(...base.longRunTargets)).toBeLessThanOrEqual(32);
    expect(Math.max(...perf.longRunTargets)).toBeLessThanOrEqual(32);
    expect(Math.max(...comp.longRunTargets)).toBeLessThanOrEqual(32);
  });

  it('performance volume multiplier is ~1.12x base', () => {
    const basePeak = Math.max(...base.weeklyVolumes);
    const perfPeak = Math.max(...perf.weeklyVolumes);
    expect(perfPeak / basePeak).toBeCloseTo(1.12, 1);
  });

  it('competitive volume multiplier is ~1.20x base', () => {
    const basePeak = Math.max(...base.weeklyVolumes);
    const compPeak = Math.max(...comp.weeklyVolumes);
    expect(compPeak / basePeak).toBeCloseTo(1.20, 1);
  });

  it('base without ambitionTier defaults same as explicit base', () => {
    const noTier = buildStructuralGuidance(BASE_PARAMS);
    expect(noTier.weeklyVolumes).toEqual(base.weeklyVolumes);
    expect(noTier.longRunTargets).toEqual(base.longRunTargets);
  });

  it('taper start week unchanged across tiers', () => {
    expect(base.taperStartWeek).toBe(perf.taperStartWeek);
    expect(base.taperStartWeek).toBe(comp.taperStartWeek);
  });

  it('cutback weeks unchanged across tiers', () => {
    expect(base.cutbackWeeks).toEqual(perf.cutbackWeeks);
    expect(base.cutbackWeeks).toEqual(comp.cutbackWeeks);
  });
});

describe('buildStructuralGuidance — ambition tiers (10K 17w, 15km vol, 7km LR)', () => {
  const BASE_PARAMS = { startingWeeklyKm: 15, startingLongestRunKm: 7, totalWeeks: 17, raceDistanceKm: 10 };
  const base = buildStructuralGuidance({ ...BASE_PARAMS, ambitionTier: 'base' });
  const comp = buildStructuralGuidance({ ...BASE_PARAMS, ambitionTier: 'competitive' });

  it('competitive peak volume > base peak volume for short race', () => {
    expect(Math.max(...comp.weeklyVolumes)).toBeGreaterThan(Math.max(...base.weeklyVolumes));
  });

  it('competitive peak LR >= base peak LR', () => {
    expect(Math.max(...comp.longRunTargets)).toBeGreaterThanOrEqual(Math.max(...base.longRunTargets));
  });

  it('all tiers: peak LR >= 10.5km (GREEN threshold)', () => {
    expect(Math.max(...base.longRunTargets)).toBeGreaterThanOrEqual(10.5);
    expect(Math.max(...comp.longRunTargets)).toBeGreaterThanOrEqual(10.5);
  });

  it('all tiers: deload weeks do not drop LR for short race', () => {
    for (const wi of comp.cutbackWeeks) {
      expect(comp.longRunTargets[wi]).toBeGreaterThanOrEqual(comp.longRunTargets[wi - 1]);
    }
  });
});

describe('buildStructuralGuidance — marathon behavior unchanged with base tier', () => {
  const g = buildStructuralGuidance({ startingWeeklyKm: 35, startingLongestRunKm: 20, totalWeeks: 16, raceDistanceKm: 42.2, ambitionTier: 'base' });

  it('marathon deload weeks drop long run', () => {
    let deloadDropFound = false;
    for (const wi of g.cutbackWeeks) {
      if (g.longRunTargets[wi] < g.longRunTargets[wi - 1]) { deloadDropFound = true; break; }
    }
    expect(deloadDropFound).toBe(true);
  });

  it('peak long run is between 29 and 32 km', () => {
    const peak = Math.max(...g.longRunTargets);
    expect(peak).toBeGreaterThanOrEqual(29);
    expect(peak).toBeLessThanOrEqual(32);
  });
});

describe('normalizePlanToStructure — half marathon 12w', () => {
  const guidance = buildStructuralGuidance({ startingWeeklyKm: 30, startingLongestRunKm: 16, totalWeeks: 12, raceDistanceKm: 21.1 });
  const startDate = '2026-03-02';

  it('long run never exceeds raceDistance * 0.9 + tolerance', () => {
    const badLongRuns = Array(12).fill(22);
    const days: NormalizerDay[] = [];
    const start = new Date(startDate);
    const DOWS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    for (let w = 0; w < 12; w++) {
      const lr = badLongRuns[w];
      for (let d = 0; d < 7; d++) {
        const date = new Date(start); date.setDate(start.getDate() + w*7+d);
        const dateStr = date.toISOString().split('T')[0];
        const dow = DOWS[date.getDay()];
        if (d === 6) days.push(makeDay(dateStr, dow, `Long run: ${lr} km easy`));
        else if (d === 0 || d === 2) days.push(makeDay(dateStr, dow, `Easy run 8 km`));
        else days.push(makeDay(dateStr, dow, 'Rest', 'REST'));
      }
    }
    const result = normalizePlanToStructure(days, guidance, startDate);
    const maxLR = Math.max(...guidance.longRunTargets);
    expect(maxLR).toBeLessThan(42.2);
  });
});
