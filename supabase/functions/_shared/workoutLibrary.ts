/*
 * Workout Library
 *
 * This module defines the controlled workout library used by the structural
 * engine to assign session identity to every training week.
 *
 * ARCHITECTURE PRINCIPLE:
 * - The maths decide: volume, long-run distance, phase, difficulty budget, tier, family
 * - This library decides: which exact workout best expresses that week's purpose
 * - The AI renders: the selected session clearly using the workout's aiRenderingNotes
 *
 * The library is intentionally small and high-quality. Every entry must earn
 * its place. Prefer fewer, stronger workouts over a large weak catalogue.
 *
 * ANTI-REPEAT: workouts share an antiRepeatCategory. The selector enforces that
 * the same category is not repeated in consecutive weeks where possible, creating
 * natural variety without chaos.
 *
 * DIFFICULTY BUDGET: each workout carries a difficultyBudgetCost that the
 * selector uses to avoid over-stressing the same week as a demanding long run.
 */

import type {
  RaceFamily,
  AmbitionTier,
} from './planStructureBuilder.ts';

import type {
  ArchetypePhase,
  QualitySessionBlueprint,
  SupportRunRole,
  LongRunFlavour,
  PlanArchetype,
  StimulusFamily,
  WorkoutPurpose,
} from './planStructureBuilder.ts';

// ---------------------------------------------------------------------------
// Core Types
// ---------------------------------------------------------------------------

export type SessionType =
  | 'quality'        // primary quality session
  | 'long_run'       // long run (with or without structure)
  | 'support'        // easy/aerobic support runs
  | 'recovery';      // dedicated recovery run

export type WorkoutCategory =
  // Quality session categories
  | 'threshold'
  | 'tempo'
  | 'hm_pace'
  | 'marathon_pace'
  | 'cv_10k_pace'
  | 'five_k_pace'
  | 'economy'
  | 'sharpening'
  // Long run categories
  | 'long_aerobic'
  | 'long_progression'
  | 'long_fast_finish'
  | 'long_mp_block'
  | 'long_alternating'
  | 'long_cutback'
  | 'long_fueling'
  // Support / recovery
  | 'aerobic_support'
  | 'recovery_run'
  | 'steady_aerobic';

export type ProgressionVariantLevel = 1 | 2 | 3;
// 1 = entry / foundational
// 2 = intermediate
// 3 = advanced / race-specific

export type WorkoutRepStructure = {
  reps: number;
  distanceKm?: number;
  durationMin?: number;
  recoveryMin?: number;
  recoveryDescription?: string;
};

export interface WorkoutEntry {
  workoutId: string;
  workoutName: string;
  purpose: string;

  // Classification
  stimulusFamily: StimulusFamily;
  workoutCategory: WorkoutCategory;
  sessionType: SessionType;

  // Constraints: what contexts this workout is valid for
  raceFamiliesAllowed: RaceFamily[];
  phasesAllowed: ArchetypePhase[];
  tiersAllowed: AmbitionTier[];
  archetypesAllowed: PlanArchetype[];

  // Blueprint this maps to (for prompt injection)
  qualityBlueprint?: QualitySessionBlueprint;
  longRunFlavour?: LongRunFlavour;
  supportRunRole?: SupportRunRole;

  // Workout purpose alignment
  workoutPurposesServed: WorkoutPurpose[];

  // Difficulty and anti-repeat
  difficultyBudgetCost: number;          // 1–5, relative cost
  antiRepeatCategory: WorkoutCategory;   // used for consecutive-week dedup

  // Progression
  progressionVariantLevel: ProgressionVariantLevel;
  progressionGroupId: string;            // workouts with same groupId can form a progression

  // Rep structure (for interval sessions)
  repStructure?: WorkoutRepStructure;

  // For the AI renderer
  aiRenderingNotes: string;
  effortDescription: string;             // e.g. "RPE 7–8", "threshold pace"
  tipCue: string;                        // coaching tip to inject
}

// ---------------------------------------------------------------------------
// Workout Library
// ---------------------------------------------------------------------------

export const WORKOUT_LIBRARY: WorkoutEntry[] = [

  // =========================================================================
  // THRESHOLD / TEMPO GROUP
  // Foundation quality for all families. Primary value for HM and 10K.
  // =========================================================================

  {
    workoutId: 'threshold_cruise_short',
    workoutName: 'Threshold Cruise Intervals — Short',
    purpose: 'Establish lactate threshold rhythm with short, controlled efforts',
    stimulusFamily: 'threshold_development',
    workoutCategory: 'threshold',
    sessionType: 'quality',
    raceFamiliesAllowed: ['short', '10k', 'half', 'marathon'],
    phasesAllowed: ['aerobic_reset', 'economy_building'],
    tiersAllowed: ['base', 'performance', 'competitive'],
    archetypesAllowed: ['development', 'established', 'established_specificity'],
    qualityBlueprint: 'threshold_cruise',
    workoutPurposesServed: ['threshold_foundation'],
    difficultyBudgetCost: 2,
    antiRepeatCategory: 'threshold',
    progressionVariantLevel: 1,
    progressionGroupId: 'threshold_cruise',
    repStructure: { reps: 3, distanceKm: 1.2, recoveryMin: 1.5, recoveryDescription: 'easy jog' },
    aiRenderingNotes: 'Short cruise intervals. Easy warm-up 10–12 min, then 3 × 1.2 km at threshold pace with 90-sec jog recovery between each, easy cool-down 10 min. Total work: 3.6 km. Keep effort controlled and even across all three reps — this is not a race.',
    effortDescription: 'threshold pace (RPE 7–7.5)',
    tipCue: 'These are control reps, not race efforts. If the third rep requires noticeably more effort than the first, the pace is too aggressive.',
  },

  {
    workoutId: 'threshold_cruise_standard',
    workoutName: 'Threshold Cruise Intervals — Standard',
    purpose: 'Build threshold endurance with steady controlled repeats',
    stimulusFamily: 'threshold_development',
    workoutCategory: 'threshold',
    sessionType: 'quality',
    raceFamiliesAllowed: ['short', '10k', 'half', 'marathon'],
    phasesAllowed: ['economy_building', 'race_specificity'],
    tiersAllowed: ['performance', 'competitive'],
    archetypesAllowed: ['development', 'established', 'established_specificity'],
    qualityBlueprint: 'threshold_cruise',
    workoutPurposesServed: ['threshold_foundation', 'threshold_extension'],
    difficultyBudgetCost: 3,
    antiRepeatCategory: 'threshold',
    progressionVariantLevel: 2,
    progressionGroupId: 'threshold_cruise',
    repStructure: { reps: 4, distanceKm: 1.2, recoveryMin: 1, recoveryDescription: 'easy jog' },
    aiRenderingNotes: 'Standard cruise intervals. Warm up 10–12 min easy, then 4 × 1.2 km at threshold pace with 60-sec jog recovery, cool down 10 min. Total threshold work: 4.8 km. The short recovery is intentional — it develops lactate clearance without going anaerobic.',
    effortDescription: 'threshold pace (RPE 7–7.5)',
    tipCue: 'The 60-second recovery is short by design. You should arrive at each rep slightly tired — that\'s the stimulus. If you feel completely recovered, the effort is too easy.',
  },

  {
    workoutId: 'threshold_cruise_long',
    workoutName: 'Threshold Cruise Intervals — Extended',
    purpose: 'Extend time at threshold with longer rep format',
    stimulusFamily: 'threshold_development',
    workoutCategory: 'threshold',
    sessionType: 'quality',
    raceFamiliesAllowed: ['10k', 'half', 'marathon'],
    phasesAllowed: ['economy_building', 'race_specificity'],
    tiersAllowed: ['performance', 'competitive'],
    archetypesAllowed: ['established', 'established_specificity'],
    qualityBlueprint: 'threshold_cruise',
    workoutPurposesServed: ['threshold_extension'],
    difficultyBudgetCost: 3,
    antiRepeatCategory: 'threshold',
    progressionVariantLevel: 3,
    progressionGroupId: 'threshold_cruise',
    repStructure: { reps: 3, distanceKm: 2.0, recoveryMin: 1.5, recoveryDescription: 'easy jog' },
    aiRenderingNotes: 'Extended cruise intervals. Warm up 10–12 min, then 3 × 2 km at threshold pace with 90-sec jog recovery, cool down 10 min. Total threshold work: 6 km. This is a higher-volume threshold session — respect the recovery; do not run it as a tempo.',
    effortDescription: 'threshold pace (RPE 7–7.5)',
    tipCue: 'Six kilometres of threshold work is a meaningful stimulus. Err slightly conservative on the first rep — the third rep will tell you if the pacing was right.',
  },

  // ---------------------------------------------------------------------------

  {
    workoutId: 'tempo_continuous_short',
    workoutName: 'Continuous Tempo — Short',
    purpose: 'Develop aerobic threshold with unbroken sustained effort',
    stimulusFamily: 'threshold_development',
    workoutCategory: 'tempo',
    sessionType: 'quality',
    raceFamiliesAllowed: ['short', '10k', 'half', 'marathon'],
    phasesAllowed: ['aerobic_reset', 'economy_building'],
    tiersAllowed: ['base', 'performance'],
    archetypesAllowed: ['development', 'established'],
    qualityBlueprint: 'tempo_continuous',
    workoutPurposesServed: ['threshold_foundation'],
    difficultyBudgetCost: 2,
    antiRepeatCategory: 'tempo',
    progressionVariantLevel: 1,
    progressionGroupId: 'tempo_continuous',
    repStructure: { reps: 1, durationMin: 20, recoveryDescription: 'none — single block' },
    aiRenderingNotes: 'Short continuous tempo. Warm up 10–12 min easy, run 20 min at threshold effort (comfortable hard, RPE ~7), cool down 10 min. Single unbroken block — do not split it. This is the entry point for sustained threshold work.',
    effortDescription: 'threshold effort (RPE 7)',
    tipCue: 'The key discipline of tempo running is not stopping. If you must pause, the effort is too high. Settle into a rhythm in the first 5 minutes before committing to the full effort.',
  },

  {
    workoutId: 'tempo_continuous_standard',
    workoutName: 'Continuous Tempo — Standard',
    purpose: 'Build sustained threshold capacity with a longer single block',
    stimulusFamily: 'threshold_development',
    workoutCategory: 'tempo',
    sessionType: 'quality',
    raceFamiliesAllowed: ['10k', 'half', 'marathon'],
    phasesAllowed: ['economy_building', 'race_specificity'],
    tiersAllowed: ['base', 'performance', 'competitive'],
    archetypesAllowed: ['development', 'established', 'established_specificity'],
    qualityBlueprint: 'tempo_continuous',
    workoutPurposesServed: ['threshold_foundation', 'threshold_extension'],
    difficultyBudgetCost: 3,
    antiRepeatCategory: 'tempo',
    progressionVariantLevel: 2,
    progressionGroupId: 'tempo_continuous',
    repStructure: { reps: 1, durationMin: 30, recoveryDescription: 'none — single block' },
    aiRenderingNotes: 'Standard continuous tempo. Warm up 10–12 min easy, then 30 min at threshold effort (RPE ~7–7.5), cool down 10 min. Single unbroken effort block. Total session ~50–55 min. The middle portion (minutes 10–20) is where the real adaptation occurs — do not let the pace drift.',
    effortDescription: 'threshold effort (RPE 7–7.5)',
    tipCue: 'Aim for even or slightly negative splits. The last 5 minutes should feel like you\'re working to hold pace, not accelerating from a comfortable base.',
  },

  {
    workoutId: 'progressive_tempo',
    workoutName: 'Progressive Tempo',
    purpose: 'Build aerobic ceiling by progressively increasing effort over a continuous block',
    stimulusFamily: 'threshold_development',
    workoutCategory: 'tempo',
    sessionType: 'quality',
    raceFamiliesAllowed: ['10k', 'half', 'marathon'],
    phasesAllowed: ['economy_building', 'race_specificity'],
    tiersAllowed: ['performance', 'competitive'],
    archetypesAllowed: ['established', 'established_specificity'],
    qualityBlueprint: 'progressive_tempo',
    workoutPurposesServed: ['threshold_extension', 'lactate_clearance'],
    difficultyBudgetCost: 3,
    antiRepeatCategory: 'tempo',
    progressionVariantLevel: 3,
    progressionGroupId: 'tempo_continuous',
    repStructure: { reps: 1, durationMin: 35, recoveryDescription: 'none — progressive single block' },
    aiRenderingNotes: 'Progressive tempo. Warm up 10–12 min easy. Then run 35 min as: first 12 min at easy-moderate effort (RPE 5–6), middle 12 min building to threshold (RPE 7), final 11 min at or slightly above threshold (RPE 7.5–8). Cool down 10 min. This is a descending-effort-barrier session — the difficulty increases naturally across the block.',
    effortDescription: 'RPE 5–6 building to RPE 7.5–8',
    tipCue: 'The first 12 minutes should feel almost too easy. That\'s correct. You\'re warming into the effort, not racing from the start. The quality of the final 11 minutes depends on how disciplined the first 12 were.',
  },

  // =========================================================================
  // VO2 / CV / 10K PACE GROUP
  // Primary value for 10K and shorter. Supporting value for HM.
  // =========================================================================

  {
    workoutId: 'vo2_intervals_short',
    workoutName: 'VO2max Intervals — Short',
    purpose: 'Develop aerobic ceiling and running economy with sharp short intervals',
    stimulusFamily: 'vo2_economy',
    workoutCategory: 'cv_10k_pace',
    sessionType: 'quality',
    raceFamiliesAllowed: ['short', '10k', 'half'],
    phasesAllowed: ['economy_building', 'race_specificity'],
    tiersAllowed: ['base', 'performance', 'competitive'],
    archetypesAllowed: ['development', 'established', 'established_specificity'],
    qualityBlueprint: 'vo2_intervals',
    workoutPurposesServed: ['vo2_development', 'economy_speed'],
    difficultyBudgetCost: 3,
    antiRepeatCategory: 'cv_10k_pace',
    progressionVariantLevel: 1,
    progressionGroupId: 'vo2_intervals',
    repStructure: { reps: 4, distanceKm: 0.8, recoveryMin: 2.5, recoveryDescription: 'full jog recovery' },
    aiRenderingNotes: 'Short VO2max intervals. Warm up 10–15 min including 4–6 strides. Then 4 × 800 m at approximately 5K effort (RPE 8.5–9) with 2.5 min jog recovery. Cool down 10–12 min. Total high-intensity work: 3.2 km. Full recovery between reps is not laziness — it\'s what makes the next rep possible at quality pace.',
    effortDescription: '5K effort (RPE 8.5–9)',
    tipCue: 'These are near-maximal aerobic efforts. You should be breathing hard at the end of each rep but able to jog the recovery without stopping. If you can\'t complete a rep at quality, take one extra 30 seconds of recovery.',
  },

  {
    workoutId: 'vo2_intervals_standard',
    workoutName: 'VO2max Intervals — Standard',
    purpose: 'Build VO2max and aerobic power with a higher-volume interval set',
    stimulusFamily: 'vo2_economy',
    workoutCategory: 'cv_10k_pace',
    sessionType: 'quality',
    raceFamiliesAllowed: ['short', '10k', 'half'],
    phasesAllowed: ['economy_building', 'race_specificity'],
    tiersAllowed: ['performance', 'competitive'],
    archetypesAllowed: ['development', 'established', 'established_specificity'],
    qualityBlueprint: 'vo2_intervals',
    workoutPurposesServed: ['vo2_development', 'race_pace_exposure'],
    difficultyBudgetCost: 4,
    antiRepeatCategory: 'cv_10k_pace',
    progressionVariantLevel: 2,
    progressionGroupId: 'vo2_intervals',
    repStructure: { reps: 5, distanceKm: 1.0, recoveryMin: 2.5, recoveryDescription: 'full jog recovery' },
    aiRenderingNotes: 'Standard VO2max intervals. Warm up 10–15 min with 4–6 strides. Then 5 × 1 km at 5K effort (RPE 8.5–9) with 2.5 min full jog recovery. Cool down 10 min. Total high-intensity work: 5 km. Quality over quantity — a poor last rep indicates the session has exceeded capacity.',
    effortDescription: '5K effort (RPE 8.5–9)',
    tipCue: 'The standard for this session is that all five reps are completed at the same quality. If the fifth rep is noticeably slower, finish the session and bank the stimulus — do not add extra reps to compensate.',
  },

  {
    workoutId: 'cv_10k_reps',
    workoutName: '10K Pace Repetitions',
    purpose: 'Develop race-specific endurance at 10K pace with structured recovery',
    stimulusFamily: 'vo2_economy',
    workoutCategory: 'cv_10k_pace',
    sessionType: 'quality',
    raceFamiliesAllowed: ['10k', 'half'],
    phasesAllowed: ['economy_building', 'race_specificity'],
    tiersAllowed: ['performance', 'competitive'],
    archetypesAllowed: ['development', 'established', 'established_specificity'],
    qualityBlueprint: 'vo2_intervals',
    workoutPurposesServed: ['race_pace_exposure', 'vo2_development'],
    difficultyBudgetCost: 3,
    antiRepeatCategory: 'cv_10k_pace',
    progressionVariantLevel: 2,
    progressionGroupId: 'cv_reps',
    repStructure: { reps: 5, distanceKm: 1.0, recoveryMin: 2, recoveryDescription: 'easy jog' },
    aiRenderingNotes: 'Race-specific 10K pace reps. Warm up 10–15 min with strides. Then 5 × 1 km at 10K race pace (RPE 8–8.5) with 2 min easy jog recovery. Cool down 10 min. This session bridges CV development and race specificity — the pace is slightly lower than a pure VO2 session, the recovery shorter.',
    effortDescription: '10K race pace (RPE 8–8.5)',
    tipCue: 'If you don\'t have a recent 10K time, target a pace that feels like you could hold it for 30–35 minutes — uncomfortable but not maximal. Even-paced across all five reps is the goal.',
  },

  // =========================================================================
  // HALF MARATHON PACE GROUP
  // Primary value for HM. Supporting for marathon and 10K.
  // =========================================================================

  {
    workoutId: 'hm_pace_intervals',
    workoutName: 'Half Marathon Pace Intervals',
    purpose: 'Develop race-specific endurance at half marathon pace with active recovery',
    stimulusFamily: 'threshold_development',
    workoutCategory: 'hm_pace',
    sessionType: 'quality',
    raceFamiliesAllowed: ['half'],
    phasesAllowed: ['economy_building', 'race_specificity'],
    tiersAllowed: ['base', 'performance', 'competitive'],
    archetypesAllowed: ['development', 'established', 'established_specificity'],
    qualityBlueprint: 'marathon_pace_repeat',
    workoutPurposesServed: ['race_pace_exposure', 'threshold_extension'],
    difficultyBudgetCost: 3,
    antiRepeatCategory: 'hm_pace',
    progressionVariantLevel: 1,
    progressionGroupId: 'hm_pace',
    repStructure: { reps: 3, durationMin: 10, recoveryMin: 2, recoveryDescription: 'easy jog' },
    aiRenderingNotes: 'HM pace intervals. Warm up 10–12 min easy. Then 3 × 10 min at half marathon race pace (RPE 7.5–8) with 2 min jog recovery. Cool down 10 min. This is controlled race-pace exposure — not a test, not a race. The effort should feel sustainable but purposeful.',
    effortDescription: 'half marathon pace (RPE 7.5–8)',
    tipCue: 'If you have a target HM pace, use it here. If not, target the effort where you could hold a short conversation but choose not to. The recovery should feel like genuine relief, not just a brief pause.',
  },

  {
    workoutId: 'hm_pace_extended',
    workoutName: 'Half Marathon Pace — Extended Reps',
    purpose: 'Extend time at half marathon pace to build race-specific endurance',
    stimulusFamily: 'race_specificity_block',
    workoutCategory: 'hm_pace',
    sessionType: 'quality',
    raceFamiliesAllowed: ['half'],
    phasesAllowed: ['race_specificity'],
    tiersAllowed: ['performance', 'competitive'],
    archetypesAllowed: ['established', 'established_specificity'],
    qualityBlueprint: 'marathon_pace_repeat',
    workoutPurposesServed: ['race_pace_extension', 'lactate_clearance'],
    difficultyBudgetCost: 4,
    antiRepeatCategory: 'hm_pace',
    progressionVariantLevel: 2,
    progressionGroupId: 'hm_pace',
    repStructure: { reps: 2, durationMin: 15, recoveryMin: 2.5, recoveryDescription: 'easy jog' },
    aiRenderingNotes: 'Extended HM pace reps. Warm up 10–12 min, then 2 × 15 min at half marathon race pace (RPE 7.5–8) with 2.5 min jog recovery. Cool down 10 min. Total race-pace work: 30 min. This is a significant race-specific session — respect the recovery and do not turn this into a 30-min tempo.',
    effortDescription: 'half marathon pace (RPE 7.5–8)',
    tipCue: 'Thirty minutes of sustained HM-pace work is the full race-specific load in a session. Target even effort across both reps. If the second rep is significantly harder, the first was too aggressive.',
  },

  // =========================================================================
  // MARATHON PACE GROUP
  // Core value for marathon. Appears in long runs and as standalone sessions.
  // =========================================================================

  {
    workoutId: 'mp_repeats_short',
    workoutName: 'Marathon Pace Repetitions — Short',
    purpose: 'Introduce marathon race pace in a controlled interval format',
    stimulusFamily: 'race_specificity_block',
    workoutCategory: 'marathon_pace',
    sessionType: 'quality',
    raceFamiliesAllowed: ['marathon'],
    phasesAllowed: ['economy_building', 'race_specificity'],
    tiersAllowed: ['base', 'performance'],
    archetypesAllowed: ['development', 'established'],
    qualityBlueprint: 'marathon_pace_repeat',
    workoutPurposesServed: ['race_pace_exposure'],
    difficultyBudgetCost: 2,
    antiRepeatCategory: 'marathon_pace',
    progressionVariantLevel: 1,
    progressionGroupId: 'mp_repeats',
    repStructure: { reps: 3, distanceKm: 2.0, recoveryMin: 2, recoveryDescription: 'easy jog' },
    aiRenderingNotes: 'Short MP repetitions. Warm up 10–12 min easy. Then 3 × 2 km at marathon race pace (RPE 6.5–7) with 90-sec jog recovery. Cool down 10 min. Total MP work: 6 km. Marathon pace should feel controlled — you\'re locking in the rhythm, not racing.',
    effortDescription: 'marathon race pace (RPE 6.5–7)',
    tipCue: 'Marathon pace feels almost too easy in a short session like this. That\'s correct. The goal is rhythm and pacing accuracy, not fatigue accumulation. If it feels genuinely hard, the pace is too fast.',
  },

  {
    workoutId: 'mp_repeats_standard',
    workoutName: 'Marathon Pace Repetitions — Standard',
    purpose: 'Build MP endurance and race rhythm with a higher-volume rep session',
    stimulusFamily: 'race_specificity_block',
    workoutCategory: 'marathon_pace',
    sessionType: 'quality',
    raceFamiliesAllowed: ['marathon'],
    phasesAllowed: ['race_specificity'],
    tiersAllowed: ['performance', 'competitive'],
    archetypesAllowed: ['established', 'established_specificity'],
    qualityBlueprint: 'marathon_pace_repeat',
    workoutPurposesServed: ['race_pace_extension'],
    difficultyBudgetCost: 3,
    antiRepeatCategory: 'marathon_pace',
    progressionVariantLevel: 2,
    progressionGroupId: 'mp_repeats',
    repStructure: { reps: 4, distanceKm: 2.0, recoveryMin: 1.5, recoveryDescription: 'easy jog' },
    aiRenderingNotes: 'Standard MP repetitions. Warm up 10–12 min, then 4 × 2 km at marathon race pace (RPE 6.5–7) with 90-sec jog recovery. Cool down 10 min. Total MP work: 8 km. This begins to approach meaningful race-pace load — the slightly shorter recovery creates an accumulated fatigue that more closely resembles late-race conditions.',
    effortDescription: 'marathon race pace (RPE 6.5–7)',
    tipCue: 'By the fourth rep your legs should feel the accumulated effort of earlier reps. This is the point. Stay controlled — resist the urge to speed up on the last rep.',
  },

  // =========================================================================
  // 5K PACE / RACE PACE SHARPENING GROUP
  // Primary for 5K family. Supporting for 10K. Taper use across all.
  // =========================================================================

  {
    workoutId: 'five_k_pace_reps',
    workoutName: '5K Pace Repetitions',
    purpose: 'Develop race-specific speed and aerobic ceiling at 5K effort',
    stimulusFamily: 'vo2_economy',
    workoutCategory: 'five_k_pace',
    sessionType: 'quality',
    raceFamiliesAllowed: ['short', '10k'],
    phasesAllowed: ['economy_building', 'race_specificity'],
    tiersAllowed: ['performance', 'competitive'],
    archetypesAllowed: ['development', 'established', 'established_specificity'],
    qualityBlueprint: 'race_pace_sharpener',
    workoutPurposesServed: ['race_pace_exposure', 'vo2_development'],
    difficultyBudgetCost: 3,
    antiRepeatCategory: 'five_k_pace',
    progressionVariantLevel: 2,
    progressionGroupId: '5k_pace',
    repStructure: { reps: 6, distanceKm: 0.8, recoveryMin: 2.5, recoveryDescription: 'full recovery jog' },
    aiRenderingNotes: '5K pace reps. Warm up 10–15 min with 4–6 strides. Then 6 × 800 m at 5K race pace (RPE 8.5–9) with 2.5 min full recovery. Cool down 10 min. Total 5K-pace work: 4.8 km. These are race-pace reps — all at genuine 5K effort. Do not let the early reps drift into "fast but comfortable" territory.',
    effortDescription: '5K race pace (RPE 8.5–9)',
    tipCue: 'The goal is race-pace accuracy, not maximum effort. If you don\'t have a 5K time, target the pace you could sustain for 18–22 minutes of hard continuous running.',
  },

  {
    workoutId: 'race_pace_sharpener',
    workoutName: 'Race Pace Sharpener',
    purpose: 'Maintain neuromuscular sharpness at race pace with short crisp efforts',
    stimulusFamily: 'race_specificity_block',
    workoutCategory: 'sharpening',
    sessionType: 'quality',
    raceFamiliesAllowed: ['short', '10k', 'half', 'marathon'],
    phasesAllowed: ['race_specificity', 'taper'],
    tiersAllowed: ['base', 'performance', 'competitive'],
    archetypesAllowed: ['development', 'established', 'established_specificity'],
    qualityBlueprint: 'race_pace_sharpener',
    workoutPurposesServed: ['sharpening'],
    difficultyBudgetCost: 2,
    antiRepeatCategory: 'sharpening',
    progressionVariantLevel: 2,
    progressionGroupId: 'sharpener',
    repStructure: { reps: 5, distanceKm: 0.4, recoveryMin: 2.5, recoveryDescription: 'full recovery' },
    aiRenderingNotes: 'Race pace sharpener. Warm up 12–15 min including 4 strides. Then 5 × 400 m at race pace (or slightly faster) with full 2.5 min recovery. Cool down 10 min. Total sharp work: 2 km. This session is about quality and feel, not load. The total volume is deliberately low.',
    effortDescription: 'race pace or 1–2% faster (RPE 8.5–9)',
    tipCue: 'These are short, sharp, and complete. Full recovery between every rep. The purpose is not to tire you — it\'s to remind your legs what race pace feels like. Leave feeling activated, not depleted.',
  },

  // =========================================================================
  // ECONOMY / STRIDES GROUP
  // Neuromuscular work. Applies across all families. Light cost.
  // =========================================================================

  {
    workoutId: 'economy_strides',
    workoutName: 'Economy Strides Set',
    purpose: 'Develop running economy and neuromuscular efficiency with short fast strides',
    stimulusFamily: 'vo2_economy',
    workoutCategory: 'economy',
    sessionType: 'quality',
    raceFamiliesAllowed: ['short', '10k', 'half', 'marathon'],
    phasesAllowed: ['aerobic_reset', 'economy_building', 'race_specificity', 'taper'],
    tiersAllowed: ['base', 'performance', 'competitive'],
    archetypesAllowed: ['development', 'established', 'established_specificity'],
    qualityBlueprint: 'economy_strides_set',
    workoutPurposesServed: ['economy_speed', 'maintenance'],
    difficultyBudgetCost: 1,
    antiRepeatCategory: 'economy',
    progressionVariantLevel: 1,
    progressionGroupId: 'economy',
    repStructure: { reps: 8, durationMin: 0.33, recoveryMin: 1.5, recoveryDescription: 'full walking/standing recovery' },
    aiRenderingNotes: 'Economy strides set. Easy run 25–30 min, then at the end: 8 × 20 seconds at fast but controlled effort (roughly 1-mile effort, not sprint) with 60–90 sec full recovery between each. No warm-up separate from the easy run — the strides cap the end of the aerobic session. Focus on form: tall posture, fast turnover, relaxed arms.',
    effortDescription: '1-mile effort (RPE 8–9), never a sprint',
    tipCue: 'Strides are about form and activation, not maximum speed. Think about running tall and light. If your form breaks down, you\'re going too hard.',
  },

  {
    workoutId: 'light_aerobic_quality',
    workoutName: 'Light Aerobic Quality',
    purpose: 'Introduce gentle quality stimulus without meaningful stress load',
    stimulusFamily: 'aerobic_base',
    workoutCategory: 'economy',
    sessionType: 'quality',
    raceFamiliesAllowed: ['short', '10k', 'half', 'marathon'],
    phasesAllowed: ['aerobic_reset', 'taper'],
    tiersAllowed: ['base'],
    archetypesAllowed: ['development'],
    qualityBlueprint: 'light_aerobic_quality',
    workoutPurposesServed: ['aerobic_development', 'maintenance'],
    difficultyBudgetCost: 1,
    antiRepeatCategory: 'economy',
    progressionVariantLevel: 1,
    progressionGroupId: 'light_quality',
    repStructure: { reps: 6, durationMin: 0.33, recoveryMin: 1, recoveryDescription: 'easy jog or walk' },
    aiRenderingNotes: 'Light aerobic quality. Easy run 20–25 min, then 6 × 20 sec at comfortable-fast effort (RPE 6–7) with easy 60-sec jog recovery. Total: ~35–40 min. This is an aerobic session with a light quality finish — not a workout in the traditional sense. It provides gentle neuromuscular stimulus during a low-demand week.',
    effortDescription: 'comfortable-fast (RPE 6–7)',
    tipCue: 'These are gentle accelerations, not hard efforts. You should feel more alert after this session, not tired. If you feel more than mildly elevated heart rate, ease off.',
  },

  // =========================================================================
  // LONG RUN LIBRARY
  // Flavour-keyed. Assigns specific structure and coaching intent.
  // =========================================================================

  {
    workoutId: 'long_run_easy_aerobic',
    workoutName: 'Easy Aerobic Long Run',
    purpose: 'Build aerobic endurance through sustained easy effort without pace targets',
    stimulusFamily: 'aerobic_base',
    workoutCategory: 'long_aerobic',
    sessionType: 'long_run',
    raceFamiliesAllowed: ['short', '10k', 'half', 'marathon'],
    phasesAllowed: ['aerobic_reset', 'economy_building'],
    tiersAllowed: ['base', 'performance', 'competitive'],
    archetypesAllowed: ['development', 'established', 'established_specificity'],
    longRunFlavour: 'easy_aerobic',
    workoutPurposesServed: ['aerobic_development'],
    difficultyBudgetCost: 1,
    antiRepeatCategory: 'long_aerobic',
    progressionVariantLevel: 1,
    progressionGroupId: 'long_aerobic',
    aiRenderingNotes: 'Easy aerobic long run at the assigned distance. Steady effort throughout, RPE 4–5, fully conversational pace. No structured content — no pace targets, no surges, no progressive elements. The value is time on feet and aerobic accumulation. Run relaxed and consistent from start to finish.',
    effortDescription: 'steady aerobic (RPE 4–5)',
    tipCue: 'This run should feel comfortable even in the final kilometre. If you\'re breathing hard, you\'re running too fast. The adaptation comes from the duration, not the pace.',
  },

  {
    workoutId: 'long_run_progression',
    workoutName: 'Progression Long Run',
    purpose: 'Develop aerobic progression and late-run pacing discipline',
    stimulusFamily: 'threshold_development',
    workoutCategory: 'long_progression',
    sessionType: 'long_run',
    raceFamiliesAllowed: ['short', '10k', 'half', 'marathon'],
    phasesAllowed: ['economy_building', 'race_specificity'],
    tiersAllowed: ['base', 'performance', 'competitive'],
    archetypesAllowed: ['development', 'established', 'established_specificity'],
    longRunFlavour: 'progression',
    workoutPurposesServed: ['aerobic_development', 'threshold_foundation'],
    difficultyBudgetCost: 2,
    antiRepeatCategory: 'long_progression',
    progressionVariantLevel: 2,
    progressionGroupId: 'long_structured',
    aiRenderingNotes: 'Progression long run at the assigned distance. Start at easy aerobic effort (RPE 4) for the first 60% of the run. Then steadily increase effort across the final 40%, arriving at comfortably hard (RPE 6–6.5) by the last kilometre. No hard finish surge — this is a gradual, continuous build. If the run is a deload week, limit the build to RPE 5.5 maximum.',
    effortDescription: 'RPE 4 building to RPE 6–6.5 in the final third',
    tipCue: 'The quality of a progression run is measured by whether the first third was genuinely easy. Start slower than feels right — the effort in the final third will be earned, not forced.',
  },

  {
    workoutId: 'long_run_fast_finish',
    workoutName: 'Fast-Finish Long Run',
    purpose: 'Develop ability to run strong at the end of a long aerobic effort',
    stimulusFamily: 'threshold_development',
    workoutCategory: 'long_fast_finish',
    sessionType: 'long_run',
    raceFamiliesAllowed: ['10k', 'half', 'marathon'],
    phasesAllowed: ['economy_building', 'race_specificity'],
    tiersAllowed: ['performance', 'competitive'],
    archetypesAllowed: ['established', 'established_specificity'],
    longRunFlavour: 'fast_finish',
    workoutPurposesServed: ['threshold_extension', 'race_pace_exposure'],
    difficultyBudgetCost: 3,
    antiRepeatCategory: 'long_fast_finish',
    progressionVariantLevel: 2,
    progressionGroupId: 'long_structured',
    aiRenderingNotes: 'Fast-finish long run at the assigned distance. Run easy aerobic effort (RPE 4–5) for the first 70–75% of the run. Then pick up to comfortably hard effort (RPE 6.5–7) for the final 25–30%. This is a deliberate shift in gear — not a gradual build but a held effort change. The purpose is to practice running strong when already fatigued from the aerobic portion.',
    effortDescription: 'RPE 4–5 then RPE 6.5–7 in final 25%',
    tipCue: 'The transition to fast-finish should be abrupt, not gradual. Find the gear and hold it. If the final section feels effortless, you didn\'t push hard enough — if it falls apart, you went too hard too soon.',
  },

  {
    workoutId: 'long_run_mp_block',
    workoutName: 'Marathon Pace Block Long Run',
    purpose: 'Build marathon-pace specific endurance within a long aerobic run',
    stimulusFamily: 'race_specificity_block',
    workoutCategory: 'long_mp_block',
    sessionType: 'long_run',
    raceFamiliesAllowed: ['half', 'marathon'],
    phasesAllowed: ['economy_building', 'race_specificity'],
    tiersAllowed: ['performance', 'competitive'],
    archetypesAllowed: ['established', 'established_specificity'],
    longRunFlavour: 'mp_block',
    workoutPurposesServed: ['race_pace_exposure', 'race_pace_extension'],
    difficultyBudgetCost: 4,
    antiRepeatCategory: 'long_mp_block',
    progressionVariantLevel: 2,
    progressionGroupId: 'long_race_specific',
    aiRenderingNotes: 'Marathon-pace block long run at the assigned distance. Structure: warm-up phase at easy effort (RPE 4–5) for the first 25–30% of the run, then structured MP blocks in the middle 40–50% (race pace, RPE 6.5–7), then return to easy effort for the final 20–25% as a cool-down. Total MP work within the long run: defined by the tier (base: 4–6 km, performance: 6–12 km, competitive: 12–18 km, not exceeding 60% of total long run distance). Outside MP blocks, run at easy aerobic effort — do not let "between blocks" drift up in effort.',
    effortDescription: 'easy RPE 4–5 with MP blocks at RPE 6.5–7',
    tipCue: 'The MP blocks within a long run are harder than standalone MP repeats because of the accumulated fatigue. Start the first block conservatively — the goal is to finish the run and finish the MP block, not demonstrate speed.',
  },

  {
    workoutId: 'long_run_alternating_mp',
    workoutName: 'Alternating MP / Steady Long Run',
    purpose: 'Develop race-specific metabolic efficiency through alternating effort blocks',
    stimulusFamily: 'race_specificity_block',
    workoutCategory: 'long_alternating',
    sessionType: 'long_run',
    raceFamiliesAllowed: ['marathon'],
    phasesAllowed: ['race_specificity'],
    tiersAllowed: ['competitive'],
    archetypesAllowed: ['established_specificity'],
    longRunFlavour: 'alternating_mp_steady',
    workoutPurposesServed: ['race_pace_extension', 'lactate_clearance'],
    difficultyBudgetCost: 5,
    antiRepeatCategory: 'long_alternating',
    progressionVariantLevel: 3,
    progressionGroupId: 'long_race_specific',
    aiRenderingNotes: 'Alternating MP/steady long run at the assigned distance. Warm up 3–4 km easy (RPE 4). Then alternate between marathon pace (RPE 6.5–7) blocks and steady aerobic (RPE 5–5.5) blocks throughout the main body of the run. Suggested block pattern: 3 km MP / 2 km steady, repeated 3–4 times depending on total distance. Finish with 2–3 km easy. This is the most demanding long run format — do not schedule it in the same week as a hard quality session.',
    effortDescription: 'alternating MP (RPE 6.5–7) and steady (RPE 5–5.5)',
    tipCue: 'The steady blocks are recovery, not rest. Maintain good form and aerobic effort during the steady sections — you\'re teaching your body to process fatigue while still moving efficiently.',
  },

  {
    workoutId: 'long_run_cutback',
    workoutName: 'Cutback Long Run',
    purpose: 'Allow active recovery and consolidation of prior training load',
    stimulusFamily: 'absorb',
    workoutCategory: 'long_cutback',
    sessionType: 'long_run',
    raceFamiliesAllowed: ['short', '10k', 'half', 'marathon'],
    phasesAllowed: ['aerobic_reset', 'economy_building', 'race_specificity', 'taper'],
    tiersAllowed: ['base', 'performance', 'competitive'],
    archetypesAllowed: ['development', 'established', 'established_specificity'],
    longRunFlavour: 'cutback',
    workoutPurposesServed: ['maintenance'],
    difficultyBudgetCost: 0,
    antiRepeatCategory: 'long_cutback',
    progressionVariantLevel: 1,
    progressionGroupId: 'long_absorb',
    aiRenderingNotes: 'Cutback long run at the assigned distance (shorter than prior week). Easy effort throughout, RPE 3–4. No structure, no progressive elements, no pace targets. This is an active recovery run — the body is consolidating adaptations from recent harder weeks. The run should feel easy from start to finish. If legs are still sore from prior weeks, reduce the distance further by 10–15% and note it in the tip.',
    effortDescription: 'easy recovery (RPE 3–4)',
    tipCue: 'A cutback run that feels too easy is correct. If this run is leaving you fatigued, reduce the distance. This week\'s purpose is consolidation, not accumulation.',
  },

  {
    workoutId: 'long_run_fueling_practice',
    workoutName: 'Fueling Practice Long Run',
    purpose: 'Develop race-day nutrition and hydration strategy through deliberate practice',
    stimulusFamily: 'aerobic_base',
    workoutCategory: 'long_fueling',
    sessionType: 'long_run',
    raceFamiliesAllowed: ['half', 'marathon'],
    phasesAllowed: ['economy_building', 'race_specificity'],
    tiersAllowed: ['base', 'performance', 'competitive'],
    archetypesAllowed: ['development', 'established', 'established_specificity'],
    longRunFlavour: 'fueling_practice',
    workoutPurposesServed: ['aerobic_development', 'race_pace_exposure'],
    difficultyBudgetCost: 1,
    antiRepeatCategory: 'long_fueling',
    progressionVariantLevel: 1,
    progressionGroupId: 'long_aerobic',
    aiRenderingNotes: 'Fueling-practice long run at the assigned distance. Easy aerobic effort throughout (RPE 4–5). The primary purpose is practising race-day fueling: take gels or nutrition every 40–45 minutes (starting at 45 min), and hydrate every 20–30 min. Log what you used and how your stomach responded. The run itself is easy — the practice is the purpose.',
    effortDescription: 'easy aerobic (RPE 4–5)',
    tipCue: 'Plan your fueling before you leave the door. If you\'re not practising a specific product or strategy, use today\'s run to establish your fueling rhythm — timing matters more than what you eat for now.',
  },

  // =========================================================================
  // SUPPORT RUN LIBRARY
  // Templates for easy and recovery runs that fill the non-quality days.
  // =========================================================================

  {
    workoutId: 'recovery_run',
    workoutName: 'Recovery Run',
    purpose: 'Active recovery — maintain blood flow and movement without adding stress',
    stimulusFamily: 'absorb',
    workoutCategory: 'recovery_run',
    sessionType: 'recovery',
    raceFamiliesAllowed: ['short', '10k', 'half', 'marathon'],
    phasesAllowed: ['aerobic_reset', 'economy_building', 'race_specificity', 'taper'],
    tiersAllowed: ['base', 'performance', 'competitive'],
    archetypesAllowed: ['development', 'established', 'established_specificity'],
    supportRunRole: 'recovery',
    workoutPurposesServed: ['maintenance'],
    difficultyBudgetCost: 0,
    antiRepeatCategory: 'recovery_run',
    progressionVariantLevel: 1,
    progressionGroupId: 'support',
    aiRenderingNotes: 'Recovery run. Genuinely easy effort, RPE 2–3. Duration follows the assigned weekly volume split. No tempo finish, no strides, no progressive elements. Purpose: active recovery, blood flow, adaptation consolidation. If still sore from a prior session, reduce by 10–15% or substitute a walk. Heart rate should remain well below threshold throughout.',
    effortDescription: 'genuinely easy (RPE 2–3)',
    tipCue: 'A recovery run that feels embarrassingly slow is doing its job. There is no fitness benefit to running this faster — the benefit comes from allowing prior sessions to be absorbed.',
  },

  {
    workoutId: 'aerobic_support_run',
    workoutName: 'Aerobic Support Run',
    purpose: 'Standard easy aerobic run building aerobic base and volume',
    stimulusFamily: 'aerobic_base',
    workoutCategory: 'aerobic_support',
    sessionType: 'support',
    raceFamiliesAllowed: ['short', '10k', 'half', 'marathon'],
    phasesAllowed: ['aerobic_reset', 'economy_building', 'race_specificity', 'taper'],
    tiersAllowed: ['base', 'performance', 'competitive'],
    archetypesAllowed: ['development', 'established', 'established_specificity'],
    supportRunRole: 'aerobic_support',
    workoutPurposesServed: ['aerobic_development'],
    difficultyBudgetCost: 0,
    antiRepeatCategory: 'aerobic_support',
    progressionVariantLevel: 1,
    progressionGroupId: 'support',
    aiRenderingNotes: 'Aerobic support run. Easy effort, RPE 3–4. Duration follows the assigned volume split. Optional: 4–6 strides at the end (20 sec fast with full recovery) for neuromuscular activation — only when legs feel good, never when fatigued. The run should feel comfortable throughout. Heart rate comfortably aerobic.',
    effortDescription: 'easy aerobic (RPE 3–4)',
    tipCue: 'These runs are the backbone of your training week. They don\'t feel heroic because they\'re not supposed to — they\'re making the hard sessions possible.',
  },

  {
    workoutId: 'steady_aerobic_run',
    workoutName: 'Steady Aerobic Run',
    purpose: 'Build aerobic density with a slightly firmer easy-to-moderate effort',
    stimulusFamily: 'aerobic_base',
    workoutCategory: 'steady_aerobic',
    sessionType: 'support',
    raceFamiliesAllowed: ['10k', 'half', 'marathon'],
    phasesAllowed: ['economy_building', 'race_specificity'],
    tiersAllowed: ['performance', 'competitive'],
    archetypesAllowed: ['established', 'established_specificity'],
    supportRunRole: 'steady_aerobic',
    workoutPurposesServed: ['aerobic_development', 'threshold_foundation'],
    difficultyBudgetCost: 1,
    antiRepeatCategory: 'steady_aerobic',
    progressionVariantLevel: 2,
    progressionGroupId: 'support',
    aiRenderingNotes: 'Steady aerobic run. Slightly firmer than easy — marathon-feel effort, RPE 4–5. Duration follows assigned volume. This is not a quality session but sits slightly above pure recovery. It builds aerobic density without quality-session stress. Heart rate should be aerobic but not conversational. Do not let this become a tempo effort.',
    effortDescription: 'steady aerobic / marathon feel (RPE 4–5)',
    tipCue: 'This run sits between easy and tempo — it should feel purposeful but sustainable for hours. If you\'re breathing through your mouth and can\'t hold a conversation, you\'ve drifted too hard.',
  },
];

// ---------------------------------------------------------------------------
// Index helpers — fast lookup by key fields
// ---------------------------------------------------------------------------

export const WORKOUT_BY_ID: Record<string, WorkoutEntry> = Object.fromEntries(
  WORKOUT_LIBRARY.map(w => [w.workoutId, w])
);

export const QUALITY_WORKOUTS = WORKOUT_LIBRARY.filter(w => w.sessionType === 'quality');
export const LONG_RUN_WORKOUTS = WORKOUT_LIBRARY.filter(w => w.sessionType === 'long_run');
export const SUPPORT_WORKOUTS = WORKOUT_LIBRARY.filter(w =>
  w.sessionType === 'support' || w.sessionType === 'recovery'
);

export function getWorkoutById(id: string): WorkoutEntry | undefined {
  return WORKOUT_BY_ID[id];
}

export function getQualityWorkoutsFor(
  family: RaceFamily,
  phase: ArchetypePhase,
  tier: AmbitionTier,
  archetype: PlanArchetype
): WorkoutEntry[] {
  return QUALITY_WORKOUTS.filter(w =>
    w.raceFamiliesAllowed.includes(family) &&
    w.phasesAllowed.includes(phase) &&
    w.tiersAllowed.includes(tier) &&
    w.archetypesAllowed.includes(archetype)
  );
}

export function getLongRunWorkoutFor(
  flavour: LongRunFlavour,
  family: RaceFamily,
  phase: ArchetypePhase,
  tier: AmbitionTier
): WorkoutEntry | undefined {
  return LONG_RUN_WORKOUTS.find(w =>
    w.longRunFlavour === flavour &&
    w.raceFamiliesAllowed.includes(family) &&
    w.phasesAllowed.includes(phase) &&
    w.tiersAllowed.includes(tier)
  ) ?? LONG_RUN_WORKOUTS.find(w =>
    w.longRunFlavour === flavour &&
    w.raceFamiliesAllowed.includes(family)
  );
}

export function getSupportWorkoutFor(
  role: SupportRunRole,
  family: RaceFamily,
  tier: AmbitionTier
): WorkoutEntry {
  const match = SUPPORT_WORKOUTS.find(w =>
    w.supportRunRole === role &&
    w.raceFamiliesAllowed.includes(family) &&
    w.tiersAllowed.includes(tier)
  );
  return match ?? SUPPORT_WORKOUTS.find(w => w.supportRunRole === role) ?? SUPPORT_WORKOUTS[0];
}
