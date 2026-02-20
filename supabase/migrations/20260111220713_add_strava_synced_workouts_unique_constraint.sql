/*
  # Add Unique Constraint to Strava Synced Workouts

  1. Changes
    - Add unique constraint on (user_id, training_plan_id, workout_date) to prevent duplicate synced workouts
    - This ensures each workout can only be synced once per training plan

  2. Security
    - No security changes needed, existing RLS policies remain in effect
*/

-- Add unique constraint to prevent duplicate synced workouts
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'strava_synced_workouts_unique_workout'
  ) THEN
    ALTER TABLE strava_synced_workouts
    ADD CONSTRAINT strava_synced_workouts_unique_workout
    UNIQUE (user_id, training_plan_id, workout_date);
  END IF;
END $$;
