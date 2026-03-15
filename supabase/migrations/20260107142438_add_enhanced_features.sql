/*
  # Enhanced Training Features

  ## New Tables
  
  ### 1. `workout_notes`
  - Stores journal entries and notes for completed workouts
  - Fields: id, user_id, training_plan_id, week_number, day_name, notes, mood, created_at, updated_at
  
  ### 2. `user_streaks`
  - Tracks workout streaks and achievements
  - Fields: id, user_id, current_streak, longest_streak, total_workouts, last_workout_date, badges, updated_at
  
  ### 3. `heart_rate_zones`
  - Stores personalized heart rate zones for users
  - Fields: id, user_id, max_hr, rest_hr, zone1_min, zone1_max, zone2_min, zone2_max, zone3_min, zone3_max, zone4_min, zone4_max, zone5_min, zone5_max, created_at, updated_at
  
  ### 4. `sleep_logs`
  - Daily sleep quality tracking
  - Fields: id, user_id, log_date, hours_slept, quality_rating, notes, created_at
  
  ### 5. `resting_heart_rate_logs`
  - Daily resting heart rate measurements
  - Fields: id, user_id, log_date, resting_hr, notes, created_at
  
  ### 6. `injury_logs`
  - Injury tracking and management
  - Fields: id, user_id, injury_type, severity, body_part, start_date, end_date, status, notes, created_at, updated_at
  
  ### 7. `hydration_logs`
  - Daily hydration tracking
  - Fields: id, user_id, log_date, water_ml, electrolytes, notes, created_at
  
  ### 8. `nutrition_logs`
  - Meal and nutrition tracking
  - Fields: id, user_id, log_date, meal_type, description, calories, carbs_g, protein_g, fat_g, notes, created_at
  
  ### 9. `race_plans`
  - Race day information and pacing strategies
  - Fields: id, user_id, training_plan_id, race_name, race_date, race_distance, target_time, pacing_strategy, weather_notes, notes, created_at, updated_at

  ## Security
  - Enable RLS on all new tables
  - Add policies for authenticated users to manage their own data
*/

-- Workout notes table
CREATE TABLE IF NOT EXISTS workout_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  training_plan_id uuid REFERENCES training_plans(id) ON DELETE CASCADE,
  week_number integer NOT NULL,
  day_name text NOT NULL,
  notes text,
  mood text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE workout_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own workout notes"
  ON workout_notes FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own workout notes"
  ON workout_notes FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own workout notes"
  ON workout_notes FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own workout notes"
  ON workout_notes FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- User streaks table
CREATE TABLE IF NOT EXISTS user_streaks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  current_streak integer DEFAULT 0,
  longest_streak integer DEFAULT 0,
  total_workouts integer DEFAULT 0,
  last_workout_date date,
  badges jsonb DEFAULT '[]'::jsonb,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE user_streaks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own streaks"
  ON user_streaks FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own streaks"
  ON user_streaks FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own streaks"
  ON user_streaks FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Heart rate zones table
CREATE TABLE IF NOT EXISTS heart_rate_zones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  max_hr integer NOT NULL,
  rest_hr integer NOT NULL,
  zone1_min integer NOT NULL,
  zone1_max integer NOT NULL,
  zone2_min integer NOT NULL,
  zone2_max integer NOT NULL,
  zone3_min integer NOT NULL,
  zone3_max integer NOT NULL,
  zone4_min integer NOT NULL,
  zone4_max integer NOT NULL,
  zone5_min integer NOT NULL,
  zone5_max integer NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE heart_rate_zones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own heart rate zones"
  ON heart_rate_zones FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own heart rate zones"
  ON heart_rate_zones FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own heart rate zones"
  ON heart_rate_zones FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Sleep logs table
CREATE TABLE IF NOT EXISTS sleep_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  log_date date NOT NULL,
  hours_slept decimal(3,1) NOT NULL,
  quality_rating integer CHECK (quality_rating BETWEEN 1 AND 5),
  notes text,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, log_date)
);

ALTER TABLE sleep_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own sleep logs"
  ON sleep_logs FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own sleep logs"
  ON sleep_logs FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own sleep logs"
  ON sleep_logs FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own sleep logs"
  ON sleep_logs FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Resting heart rate logs table
CREATE TABLE IF NOT EXISTS resting_heart_rate_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  log_date date NOT NULL,
  resting_hr integer NOT NULL CHECK (resting_hr BETWEEN 30 AND 120),
  notes text,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, log_date)
);

ALTER TABLE resting_heart_rate_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own resting heart rate logs"
  ON resting_heart_rate_logs FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own resting heart rate logs"
  ON resting_heart_rate_logs FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own resting heart rate logs"
  ON resting_heart_rate_logs FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own resting heart rate logs"
  ON resting_heart_rate_logs FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Injury logs table
CREATE TABLE IF NOT EXISTS injury_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  injury_type text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('minor', 'moderate', 'severe')),
  body_part text NOT NULL,
  start_date date NOT NULL DEFAULT CURRENT_DATE,
  end_date date,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'healing', 'recovered')),
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE injury_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own injury logs"
  ON injury_logs FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own injury logs"
  ON injury_logs FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own injury logs"
  ON injury_logs FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own injury logs"
  ON injury_logs FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Hydration logs table
CREATE TABLE IF NOT EXISTS hydration_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  log_date date NOT NULL,
  water_ml integer NOT NULL DEFAULT 0,
  electrolytes boolean DEFAULT false,
  notes text,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, log_date)
);

ALTER TABLE hydration_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own hydration logs"
  ON hydration_logs FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own hydration logs"
  ON hydration_logs FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own hydration logs"
  ON hydration_logs FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own hydration logs"
  ON hydration_logs FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Nutrition logs table
CREATE TABLE IF NOT EXISTS nutrition_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  log_date date NOT NULL DEFAULT CURRENT_DATE,
  meal_type text NOT NULL CHECK (meal_type IN ('breakfast', 'lunch', 'dinner', 'snack', 'pre-workout', 'post-workout')),
  description text NOT NULL,
  calories integer,
  carbs_g decimal(5,1),
  protein_g decimal(5,1),
  fat_g decimal(5,1),
  notes text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE nutrition_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own nutrition logs"
  ON nutrition_logs FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own nutrition logs"
  ON nutrition_logs FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own nutrition logs"
  ON nutrition_logs FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own nutrition logs"
  ON nutrition_logs FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Race plans table
CREATE TABLE IF NOT EXISTS race_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  training_plan_id uuid REFERENCES training_plans(id) ON DELETE SET NULL,
  race_name text NOT NULL,
  race_date date NOT NULL,
  race_distance text NOT NULL,
  target_time text,
  pacing_strategy jsonb,
  weather_notes text,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE race_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own race plans"
  ON race_plans FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own race plans"
  ON race_plans FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own race plans"
  ON race_plans FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own race plans"
  ON race_plans FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_workout_notes_user_plan ON workout_notes(user_id, training_plan_id);
CREATE INDEX IF NOT EXISTS idx_sleep_logs_user_date ON sleep_logs(user_id, log_date DESC);
CREATE INDEX IF NOT EXISTS idx_resting_hr_logs_user_date ON resting_heart_rate_logs(user_id, log_date DESC);
CREATE INDEX IF NOT EXISTS idx_injury_logs_user_status ON injury_logs(user_id, status);
CREATE INDEX IF NOT EXISTS idx_hydration_logs_user_date ON hydration_logs(user_id, log_date DESC);
CREATE INDEX IF NOT EXISTS idx_nutrition_logs_user_date ON nutrition_logs(user_id, log_date DESC);
CREATE INDEX IF NOT EXISTS idx_race_plans_user_date ON race_plans(user_id, race_date);
