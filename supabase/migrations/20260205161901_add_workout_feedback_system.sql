/*
  # Add Workout Feedback System for Progress Tracking

  1. New Tables
    - `training_plan_workout_feedback`
      - Stores minimal user signals for key workouts
      - Supports both date-based and week-based plan formats
      - Links to training plans via normalized_workout_id
      
  2. Security
    - Enable RLS on feedback table
    - Users can only read/write their own feedback
    
  3. Performance
    - Indexes on training_plan_id, user_id, and workout_date for fast lookups
    - Index on normalized_workout_id for deterministic matching
    
  4. Data Integrity
    - Foreign keys to training_plans and auth.users
    - Enum constraints for completion_status, effort_vs_expected, hr_matched_target
*/

-- Create enum types for feedback fields
CREATE TYPE completion_status_enum AS ENUM ('completed', 'modified', 'missed');
CREATE TYPE effort_level_enum AS ENUM ('easier', 'as_expected', 'harder');
CREATE TYPE hr_match_enum AS ENUM ('yes', 'no', 'unsure');

-- Create workout feedback table
CREATE TABLE IF NOT EXISTS training_plan_workout_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  training_plan_id uuid NOT NULL REFERENCES training_plans(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Workout identification (deterministic)
  normalized_workout_id text NOT NULL,
  workout_date date NOT NULL,
  week_number integer,
  dow text,
  
  -- Minimal user signals
  completion_status completion_status_enum NOT NULL,
  effort_vs_expected effort_level_enum,
  hr_matched_target hr_match_enum,
  notes text,
  
  -- Metadata
  is_key_workout boolean DEFAULT false,
  workout_type text,
  workout_role text,
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE training_plan_workout_feedback ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view own workout feedback"
  ON training_plan_workout_feedback
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own workout feedback"
  ON training_plan_workout_feedback
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own workout feedback"
  ON training_plan_workout_feedback
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own workout feedback"
  ON training_plan_workout_feedback
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_workout_feedback_training_plan 
  ON training_plan_workout_feedback(training_plan_id);

CREATE INDEX IF NOT EXISTS idx_workout_feedback_user 
  ON training_plan_workout_feedback(user_id);

CREATE INDEX IF NOT EXISTS idx_workout_feedback_date 
  ON training_plan_workout_feedback(workout_date DESC);

CREATE INDEX IF NOT EXISTS idx_workout_feedback_normalized_id 
  ON training_plan_workout_feedback(normalized_workout_id);

CREATE INDEX IF NOT EXISTS idx_workout_feedback_plan_date 
  ON training_plan_workout_feedback(training_plan_id, workout_date DESC);

-- Unique constraint: one feedback per workout per plan
CREATE UNIQUE INDEX IF NOT EXISTS idx_workout_feedback_unique 
  ON training_plan_workout_feedback(training_plan_id, normalized_workout_id);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_workout_feedback_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update updated_at
CREATE TRIGGER update_workout_feedback_timestamp
  BEFORE UPDATE ON training_plan_workout_feedback
  FOR EACH ROW
  EXECUTE FUNCTION update_workout_feedback_updated_at();