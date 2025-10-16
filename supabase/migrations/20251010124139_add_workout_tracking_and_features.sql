/*
  # Add Workout Tracking and Performance Features

  1. New Tables
    - `workout_completions`
      - `id` (uuid, primary key)
      - `user_id` (uuid, references auth.users)
      - `training_plan_id` (uuid, references training_plans)
      - `week_number` (integer)
      - `day_name` (text)
      - `completed_at` (timestamptz)
      - `notes` (text, optional user notes)
      - `rating` (integer, 1-5 how the workout felt)
      - `created_at` (timestamptz)
    
    - `pace_calculations`
      - `id` (uuid, primary key)
      - `user_id` (uuid, references auth.users)
      - `race_distance` (text, e.g., '5K', '10K', 'Half Marathon', 'Marathon')
      - `race_time_seconds` (integer)
      - `calculated_paces` (jsonb, stores all pace zones)
      - `created_at` (timestamptz)
    
    - `plan_shares`
      - `id` (uuid, primary key)
      - `training_plan_id` (uuid, references training_plans)
      - `share_token` (text, unique)
      - `shared_by` (uuid, references auth.users)
      - `is_active` (boolean)
      - `views_count` (integer)
      - `created_at` (timestamptz)
    
    - `workout_reminders`
      - `id` (uuid, primary key)
      - `user_id` (uuid, references auth.users)
      - `training_plan_id` (uuid, references training_plans)
      - `reminder_type` (text, 'daily', 'weekly', 'key_workouts')
      - `reminder_time` (time)
      - `is_active` (boolean)
      - `created_at` (timestamptz)

  2. Security
    - Enable RLS on all new tables
    - Add policies for authenticated users to manage their own data
    - Add policies for shared plans viewing
*/

-- Create workout_completions table
CREATE TABLE IF NOT EXISTS workout_completions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  training_plan_id uuid REFERENCES training_plans(id) ON DELETE CASCADE NOT NULL,
  week_number integer NOT NULL,
  day_name text NOT NULL,
  completed_at timestamptz DEFAULT now(),
  notes text,
  rating integer CHECK (rating >= 1 AND rating <= 5),
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, training_plan_id, week_number, day_name)
);

ALTER TABLE workout_completions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own workout completions"
  ON workout_completions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own workout completions"
  ON workout_completions FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own workout completions"
  ON workout_completions FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own workout completions"
  ON workout_completions FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Create pace_calculations table
CREATE TABLE IF NOT EXISTS pace_calculations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  race_distance text NOT NULL,
  race_time_seconds integer NOT NULL,
  calculated_paces jsonb NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE pace_calculations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own pace calculations"
  ON pace_calculations FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own pace calculations"
  ON pace_calculations FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own pace calculations"
  ON pace_calculations FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own pace calculations"
  ON pace_calculations FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Create plan_shares table
CREATE TABLE IF NOT EXISTS plan_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  training_plan_id uuid REFERENCES training_plans(id) ON DELETE CASCADE NOT NULL,
  share_token text UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(16), 'hex'),
  shared_by uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  is_active boolean DEFAULT true,
  views_count integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE plan_shares ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own plan shares"
  ON plan_shares FOR SELECT
  TO authenticated
  USING (auth.uid() = shared_by);

CREATE POLICY "Users can create plan shares"
  ON plan_shares FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = shared_by);

CREATE POLICY "Users can update own plan shares"
  ON plan_shares FOR UPDATE
  TO authenticated
  USING (auth.uid() = shared_by)
  WITH CHECK (auth.uid() = shared_by);

CREATE POLICY "Users can delete own plan shares"
  ON plan_shares FOR DELETE
  TO authenticated
  USING (auth.uid() = shared_by);

CREATE POLICY "Anyone can view active shared plans"
  ON plan_shares FOR SELECT
  TO anon
  USING (is_active = true);

-- Create workout_reminders table
CREATE TABLE IF NOT EXISTS workout_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  training_plan_id uuid REFERENCES training_plans(id) ON DELETE CASCADE,
  reminder_type text NOT NULL CHECK (reminder_type IN ('daily', 'weekly', 'key_workouts')),
  reminder_time time NOT NULL DEFAULT '08:00:00',
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE workout_reminders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own workout reminders"
  ON workout_reminders FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own workout reminders"
  ON workout_reminders FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own workout reminders"
  ON workout_reminders FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own workout reminders"
  ON workout_reminders FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_workout_completions_user_plan 
  ON workout_completions(user_id, training_plan_id);

CREATE INDEX IF NOT EXISTS idx_workout_completions_completed_at 
  ON workout_completions(completed_at);

CREATE INDEX IF NOT EXISTS idx_pace_calculations_user 
  ON pace_calculations(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_plan_shares_token 
  ON plan_shares(share_token) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_workout_reminders_user_active 
  ON workout_reminders(user_id, is_active) WHERE is_active = true;