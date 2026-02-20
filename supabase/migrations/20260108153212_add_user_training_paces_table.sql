/*
  # Add User Training Paces Table

  1. New Table
    - `user_training_paces`
      - `id` (uuid, primary key)
      - `user_id` (uuid, references auth.users) - UNIQUE constraint
      - `race_distance` (text) - the race distance used for calculation
      - `race_time_seconds` (integer) - race time used for calculation
      - `easy_pace` (text) - easy run pace (e.g., "6:00/km")
      - `long_run_pace` (text) - long run pace
      - `tempo_pace` (text) - tempo run pace
      - `interval_pace` (text) - interval/speed work pace
      - `race_pace` (text) - goal race pace
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Security
    - Enable RLS on `user_training_paces` table
    - Add policies for authenticated users to manage their own paces

  3. Notes
    - Similar to heart_rate_zones table, one set of paces per user
    - Users can update their paces as their fitness improves
    - Paces are displayed in the dashboard and can be used across plans
*/

CREATE TABLE IF NOT EXISTS user_training_paces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  race_distance text NOT NULL,
  race_time_seconds integer NOT NULL,
  easy_pace text NOT NULL,
  long_run_pace text NOT NULL,
  tempo_pace text NOT NULL,
  interval_pace text NOT NULL,
  race_pace text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE user_training_paces ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own training paces"
  ON user_training_paces FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own training paces"
  ON user_training_paces FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own training paces"
  ON user_training_paces FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own training paces"
  ON user_training_paces FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_user_training_paces_user 
  ON user_training_paces(user_id);