/*
  # Add Steps Progress Panel Analytics

  1. New Table
    - `steps_progress_analytics`
      - `id` (uuid, primary key)
      - `training_plan_id` (uuid, not null)
      - `user_id` (uuid, not null)
      - `steps_enabled` (boolean, not null)
      - `show_progress_bar` (boolean, not null)
      - `current_focus` (text, nullable)
      - `reason_codes` (text[], nullable)
      - `confidence` (text, nullable)
      - `progress_percent` (integer, nullable)
      - `weeks_to_race` (integer, nullable)
      - `plan_length_weeks` (integer, nullable)
      - `created_at` (timestamptz, not null, default now())

  2. Security
    - Enable RLS
    - Policy for service role only (analytics writes are server-side only)

  3. Notes
    - This table exists for system observability, not user tracking
    - Events capture training system behavior to improve coaching logic
    - No sensitive workout data or personal feedback is stored
*/

CREATE TABLE IF NOT EXISTS steps_progress_analytics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  training_plan_id uuid NOT NULL,
  user_id uuid NOT NULL,
  
  steps_enabled boolean NOT NULL,
  show_progress_bar boolean NOT NULL,
  
  current_focus text,
  reason_codes text[],
  confidence text,
  progress_percent integer,
  
  weeks_to_race integer,
  plan_length_weeks integer,
  
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE steps_progress_analytics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role can insert analytics"
  ON steps_progress_analytics
  FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_steps_analytics_plan
  ON steps_progress_analytics(training_plan_id);

CREATE INDEX IF NOT EXISTS idx_steps_analytics_user
  ON steps_progress_analytics(user_id);

CREATE INDEX IF NOT EXISTS idx_steps_analytics_created
  ON steps_progress_analytics(created_at DESC);
