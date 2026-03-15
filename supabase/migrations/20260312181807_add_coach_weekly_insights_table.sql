/*
  # Add Coach Weekly Insights Tracking

  1. New Tables
    - `coach_weekly_insights`
      - `id` (uuid, primary key)
      - `user_id` (uuid, foreign key to auth.users)
      - `plan_id` (uuid, foreign key to training_plans)
      - `week_start_date` (date) - Monday of the training week
      - `insight_key` (text) - identifier for the insight shown
      - `trigger_type` (text) - 'weekly_open' or 'workout_completion'
      - `shown_at` (timestamptz) - when the insight was displayed
      - `dismissed_at` (timestamptz, nullable) - when user dismissed
      - `cta_clicked` (text, nullable) - which CTA was clicked
      - `created_at` (timestamptz)

  2. Security
    - Enable RLS on `coach_weekly_insights` table
    - Add policy for users to manage their own insight records

  3. Indexes
    - Unique constraint on (user_id, plan_id, week_start_date)
    - Index on user_id for fast lookups

  4. Notes
    - One insight per user per plan per week
    - Tracks engagement via cta_clicked and dismissed_at
*/

CREATE TABLE IF NOT EXISTS coach_weekly_insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_id uuid NOT NULL REFERENCES training_plans(id) ON DELETE CASCADE,
  week_start_date date NOT NULL,
  insight_key text NOT NULL,
  trigger_type text NOT NULL CHECK (trigger_type IN ('weekly_open', 'workout_completion')),
  shown_at timestamptz NOT NULL DEFAULT now(),
  dismissed_at timestamptz,
  cta_clicked text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS coach_weekly_insights_user_plan_week_idx 
  ON coach_weekly_insights (user_id, plan_id, week_start_date);

CREATE INDEX IF NOT EXISTS coach_weekly_insights_user_id_idx 
  ON coach_weekly_insights (user_id);

CREATE INDEX IF NOT EXISTS coach_weekly_insights_plan_id_idx 
  ON coach_weekly_insights (plan_id);

ALTER TABLE coach_weekly_insights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own weekly insights"
  ON coach_weekly_insights
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own weekly insights"
  ON coach_weekly_insights
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own weekly insights"
  ON coach_weekly_insights
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own weekly insights"
  ON coach_weekly_insights
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);
