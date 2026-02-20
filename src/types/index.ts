export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface TrainingPaces {
  easyPace: string;
  longRunPace: string;
  tempoPace: string;
  intervalPace: string;
  racePace: string;
}

export interface RunnerAnswers {
  experience?: string;
  raceDistance?: string;
  ultraDistanceKm?: number;
  customStartDate?: string;
  raceDate?: string;
  raceName?: string;
  raceLocation?: string;
  planWeeks?: number;
  longestRun?: number;
  currentWeeklyKm?: number;
  availableDays?: string[];
  daysPerWeek?: number;
  injuries?: string;
  recentRaceDistance?: string;
  recentRaceHours?: number;
  recentRaceMinutes?: number;
  recentRaceSeconds?: number;
  includeCalibrationRun?: boolean;
}

export interface CalibrationResult {
  testType: '5K' | '10K' | 'HM' | 'MARATHON' | 'ULTRA';
  completedAtISO: string;
  workSegmentDurationMinutes: number;
  workSegmentDistanceMeters: number;
  averagePaceSecPerKm: number;
  paceVariabilityPct?: number;
  firstHalfVsSecondHalfSplitPct?: number;
  pausedTimeSeconds: number;
  elevationGainMeters: number;
  avgHeartRate?: number;
  hrDriftPct?: number;
  validity: 'high' | 'medium' | 'low';
  pacingQuality: 'good' | 'mixed' | 'poor';
  confidence: 'high' | 'medium' | 'low';
}

export interface DayWorkout {
  workout: string;
  tips: string[];
  workoutType?: 'normal' | 'calibration';
  calibrationTag?: {
    kind: 'calibration';
    testType: string;
  };
}

export interface DayWorkoutWithDate {
  date: string;
  dow: string;
  workout: string;
  tips: string[];
  workout_type?: 'TRAIN' | 'REST' | 'RACE';
  workoutType?: 'normal' | 'calibration';
  calibrationTag?: {
    kind: 'calibration';
    testType: string;
  };
}

export interface WeekPlan {
  week: number;
  days: {
    Mon: string | DayWorkout;
    Tue: string | DayWorkout;
    Wed: string | DayWorkout;
    Thu: string | DayWorkout;
    Fri: string | DayWorkout;
    Sat: string | DayWorkout;
    Sun: string | DayWorkout;
  };
}

export interface PlanData {
  plan: WeekPlan[];
  tips?: string[];
  days?: DayWorkoutWithDate[];
  plan_type?: string;
  start_date?: string;
  race_date?: string;
  steps_meta?: StepsMeta;
}

export interface DateBasedPlanData {
  plan_type: 'date_based_preview' | 'date_based_full';
  start_date: string;
  race_date: string;
  preview_range_days?: number;
  days: DayWorkoutWithDate[];
  plan?: WeekPlan[];
  tips?: string[];
  steps_meta?: StepsMeta;
}

export interface TrainingPlan {
  id: string;
  user_id: string;
  answers: RunnerAnswers;
  plan_data: PlanData | DateBasedPlanData;
  plan_type: 'static' | 'responsive' | 'weeks_based' | 'date_based_preview' | 'date_based_full';
  chat_history: ChatMessage[];
  is_active: boolean;
  start_date: string;
  race_date?: string;
  race_name?: string;
  race_location?: string;
  duration_weeks?: number;
  preview_range_days?: number;
  final_preferences?: RunnerAnswers;
  training_paces?: TrainingPaces | null;
  calibration_result?: CalibrationResult | null;
  archived: boolean;
  created_at: string;
  updated_at: string;
  completion_count?: number;
}

export type AppState = 'landing' | 'questionnaire' | 'viewPlan' | 'savedPlans' | 'login' | 'about';

export interface WorkoutCompletion {
  id?: string;
  user_id: string;
  plan_id: string;
  workout_date: string;
  week_number: number;
  day_name: string;
  workout_description: string;
  completed: boolean;
  rpe?: number;
  enjoyment?: number;
  notes?: string;
  distance_km?: number;
  duration_minutes?: number;
  created_at?: string;
  updated_at?: string;
}

export interface Badge {
  id: string;
  name: string;
  description: string;
  icon: string;
  requirement: number;
  category: 'streak' | 'distance' | 'consistency' | 'milestone';
}

export interface UserBadge {
  id: string;
  user_id: string;
  badge_id: string;
  earned_date: string;
  plan_id?: string;
}

export interface Streak {
  id: string;
  user_id: string;
  plan_id: string;
  current_streak: number;
  longest_streak: number;
  last_workout_date?: string;
  total_workouts_completed: number;
  updated_at: string;
}

export interface PlanGenerationJob {
  id: string;
  user_id: string;
  plan_id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  error_message?: string;
  created_at: string;
  started_at?: string;
  completed_at?: string;
}

export type StepId = 'aerobic_base' | 'threshold' | 'economy' | 'race_specific';

export type WorkoutRole = 'base' | 'threshold' | 'economy' | 'race_specific' | 'recovery' | 'calibration';

export type CompletionStatus = 'completed' | 'modified' | 'missed';

export type EffortLevel = 'easier' | 'as_expected' | 'harder';

export type HrMatch = 'yes' | 'no' | 'unsure';

export type ConfidenceLevel = 'low' | 'med' | 'high';

export type RecommendedAction = 'progress' | 'hold_slightly' | 'consolidate' | 'reduce_load' | 'progress_with_caution';

export type ReasonCode = 'LOW_COMPLETION' | 'HIGH_EFFORT' | 'LOW_DATA' | 'GOOD_PROGRESS' | 'TIME_BOX_ESCAPE' | 'HR_MISMATCH' | 'RACE_IMMINENT' | 'MISSING_STEP_META';

export interface PlanStep {
  step_id: StepId;
  name: string;
  purpose: string;
  typical_duration_weeks: number;
  max_duration_weeks: number;
  initial_week_range_estimate?: {
    start_week: number;
    end_week: number;
  };
}

export interface WeekFocus {
  week_number: number;
  focus_step_id: StepId;
}

export interface StepsMeta {
  steps_enabled: boolean;
  reason?: string;
  current_focus_only?: boolean;
  allowed_steps?: StepId[];
  plan_steps?: PlanStep[];
  week_focus?: WeekFocus[];
  workout_roles?: Record<string, WorkoutRole>;
  generated_at?: string;
  generator_version?: string;
}

export interface ProgressPanel {
  current_focus_name: string;
  why_it_matters: string;
  steps_enabled: boolean;
  show_progress_bar: boolean;
  progress_percent?: number | null;
  confidence?: ConfidenceLevel | null;
  this_week_strategy: string;
  accuracy_hint?: string;
  reason_codes?: ReasonCode[];
}

export interface WorkoutFeedback {
  id?: string;
  training_plan_id: string;
  user_id: string;
  normalized_workout_id: string;
  workout_date: string;
  week_number?: number;
  dow?: string;
  completion_status: CompletionStatus;
  effort_vs_expected?: EffortLevel;
  hr_matched_target?: HrMatch;
  notes?: string;
  is_key_workout?: boolean;
  workout_type?: string;
  workout_role?: WorkoutRole;
  created_at?: string;
  updated_at?: string;
}

export interface StepStatusEvaluation {
  progress_percent: number;
  confidence: ConfidenceLevel;
  recommended_action: RecommendedAction;
  reason_codes: ReasonCode[];
  time_box_escape: boolean;
}
