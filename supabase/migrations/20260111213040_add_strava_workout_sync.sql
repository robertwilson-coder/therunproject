/*
  # Add Strava Workout Sync Support

  1. Changes to training_plans table
    - Add `sync_to_strava` column (boolean) to control if workouts should sync to Strava
    - Add `strava_synced_at` column (timestamptz) to track last sync time
  
  2. Changes to strava_connections table
    - Add `auto_sync_workouts` column (boolean) to enable/disable automatic workout syncing
    - Add `sync_scope` column (text) to track granted permissions
  
  3. New table: strava_synced_workouts
    - Tracks which individual workouts have been synced to Strava
    - Stores Strava workout IDs for future updates/deletions
    - Links to training_plans and workout dates
  
  4. Security
    - Enable RLS on new table
    - Add policies for authenticated users to manage their own synced workouts
*/

-- Add columns to training_plans
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'training_plans' AND column_name = 'sync_to_strava'
  ) THEN
    ALTER TABLE training_plans ADD COLUMN sync_to_strava boolean DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'training_plans' AND column_name = 'strava_synced_at'
  ) THEN
    ALTER TABLE training_plans ADD COLUMN strava_synced_at timestamptz;
  END IF;
END $$;

-- Add columns to strava_connections
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'strava_connections' AND column_name = 'auto_sync_workouts'
  ) THEN
    ALTER TABLE strava_connections ADD COLUMN auto_sync_workouts boolean DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'strava_connections' AND column_name = 'sync_scope'
  ) THEN
    ALTER TABLE strava_connections ADD COLUMN sync_scope text;
  END IF;
END $$;

-- Create strava_synced_workouts table
CREATE TABLE IF NOT EXISTS strava_synced_workouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  training_plan_id uuid REFERENCES training_plans(id) ON DELETE CASCADE NOT NULL,
  workout_date date NOT NULL,
  workout_description text NOT NULL,
  strava_workout_id text,
  synced_at timestamptz DEFAULT now(),
  last_updated timestamptz DEFAULT now(),
  sync_status text DEFAULT 'pending',
  error_message text,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE strava_synced_workouts ENABLE ROW LEVEL SECURITY;

-- Create policies for strava_synced_workouts
CREATE POLICY "Users can view own synced workouts"
  ON strava_synced_workouts FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own synced workouts"
  ON strava_synced_workouts FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own synced workouts"
  ON strava_synced_workouts FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own synced workouts"
  ON strava_synced_workouts FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_strava_synced_workouts_user_plan 
  ON strava_synced_workouts(user_id, training_plan_id);

CREATE INDEX IF NOT EXISTS idx_strava_synced_workouts_date 
  ON strava_synced_workouts(workout_date);