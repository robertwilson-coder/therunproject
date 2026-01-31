/*
  # Add Distance and Duration Tracking to Workout Completions

  1. Changes
    - Add `distance_miles` column to workout_completions (numeric, optional)
    - Add `duration_minutes` column to workout_completions (numeric, optional)
    
  2. Purpose
    - Allow users to track the actual distance and duration of completed workouts
    - Enable analytics to calculate total distance and time
    
  3. Notes
    - Both columns are optional (nullable) as not all workouts have measurable distance/duration
    - Distance stored in miles, duration in minutes for consistency with training plans
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'workout_completions' AND column_name = 'distance_miles'
  ) THEN
    ALTER TABLE workout_completions ADD COLUMN distance_miles numeric;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'workout_completions' AND column_name = 'duration_minutes'
  ) THEN
    ALTER TABLE workout_completions ADD COLUMN duration_minutes numeric;
  END IF;
END $$;