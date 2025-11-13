/*
  # Running Training Plans Schema

  1. New Tables
    - `training_plans`
      - `id` (uuid, primary key)
      - `user_id` (uuid, references auth.users)
      - `answers` (jsonb) - stores questionnaire responses
      - `plan_data` (jsonb) - stores generated training plan
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)
  
  2. Security
    - Enable RLS on `training_plans` table
    - Add policies for authenticated users to:
      - Read their own training plans
      - Create new training plans
      - Update their own training plans
      - Delete their own training plans
*/

CREATE TABLE IF NOT EXISTS training_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  answers jsonb NOT NULL DEFAULT '{}'::jsonb,
  plan_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE training_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own training plans"
  ON training_plans
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own training plans"
  ON training_plans
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own training plans"
  ON training_plans
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own training plans"
  ON training_plans
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_training_plans_user_id ON training_plans(user_id);
CREATE INDEX IF NOT EXISTS idx_training_plans_created_at ON training_plans(created_at DESC);