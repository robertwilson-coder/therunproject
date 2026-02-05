/*
  # Fueling Strategy Lab Tables

  ## Overview
  Creates tables to support the Fueling Strategy Lab feature, allowing runners to:
  - Create and save fueling strategies for races/workouts
  - Log actual fueling consumption during workouts
  - Track stomach comfort and energy ratings
  - Analyze patterns to optimize race-day fueling

  ## New Tables

  ### `fueling_strategies`
  Stores planned fueling strategies that users can create and reuse
  - `id` (uuid, primary key)
  - `user_id` (uuid, references auth.users)
  - `training_plan_id` (uuid, optional reference to specific training plan)
  - `name` (text) - Strategy name (e.g., "Half Marathon Race Plan")
  - `description` (text) - Optional notes about the strategy
  - `pre_run_items` (jsonb) - Array of items to consume before run
  - `during_run_items` (jsonb) - Array of items with timing/mile markers
  - `post_run_items` (jsonb) - Array of recovery items
  - `hydration_plan` (jsonb) - Hydration goals and timing
  - `created_at` (timestamptz)
  - `updated_at` (timestamptz)

  ### `fueling_logs`
  Records what was actually consumed during specific workouts
  - `id` (uuid, primary key)
  - `user_id` (uuid, references auth.users)
  - `workout_completion_id` (uuid, references workout_completions)
  - `strategy_id` (uuid, optional reference to fueling_strategies)
  - `pre_run_items` (jsonb) - What was actually consumed before
  - `during_run_items` (jsonb) - What was actually consumed during
  - `post_run_items` (jsonb) - What was actually consumed after
  - `hydration_actual` (jsonb) - Actual hydration data
  - `stomach_comfort_rating` (integer, 1-5 scale)
  - `energy_rating` (integer, 1-5 scale)
  - `notes` (text) - Observations and learnings
  - `created_at` (timestamptz)

  ## Security
  - Enable RLS on all tables
  - Users can only access their own fueling data
  - Policies for select, insert, update, delete operations
*/

-- Create fueling_strategies table
CREATE TABLE IF NOT EXISTS fueling_strategies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  training_plan_id uuid REFERENCES training_plans(id) ON DELETE SET NULL,
  name text NOT NULL,
  description text DEFAULT '',
  pre_run_items jsonb DEFAULT '[]'::jsonb,
  during_run_items jsonb DEFAULT '[]'::jsonb,
  post_run_items jsonb DEFAULT '[]'::jsonb,
  hydration_plan jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create fueling_logs table
CREATE TABLE IF NOT EXISTS fueling_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  workout_completion_id uuid REFERENCES workout_completions(id) ON DELETE CASCADE NOT NULL,
  strategy_id uuid REFERENCES fueling_strategies(id) ON DELETE SET NULL,
  pre_run_items jsonb DEFAULT '[]'::jsonb,
  during_run_items jsonb DEFAULT '[]'::jsonb,
  post_run_items jsonb DEFAULT '[]'::jsonb,
  hydration_actual jsonb DEFAULT '{}'::jsonb,
  stomach_comfort_rating integer CHECK (stomach_comfort_rating >= 1 AND stomach_comfort_rating <= 5),
  energy_rating integer CHECK (energy_rating >= 1 AND energy_rating <= 5),
  notes text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE fueling_strategies ENABLE ROW LEVEL SECURITY;
ALTER TABLE fueling_logs ENABLE ROW LEVEL SECURITY;

-- Policies for fueling_strategies
CREATE POLICY "Users can view own fueling strategies"
  ON fueling_strategies FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own fueling strategies"
  ON fueling_strategies FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own fueling strategies"
  ON fueling_strategies FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own fueling strategies"
  ON fueling_strategies FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Policies for fueling_logs
CREATE POLICY "Users can view own fueling logs"
  ON fueling_logs FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own fueling logs"
  ON fueling_logs FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own fueling logs"
  ON fueling_logs FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own fueling logs"
  ON fueling_logs FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_fueling_strategies_user_id ON fueling_strategies(user_id);
CREATE INDEX IF NOT EXISTS idx_fueling_strategies_training_plan_id ON fueling_strategies(training_plan_id);
CREATE INDEX IF NOT EXISTS idx_fueling_logs_user_id ON fueling_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_fueling_logs_workout_completion_id ON fueling_logs(workout_completion_id);
CREATE INDEX IF NOT EXISTS idx_fueling_logs_strategy_id ON fueling_logs(strategy_id);