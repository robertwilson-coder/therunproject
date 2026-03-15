import type {
  AmbitionTier,
  PlanArchetype,
  LongRunFlavour,
  QualitySessionBlueprint,
  ArchetypePhase,
} from './planStructureBuilder.ts';

export type RaceFamily = 'short' | '10k' | 'half' | 'marathon';

export type LongRunTargetStatus = 'below' | 'near' | 'above';
export type LongRunProgressionMode = 'build' | 'mixed' | 'specificity_led';

export interface LongRunTargetZone {
  usefulMinKm: number;
  usefulMaxKm: number;
  hardCapKm: number;
  hardCapMinutes: number;
  ratioToRaceDistance: { min: number; max: number };
  importanceWeight: number;
  nearThresholdPercent: number;
}

export interface PostTargetProgressionRules {
  primaryLevers: string[];
  secondaryLevers: string[];
  longRunRole: 'primary_value' | 'supporting' | 'maintenance';
  flavourImportance: 'high' | 'moderate' | 'low';
  qualitySessionImportance: 'high' | 'moderate' | 'low';
}

export interface LongRunParameters {
  capDistanceKm: number;
  capTimeMinutes: number;
  targetRatioToRaceDistance: number;
  maxShareOfWeeklyVolume: number;
  targetZone: LongRunTargetZone;
  postTargetProgression: PostTargetProgressionRules;
  flavourPoolByTierAndPhase: Record<AmbitionTier, Record<ArchetypePhase, LongRunFlavour[]>>;
  maxRaceSpecificContentByTierAndPhase: Record<AmbitionTier, Record<ArchetypePhase, 0 | 1 | 2 | 3>>;
}

export interface WeeklyVolumeParameters {
  peakVolumeMultiplierByArchetype: Record<PlanArchetype, number>;
  maxWeeklyGrowthRate: number;
  plateauThresholdWeeks: number;
  ceilingHandling: 'maintain' | 'quality_rotation' | 'variety_injection';
}

export interface QualitySessionParameters {
  primaryStimulusPriorities: string[];
  blueprintPoolByPhaseAndTier: Record<ArchetypePhase, Record<AmbitionTier, QualitySessionBlueprint[]>>;
  maxQualitySessionsPerWeek: Record<AmbitionTier, number>;
  minDaysBetweenHardSessions: number;
  sophisticationCeiling: Record<AmbitionTier, 'simple' | 'structured' | 'polished'>;
}

export interface PhaseParameters {
  defaultPhaseFractions: Record<ArchetypePhase, number>;
  phaseEmphasis: {
    longRunDevelopment: number;
    thresholdDevelopment: number;
    racePaceWork: number;
    economyWork: number;
    sharpening: number;
  };
  taperWeeksDefault: number;
  taperVolumeMultipliers: number[];
}

export interface DifficultyBudgetParameters {
  maxWeeklyStressUnits: Record<AmbitionTier, number>;
  longRunStressCost: Record<LongRunFlavour, number>;
  qualitySessionStressCost: Record<QualitySessionBlueprint, number>;
  maxHardStimuliPerWeek: Record<AmbitionTier, number>;
}

export interface AntiBoredomParameters {
  postLongRunCeilingStrategy: 'flavour_rotation' | 'purpose_variation' | 'content_progression';
  postVolumeCeilingStrategy: 'quality_escalation' | 'stimulus_rotation' | 'specificity_deepening';
  stimulusFamilyRotation: string[];
  antiCloneWindowWeeks: number;
  minDistinctFlavoursInWindow: number;
}

export interface RaceFamilyConfig {
  family: RaceFamily;
  distanceRangeKm: { min: number; max: number };
  longRun: LongRunParameters;
  weeklyVolume: WeeklyVolumeParameters;
  qualitySession: QualitySessionParameters;
  phase: PhaseParameters;
  difficultyBudget: DifficultyBudgetParameters;
  antiBoredom: AntiBoredomParameters;
  coachingPhilosophy: string;
}

const SHORT_FAMILY_CONFIG: RaceFamilyConfig = {
  family: 'short',
  distanceRangeKm: { min: 0, max: 7.99 },
  longRun: {
    capDistanceKm: 16,
    capTimeMinutes: 100,
    targetRatioToRaceDistance: 2.5,
    maxShareOfWeeklyVolume: 0.40,
    targetZone: {
      usefulMinKm: 10,
      usefulMaxKm: 14,
      hardCapKm: 16,
      hardCapMinutes: 100,
      ratioToRaceDistance: { min: 2.0, max: 3.0 },
      importanceWeight: 0.15,
      nearThresholdPercent: 0.85,
    },
    postTargetProgression: {
      primaryLevers: ['workout_identity', 'economy_work', 'speed_support', 'sharpening'],
      secondaryLevers: ['threshold_development', 'vo2_development'],
      longRunRole: 'maintenance',
      flavourImportance: 'low',
      qualitySessionImportance: 'high',
    },
    flavourPoolByTierAndPhase: {
      base: {
        aerobic_reset: ['easy_aerobic', 'cutback'],
        economy_building: ['easy_aerobic', 'progression'],
        race_specificity: ['progression', 'fast_finish'],
        taper: ['cutback'],
      },
      performance: {
        aerobic_reset: ['easy_aerobic', 'progression'],
        economy_building: ['progression', 'fast_finish'],
        race_specificity: ['fast_finish', 'progression'],
        taper: ['cutback'],
      },
      competitive: {
        aerobic_reset: ['progression', 'fast_finish'],
        economy_building: ['fast_finish', 'progression'],
        race_specificity: ['fast_finish', 'progression'],
        taper: ['cutback'],
      },
    },
    maxRaceSpecificContentByTierAndPhase: {
      base: { aerobic_reset: 0, economy_building: 1, race_specificity: 2, taper: 0 },
      performance: { aerobic_reset: 0, economy_building: 1, race_specificity: 2, taper: 0 },
      competitive: { aerobic_reset: 0, economy_building: 2, race_specificity: 3, taper: 0 },
    },
  },
  weeklyVolume: {
    peakVolumeMultiplierByArchetype: { development: 1.35, established: 1.15, established_specificity: 1.05 },
    maxWeeklyGrowthRate: 0.08,
    plateauThresholdWeeks: 3,
    ceilingHandling: 'quality_rotation',
  },
  qualitySession: {
    primaryStimulusPriorities: ['vo2_economy', 'threshold_development', 'race_pace_sharpening'],
    blueprintPoolByPhaseAndTier: {
      aerobic_reset: {
        base: ['light_aerobic_quality'],
        performance: ['threshold_cruise', 'economy_strides_set'],
        competitive: ['threshold_cruise', 'economy_strides_set', 'vo2_intervals'],
      },
      economy_building: {
        base: ['threshold_cruise', 'tempo_continuous'],
        performance: ['vo2_intervals', 'progressive_tempo'],
        competitive: ['vo2_intervals', 'economy_strides_set', 'progressive_tempo'],
      },
      race_specificity: {
        base: ['tempo_continuous', 'progressive_tempo'],
        performance: ['race_pace_sharpener', 'vo2_intervals'],
        competitive: ['race_pace_sharpener', 'vo2_intervals', 'economy_strides_set'],
      },
      taper: {
        base: ['threshold_cruise'],
        performance: ['race_pace_sharpener'],
        competitive: ['race_pace_sharpener'],
      },
    },
    maxQualitySessionsPerWeek: { base: 1, performance: 2, competitive: 2 },
    minDaysBetweenHardSessions: 2,
    sophisticationCeiling: { base: 'simple', performance: 'structured', competitive: 'polished' },
  },
  phase: {
    defaultPhaseFractions: { aerobic_reset: 0.25, economy_building: 0.35, race_specificity: 0.30, taper: 0.10 },
    phaseEmphasis: {
      longRunDevelopment: 0.15,
      thresholdDevelopment: 0.25,
      racePaceWork: 0.25,
      economyWork: 0.25,
      sharpening: 0.10,
    },
    taperWeeksDefault: 1,
    taperVolumeMultipliers: [0.65],
  },
  difficultyBudget: {
    maxWeeklyStressUnits: { base: 6, performance: 8, competitive: 10 },
    longRunStressCost: {
      easy_aerobic: 1, cutback: 0, fueling_practice: 1, progression: 2, fast_finish: 3, mp_block: 4, alternating_mp_steady: 5,
    },
    qualitySessionStressCost: {
      light_aerobic_quality: 1, threshold_cruise: 2, tempo_continuous: 2, progressive_tempo: 3,
      vo2_intervals: 4, marathon_pace_repeat: 3, race_pace_sharpener: 3, economy_strides_set: 1,
    },
    maxHardStimuliPerWeek: { base: 1, performance: 2, competitive: 3 },
  },
  antiBoredom: {
    postLongRunCeilingStrategy: 'purpose_variation',
    postVolumeCeilingStrategy: 'quality_escalation',
    stimulusFamilyRotation: ['vo2_economy', 'threshold_development', 'race_pace_sharpening', 'economy_speed'],
    antiCloneWindowWeeks: 3,
    minDistinctFlavoursInWindow: 2,
  },
  coachingPhilosophy: 'Premium feel from workout progression, economy, speed support, threshold support, sharpening. Long-run variety is light and not overemphasized.',
};

const TEN_K_FAMILY_CONFIG: RaceFamilyConfig = {
  family: '10k',
  distanceRangeKm: { min: 8, max: 17.99 },
  longRun: {
    capDistanceKm: 21,
    capTimeMinutes: 130,
    targetRatioToRaceDistance: 1.8,
    maxShareOfWeeklyVolume: 0.45,
    targetZone: {
      usefulMinKm: 13,
      usefulMaxKm: 18,
      hardCapKm: 21,
      hardCapMinutes: 130,
      ratioToRaceDistance: { min: 1.3, max: 2.0 },
      importanceWeight: 0.20,
      nearThresholdPercent: 0.80,
    },
    postTargetProgression: {
      primaryLevers: ['workout_identity', 'vo2_development', 'threshold_progression', '10k_pace_work'],
      secondaryLevers: ['economy_speed', 'sharpening'],
      longRunRole: 'supporting',
      flavourImportance: 'low',
      qualitySessionImportance: 'high',
    },
    flavourPoolByTierAndPhase: {
      base: {
        aerobic_reset: ['easy_aerobic', 'fueling_practice', 'cutback'],
        economy_building: ['easy_aerobic', 'progression', 'fast_finish'],
        race_specificity: ['progression', 'fast_finish'],
        taper: ['cutback'],
      },
      performance: {
        aerobic_reset: ['easy_aerobic', 'progression', 'fueling_practice'],
        economy_building: ['progression', 'fast_finish', 'fueling_practice'],
        race_specificity: ['fast_finish', 'progression'],
        taper: ['cutback'],
      },
      competitive: {
        aerobic_reset: ['progression', 'fast_finish', 'easy_aerobic'],
        economy_building: ['fast_finish', 'progression', 'fueling_practice'],
        race_specificity: ['fast_finish', 'progression'],
        taper: ['cutback'],
      },
    },
    maxRaceSpecificContentByTierAndPhase: {
      base: { aerobic_reset: 0, economy_building: 1, race_specificity: 2, taper: 0 },
      performance: { aerobic_reset: 0, economy_building: 1, race_specificity: 2, taper: 0 },
      competitive: { aerobic_reset: 0, economy_building: 2, race_specificity: 3, taper: 0 },
    },
  },
  weeklyVolume: {
    peakVolumeMultiplierByArchetype: { development: 1.40, established: 1.20, established_specificity: 1.08 },
    maxWeeklyGrowthRate: 0.07,
    plateauThresholdWeeks: 4,
    ceilingHandling: 'quality_rotation',
  },
  qualitySession: {
    primaryStimulusPriorities: ['vo2_development', 'threshold_development', 'race_pace_work'],
    blueprintPoolByPhaseAndTier: {
      aerobic_reset: {
        base: ['light_aerobic_quality', 'threshold_cruise'],
        performance: ['threshold_cruise', 'economy_strides_set'],
        competitive: ['threshold_cruise', 'economy_strides_set'],
      },
      economy_building: {
        base: ['threshold_cruise', 'tempo_continuous'],
        performance: ['vo2_intervals', 'progressive_tempo'],
        competitive: ['vo2_intervals', 'progressive_tempo'],
      },
      race_specificity: {
        base: ['tempo_continuous', 'threshold_cruise'],
        performance: ['race_pace_sharpener', 'vo2_intervals'],
        competitive: ['race_pace_sharpener', 'vo2_intervals'],
      },
      taper: {
        base: ['threshold_cruise'],
        performance: ['race_pace_sharpener'],
        competitive: ['race_pace_sharpener'],
      },
    },
    maxQualitySessionsPerWeek: { base: 1, performance: 2, competitive: 2 },
    minDaysBetweenHardSessions: 2,
    sophisticationCeiling: { base: 'simple', performance: 'structured', competitive: 'polished' },
  },
  phase: {
    defaultPhaseFractions: { aerobic_reset: 0.25, economy_building: 0.35, race_specificity: 0.30, taper: 0.10 },
    phaseEmphasis: {
      longRunDevelopment: 0.20,
      thresholdDevelopment: 0.30,
      racePaceWork: 0.20,
      economyWork: 0.20,
      sharpening: 0.10,
    },
    taperWeeksDefault: 1,
    taperVolumeMultipliers: [0.65],
  },
  difficultyBudget: {
    maxWeeklyStressUnits: { base: 7, performance: 9, competitive: 11 },
    longRunStressCost: {
      easy_aerobic: 1, cutback: 0, fueling_practice: 1, progression: 2, fast_finish: 3, mp_block: 4, alternating_mp_steady: 5,
    },
    qualitySessionStressCost: {
      light_aerobic_quality: 1, threshold_cruise: 2, tempo_continuous: 2, progressive_tempo: 3,
      vo2_intervals: 4, marathon_pace_repeat: 3, race_pace_sharpener: 3, economy_strides_set: 1,
    },
    maxHardStimuliPerWeek: { base: 1, performance: 2, competitive: 3 },
  },
  antiBoredom: {
    postLongRunCeilingStrategy: 'purpose_variation',
    postVolumeCeilingStrategy: 'quality_escalation',
    stimulusFamilyRotation: ['vo2_development', 'threshold_extension', 'race_pace_work', 'economy_speed'],
    antiCloneWindowWeeks: 3,
    minDistinctFlavoursInWindow: 2,
  },
  coachingPhilosophy: 'Premium feel from workout identity, threshold/CV/10K-specific progression, sharpening. Long run matters, but is not the main visible lever.',
};

const HALF_FAMILY_CONFIG: RaceFamilyConfig = {
  family: 'half',
  distanceRangeKm: { min: 18, max: 34.99 },
  longRun: {
    capDistanceKm: 28,
    capTimeMinutes: 165,
    targetRatioToRaceDistance: 0.95,
    maxShareOfWeeklyVolume: 0.55,
    targetZone: {
      usefulMinKm: 16,
      usefulMaxKm: 28,
      hardCapKm: 28,
      hardCapMinutes: 165,
      ratioToRaceDistance: { min: 0.75, max: 1.0 },
      importanceWeight: 0.32,
      nearThresholdPercent: 0.80,
    },
    postTargetProgression: {
      primaryLevers: ['threshold_extension', 'hm_pace_progression', 'race_pace_work'],
      secondaryLevers: ['long_run_flavour', 'progression_runs', 'lactate_clearance'],
      longRunRole: 'supporting',
      flavourImportance: 'moderate',
      qualitySessionImportance: 'high',
    },
    flavourPoolByTierAndPhase: {
      base: {
        aerobic_reset: ['easy_aerobic', 'fueling_practice', 'cutback'],
        economy_building: ['easy_aerobic', 'progression', 'fast_finish', 'fueling_practice'],
        race_specificity: ['fast_finish', 'progression', 'fueling_practice'],
        taper: ['cutback'],
      },
      performance: {
        aerobic_reset: ['easy_aerobic', 'progression', 'fueling_practice'],
        economy_building: ['progression', 'fast_finish', 'mp_block', 'fueling_practice'],
        race_specificity: ['mp_block', 'fast_finish', 'progression', 'fueling_practice'],
        taper: ['cutback'],
      },
      competitive: {
        aerobic_reset: ['progression', 'fast_finish', 'easy_aerobic'],
        economy_building: ['fast_finish', 'mp_block', 'progression', 'fueling_practice'],
        race_specificity: ['mp_block', 'fast_finish', 'progression'],
        taper: ['cutback'],
      },
    },
    maxRaceSpecificContentByTierAndPhase: {
      base: { aerobic_reset: 0, economy_building: 1, race_specificity: 2, taper: 0 },
      performance: { aerobic_reset: 0, economy_building: 2, race_specificity: 3, taper: 0 },
      competitive: { aerobic_reset: 1, economy_building: 2, race_specificity: 3, taper: 0 },
    },
  },
  weeklyVolume: {
    peakVolumeMultiplierByArchetype: { development: 1.45, established: 1.25, established_specificity: 1.10 },
    maxWeeklyGrowthRate: 0.06,
    plateauThresholdWeeks: 5,
    ceilingHandling: 'variety_injection',
  },
  qualitySession: {
    primaryStimulusPriorities: ['threshold_development', 'hm_pace_work', 'lactate_clearance'],
    blueprintPoolByPhaseAndTier: {
      aerobic_reset: {
        base: ['light_aerobic_quality', 'threshold_cruise'],
        performance: ['threshold_cruise', 'economy_strides_set'],
        competitive: ['threshold_cruise', 'economy_strides_set'],
      },
      economy_building: {
        base: ['tempo_continuous', 'threshold_cruise'],
        performance: ['tempo_continuous', 'progressive_tempo'],
        competitive: ['progressive_tempo', 'vo2_intervals'],
      },
      race_specificity: {
        base: ['tempo_continuous', 'threshold_cruise'],
        performance: ['marathon_pace_repeat', 'progressive_tempo'],
        competitive: ['marathon_pace_repeat', 'race_pace_sharpener'],
      },
      taper: {
        base: ['threshold_cruise'],
        performance: ['race_pace_sharpener'],
        competitive: ['race_pace_sharpener'],
      },
    },
    maxQualitySessionsPerWeek: { base: 1, performance: 2, competitive: 2 },
    minDaysBetweenHardSessions: 2,
    sophisticationCeiling: { base: 'simple', performance: 'structured', competitive: 'polished' },
  },
  phase: {
    defaultPhaseFractions: { aerobic_reset: 0.20, economy_building: 0.35, race_specificity: 0.35, taper: 0.10 },
    phaseEmphasis: {
      longRunDevelopment: 0.25,
      thresholdDevelopment: 0.30,
      racePaceWork: 0.25,
      economyWork: 0.10,
      sharpening: 0.10,
    },
    taperWeeksDefault: 1,
    taperVolumeMultipliers: [0.65],
  },
  difficultyBudget: {
    maxWeeklyStressUnits: { base: 8, performance: 10, competitive: 12 },
    longRunStressCost: {
      easy_aerobic: 1, cutback: 0, fueling_practice: 1, progression: 2, fast_finish: 3, mp_block: 4, alternating_mp_steady: 5,
    },
    qualitySessionStressCost: {
      light_aerobic_quality: 1, threshold_cruise: 2, tempo_continuous: 2, progressive_tempo: 3,
      vo2_intervals: 4, marathon_pace_repeat: 3, race_pace_sharpener: 3, economy_strides_set: 1,
    },
    maxHardStimuliPerWeek: { base: 2, performance: 2, competitive: 3 },
  },
  antiBoredom: {
    postLongRunCeilingStrategy: 'flavour_rotation',
    postVolumeCeilingStrategy: 'specificity_deepening',
    stimulusFamilyRotation: ['threshold_development', 'hm_pace_work', 'lactate_clearance', 'race_execution'],
    antiCloneWindowWeeks: 4,
    minDistinctFlavoursInWindow: 3,
  },
  coachingPhilosophy: 'Premium feel from threshold/HM-pace progression, progression runs, race-specific long-run structure. Long runs matter, but not as heavily as marathon.',
};

const MARATHON_FAMILY_CONFIG: RaceFamilyConfig = {
  family: 'marathon',
  distanceRangeKm: { min: 35, max: 50 },
  longRun: {
    capDistanceKm: 32,
    capTimeMinutes: 180,
    targetRatioToRaceDistance: 0.75,
    maxShareOfWeeklyVolume: 0.60,
    targetZone: {
      usefulMinKm: 26,
      usefulMaxKm: 32,
      hardCapKm: 32,
      hardCapMinutes: 180,
      ratioToRaceDistance: { min: 0.62, max: 0.78 },
      importanceWeight: 0.40,
      nearThresholdPercent: 0.85,
    },
    postTargetProgression: {
      primaryLevers: ['long_run_flavour', 'mp_execution', 'race_simulation', 'fueling_practice'],
      secondaryLevers: ['threshold_extension', 'aerobic_durability'],
      longRunRole: 'primary_value',
      flavourImportance: 'high',
      qualitySessionImportance: 'moderate',
    },
    flavourPoolByTierAndPhase: {
      base: {
        aerobic_reset: ['easy_aerobic', 'fueling_practice', 'cutback'],
        economy_building: ['easy_aerobic', 'progression', 'fast_finish', 'fueling_practice'],
        race_specificity: ['fast_finish', 'progression', 'fueling_practice'],
        taper: ['cutback'],
      },
      performance: {
        aerobic_reset: ['easy_aerobic', 'progression', 'fueling_practice'],
        economy_building: ['progression', 'fast_finish', 'mp_block', 'fueling_practice'],
        race_specificity: ['mp_block', 'fast_finish', 'progression', 'fueling_practice'],
        taper: ['cutback'],
      },
      competitive: {
        aerobic_reset: ['progression', 'fast_finish', 'easy_aerobic'],
        economy_building: ['fast_finish', 'mp_block', 'progression', 'fueling_practice'],
        race_specificity: ['mp_block', 'alternating_mp_steady', 'fast_finish', 'progression'],
        taper: ['cutback'],
      },
    },
    maxRaceSpecificContentByTierAndPhase: {
      base: { aerobic_reset: 0, economy_building: 1, race_specificity: 2, taper: 0 },
      performance: { aerobic_reset: 0, economy_building: 2, race_specificity: 3, taper: 1 },
      competitive: { aerobic_reset: 1, economy_building: 2, race_specificity: 3, taper: 1 },
    },
  },
  weeklyVolume: {
    peakVolumeMultiplierByArchetype: { development: 1.50, established: 1.30, established_specificity: 1.12 },
    maxWeeklyGrowthRate: 0.06,
    plateauThresholdWeeks: 6,
    ceilingHandling: 'variety_injection',
  },
  qualitySession: {
    primaryStimulusPriorities: ['marathon_pace_work', 'threshold_extension', 'aerobic_durability'],
    blueprintPoolByPhaseAndTier: {
      aerobic_reset: {
        base: ['light_aerobic_quality'],
        performance: ['threshold_cruise', 'economy_strides_set'],
        competitive: ['threshold_cruise', 'economy_strides_set'],
      },
      economy_building: {
        base: ['threshold_cruise', 'tempo_continuous'],
        performance: ['tempo_continuous', 'progressive_tempo'],
        competitive: ['progressive_tempo', 'vo2_intervals'],
      },
      race_specificity: {
        base: ['tempo_continuous'],
        performance: ['marathon_pace_repeat', 'progressive_tempo'],
        competitive: ['marathon_pace_repeat', 'race_pace_sharpener'],
      },
      taper: {
        base: ['threshold_cruise'],
        performance: ['marathon_pace_repeat'],
        competitive: ['race_pace_sharpener'],
      },
    },
    maxQualitySessionsPerWeek: { base: 1, performance: 2, competitive: 2 },
    minDaysBetweenHardSessions: 2,
    sophisticationCeiling: { base: 'simple', performance: 'structured', competitive: 'polished' },
  },
  phase: {
    defaultPhaseFractions: { aerobic_reset: 0.15, economy_building: 0.35, race_specificity: 0.35, taper: 0.15 },
    phaseEmphasis: {
      longRunDevelopment: 0.35,
      thresholdDevelopment: 0.25,
      racePaceWork: 0.20,
      economyWork: 0.10,
      sharpening: 0.10,
    },
    taperWeeksDefault: 2,
    taperVolumeMultipliers: [0.80, 0.55],
  },
  difficultyBudget: {
    maxWeeklyStressUnits: { base: 8, performance: 11, competitive: 14 },
    longRunStressCost: {
      easy_aerobic: 1, cutback: 0, fueling_practice: 1, progression: 2, fast_finish: 3, mp_block: 4, alternating_mp_steady: 5,
    },
    qualitySessionStressCost: {
      light_aerobic_quality: 1, threshold_cruise: 2, tempo_continuous: 2, progressive_tempo: 3,
      vo2_intervals: 4, marathon_pace_repeat: 3, race_pace_sharpener: 3, economy_strides_set: 1,
    },
    maxHardStimuliPerWeek: { base: 2, performance: 2, competitive: 3 },
  },
  antiBoredom: {
    postLongRunCeilingStrategy: 'flavour_rotation',
    postVolumeCeilingStrategy: 'specificity_deepening',
    stimulusFamilyRotation: ['marathon_pace_work', 'threshold_extension', 'aerobic_durability', 'race_execution'],
    antiCloneWindowWeeks: 4,
    minDistinctFlavoursInWindow: 3,
  },
  coachingPhilosophy: 'Premium feel heavily from long-run flavour, marathon-specific long runs, race-execution progression, and careful integration with the rest of the week.',
};

const RACE_FAMILY_CONFIGS: Record<RaceFamily, RaceFamilyConfig> = {
  short: SHORT_FAMILY_CONFIG,
  '10k': TEN_K_FAMILY_CONFIG,
  half: HALF_FAMILY_CONFIG,
  marathon: MARATHON_FAMILY_CONFIG,
};

export function getRaceFamilyFromDistance(raceDistanceKm: number): RaceFamily {
  if (raceDistanceKm >= 35) return 'marathon';
  if (raceDistanceKm >= 18) return 'half';
  if (raceDistanceKm >= 8) return '10k';
  return 'short';
}

export function getRaceFamilyConfig(family: RaceFamily): RaceFamilyConfig {
  return RACE_FAMILY_CONFIGS[family];
}

export function getRaceFamilyConfigForDistance(raceDistanceKm: number): RaceFamilyConfig {
  const family = getRaceFamilyFromDistance(raceDistanceKm);
  return getRaceFamilyConfig(family);
}

export interface DistanceAdjustments {
  longRunTargetMultiplier: number;
  workoutDurationMultiplier: number;
  repLengthAdjustment: 'shorter' | 'standard' | 'longer';
  taperIntensity: 'lighter' | 'standard' | 'sharper';
  sessionDensityMultiplier: number;
}

export function computeDistanceAdjustments(
  raceDistanceKm: number,
  family: RaceFamily
): DistanceAdjustments {
  const config = getRaceFamilyConfig(family);
  const { min, max } = config.distanceRangeKm;
  const range = max - min;
  const positionInFamily = range > 0 ? (raceDistanceKm - min) / range : 0.5;
  const clampedPosition = Math.max(0, Math.min(1, positionInFamily));

  let longRunTargetMultiplier = 1.0;
  let workoutDurationMultiplier = 1.0;
  let repLengthAdjustment: 'shorter' | 'standard' | 'longer' = 'standard';
  let taperIntensity: 'lighter' | 'standard' | 'sharper' = 'standard';
  let sessionDensityMultiplier = 1.0;

  if (family === 'short') {
    longRunTargetMultiplier = 0.8 + (clampedPosition * 0.4);
    workoutDurationMultiplier = 0.85 + (clampedPosition * 0.3);
    repLengthAdjustment = clampedPosition < 0.5 ? 'shorter' : 'standard';
    sessionDensityMultiplier = 0.9 + (clampedPosition * 0.2);
  } else if (family === '10k') {
    longRunTargetMultiplier = 0.85 + (clampedPosition * 0.3);
    workoutDurationMultiplier = 0.9 + (clampedPosition * 0.2);
    repLengthAdjustment = clampedPosition < 0.3 ? 'shorter' : clampedPosition > 0.7 ? 'longer' : 'standard';
    sessionDensityMultiplier = 0.95 + (clampedPosition * 0.1);
  } else if (family === 'half') {
    longRunTargetMultiplier = 0.9 + (clampedPosition * 0.2);
    workoutDurationMultiplier = 0.95 + (clampedPosition * 0.1);
    repLengthAdjustment = clampedPosition > 0.6 ? 'longer' : 'standard';
    taperIntensity = clampedPosition > 0.7 ? 'sharper' : 'standard';
    sessionDensityMultiplier = 1.0 + (clampedPosition * 0.05);
  } else {
    longRunTargetMultiplier = 0.95 + (clampedPosition * 0.1);
    workoutDurationMultiplier = 1.0;
    repLengthAdjustment = 'longer';
    taperIntensity = clampedPosition > 0.3 ? 'sharper' : 'standard';
    sessionDensityMultiplier = 1.0;
  }

  return {
    longRunTargetMultiplier,
    workoutDurationMultiplier,
    repLengthAdjustment,
    taperIntensity,
    sessionDensityMultiplier,
  };
}

export interface ArchetypeModifiers {
  volumeProgressionStyle: 'quantity_led' | 'stability_led' | 'specificity_led';
  longRunProgressionStyle: 'distance_growth' | 'content_progression' | 'flavour_rotation';
  qualityEmphasis: 'foundational' | 'building' | 'specific';
  phaseCompression: number;
}

export function getArchetypeModifiers(archetype: PlanArchetype): ArchetypeModifiers {
  switch (archetype) {
    case 'development':
      return {
        volumeProgressionStyle: 'quantity_led',
        longRunProgressionStyle: 'distance_growth',
        qualityEmphasis: 'foundational',
        phaseCompression: 1.0,
      };
    case 'established':
      return {
        volumeProgressionStyle: 'stability_led',
        longRunProgressionStyle: 'content_progression',
        qualityEmphasis: 'building',
        phaseCompression: 0.9,
      };
    case 'established_specificity':
      return {
        volumeProgressionStyle: 'specificity_led',
        longRunProgressionStyle: 'flavour_rotation',
        qualityEmphasis: 'specific',
        phaseCompression: 0.85,
      };
  }
}

export interface TierModifiers {
  density: 'light' | 'moderate' | 'dense';
  sophistication: 'simple' | 'structured' | 'polished';
  specificityFrequency: 'occasional' | 'regular' | 'frequent';
  premiumExpression: 'conservative' | 'balanced' | 'premium';
}

export function getTierModifiers(tier: AmbitionTier): TierModifiers {
  switch (tier) {
    case 'base':
      return {
        density: 'light',
        sophistication: 'simple',
        specificityFrequency: 'occasional',
        premiumExpression: 'conservative',
      };
    case 'performance':
      return {
        density: 'moderate',
        sophistication: 'structured',
        specificityFrequency: 'regular',
        premiumExpression: 'balanced',
      };
    case 'competitive':
      return {
        density: 'dense',
        sophistication: 'polished',
        specificityFrequency: 'frequent',
        premiumExpression: 'premium',
      };
  }
}

export function computeLongRunCapForFamily(
  family: RaceFamily,
  raceDistanceKm: number,
  paceMinPerKm: number
): number {
  const config = getRaceFamilyConfig(family);
  const adjustments = computeDistanceAdjustments(raceDistanceKm, family);

  const baseTarget = Math.min(
    raceDistanceKm * config.longRun.targetRatioToRaceDistance * adjustments.longRunTargetMultiplier,
    config.longRun.capDistanceKm
  );

  const durationCapKm = config.longRun.capTimeMinutes / paceMinPerKm;

  return Math.min(baseTarget, durationCapKm);
}

export function computeTaperWeeksForFamily(
  family: RaceFamily,
  totalWeeks: number
): number {
  const config = getRaceFamilyConfig(family);
  const defaultTaper = config.phase.taperWeeksDefault;
  const maxByDuration = Math.max(1, Math.floor(totalWeeks * 0.2));
  return Math.min(defaultTaper, maxByDuration);
}

export function getPhaseAllocations(
  family: RaceFamily,
  tier: AmbitionTier,
  totalBuildWeeks: number
): Record<ArchetypePhase, number> {
  const config = getRaceFamilyConfig(family);
  const fractions = config.phase.defaultPhaseFractions;

  let resetFraction = fractions.aerobic_reset;
  let economyFraction = fractions.economy_building;
  let specFraction = fractions.race_specificity;

  if (tier === 'competitive') {
    // Competitive runners start with higher volume and need more metabolic reset time
    resetFraction *= 1.15;
    specFraction += (fractions.economy_building * 0.1);
    economyFraction *= 0.9;
  } else if (tier === 'base') {
    // Base runners need less specificity — shift some toward aerobic reset
    resetFraction *= 1.1;
    specFraction -= (fractions.aerobic_reset * 0.1);
  }

  const totalBuild = resetFraction + economyFraction + specFraction;
  const normalizedReset = resetFraction / totalBuild;
  const normalizedEconomy = economyFraction / totalBuild;
  const normalizedSpec = specFraction / totalBuild;

  return {
    aerobic_reset: Math.max(1, Math.round(totalBuildWeeks * normalizedReset)),
    economy_building: Math.max(1, Math.round(totalBuildWeeks * normalizedEconomy)),
    race_specificity: Math.max(1, Math.round(totalBuildWeeks * normalizedSpec)),
    taper: 0,
  };
}

export function getAllowedFlavoursFromConfig(
  family: RaceFamily,
  phase: ArchetypePhase,
  tier: AmbitionTier
): LongRunFlavour[] {
  const config = getRaceFamilyConfig(family);
  return config.longRun.flavourPoolByTierAndPhase[tier][phase] || ['easy_aerobic'];
}

export function getMaxRaceSpecificContentFromConfig(
  family: RaceFamily,
  phase: ArchetypePhase,
  tier: AmbitionTier
): 0 | 1 | 2 | 3 {
  const config = getRaceFamilyConfig(family);
  return config.longRun.maxRaceSpecificContentByTierAndPhase[tier][phase];
}

export function getQualityBlueprintPoolFromConfig(
  family: RaceFamily,
  phase: ArchetypePhase,
  tier: AmbitionTier
): QualitySessionBlueprint[] {
  const config = getRaceFamilyConfig(family);
  return config.qualitySession.blueprintPoolByPhaseAndTier[phase][tier] || ['threshold_cruise'];
}

export function getMaxQualitySessionsFromConfig(
  family: RaceFamily,
  tier: AmbitionTier
): number {
  const config = getRaceFamilyConfig(family);
  return config.qualitySession.maxQualitySessionsPerWeek[tier];
}

export function shouldApplyPostCeilingVariety(
  family: RaceFamily,
  weeksSinceCapReached: number,
  currentFlavour: LongRunFlavour,
  recentFlavours: LongRunFlavour[]
): { shouldRotate: boolean; suggestedFlavour?: LongRunFlavour } {
  const config = getRaceFamilyConfig(family);

  if (weeksSinceCapReached < 2) {
    return { shouldRotate: false };
  }

  const windowSize = config.antiBoredom.antiCloneWindowWeeks;
  const recentWindow = recentFlavours.slice(-windowSize);
  const distinctCount = new Set(recentWindow).size;

  if (distinctCount < config.antiBoredom.minDistinctFlavoursInWindow) {
    return { shouldRotate: true };
  }

  const consecutiveSame = recentFlavours.length >= 2 &&
    recentFlavours[recentFlavours.length - 1] === currentFlavour &&
    recentFlavours[recentFlavours.length - 2] === currentFlavour;

  return { shouldRotate: consecutiveSame };
}

export interface LongRunTargetAnalysis {
  targetZone: LongRunTargetZone;
  usefulTargetKm: number;
  status: LongRunTargetStatus;
  progressionMode: LongRunProgressionMode;
  distanceToUsefulTarget: number;
  percentOfUsefulTarget: number;
  shouldBuildDistance: boolean;
  postTargetRules: PostTargetProgressionRules;
}

export function computeUsefulLongRunTarget(
  raceDistanceKm: number,
  family: RaceFamily,
  paceMinPerKm: number = 6.0
): number {
  const config = getRaceFamilyConfig(family);
  const zone = config.longRun.targetZone;
  const adjustments = computeDistanceAdjustments(raceDistanceKm, family);

  const ratioBasedTarget = raceDistanceKm *
    ((zone.ratioToRaceDistance.min + zone.ratioToRaceDistance.max) / 2) *
    adjustments.longRunTargetMultiplier;

  const durationCapKm = zone.hardCapMinutes / paceMinPerKm;

  const usefulTarget = Math.min(
    Math.max(ratioBasedTarget, zone.usefulMinKm),
    zone.usefulMaxKm,
    zone.hardCapKm,
    durationCapKm
  );

  return Math.round(usefulTarget * 10) / 10;
}

export function computeIntermediateDistanceTarget(
  raceDistanceKm: number,
  family: RaceFamily,
  paceMinPerKm: number = 6.0
): number {
  const config = getRaceFamilyConfig(family);
  const { min, max } = config.distanceRangeKm;
  const range = max - min;
  const positionInFamily = range > 0 ? (raceDistanceKm - min) / range : 0.5;
  const clampedPosition = Math.max(0, Math.min(1, positionInFamily));

  const zone = config.longRun.targetZone;
  const zoneRange = zone.usefulMaxKm - zone.usefulMinKm;

  const baseTarget = zone.usefulMinKm + (zoneRange * clampedPosition);

  const ratioBasedMin = raceDistanceKm * zone.ratioToRaceDistance.min;
  const ratioBasedMax = raceDistanceKm * zone.ratioToRaceDistance.max;
  const ratioBasedMid = (ratioBasedMin + ratioBasedMax) / 2;

  const blendedTarget = (baseTarget * 0.6) + (ratioBasedMid * 0.4);

  const durationCapKm = zone.hardCapMinutes / paceMinPerKm;

  return Math.round(
    Math.min(
      Math.max(blendedTarget, zone.usefulMinKm),
      zone.usefulMaxKm,
      zone.hardCapKm,
      durationCapKm
    ) * 10
  ) / 10;
}

export function analyzeLongRunTargetStatus(
  currentLongRunKm: number,
  raceDistanceKm: number,
  family: RaceFamily,
  paceMinPerKm: number = 6.0
): LongRunTargetAnalysis {
  const config = getRaceFamilyConfig(family);
  const zone = config.longRun.targetZone;
  const postTargetRules = config.longRun.postTargetProgression;

  const usefulTargetKm = computeIntermediateDistanceTarget(raceDistanceKm, family, paceMinPerKm);

  const percentOfUsefulTarget = usefulTargetKm > 0
    ? currentLongRunKm / usefulTargetKm
    : 1;

  const nearThreshold = zone.nearThresholdPercent;

  let status: LongRunTargetStatus;
  let progressionMode: LongRunProgressionMode;
  let shouldBuildDistance: boolean;

  if (percentOfUsefulTarget >= 1.0) {
    status = 'above';
    progressionMode = 'specificity_led';
    shouldBuildDistance = false;
  } else if (percentOfUsefulTarget >= nearThreshold) {
    status = 'near';
    progressionMode = 'mixed';
    shouldBuildDistance = percentOfUsefulTarget < 0.95;
  } else {
    status = 'below';
    progressionMode = 'build';
    shouldBuildDistance = true;
  }

  const distanceToUsefulTarget = Math.max(0, usefulTargetKm - currentLongRunKm);

  return {
    targetZone: zone,
    usefulTargetKm,
    status,
    progressionMode,
    distanceToUsefulTarget,
    percentOfUsefulTarget: Math.round(percentOfUsefulTarget * 100) / 100,
    shouldBuildDistance,
    postTargetRules,
  };
}

export interface ArchetypeRecommendation {
  recommendedArchetype: PlanArchetype;
  reason: string;
  longRunTargetStatus: LongRunTargetStatus;
  shouldShiftToSpecificity: boolean;
}

export function recommendArchetypeFromTargetStatus(
  currentLongRunKm: number,
  currentWeeklyKm: number,
  raceDistanceKm: number,
  totalWeeks: number,
  baselineArchetype: PlanArchetype
): ArchetypeRecommendation {
  const family = getRaceFamilyFromDistance(raceDistanceKm);
  const analysis = analyzeLongRunTargetStatus(currentLongRunKm, raceDistanceKm, family);

  if (analysis.status === 'above') {
    return {
      recommendedArchetype: 'established_specificity',
      reason: 'Runner already at or above useful long-run target; shift to specificity-led progression',
      longRunTargetStatus: analysis.status,
      shouldShiftToSpecificity: true,
    };
  }

  if (analysis.status === 'near') {
    const weeksToReachTarget = analysis.distanceToUsefulTarget / 1.5;
    const hasTimeToReach = weeksToReachTarget <= totalWeeks * 0.4;

    if (hasTimeToReach) {
      return {
        recommendedArchetype: baselineArchetype === 'development' ? 'established' : baselineArchetype,
        reason: 'Runner near target with time to complete build; use mixed progression',
        longRunTargetStatus: analysis.status,
        shouldShiftToSpecificity: false,
      };
    } else {
      return {
        recommendedArchetype: 'established_specificity',
        reason: 'Runner near target without much build time needed; shift to specificity earlier',
        longRunTargetStatus: analysis.status,
        shouldShiftToSpecificity: true,
      };
    }
  }

  const weeksNeededToBuild = analysis.distanceToUsefulTarget / 1.5;
  const buildPhaseAvailable = totalWeeks * 0.6;

  if (weeksNeededToBuild > buildPhaseAvailable) {
    return {
      recommendedArchetype: 'development',
      reason: 'Runner below target with significant build needed; prioritize distance development',
      longRunTargetStatus: analysis.status,
      shouldShiftToSpecificity: false,
    };
  }

  return {
    recommendedArchetype: baselineArchetype,
    reason: 'Runner below target but achievable within plan; use baseline archetype',
    longRunTargetStatus: analysis.status,
    shouldShiftToSpecificity: false,
  };
}

export function computeTargetAwarePhaseAllocations(
  family: RaceFamily,
  tier: AmbitionTier,
  totalBuildWeeks: number,
  targetStatus: LongRunTargetStatus
): Record<ArchetypePhase, number> {
  const baseAllocations = getPhaseAllocations(family, tier, totalBuildWeeks);

  if (targetStatus === 'above') {
    const shiftAmount = Math.floor(baseAllocations.aerobic_reset * 0.5);
    return {
      aerobic_reset: Math.max(1, baseAllocations.aerobic_reset - shiftAmount),
      economy_building: baseAllocations.economy_building,
      race_specificity: baseAllocations.race_specificity + shiftAmount,
      taper: 0,
    };
  }

  if (targetStatus === 'near') {
    const shiftAmount = Math.floor(baseAllocations.aerobic_reset * 0.25);
    return {
      aerobic_reset: Math.max(1, baseAllocations.aerobic_reset - shiftAmount),
      economy_building: baseAllocations.economy_building,
      race_specificity: baseAllocations.race_specificity + shiftAmount,
      taper: 0,
    };
  }

  return baseAllocations;
}

export function getPostTargetProgressionGuidance(family: RaceFamily): PostTargetProgressionRules {
  const config = getRaceFamilyConfig(family);
  return config.longRun.postTargetProgression;
}

export { RACE_FAMILY_CONFIGS };
