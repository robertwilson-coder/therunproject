/*
  # Add Garmin Connect Integration

  1. New Tables
    - `garmin_connections`
      - `id` (uuid, primary key)
      - `user_id` (uuid, references auth.users)
      - `garmin_user_id` (text, Garmin user identifier)
      - `access_token` (text, OAuth access token)
      - `refresh_token` (text, OAuth refresh token)
      - `expires_at` (timestamptz, token expiration)
      - `connected_at` (timestamptz, connection timestamp)
      - `last_sync_at` (timestamptz, last activity sync)
      - `auto_sync_workouts` (boolean, auto-push workouts to Garmin)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

    - `garmin_synced_workouts`
      - `id` (uuid, primary key)
      - `user_id` (uuid, references auth.users)
      - `training_plan_id` (uuid, references training_plans)
      - `workout_date` (date)
      - `workout_description` (text)
      - `garmin_workout_id` (text, Garmin workout identifier)
      - `sync_status` (text: 'pending', 'completed', 'failed')
      - `synced_at` (timestamptz)
      - `error_message` (text, nullable)

  2. Security
    - Enable RLS on all tables
    - Add policies for authenticated users to manage their own data
*/

-- Create garmin_connections table
CREATE TABLE IF NOT EXISTS garmin_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  garmin_user_id text NOT NULL,
  access_token text NOT NULL,
  refresh_token text NOT NULL,
  expires_at timestamptz NOT NULL,
  connected_at timestamptz DEFAULT now() NOT NULL,
  last_sync_at timestamptz,
  auto_sync_workouts boolean DEFAULT true NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE(user_id)
);

ALTER TABLE garmin_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own Garmin connection"
  ON garmin_connections FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own Garmin connection"
  ON garmin_connections FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own Garmin connection"
  ON garmin_connections FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own Garmin connection"
  ON garmin_connections FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Create garmin_synced_workouts table
CREATE TABLE IF NOT EXISTS garmin_synced_workouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  training_plan_id uuid REFERENCES training_plans(id) ON DELETE CASCADE NOT NULL,
  workout_date date NOT NULL,
  workout_description text NOT NULL,
  garmin_workout_id text,
  sync_status text DEFAULT 'pending' NOT NULL CHECK (sync_status IN ('pending', 'completed', 'failed')),
  synced_at timestamptz DEFAULT now() NOT NULL,
  error_message text,
  created_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE(user_id, training_plan_id, workout_date)
);

ALTER TABLE garmin_synced_workouts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own Garmin synced workouts"
  ON garmin_synced_workouts FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own Garmin synced workouts"
  ON garmin_synced_workouts FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own Garmin synced workouts"
  ON garmin_synced_workouts FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own Garmin synced workouts"
  ON garmin_synced_workouts FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_garmin_connections_user_id ON garmin_connections(user_id);
CREATE INDEX IF NOT EXISTS idx_garmin_synced_workouts_user_id ON garmin_synced_workouts(user_id);
CREATE INDEX IF NOT EXISTS idx_garmin_synced_workouts_plan_id ON garmin_synced_workouts(training_plan_id);
CREATE INDEX IF NOT EXISTS idx_garmin_synced_workouts_date ON garmin_synced_workouts(workout_date);
