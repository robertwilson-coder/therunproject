/*
  # Update Two-Stage Plan Generation System

  1. Changes to training_plans table
    - Update `plan_type` check constraint to include new types
    - Add `preview_range_days` column to store preview length (14 days)
    - Add `final_preferences` column to store user adjustments made during preview

  2. Updates to plan_generation_jobs table
    - Add `plan_id` foreign key to training_plans
    - Add `progress` column for tracking generation progress
    - Add `started_at` timestamp

  3. Indexes
    - Add index for plan_generation_jobs.plan_id
*/

-- Drop existing check constraint and add new one for plan_type
ALTER TABLE training_plans
  DROP CONSTRAINT IF EXISTS training_plans_plan_type_check;

ALTER TABLE training_plans
  ADD CONSTRAINT training_plans_plan_type_check 
  CHECK (plan_type IN ('static', 'responsive', 'weeks_based', 'date_based_preview', 'date_based_full'));

-- Add new columns to training_plans
ALTER TABLE training_plans
  ADD COLUMN IF NOT EXISTS preview_range_days INTEGER,
  ADD COLUMN IF NOT EXISTS final_preferences JSONB;

-- Add new columns to plan_generation_jobs
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'plan_generation_jobs' AND column_name = 'plan_id'
  ) THEN
    ALTER TABLE plan_generation_jobs
      ADD COLUMN plan_id UUID REFERENCES training_plans(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'plan_generation_jobs' AND column_name = 'progress'
  ) THEN
    ALTER TABLE plan_generation_jobs
      ADD COLUMN progress INTEGER DEFAULT 0 CHECK (progress >= 0 AND progress <= 100);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'plan_generation_jobs' AND column_name = 'started_at'
  ) THEN
    ALTER TABLE plan_generation_jobs
      ADD COLUMN started_at TIMESTAMPTZ;
  END IF;
END $$;

-- Add index for plan_generation_jobs.plan_id
CREATE INDEX IF NOT EXISTS idx_jobs_plan_id ON plan_generation_jobs(plan_id);

-- Add index for training_plans.plan_type
CREATE INDEX IF NOT EXISTS idx_training_plans_type ON training_plans(plan_type);
