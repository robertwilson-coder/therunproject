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
}

export interface DateBasedPlanData {
  plan_type: 'date_based_preview' | 'date_based_full';
  start_date: string;
  race_date: string;
  preview_range_days?: number;
  days: DayWorkoutWithDate[];
  plan?: WeekPlan[];
  tips?: string[];
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

export type AppState = 'landing' | 'questionnaire' | 'viewPlan' | 'savedPlans' | 'login';

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
