import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_BoltDatabase_URL;
const supabaseAnonKey = import.meta.env.VITE_BoltDatabase_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables. Please check your .env file.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});

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

export interface TrainingPlan {
  id: string;
  user_id: string;
  answers: RunnerAnswers;
  plan_data: PlanData;
  plan_type: 'static' | 'responsive';
  chat_history: ChatMessage[];
  is_active: boolean;
  start_date: string;
  training_paces?: TrainingPaces | null;
  created_at: string;
  updated_at: string;
}

export interface RunnerAnswers {
  experience?: string;
  raceDistance?: string;
  raceDate?: string;
  planWeeks?: number;
  longestRun?: number;
  currentWeeklyKm?: number;
  availableDays?: string[];
  daysPerWeek?: number;
  injuries?: string;
}

export interface PlanData {
  plan: WeekPlan[];
}

export interface DayWorkout {
  workout: string;
  tips: string[];
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
