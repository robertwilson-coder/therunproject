/*
  # Add Performance Indexes

  This migration adds database indexes to improve query performance across frequently accessed tables.

  ## New Indexes

  ### workout_completions table
  - Composite index on `user_id` and `completed_at` for efficient workout lookup by user and date
  - Index on `training_plan_id` for filtering completions by training plan

  ### training_plans table
  - Composite index on `user_id` and `is_active` for quickly finding active plans per user
  - Index on `archived` for filtering archived vs non-archived plans
  - Index on `start_date` for date-based queries
  - Index on `created_at` for sorting by creation date

  ### user_streaks table
  - Composite index on `user_id` and `training_plan_id` for efficient streak lookup
  - Index on `last_workout_date` for date-based queries

  ## Performance Impact

  These indexes will significantly improve:
  - Dashboard loading times
  - Workout completion queries
  - Training plan retrieval
  - Streak calculations
  - Badge displays

  Note: Indexes are created with IF NOT EXISTS to allow safe re-running of this migration.
*/

-- workout_completions indexes
CREATE INDEX IF NOT EXISTS idx_workout_completions_user_date
  ON workout_completions(user_id, completed_at DESC);

CREATE INDEX IF NOT EXISTS idx_workout_completions_plan_id
  ON workout_completions(training_plan_id);

-- training_plans indexes
CREATE INDEX IF NOT EXISTS idx_training_plans_user_active
  ON training_plans(user_id, is_active)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_training_plans_archived
  ON training_plans(archived)
  WHERE archived = false;

CREATE INDEX IF NOT EXISTS idx_training_plans_start_date
  ON training_plans(start_date DESC);

CREATE INDEX IF NOT EXISTS idx_training_plans_user_created
  ON training_plans(user_id, created_at DESC);

-- user_streaks indexes
CREATE INDEX IF NOT EXISTS idx_user_streaks_user_plan
  ON user_streaks(user_id, training_plan_id);

CREATE INDEX IF NOT EXISTS idx_user_streaks_last_workout
  ON user_streaks(last_workout_date DESC);

-- Additional composite indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_workout_completions_user_plan_week
  ON workout_completions(user_id, training_plan_id, week_number);