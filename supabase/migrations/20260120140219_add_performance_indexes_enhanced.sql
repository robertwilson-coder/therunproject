/*
  # Enhanced Performance Indexes

  1. Purpose
    - Add compound indexes for frequently queried columns
    - Improve query performance across all major tables
    - Optimize filtering and sorting operations

  2. Indexes Added
    - workout_completions: (user_id, training_plan_id), (training_plan_id, completed_at)
    - training_plans: (user_id, created_at), (user_id, archived)
    - workout_notes: (user_id, training_plan_id)
    - sleep_logs: (user_id, log_date)
    - resting_heart_rate_logs: (user_id, log_date)
    - injury_logs: (user_id, log_date)
    - race_plans: (user_id, race_date)
    - garmin_connections: (user_id)
    - user_training_paces: (user_id)

  3. Benefits
    - Faster lookups for user-specific data
    - Optimized date range queries
    - Better performance for plan-related queries
    - Improved sorting efficiency
*/

-- Workout completions indexes (most frequently queried)
CREATE INDEX IF NOT EXISTS idx_workout_completions_user_plan 
  ON workout_completions(user_id, training_plan_id);

CREATE INDEX IF NOT EXISTS idx_workout_completions_plan_date 
  ON workout_completions(training_plan_id, completed_at DESC);

CREATE INDEX IF NOT EXISTS idx_workout_completions_user_date 
  ON workout_completions(user_id, completed_at DESC);

-- Training plans indexes
CREATE INDEX IF NOT EXISTS idx_training_plans_user_created 
  ON training_plans(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_training_plans_user_archived 
  ON training_plans(user_id, archived) 
  WHERE archived = false;

-- Workout notes indexes
CREATE INDEX IF NOT EXISTS idx_workout_notes_user_plan 
  ON workout_notes(user_id, training_plan_id);

CREATE INDEX IF NOT EXISTS idx_workout_notes_lookup 
  ON workout_notes(user_id, training_plan_id, week_number, day_name);

-- Recovery tracking indexes
CREATE INDEX IF NOT EXISTS idx_sleep_logs_user_date 
  ON sleep_logs(user_id, log_date DESC);

CREATE INDEX IF NOT EXISTS idx_resting_hr_user_date 
  ON resting_heart_rate_logs(user_id, log_date DESC);

CREATE INDEX IF NOT EXISTS idx_injury_logs_user_date 
  ON injury_logs(user_id, log_date DESC);

-- Nutrition and hydration indexes
CREATE INDEX IF NOT EXISTS idx_hydration_logs_user_date 
  ON hydration_logs(user_id, log_date DESC);

CREATE INDEX IF NOT EXISTS idx_nutrition_logs_user_date 
  ON nutrition_logs(user_id, log_date DESC);

-- Race planning indexes
CREATE INDEX IF NOT EXISTS idx_race_plans_user_date 
  ON race_plans(user_id, race_date);

-- Integration indexes
CREATE INDEX IF NOT EXISTS idx_garmin_connections_user 
  ON garmin_connections(user_id);

CREATE INDEX IF NOT EXISTS idx_strava_activities_user_date 
  ON strava_activities(user_id, start_date DESC);

-- Training paces index
CREATE INDEX IF NOT EXISTS idx_user_training_paces_user 
  ON user_training_paces(user_id);

-- Streaks and badges index
CREATE INDEX IF NOT EXISTS idx_user_streaks_user 
  ON user_streaks(user_id);

-- Workout reminders index
CREATE INDEX IF NOT EXISTS idx_workout_reminders_user 
  ON workout_reminders(user_id);