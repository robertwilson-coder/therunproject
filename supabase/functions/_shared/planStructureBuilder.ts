import {
  getRaceFamilyFromDistance,
  getRaceFamilyConfig,
  computeDistanceAdjustments,
  getArchetypeModifiers,
  getTierModifiers,
  computeLongRunCapForFamily,
  computeTaperWeeksForFamily,
  getPhaseAllocations,
  getAllowedFlavoursFromConfig,
  getMaxRaceSpecificContentFromConfig,
  getQualityBlueprintPoolFromConfig,
  getMaxQualitySessionsFromConfig,
  shouldApplyPostCeilingVariety,
  analyzeLongRunTargetStatus,
  recommendArchetypeFromTargetStatus,
  computeTargetAwarePhaseAllocations,
  computeIntermediateDistanceTarget,
  getPostTargetProgressionGuidance,
  type RaceFamily,
  type RaceFamilyConfig,
  type DistanceAdjustments,
  type ArchetypeModifiers,
  type TierModifiers,
  type LongRunTargetStatus,
  type LongRunProgressionMode,
  type LongRunTargetAnalysis,
  type PostTargetProgressionRules,
} from './raceFamilyParameters.ts';

import {
  selectWeekWorkouts,
  buildRecentCategoryHistory,
  type WorkoutSelectionContext,
} from './workoutSelector.ts';

import type { WorkoutCategory } from './workoutLibrary.ts';

const RAMP_RATE = 0.06;
const DELOAD_EVERY = 4;
const DELOAD_DROP = 0.25;
const MIN_BUILD_STEP_KM = 0.5;
const DEFAULT_PACE_MIN_PER_KM = 6.0;
const MAX_DURATION_MINUTES = 150;
const SPECIFICITY_RATIO_MARATHON_LIKE = 0.75;
const LONG_RUN_VOLUME_CAP = 0.65;
const MARATHON_THRESHOLD_KM = 35;
const MAX_LONG_RUN_KM_HALF = 26;

const MIN_PLAN_WEEKS = 4;
const MAX_PLAN_WEEKS = 20;
const MICRO_PLAN_THRESHOLD_WEEKS = 6;

const MICRO_RAMP_RATE = 0.03;
const MICRO_LONG_RUN_GROWTH_CAP = 0.15;

const ESTABLISHED_RAMP_RATE = 0.05;
const ESTABLISHED_RAMP_RATE_EXTENDED_HALF = 0.055;
const ESTABLISHED_VOLUME_THRESHOLD_MARATHON = 50;
const ESTABLISHED_VOLUME_THRESHOLD_HALF = 35;
const ESTABLISHED_LONG_RUN_THRESHOLD_MARATHON = 24;
const ESTABLISHED_LONG_RUN_THRESHOLD_HALF = 16;

const ESTABLISHED_SPECIFICITY_VOLUME_MARATHON = 65;
const ESTABLISHED_SPECIFICITY_LONG_RUN_MARATHON = 28;
const ESTABLISHED_SPECIFICITY_VOLUME_HALF = 50;
const ESTABLISHED_SPECIFICITY_LONG_RUN_HALF = 18;
const ESTABLISHED_SPECIFICITY_VOLUME_10K = 40;
const ESTABLISHED_SPECIFICITY_LONG_RUN_10K = 14;
const ESTABLISHED_SPECIFICITY_VOLUME_5K = 35;
const ESTABLISHED_SPECIFICITY_LONG_RUN_5K = 12;

function round1(x: number): number {
  return Math.round(x * 10) / 10;
}

function clamp(x: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, x));
}

export type AmbitionTier = 'base' | 'performance' | 'competitive';
export type PlanArchetype = 'development' | 'established' | 'established_specificity';

// Phase assignments for established_specificity — deterministic, computed from plan structure
export type ArchetypePhase = 'aerobic_reset' | 'economy_building' | 'race_specificity' | 'taper';

export type LongRunFlavour =
  | 'easy_aerobic'
  | 'progression'
  | 'fast_finish'
  | 'mp_block'
  | 'alternating_mp_steady'
  | 'cutback'
  | 'fueling_practice';

export type LongRunCategory = 'aerobic' | 'progressive' | 'marathon_specific' | 'absorb';

export type QualitySessionBlueprint =
  | 'light_aerobic_quality'
  | 'threshold_cruise'
  | 'tempo_continuous'
  | 'progressive_tempo'
  | 'vo2_intervals'
  | 'marathon_pace_repeat'
  | 'race_pace_sharpener'
  | 'economy_strides_set';

export type SupportRunRole = 'recovery' | 'aerobic_support' | 'steady_aerobic';

export type RaceDistanceCategory = '5k' | '10k' | 'half' | 'marathon';

export type { RaceFamily } from './raceFamilyParameters.ts';

export type StimulusFamily =
  | 'aerobic_base'
  | 'threshold_development'
  | 'vo2_economy'
  | 'race_specificity_block'
  | 'absorb';

export type LongRunPurpose =
  | 'aerobic_endurance'
  | 'time_on_feet'
  | 'fat_adaptation'
  | 'pace_practice'
  | 'negative_split_execution'
  | 'race_simulation'
  | 'fueling_rehearsal'
  | 'threshold_finish'
  | 'hm_pace_segments'
  | 'mp_segments'
  | 'recovery';

export type WorkoutPurpose =
  | 'aerobic_development'
  | 'threshold_foundation'
  | 'threshold_extension'
  | 'vo2_development'
  | 'economy_speed'
  | 'race_pace_exposure'
  | 'race_pace_extension'
  | 'lactate_clearance'
  | 'sharpening'
  | 'maintenance';

export type TierSophistication = 'simple' | 'structured' | 'polished';

export interface WeekStructuralMeta {
  phase: ArchetypePhase;
  longRunFlavour: LongRunFlavour;
  qualityIntensityMultiplier: number;
  difficultyBudgetUsed: 'demanding' | 'moderate' | 'light';
  qualitySessionsThisWeek: number;
  qualitySessionBlueprint: QualitySessionBlueprint;
  supportRunRole: SupportRunRole;
  raceDistanceCategory: RaceDistanceCategory;
  raceFamily: RaceFamily;
  stimulusFamily: StimulusFamily;
  weekInPhase: number;
  totalPhaseWeeks: number;
  raceSpecificContentLevel: 0 | 1 | 2 | 3;
  secondaryQualityBlueprint?: QualitySessionBlueprint;
  longRunPurpose: LongRunPurpose;
  primaryWorkoutPurpose: WorkoutPurpose;
  secondaryWorkoutPurpose?: WorkoutPurpose;
  tierSophistication: TierSophistication;
  phaseProgressPercent: number;
  longRunTargetStatus?: LongRunTargetStatus;
  longRunProgressionMode?: LongRunProgressionMode;
  longRunTargetKm?: number;
  qualityProgressionPriority?: 'high' | 'moderate' | 'low';

  // Workout library selections
  selectedWorkoutId?: string;
  selectedSecondaryWorkoutId?: string;
  selectedLongRunWorkoutId?: string;
  selectedSupportRunWorkoutId?: string;
}

interface AmbitionMultipliers {
  volumeMultiplier: number;
  longRunMultiplier: number;
}

const AMBITION_MULTIPLIERS: Record<AmbitionTier, AmbitionMultipliers> = {
  base:        { volumeMultiplier: 1.00, longRunMultiplier: 1.00 },
  performance: { volumeMultiplier: 1.12, longRunMultiplier: 1.10 },
  competitive: { volumeMultiplier: 1.20, longRunMultiplier: 1.18 },
};

export function detectPlanArchetype(
  startingWeeklyKm: number,
  startingLongestRunKm: number,
  raceDistanceKm: number
): PlanArchetype {
  const isMarathon = raceDistanceKm >= 42;
  const isHalf = raceDistanceKm >= 21 && raceDistanceKm < 42;
  const is10K = raceDistanceKm >= 8 && raceDistanceKm < 21;

  if (isMarathon) {
    if (
      startingWeeklyKm >= ESTABLISHED_SPECIFICITY_VOLUME_MARATHON &&
      startingLongestRunKm >= ESTABLISHED_SPECIFICITY_LONG_RUN_MARATHON
    ) {
      return 'established_specificity';
    }
    if (
      startingWeeklyKm >= ESTABLISHED_VOLUME_THRESHOLD_MARATHON &&
      startingLongestRunKm >= ESTABLISHED_LONG_RUN_THRESHOLD_MARATHON
    ) {
      return 'established';
    }
  } else if (isHalf) {
    if (
      startingWeeklyKm >= ESTABLISHED_SPECIFICITY_VOLUME_HALF &&
      startingLongestRunKm >= ESTABLISHED_SPECIFICITY_LONG_RUN_HALF
    ) {
      return 'established_specificity';
    }
    if (
      startingWeeklyKm >= ESTABLISHED_VOLUME_THRESHOLD_HALF &&
      startingLongestRunKm >= ESTABLISHED_LONG_RUN_THRESHOLD_HALF
    ) {
      return 'established';
    }
  } else if (is10K) {
    if (
      startingWeeklyKm >= ESTABLISHED_SPECIFICITY_VOLUME_10K &&
      startingLongestRunKm >= ESTABLISHED_SPECIFICITY_LONG_RUN_10K
    ) {
      return 'established_specificity';
    }
  } else {
    // 5K and shorter
    if (
      startingWeeklyKm >= ESTABLISHED_SPECIFICITY_VOLUME_5K &&
      startingLongestRunKm >= ESTABLISHED_SPECIFICITY_LONG_RUN_5K
    ) {
      return 'established_specificity';
    }
  }

  return 'development';
}

export interface StructuralGuidance {
  weeklyVolumes: number[];
  longRunTargets: number[];
  cutbackWeeks: number[];
  peakWeek: number;
  taperStartWeek: number;
  peakCapped: boolean;
  ambitionTier: AmbitionTier;
  qualitySessionsPerWeek: number;
  planArchetype: PlanArchetype;
  weeklyMeta?: WeekStructuralMeta[];
  longRunTargetAnalysis?: LongRunTargetAnalysis;
  usefulLongRunTargetKm?: number;
  archetypeRecommendation?: string;
}

function isDeloadWeek(weekIndex: number): boolean {
  return (weekIndex + 1) % DELOAD_EVERY === 0;
}

function computeTaperWeeks(raceDistanceKm: number, totalWeeks: number): number {
  const family = getRaceFamilyFromDistance(raceDistanceKm);
  return computeTaperWeeksForFamily(family, totalWeeks);
}

export interface LongRunStructure {
  maxMpKmPerRun: number;
  minMpKmPerRun: number;
  maxMpFractionOfLongRun: number;
  qualitySessionsPerWeek: number;
}

export const LONG_RUN_STRUCTURE_BY_TIER: Record<AmbitionTier, LongRunStructure> = {
  base:        { maxMpKmPerRun: 6,  minMpKmPerRun: 0,  maxMpFractionOfLongRun: 0.60, qualitySessionsPerWeek: 1 },
  performance: { maxMpKmPerRun: 12, minMpKmPerRun: 8,  maxMpFractionOfLongRun: 0.60, qualitySessionsPerWeek: 2 },
  competitive: { maxMpKmPerRun: 18, minMpKmPerRun: 12, maxMpFractionOfLongRun: 0.60, qualitySessionsPerWeek: 2 },
};

export function parseRaceDistanceKm(raceDistanceStr: string): number {
  const s = raceDistanceStr.toLowerCase().trim();
  if (s.includes('half marathon') || s.includes('half')) return 21.1;
  if (s.includes('marathon')) return 42.2;
  const match = s.match(/(\d+(\.\d+)?)/);
  if (match) return parseFloat(match[1]);
  return 0;
}

export function isMarathonLikeRace(raceDistanceKm: number): boolean {
  return raceDistanceKm >= MARATHON_THRESHOLD_KM;
}

export function isEnduranceRace(raceDistanceKm: number): boolean {
  return raceDistanceKm >= 18;
}

export function getLongRunCapKm(raceDistanceKm: number, paceMinPerKm = DEFAULT_PACE_MIN_PER_KM): number {
  const family = getRaceFamilyFromDistance(raceDistanceKm);
  return computeLongRunCapForFamily(family, raceDistanceKm, paceMinPerKm);
}

export function classifyRaceDistance(raceDistanceKm: number): RaceDistanceCategory {
  if (raceDistanceKm >= MARATHON_THRESHOLD_KM) return 'marathon';
  if (raceDistanceKm >= 18) return 'half';
  if (raceDistanceKm >= 8) return '10k';
  return '5k';
}

export function classifyRaceFamily(raceDistanceKm: number): RaceFamily {
  return getRaceFamilyFromDistance(raceDistanceKm);
}

export function getTierSophistication(tier: AmbitionTier): TierSophistication {
  if (tier === 'base') return 'simple';
  if (tier === 'performance') return 'structured';
  return 'polished';
}

export function computeLongRunPurpose(
  phase: ArchetypePhase,
  tier: AmbitionTier,
  raceFamily: RaceFamily,
  flavour: LongRunFlavour,
  phaseProgress: number,
  isDeload: boolean
): LongRunPurpose {
  if (isDeload || phase === 'taper' || flavour === 'cutback') return 'recovery';

  if (phase === 'aerobic_reset') {
    if (raceFamily === 'marathon' || raceFamily === 'half') {
      return phaseProgress < 0.5 ? 'aerobic_endurance' : 'time_on_feet';
    }
    return 'aerobic_endurance';
  }

  if (phase === 'economy_building') {
    if (raceFamily === 'marathon') {
      if (flavour === 'mp_block') return 'mp_segments';
      if (flavour === 'fueling_practice') return 'fueling_rehearsal';
      if (flavour === 'fast_finish') return 'negative_split_execution';
      if (tier === 'competitive' && phaseProgress > 0.6) return 'fat_adaptation';
      return 'time_on_feet';
    }
    if (raceFamily === 'half') {
      if (flavour === 'mp_block') return 'hm_pace_segments';
      if (flavour === 'fast_finish') return 'threshold_finish';
      if (flavour === 'progression') return 'negative_split_execution';
      if (flavour === 'fueling_practice') return 'fueling_rehearsal';
      return phaseProgress < 0.5 ? 'time_on_feet' : 'pace_practice';
    }
    if (raceFamily === '10k') {
      if (flavour === 'fast_finish') return 'threshold_finish';
      if (flavour === 'progression') return 'negative_split_execution';
      return 'aerobic_endurance';
    }
    // short
    return flavour === 'progression' ? 'negative_split_execution' : 'aerobic_endurance';
  }

  // race_specificity
  if (raceFamily === 'marathon') {
    if (flavour === 'mp_block' || flavour === 'alternating_mp_steady') return 'race_simulation';
    if (flavour === 'fueling_practice') return 'fueling_rehearsal';
    if (flavour === 'fast_finish') return 'negative_split_execution';
    return tier === 'competitive' ? 'race_simulation' : 'pace_practice';
  }
  if (raceFamily === 'half') {
    if (flavour === 'mp_block') return 'race_simulation';
    if (flavour === 'fast_finish') return 'threshold_finish';
    if (flavour === 'progression') return 'negative_split_execution';
    return tier === 'competitive' ? 'hm_pace_segments' : 'pace_practice';
  }
  if (raceFamily === '10k') {
    if (flavour === 'fast_finish') return 'threshold_finish';
    return 'pace_practice';
  }
  // short
  return 'pace_practice';
}

export function computeWorkoutPurposes(
  phase: ArchetypePhase,
  tier: AmbitionTier,
  raceFamily: RaceFamily,
  phaseProgress: number,
  isDeload: boolean
): { primary: WorkoutPurpose; secondary?: WorkoutPurpose } {
  if (isDeload) return { primary: 'maintenance' };
  if (phase === 'taper') return { primary: 'sharpening' };

  if (phase === 'aerobic_reset') {
    if (tier === 'base') return { primary: 'aerobic_development' };
    if (tier === 'performance') return { primary: 'threshold_foundation' };
    return { primary: 'threshold_foundation', secondary: 'economy_speed' };
  }

  if (phase === 'economy_building') {
    if (raceFamily === 'marathon') {
      if (tier === 'base') return { primary: 'threshold_foundation' };
      if (tier === 'performance') {
        return phaseProgress < 0.5
          ? { primary: 'threshold_foundation', secondary: 'economy_speed' }
          : { primary: 'threshold_extension', secondary: 'race_pace_exposure' };
      }
      return phaseProgress < 0.4
        ? { primary: 'threshold_extension', secondary: 'economy_speed' }
        : { primary: 'race_pace_exposure', secondary: 'vo2_development' };
    }
    if (raceFamily === 'half') {
      if (tier === 'base') return { primary: 'threshold_foundation' };
      if (tier === 'performance') {
        return phaseProgress < 0.5
          ? { primary: 'threshold_foundation', secondary: 'vo2_development' }
          : { primary: 'threshold_extension', secondary: 'race_pace_exposure' };
      }
      return phaseProgress < 0.4
        ? { primary: 'threshold_extension', secondary: 'vo2_development' }
        : { primary: 'race_pace_exposure', secondary: 'lactate_clearance' };
    }
    if (raceFamily === '10k') {
      if (tier === 'base') return { primary: 'threshold_foundation' };
      if (tier === 'performance') {
        return phaseProgress < 0.5
          ? { primary: 'vo2_development', secondary: 'threshold_foundation' }
          : { primary: 'vo2_development', secondary: 'race_pace_exposure' };
      }
      return phaseProgress < 0.4
        ? { primary: 'vo2_development', secondary: 'economy_speed' }
        : { primary: 'race_pace_exposure', secondary: 'vo2_development' };
    }
    // short
    if (tier === 'base') return { primary: 'aerobic_development', secondary: 'economy_speed' };
    if (tier === 'performance') {
      return { primary: 'vo2_development', secondary: 'economy_speed' };
    }
    return { primary: 'vo2_development', secondary: 'race_pace_exposure' };
  }

  // race_specificity
  if (raceFamily === 'marathon') {
    if (tier === 'base') return { primary: 'threshold_extension' };
    if (tier === 'performance') {
      return phaseProgress < 0.5
        ? { primary: 'race_pace_exposure', secondary: 'threshold_extension' }
        : { primary: 'race_pace_extension', secondary: 'sharpening' };
    }
    return phaseProgress < 0.4
      ? { primary: 'race_pace_extension', secondary: 'lactate_clearance' }
      : { primary: 'race_pace_extension', secondary: 'sharpening' };
  }
  if (raceFamily === 'half') {
    if (tier === 'base') return { primary: 'threshold_extension' };
    if (tier === 'performance') {
      return phaseProgress < 0.5
        ? { primary: 'race_pace_exposure', secondary: 'threshold_extension' }
        : { primary: 'race_pace_extension', secondary: 'sharpening' };
    }
    return phaseProgress < 0.4
      ? { primary: 'race_pace_extension', secondary: 'vo2_development' }
      : { primary: 'race_pace_extension', secondary: 'sharpening' };
  }
  if (raceFamily === '10k') {
    if (tier === 'base') return { primary: 'threshold_extension' };
    if (tier === 'performance') {
      return phaseProgress < 0.5
        ? { primary: 'vo2_development', secondary: 'race_pace_exposure' }
        : { primary: 'race_pace_extension', secondary: 'sharpening' };
    }
    return phaseProgress < 0.4
      ? { primary: 'race_pace_extension', secondary: 'vo2_development' }
      : { primary: 'race_pace_extension', secondary: 'sharpening' };
  }
  // short
  if (tier === 'base') return { primary: 'economy_speed', secondary: 'aerobic_development' };
  if (tier === 'performance') {
    return phaseProgress < 0.5
      ? { primary: 'race_pace_exposure', secondary: 'economy_speed' }
      : { primary: 'race_pace_extension', secondary: 'sharpening' };
  }
  return phaseProgress < 0.4
    ? { primary: 'race_pace_extension', secondary: 'economy_speed' }
    : { primary: 'sharpening', secondary: 'race_pace_extension' };
}

export function computeStimulusFamily(
  phase: ArchetypePhase,
  tier: AmbitionTier,
  weekInPhase: number,
  totalPhaseWeeks: number,
  isDeload: boolean
): StimulusFamily {
  if (isDeload || phase === 'taper') return 'absorb';
  if (phase === 'aerobic_reset') {
    return tier === 'base' ? 'aerobic_base' : 'threshold_development';
  }
  if (phase === 'economy_building') {
    if (tier === 'base') return 'aerobic_base';
    const progress = totalPhaseWeeks > 1 ? weekInPhase / (totalPhaseWeeks - 1) : 1;
    if (tier === 'performance') return progress < 0.5 ? 'threshold_development' : 'vo2_economy';
    return progress < 0.4 ? 'threshold_development' : 'vo2_economy';
  }
  return 'race_specificity_block';
}

export function computeRaceSpecificContentLevel(
  phase: ArchetypePhase,
  weekInPhase: number,
  totalPhaseWeeks: number,
  raceDistanceKm: number,
  isDeload: boolean
): 0 | 1 | 2 | 3 {
  if (isDeload || phase === 'taper' || phase === 'aerobic_reset') return 0;
  const progress = totalPhaseWeeks > 1 ? weekInPhase / (totalPhaseWeeks - 1) : 1;
  if (phase === 'economy_building') {
    if (raceDistanceKm <= 10) return progress < 0.5 ? 1 : 2;
    if (raceDistanceKm <= 21.2) return progress < 0.6 ? 1 : 2;
    return progress < 0.7 ? 1 : 2;
  }
  // race_specificity
  if (raceDistanceKm <= 10) return progress < 0.5 ? 2 : 3;
  if (raceDistanceKm <= 21.2) return progress < 0.4 ? 2 : 3;
  return progress < 0.5 ? 2 : 3;
}

export function isMicroPlan(totalWeeks: number): boolean {
  return totalWeeks >= MIN_PLAN_WEEKS && totalWeeks <= MICRO_PLAN_THRESHOLD_WEEKS;
}

export function validatePlanDuration(totalWeeks: number): { valid: boolean; clampedWeeks: number; message?: string } {
  if (totalWeeks < MIN_PLAN_WEEKS) {
    return {
      valid: false,
      clampedWeeks: MIN_PLAN_WEEKS,
      message: `Plans must be at least ${MIN_PLAN_WEEKS} weeks. Your request has been adjusted.`,
    };
  }
  if (totalWeeks > MAX_PLAN_WEEKS) {
    return {
      valid: false,
      clampedWeeks: MAX_PLAN_WEEKS,
      message: `Plans are limited to ${MAX_PLAN_WEEKS} weeks to ensure effective and reliable training progression. Your request has been adjusted to ${MAX_PLAN_WEEKS} weeks.`,
    };
  }
  return { valid: true, clampedWeeks: totalWeeks };
}

export { MIN_PLAN_WEEKS, MAX_PLAN_WEEKS, MICRO_PLAN_THRESHOLD_WEEKS };

// ---------------------------------------------------------------------------
// Phase boundary computation for established_specificity archetype
// ---------------------------------------------------------------------------

export function computeArchetypePhases(
  totalWeeks: number,
  taperStartWeek: number,
  tier: AmbitionTier,
  raceDistanceKm = 42.2
): ArchetypePhase[] {
  const buildWeeks = taperStartWeek;
  const phases: ArchetypePhase[] = [];

  const family = getRaceFamilyFromDistance(raceDistanceKm);
  const allocations = getPhaseAllocations(family, tier, buildWeeks);

  const resetEnd = allocations.aerobic_reset;
  const economyEnd = resetEnd + allocations.economy_building;

  for (let i = 0; i < totalWeeks; i++) {
    if (i >= taperStartWeek) {
      phases.push('taper');
    } else if (i < resetEnd) {
      phases.push('aerobic_reset');
    } else if (i < economyEnd) {
      phases.push('economy_building');
    } else {
      phases.push('race_specificity');
    }
  }

  return phases;
}

// ---------------------------------------------------------------------------
// Long-run flavour assignment — deterministic, anti-clone enforced
// ---------------------------------------------------------------------------

const FLAVOUR_DIFFICULTY: Record<LongRunFlavour, number> = {
  easy_aerobic:          0,
  cutback:               0,
  fueling_practice:      1,
  progression:           2,
  fast_finish:           3,
  mp_block:              4,
  alternating_mp_steady: 5,
};

export function classifyFlavourCategory(flavour: LongRunFlavour): LongRunCategory {
  switch (flavour) {
    case 'easy_aerobic':
    case 'fueling_practice':
      return 'aerobic';
    case 'progression':
    case 'fast_finish':
      return 'progressive';
    case 'mp_block':
    case 'alternating_mp_steady':
      return 'marathon_specific';
    case 'cutback':
      return 'absorb';
  }
}

function getAllowedFlavoursRaw(
  phase: ArchetypePhase,
  tier: AmbitionTier,
  isDeload: boolean
): LongRunFlavour[] {
  if (isDeload || phase === 'taper') return ['cutback'];

  if (phase === 'aerobic_reset') {
    if (tier === 'competitive') return ['progression', 'fast_finish', 'easy_aerobic'];
    if (tier === 'performance') return ['easy_aerobic', 'progression', 'fueling_practice'];
    return ['easy_aerobic', 'fueling_practice', 'cutback'];
  }

  if (phase === 'economy_building') {
    if (tier === 'competitive') return ['fast_finish', 'mp_block', 'progression', 'fueling_practice'];
    if (tier === 'performance') return ['progression', 'fast_finish', 'mp_block', 'fueling_practice'];
    return ['easy_aerobic', 'progression', 'fast_finish', 'fueling_practice'];
  }

  if (tier === 'competitive') return ['mp_block', 'alternating_mp_steady', 'fast_finish', 'progression'];
  if (tier === 'performance') return ['mp_block', 'fast_finish', 'progression', 'fueling_practice'];
  return ['fast_finish', 'progression', 'fueling_practice', 'easy_aerobic'];
}

function getAllowedFlavours(
  phase: ArchetypePhase,
  tier: AmbitionTier,
  isDeload: boolean,
  raceDistanceKm = 42.2
): LongRunFlavour[] {
  if (isDeload || phase === 'taper') return ['cutback'];

  const family = getRaceFamilyFromDistance(raceDistanceKm);
  const configFlavours = getAllowedFlavoursFromConfig(family, phase, tier);

  if (configFlavours.length > 0) {
    return configFlavours;
  }

  const raw = getAllowedFlavoursRaw(phase, tier, isDeload);
  const distCat = classifyRaceDistance(raceDistanceKm);

  const filtered = raw.filter(f => {
    if (f === 'mp_block' || f === 'alternating_mp_steady') {
      if (distCat === '5k' || distCat === '10k') return false;
      if (distCat === 'half' && phase === 'aerobic_reset') return false;
    }
    if (f === 'fueling_practice') {
      if (distCat === '5k' || distCat === '10k') return false;
      if (distCat === 'half' && phase === 'aerobic_reset') return false;
    }
    return true;
  });

  return filtered.length > 0 ? filtered : raw;
}

export function assignLongRunFlavours(
  phases: ArchetypePhase[],
  deloadFlags: boolean[],
  tier: AmbitionTier,
  raceDistanceKm = 42.2
): LongRunFlavour[] {
  const flavours: LongRunFlavour[] = [];
  const rollingHistory: LongRunFlavour[] = [];
  let globalPos = 0;

  for (let i = 0; i < phases.length; i++) {
    const phase = phases[i];
    const isDeload = deloadFlags[i] ?? false;

    if (isDeload || phase === 'taper') {
      flavours.push('cutback');
      continue;
    }

    const allowed = getAllowedFlavours(phase, tier, false, raceDistanceKm);

    // Block the last 2 real flavours to prevent back-to-back repeats
    const last2 = rollingHistory.slice(-2);
    let candidates = allowed.filter(f => !last2.includes(f));
    if (candidates.length === 0) {
      // Relax to only block the immediate previous
      const last1 = rollingHistory.slice(-1);
      candidates = allowed.filter(f => !last1.includes(f));
    }
    if (candidates.length === 0) candidates = allowed;

    // Also enforce category diversity: avoid same category 2 weeks in a row
    const recentCats = rollingHistory.slice(-2).map(classifyFlavourCategory);
    if (recentCats.length >= 2 && recentCats[0] === recentCats[1] && recentCats[1] !== 'absorb') {
      const dominantCat = recentCats[1];
      const diverse = candidates.filter(f => classifyFlavourCategory(f) !== dominantCat);
      if (diverse.length > 0) candidates = diverse;
    }

    const selected = candidates[globalPos % candidates.length];
    globalPos++;
    flavours.push(selected);
    rollingHistory.push(selected);
    if (rollingHistory.length > 6) rollingHistory.shift();
  }

  return flavours;
}

// ---------------------------------------------------------------------------
// Quality intensity multiplier — 0–1 scale, progresses across phases
// ---------------------------------------------------------------------------

function computeQualityIntensityMultiplier(
  phase: ArchetypePhase,
  weekIndexInPhase: number,
  phaseLength: number,
  tier: AmbitionTier,
  isDeload: boolean
): number {
  if (isDeload || phase === 'taper') return 0.4;

  const phaseBase: Record<AmbitionTier, Record<ArchetypePhase, [number, number]>> = {
    base: {
      aerobic_reset:    [0.30, 0.40],
      economy_building: [0.40, 0.60],
      race_specificity: [0.60, 0.80],
      taper:            [0.40, 0.40],
    },
    performance: {
      aerobic_reset:    [0.35, 0.50],
      economy_building: [0.50, 0.75],
      race_specificity: [0.75, 1.00],
      taper:            [0.50, 0.50],
    },
    competitive: {
      aerobic_reset:    [0.45, 0.60],
      economy_building: [0.60, 0.85],
      race_specificity: [0.85, 1.00],
      taper:            [0.55, 0.55],
    },
  };

  const [start, end] = phaseBase[tier][phase];
  const progress = phaseLength > 1 ? weekIndexInPhase / (phaseLength - 1) : 1;
  return Math.round((start + (end - start) * progress) * 100) / 100;
}

// ---------------------------------------------------------------------------
// Difficulty budget guard
// ---------------------------------------------------------------------------

function computeDifficultyBudget(
  flavour: LongRunFlavour,
  qualityIntensityMultiplier: number,
  baseQualitySessions: number
): { qualitySessionsThisWeek: number; difficultyBudgetUsed: 'demanding' | 'moderate' | 'light'; adjustedMultiplier: number } {
  const weight = FLAVOUR_DIFFICULTY[flavour];

  if (weight >= 4) {
    return {
      qualitySessionsThisWeek: Math.max(1, baseQualitySessions - 1),
      difficultyBudgetUsed: 'demanding',
      adjustedMultiplier: Math.min(qualityIntensityMultiplier, 0.60),
    };
  }
  if (weight >= 2) {
    return {
      qualitySessionsThisWeek: baseQualitySessions,
      difficultyBudgetUsed: 'moderate',
      adjustedMultiplier: qualityIntensityMultiplier,
    };
  }
  return {
    qualitySessionsThisWeek: baseQualitySessions,
    difficultyBudgetUsed: 'light',
    adjustedMultiplier: qualityIntensityMultiplier,
  };
}

// ---------------------------------------------------------------------------
// Weekly meta computation for established_specificity archetype
// ---------------------------------------------------------------------------

function assignQualityBlueprints(
  phase: ArchetypePhase,
  tier: AmbitionTier,
  globalWeekIndex: number,
  isDeload: boolean,
  raceDistanceKm: number,
  blueprintHistory: QualitySessionBlueprint[]
): { primary: QualitySessionBlueprint; secondary: QualitySessionBlueprint | undefined } {
  const family = getRaceFamilyFromDistance(raceDistanceKm);

  if (isDeload) return { primary: 'threshold_cruise', secondary: undefined };
  if (phase === 'taper') return { primary: 'race_pace_sharpener', secondary: undefined };

  const blueprintPool = getQualityBlueprintPoolFromConfig(family, phase, tier);

  if (blueprintPool.length === 0) {
    return { primary: 'threshold_cruise', secondary: undefined };
  }

  if (blueprintPool.length === 1) {
    return { primary: blueprintPool[0], secondary: undefined };
  }

  const last3 = blueprintHistory.slice(-3);
  let candidates = blueprintPool.filter(b => !last3.includes(b));
  if (candidates.length === 0) {
    const last1 = blueprintHistory.slice(-1);
    candidates = blueprintPool.filter(b => !last1.includes(b));
  }
  if (candidates.length === 0) candidates = blueprintPool;

  const primary = candidates[globalWeekIndex % candidates.length];

  const secondaryCandidates = blueprintPool.filter(b => b !== primary);
  const secondary = secondaryCandidates.length > 0
    ? secondaryCandidates[globalWeekIndex % secondaryCandidates.length]
    : undefined;

  return { primary, secondary };
}

function assignSupportRunRole(
  phase: ArchetypePhase,
  tier: AmbitionTier,
  isDeload: boolean,
  daysPerWeek: number
): SupportRunRole {
  if (isDeload || phase === 'taper') return 'recovery';

  if (tier === 'competitive' && daysPerWeek >= 5 &&
      (phase === 'economy_building' || phase === 'race_specificity')) {
    return 'steady_aerobic';
  }

  if (tier === 'performance' && daysPerWeek >= 5 && phase === 'race_specificity') {
    return 'steady_aerobic';
  }

  return 'aerobic_support';
}

function buildEstablishedSpecificityMeta(
  totalWeeks: number,
  taperStartWeek: number,
  deloadFlags: boolean[],
  tier: AmbitionTier,
  daysPerWeek: number,
  raceDistanceKm: number
): WeekStructuralMeta[] {
  const phases = computeArchetypePhases(totalWeeks, taperStartWeek, tier, raceDistanceKm);
  const flavours = assignLongRunFlavours(phases, deloadFlags, tier, raceDistanceKm);
  const distCat = classifyRaceDistance(raceDistanceKm);
  const raceFamily = classifyRaceFamily(raceDistanceKm);
  const tierSoph = getTierSophistication(tier);

  const baseQualityPerTier: Record<AmbitionTier, number> = {
    base: 1,
    performance: 2,
    competitive: 2,
  };

  const phaseWeekCounters: Partial<Record<ArchetypePhase, number>> = {};
  const phaseLengths: Partial<Record<ArchetypePhase, number>> = {};

  for (const p of phases) {
    phaseLengths[p] = (phaseLengths[p] ?? 0) + 1;
  }

  const meta: WeekStructuralMeta[] = [];
  const blueprintHistory: QualitySessionBlueprint[] = [];

  for (let i = 0; i < totalWeeks; i++) {
    const phase = phases[i];
    const isDeload = deloadFlags[i] ?? false;
    const flavour = flavours[i];

    phaseWeekCounters[phase] = (phaseWeekCounters[phase] ?? 0) + 1;
    const weekInPhase = phaseWeekCounters[phase]! - 1;
    const totalPhaseWeeks = phaseLengths[phase]!;
    const phaseProgress = totalPhaseWeeks > 1 ? weekInPhase / (totalPhaseWeeks - 1) : 1;

    const rawMultiplier = computeQualityIntensityMultiplier(
      phase,
      weekInPhase,
      totalPhaseWeeks,
      tier,
      isDeload
    );

    const baseQuality = baseQualityPerTier[tier];
    const { qualitySessionsThisWeek, difficultyBudgetUsed, adjustedMultiplier } =
      computeDifficultyBudget(flavour, rawMultiplier, baseQuality);

    const { primary, secondary } = assignQualityBlueprints(phase, tier, i, isDeload, raceDistanceKm, blueprintHistory);
    blueprintHistory.push(primary);
    const supportRole = assignSupportRunRole(phase, tier, isDeload, daysPerWeek);
    const stimFamily = computeStimulusFamily(phase, tier, weekInPhase, totalPhaseWeeks, isDeload);
    const raceLevel = computeRaceSpecificContentLevel(phase, weekInPhase, totalPhaseWeeks, raceDistanceKm, isDeload);
    const longRunPurpose = computeLongRunPurpose(phase, tier, raceFamily, flavour, phaseProgress, isDeload);
    const workoutPurposes = computeWorkoutPurposes(phase, tier, raceFamily, phaseProgress, isDeload);

    const secondaryBlueprint = qualitySessionsThisWeek >= 2 ? secondary : undefined;

    meta.push({
      phase,
      longRunFlavour: flavour,
      qualityIntensityMultiplier: adjustedMultiplier,
      difficultyBudgetUsed,
      qualitySessionsThisWeek,
      qualitySessionBlueprint: primary,
      supportRunRole: supportRole,
      raceDistanceCategory: distCat,
      raceFamily,
      stimulusFamily: stimFamily,
      weekInPhase,
      totalPhaseWeeks,
      raceSpecificContentLevel: raceLevel,
      secondaryQualityBlueprint: secondaryBlueprint,
      longRunPurpose,
      primaryWorkoutPurpose: workoutPurposes.primary,
      secondaryWorkoutPurpose: workoutPurposes.secondary,
      tierSophistication: tierSoph,
      phaseProgressPercent: Math.round(phaseProgress * 100),
    });
  }

  return meta;
}

function buildSimplifiedMeta(
  totalWeeks: number,
  taperStartWeek: number,
  deloadFlags: boolean[],
  tier: AmbitionTier,
  daysPerWeek: number,
  raceDistanceKm: number
): WeekStructuralMeta[] {
  const buildWeeks = taperStartWeek;
  const distCat = classifyRaceDistance(raceDistanceKm);
  const raceFamily = classifyRaceFamily(raceDistanceKm);
  const tierSoph = getTierSophistication(tier);

  const allocations = getPhaseAllocations(raceFamily, tier, buildWeeks);
  const resetEnd = allocations.aerobic_reset;
  const economyEnd = resetEnd + allocations.economy_building;

  const phases: ArchetypePhase[] = [];
  for (let i = 0; i < totalWeeks; i++) {
    if (i >= taperStartWeek) phases.push('taper');
    else if (i < resetEnd) phases.push('aerobic_reset');
    else if (i < economyEnd) phases.push('economy_building');
    else phases.push('race_specificity');
  }

  const flavours = assignLongRunFlavours(phases, deloadFlags, tier, raceDistanceKm);

  const baseQualityPerTier: Record<AmbitionTier, number> = {
    base: 1,
    performance: 1,
    competitive: 2,
  };

  const phaseLengths: Partial<Record<ArchetypePhase, number>> = {};
  for (const p of phases) phaseLengths[p] = (phaseLengths[p] ?? 0) + 1;

  const phaseWeekCounters: Partial<Record<ArchetypePhase, number>> = {};
  const meta: WeekStructuralMeta[] = [];
  const blueprintHistory: QualitySessionBlueprint[] = [];

  for (let i = 0; i < totalWeeks; i++) {
    const phase = phases[i];
    const isDeload = deloadFlags[i] ?? false;
    const flavour = flavours[i];

    phaseWeekCounters[phase] = (phaseWeekCounters[phase] ?? 0) + 1;
    const weekInPhase = phaseWeekCounters[phase]! - 1;
    const totalPhaseWeeks = phaseLengths[phase]!;
    const phaseProgress = totalPhaseWeeks > 1 ? weekInPhase / (totalPhaseWeeks - 1) : 1;

    const rawMultiplier = computeQualityIntensityMultiplier(phase, weekInPhase, totalPhaseWeeks, tier, isDeload);
    const baseQuality = baseQualityPerTier[tier];
    const { qualitySessionsThisWeek, difficultyBudgetUsed, adjustedMultiplier } =
      computeDifficultyBudget(flavour, rawMultiplier, baseQuality);

    const { primary, secondary } = assignQualityBlueprints(phase, tier, i, isDeload, raceDistanceKm, blueprintHistory);
    blueprintHistory.push(primary);
    const supportRole = assignSupportRunRole(phase, tier, isDeload, daysPerWeek);
    const stimFamily = computeStimulusFamily(phase, tier, weekInPhase, totalPhaseWeeks, isDeload);
    const raceLevel = computeRaceSpecificContentLevel(phase, weekInPhase, totalPhaseWeeks, raceDistanceKm, isDeload);
    const longRunPurpose = computeLongRunPurpose(phase, tier, raceFamily, flavour, phaseProgress, isDeload);
    const workoutPurposes = computeWorkoutPurposes(phase, tier, raceFamily, phaseProgress, isDeload);

    const secondaryBlueprint = qualitySessionsThisWeek >= 2 ? secondary : undefined;

    meta.push({
      phase,
      longRunFlavour: flavour,
      qualityIntensityMultiplier: adjustedMultiplier,
      difficultyBudgetUsed,
      qualitySessionsThisWeek,
      qualitySessionBlueprint: primary,
      supportRunRole: supportRole,
      raceDistanceCategory: distCat,
      raceFamily,
      stimulusFamily: stimFamily,
      weekInPhase,
      totalPhaseWeeks,
      raceSpecificContentLevel: raceLevel,
      secondaryQualityBlueprint: secondaryBlueprint,
      longRunPurpose,
      primaryWorkoutPurpose: workoutPurposes.primary,
      secondaryWorkoutPurpose: workoutPurposes.secondary,
      tierSophistication: tierSoph,
      phaseProgressPercent: Math.round(phaseProgress * 100),
    });
  }

  return meta;
}

// ---------------------------------------------------------------------------
// Workout library attachment — calls selector for each week and attaches IDs
// ---------------------------------------------------------------------------

function attachWorkoutSelections(
  meta: WeekStructuralMeta[],
  archetype: PlanArchetype,
  totalWeeks: number
): WeekStructuralMeta[] {
  const selectionHistory: Array<{ primaryCategory: WorkoutCategory; secondaryCategory?: WorkoutCategory }> = [];

  return meta.map((m, weekIndex) => {
    const { recentPrimary, recentSecondary } = buildRecentCategoryHistory(selectionHistory, 5);

    const ctx: WorkoutSelectionContext = {
      weekIndex,
      totalWeeks,
      raceFamily: m.raceFamily,
      phase: m.phase,
      tier: m.tierSophistication === 'sophisticated' ? 'competitive' : m.tierSophistication === 'moderate' ? 'performance' : 'base',
      archetype,
      longRunFlavour: m.longRunFlavour,
      supportRunRole: m.supportRunRole,
      primaryQualityBlueprint: m.qualitySessionBlueprint,
      secondaryQualityBlueprint: m.secondaryQualityBlueprint,
      primaryWorkoutPurpose: m.primaryWorkoutPurpose,
      secondaryWorkoutPurpose: m.secondaryWorkoutPurpose,
      qualitySessionsThisWeek: m.qualitySessionsThisWeek,
      difficultyBudgetUsed: m.difficultyBudgetUsed,
      phaseProgressPercent: m.phaseProgressPercent,
      recentPrimaryCategories: recentPrimary,
      recentSecondaryCategories: recentSecondary,
    };

    const selection = selectWeekWorkouts(ctx);

    selectionHistory.push({
      primaryCategory: selection.primaryQualityWorkout.antiRepeatCategory,
      secondaryCategory: selection.secondaryQualityWorkout?.antiRepeatCategory,
    });

    return {
      ...m,
      selectedWorkoutId: selection.primaryQualityWorkoutId,
      selectedSecondaryWorkoutId: selection.secondaryQualityWorkoutId,
      selectedLongRunWorkoutId: selection.longRunWorkoutId,
      selectedSupportRunWorkoutId: selection.supportRunWorkoutId,
    };
  });
}

export function buildWeeklyMetaForArchetype(
  archetype: PlanArchetype,
  totalWeeks: number,
  taperStartWeek: number,
  deloadFlags: boolean[],
  tier: AmbitionTier,
  daysPerWeek: number,
  raceDistanceKm: number,
  targetAnalysis?: LongRunTargetAnalysis
): WeekStructuralMeta[] {
  let raw: WeekStructuralMeta[];
  if (archetype === 'established_specificity') {
    raw = buildEstablishedSpecificityMeta(totalWeeks, taperStartWeek, deloadFlags, tier, daysPerWeek, raceDistanceKm);
  } else {
    raw = buildSimplifiedMeta(totalWeeks, taperStartWeek, deloadFlags, tier, daysPerWeek, raceDistanceKm);
  }

  if (targetAnalysis) {
    raw = raw.map(m => ({
      ...m,
      longRunTargetStatus: targetAnalysis.status,
      longRunProgressionMode: targetAnalysis.progressionMode,
      longRunTargetKm: targetAnalysis.usefulTargetKm,
      qualityProgressionPriority: targetAnalysis.postTargetRules.qualitySessionImportance,
    }));
  }

  const guarded = enforceAntiCloneGuard(raw, deloadFlags);
  return attachWorkoutSelections(guarded, archetype, totalWeeks);
}

// ---------------------------------------------------------------------------
// Anti-clone guard — validates no 3-week non-deload window has identical flavours
// ---------------------------------------------------------------------------

export function enforceAntiCloneGuard(
  meta: WeekStructuralMeta[],
  deloadFlags: boolean[]
): WeekStructuralMeta[] {
  const corrected = meta.map(m => ({ ...m }));

  for (let i = 2; i < corrected.length; i++) {
    if (deloadFlags[i] || deloadFlags[i - 1] || deloadFlags[i - 2]) continue;
    if (corrected[i].phase === 'taper') continue;

    const f0 = corrected[i - 2].longRunFlavour;
    const f1 = corrected[i - 1].longRunFlavour;
    const f2 = corrected[i].longRunFlavour;

    const c0 = classifyFlavourCategory(f0);
    const c1 = classifyFlavourCategory(f1);
    const c2 = classifyFlavourCategory(f2);

    const sameFlavour3 = f0 === f1 && f1 === f2;
    const sameCategory3 = c0 === c1 && c1 === c2 && c2 !== 'absorb';

    if (sameFlavour3 || sameCategory3) {
      const phase = corrected[i].phase;
      const tier = corrected[i].qualityIntensityMultiplier > 0.7 ? 'competitive'
        : corrected[i].qualityIntensityMultiplier > 0.5 ? 'performance'
        : 'base';
      const allowed = getAllowedFlavours(phase, tier, false);
      const alternative = allowed.find(f => {
        if (f === f2) return false;
        const cat = classifyFlavourCategory(f);
        return cat !== c1;
      }) ?? allowed.find(f => f !== f2) ?? allowed[0];
      corrected[i] = { ...corrected[i], longRunFlavour: alternative };
    }
  }

  return corrected;
}

export function buildStructuralGuidance(params: {
  startingWeeklyKm: number;
  startingLongestRunKm: number;
  totalWeeks: number;
  raceDistanceKm: number;
  paceMinPerKm?: number;
  trainingFocus?: 'durability' | 'performance';
  ambitionTier?: AmbitionTier;
  daysPerWeek?: number;
  forceArchetype?: PlanArchetype;
}): StructuralGuidance {
  const {
    startingWeeklyKm,
    startingLongestRunKm,
    totalWeeks: rawTotalWeeks,
    raceDistanceKm,
    paceMinPerKm = DEFAULT_PACE_MIN_PER_KM,
    ambitionTier = 'base',
    daysPerWeek = 4,
    forceArchetype,
  } = params;

  const { clampedWeeks } = validatePlanDuration(rawTotalWeeks);
  const totalWeeks = clampedWeeks;

  const isMicro = isMicroPlan(totalWeeks);

  const raceFamily = getRaceFamilyFromDistance(raceDistanceKm);
  const longRunTargetAnalysis = analyzeLongRunTargetStatus(
    startingLongestRunKm,
    raceDistanceKm,
    raceFamily,
    paceMinPerKm
  );

  const baseArchetype = detectPlanArchetype(startingWeeklyKm, startingLongestRunKm, raceDistanceKm);
  const archetypeRec = recommendArchetypeFromTargetStatus(
    startingLongestRunKm,
    startingWeeklyKm,
    raceDistanceKm,
    totalWeeks,
    baseArchetype
  );

  const planArchetype = forceArchetype ?? archetypeRec.recommendedArchetype;
  const isEstablished = planArchetype === 'established' || planArchetype === 'established_specificity';

  const isExtendedHalf = raceDistanceKm >= 25 && raceDistanceKm < 35;
  const effectiveRampRate = isMicro
    ? MICRO_RAMP_RATE
    : isEstablished
      ? (isExtendedHalf ? ESTABLISHED_RAMP_RATE_EXTENDED_HALF : ESTABLISHED_RAMP_RATE)
      : RAMP_RATE;

  const effectiveAmbitionTier: AmbitionTier = isMicro ? 'base' : ambitionTier;
  const { volumeMultiplier, longRunMultiplier } = AMBITION_MULTIPLIERS[effectiveAmbitionTier];

  const taperWeeks = raceDistanceKm > 0 ? computeTaperWeeks(raceDistanceKm, totalWeeks) : 0;
  const buildWeeks = Math.max(1, totalWeeks - taperWeeks);

  const structuralVolumes: number[] = [];
  const actualVolumes: number[] = [];
  const deloadFlags: boolean[] = [];
  let structuralVolume = startingWeeklyKm;

  const shouldDeload = (weekIndex: number): boolean => {
    if (isMicro) return false;
    return isDeloadWeek(weekIndex);
  };

  for (let week = 0; week < buildWeeks; week++) {
    const isDeload = shouldDeload(week);

    if (isDeload) {
      structuralVolumes.push(structuralVolume);
      actualVolumes.push(round1(structuralVolume * (1 - DELOAD_DROP)));
    } else {
      structuralVolume = round1(structuralVolume * (1 + effectiveRampRate));
      structuralVolumes.push(structuralVolume);
      actualVolumes.push(structuralVolume);
    }
    deloadFlags.push(isDeload);
  }

  const baseAchievablePeakVolume = actualVolumes.length > 0
    ? Math.max(...actualVolumes)
    : structuralVolume;

  const scaledVolumes = actualVolumes.map(v => round1(v * volumeMultiplier));

  const achievablePeakVolume = scaledVolumes.length > 0
    ? Math.max(...scaledVolumes)
    : round1(structuralVolume * volumeMultiplier);

  const desiredPeakVolume = achievablePeakVolume;
  const peakCapped = volumeMultiplier > 1.0;

  const taperStartWeek = buildWeeks;
  let peakWeek = scaledVolumes.indexOf(achievablePeakVolume);
  if (peakWeek === -1) peakWeek = buildWeeks - 1;

  const TAPER_VOL_MULTS: Record<number, number[]> = {
    1: [0.65],
    2: [0.80, 0.60],
    3: [0.87, 0.72, 0.60],
  };
  const taperVolMults = TAPER_VOL_MULTS[taperWeeks] ?? TAPER_VOL_MULTS[2];

  for (let t = 0; t < taperWeeks; t++) {
    const taperVolume = round1(desiredPeakVolume * taperVolMults[t]);
    structuralVolumes.push(desiredPeakVolume);
    scaledVolumes.push(taperVolume);
    deloadFlags.push(false);
  }

  const isMarathonBuild = isMarathonLikeRace(raceDistanceKm);
  const isEndurance = isEnduranceRace(raceDistanceKm);
  const longRunCapKm = getLongRunCapKm(raceDistanceKm);

  function computeShortRaceLongRunTarget(distanceKm: number): number {
    const raceFamily = getRaceFamilyFromDistance(distanceKm);
    if (raceFamily === 'short') {
      // 5K: base formula is 2.2x race distance, but an experienced runner with a larger aerobic
      // base benefits from preserving more of it. Scale up based on their current longest run,
      // capped at 16 km (hard ceiling for a 5K-focused plan).
      const formulaTarget = distanceKm * 2.2;
      const fitnessTarget = startingLongestRunKm * 0.80;
      return Math.min(Math.max(formulaTarget, fitnessTarget), 16);
    }
    if (raceFamily === '10k') {
      // 10K: base formula is 1.6x race distance; preserve aerobic base for experienced runners.
      const formulaTarget = distanceKm * 1.6;
      const fitnessTarget = startingLongestRunKm * 0.85;
      return Math.min(Math.max(formulaTarget, fitnessTarget), 20);
    }
    // half or anything else up to marathon threshold
    return Math.min(distanceKm * 0.95, MAX_LONG_RUN_KM_HALF);
  }

  let baseSpecificityTarget: number;
  if (isMicro) {
    const maxLongRunGrowth = startingLongestRunKm * (1 + MICRO_LONG_RUN_GROWTH_CAP);
    const normalTarget = isMarathonBuild
      ? Math.min(raceDistanceKm * SPECIFICITY_RATIO_MARATHON_LIKE, longRunCapKm)
      : raceDistanceKm > 0
        ? computeShortRaceLongRunTarget(raceDistanceKm)
        : 0;
    baseSpecificityTarget = Math.min(normalTarget, maxLongRunGrowth);
  } else {
    baseSpecificityTarget = isMarathonBuild
      ? Math.min(raceDistanceKm * SPECIFICITY_RATIO_MARATHON_LIKE, longRunCapKm)
      : raceDistanceKm > 0
        ? computeShortRaceLongRunTarget(raceDistanceKm)
        : 0;
  }

  const specificityTarget = Math.min(
    baseSpecificityTarget * longRunMultiplier,
    longRunCapKm
  );

  const durationCapKm = MAX_DURATION_MINUTES / paceMinPerKm;

  const longRunTargets: number[] = [];

  const isShortRace = raceFamily === 'short' || raceFamily === '10k';

  // For short races (5K/10K) we derive the plan-internal starting long run from the target,
  // not from the runner's actual longest run. This ensures a proper build arc exists regardless
  // of whether the runner already runs longer than the target distance.
  //
  // A runner doing 20 km long runs doesn't start their 5K plan at 20 km — but we also don't
  // start them at 20 km capped to 11 km (= 0 growth), we start them at a fraction of the target
  // so there's a real build from week 1 through to peak.
  //
  // The fraction scales with plan length: longer plans start lower and build more gradually.
  // For non-short races we use the actual starting long run as before.
  let effectiveStartingLongRun: number;
  if (isShortRace && specificityTarget > 0) {
    // For short races the plan always uses a fraction of the peak target as its week-1 long run,
    // creating a genuine build arc from start to peak regardless of the runner's current LR.
    // Longer plans start at a lower fraction to allow for a more gradual build.
    const startFraction = buildWeeks >= 12 ? 0.55 : buildWeeks >= 8 ? 0.62 : 0.70;
    effectiveStartingLongRun = round1(specificityTarget * startFraction);
  } else {
    effectiveStartingLongRun = startingLongestRunKm;
  }

  for (let i = 0; i < totalWeeks; i++) {
    const isDeload = deloadFlags[i];
    const sv = structuralVolumes[i];
    const isTaper = i >= buildWeeks;

    let proposed: number;

    if (i === 0) {
      proposed = effectiveStartingLongRun;
    } else if (isTaper) {
      const peakLr = longRunTargets.length > 0
        ? Math.max(...longRunTargets.slice(0, buildWeeks))
        : effectiveStartingLongRun;
      const TAPER_LR_MULTS: Record<number, number[]> = {
        1: [0.60],
        2: [0.78, 0.55],
        3: [0.87, 0.68, 0.52],
      };
      const lrMults = TAPER_LR_MULTS[taperWeeks] ?? TAPER_LR_MULTS[2];
      const taperPos = i - buildWeeks;
      const rawLr = peakLr * lrMults[taperPos];
      const previousReference = taperPos === 0
        ? peakLr
        : longRunTargets[longRunTargets.length - 1];
      proposed = Math.min(rawLr, previousReference - 0.5);
    } else if (isDeload) {
      proposed = longRunTargets[i - 1] * (1 - DELOAD_DROP);
    } else if (specificityTarget > 0) {
      const prev = longRunTargets[i - 1];
      const totalBuildWeeksForRamp = Math.max(1, buildWeeks - 1);
      const totalDistance = specificityTarget - effectiveStartingLongRun;
      const linearStep = totalDistance / totalBuildWeeksForRamp;
      const effectiveMinStep = isMicro ? 0 : MIN_BUILD_STEP_KM;
      proposed = prev + Math.max(linearStep, effectiveMinStep);
    } else {
      const prev = longRunTargets[i - 1];
      const linearStep = prev * 0.05;
      proposed = prev + Math.max(linearStep, isMicro ? 0 : MIN_BUILD_STEP_KM);
    }

    const frequencyAwareLongRunCap = daysPerWeek <= 1 ? 1.0
      : daysPerWeek === 2 ? 0.80
      : LONG_RUN_VOLUME_CAP;

    const scaledSv = i < scaledVolumes.length ? scaledVolumes[i] : sv * volumeMultiplier;

    // For short races use specificityTarget as the hard ceiling, not the generic longRunCapKm.
    // This prevents volume-based arithmetic from pushing a 5K long run above ~12 km.
    const hardCap = isShortRace && specificityTarget > 0
      ? Math.min(longRunCapKm, specificityTarget)
      : longRunCapKm;

    const volumeBasedCeiling = Math.min(
      scaledSv * frequencyAwareLongRunCap,
      hardCap,
      durationCapKm
    );

    const ceiling = i === 0
      ? Math.max(volumeBasedCeiling, effectiveStartingLongRun)
      : volumeBasedCeiling;

    const finalValue = round1(Math.max(1, Math.min(proposed, ceiling)));
    longRunTargets.push(finalValue);
  }

  const cutbackWeeks: number[] = [];
  for (let i = 0; i < buildWeeks; i++) {
    if (deloadFlags[i]) cutbackWeeks.push(i);
  }

  const tierStructure = LONG_RUN_STRUCTURE_BY_TIER[effectiveAmbitionTier];

  const weeklyMeta = buildWeeklyMetaForArchetype(
    planArchetype,
    totalWeeks,
    taperStartWeek,
    deloadFlags,
    effectiveAmbitionTier,
    daysPerWeek,
    raceDistanceKm,
    longRunTargetAnalysis
  );

  return {
    weeklyVolumes: scaledVolumes,
    longRunTargets,
    cutbackWeeks,
    peakWeek,
    taperStartWeek,
    peakCapped,
    ambitionTier: effectiveAmbitionTier,
    qualitySessionsPerWeek: tierStructure.qualitySessionsPerWeek,
    planArchetype,
    weeklyMeta,
    longRunTargetAnalysis,
    usefulLongRunTargetKm: longRunTargetAnalysis.usefulTargetKm,
    archetypeRecommendation: archetypeRec.reason,
  };
}
