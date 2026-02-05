/*
  # Beta Feedback Table

  1. New Tables
    - `beta_feedback`
      - `id` (uuid, primary key)
      - `user_id` (uuid, nullable - allows anonymous feedback)
      - `most_useful` (text) - What part felt most useful
      - `confusing_frustrating` (text) - What was confusing or frustrating
      - `comparison` (text) - Comparison to other running plans
      - `improvements` (text) - What to change or improve
      - `other_remarks` (text) - Additional comments
      - `created_at` (timestamptz)

  2. Security
    - Enable RLS on `beta_feedback` table
    - Allow all authenticated users to insert their own feedback
    - Allow anonymous users to insert feedback
    - Only allow users to view their own feedback
*/

CREATE TABLE IF NOT EXISTS beta_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  most_useful text DEFAULT '',
  confusing_frustrating text DEFAULT '',
  comparison text DEFAULT '',
  improvements text DEFAULT '',
  other_remarks text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE beta_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert their own feedback"
  ON beta_feedback
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Anonymous users can insert feedback"
  ON beta_feedback
  FOR INSERT
  TO anon
  WITH CHECK (user_id IS NULL);

CREATE POLICY "Users can view their own feedback"
  ON beta_feedback
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);