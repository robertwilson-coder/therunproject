/*
  # Add Calibration Test Completions Table

  1. New Tables
    - `calibration_completions`
      - `id` (uuid, primary key)
      - `user_id` (uuid, references auth.users)
      - `training_plan_id` (uuid, references training_plans)
      - `week_number` (integer)
      - `day_name` (text)
      - `test_type` (text) - Description of the calibration test
      - `work_duration_minutes` (numeric) - Duration of work segment only
      - `work_distance_km` (numeric) - Distance of work segment only
      - `average_pace_seconds` (integer) - Average pace in seconds per km for work segment
      - `pace_split_difference_seconds` (integer) - Difference between first half and second half pace (seconds/km)
      - `elevation_gain_meters` (integer) - Elevation gain during work segment
      - `average_heart_rate` (integer, nullable) - Average HR during work segment
      - `heart_rate_drift` (integer, nullable) - HR drift from start to end of work segment
      - `notes` (text, nullable) - Optional notes
      - `created_at` (timestamptz)

  2. Security
    - Enable RLS on `calibration_completions` table
    - Add policies for authenticated users to manage their own calibration data

  3. Indexes
    - Add indexes for common queries on user_id, training_plan_id, and week_number
*/

CREATE TABLE IF NOT EXISTS calibration_completions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  training_plan_id uuid REFERENCES training_plans(id) ON DELETE CASCADE NOT NULL,
  week_number integer NOT NULL,
  day_name text NOT NULL,
  test_type text NOT NULL,
  work_duration_minutes numeric NOT NULL,
  work_distance_km numeric NOT NULL,
  average_pace_seconds integer NOT NULL,
  pace_split_difference_seconds integer,
  elevation_gain_meters integer DEFAULT 0,
  average_heart_rate integer,
  heart_rate_drift integer,
  notes text,
  created_at timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE calibration_completions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own calibration completions"
  ON calibration_completions
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own calibration completions"
  ON calibration_completions
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own calibration completions"
  ON calibration_completions
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own calibration completions"
  ON calibration_completions
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_calibration_completions_user_id ON calibration_completions(user_id);
CREATE INDEX IF NOT EXISTS idx_calibration_completions_training_plan_id ON calibration_completions(training_plan_id);
CREATE INDEX IF NOT EXISTS idx_calibration_completions_week_number ON calibration_completions(week_number);
CREATE INDEX IF NOT EXISTS idx_calibration_completions_plan_week ON calibration_completions(training_plan_id, week_number);