/*
  # Add Fatigue Advisory Log Table

  ## Purpose
  Tracks when fatigue advisories have been shown to users and what decisions they made.
  This enables frequency control (max 1 per 7 days, suppress if dismissed within 5 days)
  and transparency logging as required by Phase 3 of the Fatigue Advisory Layer.

  ## New Tables
  - `fatigue_advisory_log`
    - `id` (uuid, primary key)
    - `user_id` (uuid, foreign key to auth.users)
    - `training_plan_id` (uuid, foreign key to training_plans)
    - `shown_at` (timestamptz) — when the advisory was displayed
    - `fatigue_level` (text) — 'moderate' or 'elevated'
    - `trigger_reason` (text) — human-readable reason (e.g. "highRPEStreak: 3")
    - `signal_values` (jsonb) — snapshot of FatigueSignals at trigger time
    - `user_decision` (text) — 'reduce_intensity' | 'bring_deload_forward' | 'continue' | 'dismissed'
    - `decided_at` (timestamptz, nullable) — when the user responded

  ## Security
  - RLS enabled, restricted to owner

  ## Notes
  1. The `shown_at` column is used to enforce the 7-day and 5-day suppression windows.
  2. `signal_values` is stored as JSONB to preserve the full diagnostic snapshot.
  3. `user_decision` is nullable until the user responds to the advisory.
*/

CREATE TABLE IF NOT EXISTS fatigue_advisory_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  training_plan_id uuid REFERENCES training_plans(id) ON DELETE CASCADE NOT NULL,
  shown_at timestamptz NOT NULL DEFAULT now(),
  fatigue_level text NOT NULL CHECK (fatigue_level IN ('moderate', 'elevated')),
  trigger_reason text NOT NULL DEFAULT '',
  signal_values jsonb NOT NULL DEFAULT '{}',
  user_decision text CHECK (user_decision IN ('reduce_intensity', 'bring_deload_forward', 'continue', 'dismissed')),
  decided_at timestamptz
);

ALTER TABLE fatigue_advisory_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own advisory log"
  ON fatigue_advisory_log FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own advisory log"
  ON fatigue_advisory_log FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own advisory log"
  ON fatigue_advisory_log FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_fatigue_advisory_log_user_plan
  ON fatigue_advisory_log (user_id, training_plan_id, shown_at DESC);
