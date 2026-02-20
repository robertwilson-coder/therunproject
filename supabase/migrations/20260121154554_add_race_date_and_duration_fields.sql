/*
  # Add race date and duration tracking to training plans

  ## Changes
  1. New Columns Added to `training_plans`
    - `race_date` (date, nullable) - The specific race date if user provided one
    - `duration_weeks` (integer) - Total number of weeks in the plan
    - `created_with_race_date` (boolean) - Flag indicating if plan was created with a specific race date

  ## Purpose
  These columns enable proper distinction between two plan creation methods:
  - Plans created with a SPECIFIC RACE DATE (calculate backwards from race day)
  - Plans created with NUMBER OF WEEKS (calculate forward from start date)

  ## Migration Safety
  - All new columns are nullable or have defaults
  - Existing plans will have created_with_race_date=false by default
  - No data loss occurs

  ## Notes
  - This fixes the critical bug where race date plans calculated weeks from TODAY instead of START DATE
  - Enables proper workout date alignment with race day
  - Allows UI to display accurate progress tracking toward race date
*/

-- Add race_date column for storing the target race date
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'training_plans' AND column_name = 'race_date'
  ) THEN
    ALTER TABLE training_plans ADD COLUMN race_date date;
  END IF;
END $$;

-- Add duration_weeks column for storing plan length
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'training_plans' AND column_name = 'duration_weeks'
  ) THEN
    ALTER TABLE training_plans ADD COLUMN duration_weeks integer;
  END IF;
END $$;

-- Add created_with_race_date flag to distinguish creation methods
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'training_plans' AND column_name = 'created_with_race_date'
  ) THEN
    ALTER TABLE training_plans ADD COLUMN created_with_race_date boolean DEFAULT false NOT NULL;
  END IF;
END $$;

-- Create index on race_date for efficient queries
CREATE INDEX IF NOT EXISTS idx_training_plans_race_date
  ON training_plans(race_date)
  WHERE race_date IS NOT NULL;

-- Create composite index for user + race date queries
CREATE INDEX IF NOT EXISTS idx_training_plans_user_race
  ON training_plans(user_id, race_date)
  WHERE race_date IS NOT NULL;

-- Backfill duration_weeks for existing plans based on plan_data
UPDATE training_plans
SET duration_weeks = (
  SELECT jsonb_array_length(plan_data->'plan')
)
WHERE duration_weeks IS NULL
  AND plan_data IS NOT NULL
  AND plan_data->'plan' IS NOT NULL;

-- Backfill race_date from answers JSON for existing plans that have it
UPDATE training_plans
SET race_date = (answers->>'raceDate')::date,
    created_with_race_date = true
WHERE race_date IS NULL
  AND answers->>'raceDate' IS NOT NULL
  AND (answers->>'raceDate') != '';
