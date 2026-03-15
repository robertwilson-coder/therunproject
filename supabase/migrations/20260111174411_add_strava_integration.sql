/*
  # Strava Integration Tables

  ## Overview
  This migration adds support for Strava OAuth integration and automatic activity syncing.

  ## New Tables
  
  ### `strava_connections`
  Stores user Strava OAuth tokens and athlete information.
  - `id` (uuid, primary key)
  - `user_id` (uuid, foreign key to auth.users)
  - `athlete_id` (bigint, Strava athlete ID)
  - `access_token` (text, encrypted OAuth access token)
  - `refresh_token` (text, encrypted OAuth refresh token)
  - `expires_at` (timestamptz, when access token expires)
  - `scope` (text, OAuth scopes granted)
  - `connected_at` (timestamptz, when first connected)
  - `last_sync_at` (timestamptz, last successful sync)
  - `created_at` (timestamptz, record creation time)
  - `updated_at` (timestamptz, record update time)

  ### `strava_activities`
  Stores synced Strava activities for matching with training plans.
  - `id` (uuid, primary key)
  - `user_id` (uuid, foreign key to auth.users)
  - `strava_activity_id` (bigint, unique Strava activity ID)
  - `activity_type` (text, e.g., 'Run', 'Ride')
  - `start_date` (timestamptz, activity start time)
  - `distance` (numeric, distance in meters)
  - `moving_time` (integer, moving time in seconds)
  - `elapsed_time` (integer, total elapsed time in seconds)
  - `average_speed` (numeric, average speed in m/s)
  - `max_speed` (numeric, max speed in m/s)
  - `average_heartrate` (numeric, average HR in bpm)
  - `max_heartrate` (numeric, max HR in bpm)
  - `total_elevation_gain` (numeric, elevation in meters)
  - `matched_workout_id` (uuid, nullable, foreign key to workout_completions)
  - `raw_data` (jsonb, full Strava activity object)
  - `synced_at` (timestamptz, when activity was synced)
  - `created_at` (timestamptz, record creation time)

  ## Modified Tables
  
  ### `workout_completions`
  - Added `strava_activity_id` (bigint, nullable) to link completions with Strava activities

  ## Security
  - RLS enabled on all tables
  - Users can only access their own Strava data
  - Policies for authenticated users to manage their connections and activities

  ## Important Notes
  - Access tokens are stored encrypted and should be handled securely
  - Tokens expire and need refresh (typically every 6 hours)
  - Webhook subscriptions should be set up for real-time activity sync
*/

-- Create strava_connections table
CREATE TABLE IF NOT EXISTS strava_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  athlete_id bigint NOT NULL,
  access_token text NOT NULL,
  refresh_token text NOT NULL,
  expires_at timestamptz NOT NULL,
  scope text NOT NULL DEFAULT 'read,activity:read_all',
  connected_at timestamptz NOT NULL DEFAULT now(),
  last_sync_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

-- Create strava_activities table
CREATE TABLE IF NOT EXISTS strava_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  strava_activity_id bigint NOT NULL UNIQUE,
  activity_type text NOT NULL,
  start_date timestamptz NOT NULL,
  distance numeric NOT NULL DEFAULT 0,
  moving_time integer NOT NULL DEFAULT 0,
  elapsed_time integer NOT NULL DEFAULT 0,
  average_speed numeric,
  max_speed numeric,
  average_heartrate numeric,
  max_heartrate numeric,
  total_elevation_gain numeric,
  matched_workout_id uuid REFERENCES workout_completions(id) ON DELETE SET NULL,
  raw_data jsonb,
  synced_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Add strava_activity_id to workout_completions
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'workout_completions' AND column_name = 'strava_activity_id'
  ) THEN
    ALTER TABLE workout_completions ADD COLUMN strava_activity_id bigint;
  END IF;
END $$;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_strava_connections_user_id ON strava_connections(user_id);
CREATE INDEX IF NOT EXISTS idx_strava_connections_athlete_id ON strava_connections(athlete_id);
CREATE INDEX IF NOT EXISTS idx_strava_activities_user_id ON strava_activities(user_id);
CREATE INDEX IF NOT EXISTS idx_strava_activities_strava_id ON strava_activities(strava_activity_id);
CREATE INDEX IF NOT EXISTS idx_strava_activities_start_date ON strava_activities(start_date);
CREATE INDEX IF NOT EXISTS idx_workout_completions_strava_id ON workout_completions(strava_activity_id);

-- Enable RLS
ALTER TABLE strava_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE strava_activities ENABLE ROW LEVEL SECURITY;

-- RLS Policies for strava_connections

CREATE POLICY "Users can view own Strava connection"
  ON strava_connections FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own Strava connection"
  ON strava_connections FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own Strava connection"
  ON strava_connections FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own Strava connection"
  ON strava_connections FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- RLS Policies for strava_activities

CREATE POLICY "Users can view own Strava activities"
  ON strava_activities FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own Strava activities"
  ON strava_activities FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own Strava activities"
  ON strava_activities FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own Strava activities"
  ON strava_activities FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Update trigger for strava_connections
CREATE OR REPLACE FUNCTION update_strava_connections_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER strava_connections_updated_at
  BEFORE UPDATE ON strava_connections
  FOR EACH ROW
  EXECUTE FUNCTION update_strava_connections_updated_at();