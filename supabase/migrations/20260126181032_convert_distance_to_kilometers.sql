/*
  # Convert distance tracking from miles to kilometers

  1. Changes
    - Add new `distance_km` column to workout_completions table
    - Convert existing `distance_miles` data to kilometers (multiply by 1.609)
    - Drop the old `distance_miles` column
    - This supports the app's focus on non-US markets where km is standard

  2. Notes
    - Existing workout data will be automatically converted from miles to kilometers
    - The conversion factor is 1 mile = 1.609 kilometers
    - This is a breaking change for any integrations relying on the distance_miles column
*/

-- Add new distance_km column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'workout_completions' AND column_name = 'distance_km'
  ) THEN
    ALTER TABLE workout_completions ADD COLUMN distance_km numeric;
  END IF;
END $$;

-- Convert existing miles data to kilometers
UPDATE workout_completions 
SET distance_km = distance_miles * 1.609
WHERE distance_miles IS NOT NULL AND distance_km IS NULL;

-- Drop the old distance_miles column
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'workout_completions' AND column_name = 'distance_miles'
  ) THEN
    ALTER TABLE workout_completions DROP COLUMN distance_miles;
  END IF;
END $$;

-- Add comment for documentation
COMMENT ON COLUMN workout_completions.distance_km IS 'Distance completed in kilometers';
