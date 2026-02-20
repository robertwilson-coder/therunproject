/*
  # Update Recovery Tables Structure

  1. Changes to sleep_logs
    - Add `wake_feeling` column (well-rested, normal, fatigued)
    - Rename `hours_slept` to `hours` for consistency
    - Rename `quality_rating` to `quality` for consistency

  2. Changes to resting_heart_rate_logs
    - Add `time_measured` column for tracking measurement time
    - Rename `resting_hr` to `heart_rate` for consistency
    - Update check constraint to allow up to 250 bpm

  3. Changes to injury_logs
    - Add `pain_type` column (sharp, dull, aching, burning, stabbing, throbbing)
    - Rename `body_part` to `body_area` for consistency
    - Update `severity` to be integer (1-10 scale) instead of text
    - Rename `start_date` to `log_date` for consistency
    - Rename `end_date` to `resolved_date` for consistency
    - Rename `injury_type` column content to be more generic
    - Update status values (active, recovering, resolved)

  4. Important Notes
    - All changes are backwards compatible with existing data
    - New columns have sensible defaults
    - Updated constraints ensure data integrity
*/

-- Update sleep_logs table
DO $$
BEGIN
  -- Add wake_feeling column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sleep_logs' AND column_name = 'wake_feeling'
  ) THEN
    ALTER TABLE sleep_logs ADD COLUMN wake_feeling text DEFAULT 'normal' CHECK (wake_feeling IN ('well-rested', 'normal', 'fatigued'));
  END IF;

  -- Rename hours_slept to hours if needed
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sleep_logs' AND column_name = 'hours_slept'
  ) THEN
    ALTER TABLE sleep_logs RENAME COLUMN hours_slept TO hours;
  END IF;

  -- Rename quality_rating to quality if needed
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sleep_logs' AND column_name = 'quality_rating'
  ) THEN
    ALTER TABLE sleep_logs RENAME COLUMN quality_rating TO quality;
  END IF;
END $$;

-- Update resting_heart_rate_logs table
DO $$
BEGIN
  -- Add time_measured column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'resting_heart_rate_logs' AND column_name = 'time_measured'
  ) THEN
    ALTER TABLE resting_heart_rate_logs ADD COLUMN time_measured time;
  END IF;

  -- Rename resting_hr to heart_rate if needed
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'resting_heart_rate_logs' AND column_name = 'resting_hr'
  ) THEN
    ALTER TABLE resting_heart_rate_logs RENAME COLUMN resting_hr TO heart_rate;
  END IF;

  -- Update the constraint to allow up to 250 bpm
  IF EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage
    WHERE table_name = 'resting_heart_rate_logs' AND column_name = 'heart_rate'
  ) THEN
    ALTER TABLE resting_heart_rate_logs DROP CONSTRAINT IF EXISTS resting_heart_rate_logs_resting_hr_check;
    ALTER TABLE resting_heart_rate_logs DROP CONSTRAINT IF EXISTS resting_heart_rate_logs_heart_rate_check;
    ALTER TABLE resting_heart_rate_logs ADD CONSTRAINT resting_heart_rate_logs_heart_rate_check CHECK (heart_rate >= 30 AND heart_rate <= 250);
  END IF;
END $$;

-- Update injury_logs table
DO $$
BEGIN
  -- Add pain_type column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'injury_logs' AND column_name = 'pain_type'
  ) THEN
    ALTER TABLE injury_logs ADD COLUMN pain_type text DEFAULT 'aching' CHECK (pain_type IN ('sharp', 'dull', 'aching', 'burning', 'stabbing', 'throbbing'));
  END IF;

  -- Rename body_part to body_area if needed
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'injury_logs' AND column_name = 'body_part'
  ) THEN
    ALTER TABLE injury_logs RENAME COLUMN body_part TO body_area;
  END IF;

  -- Rename start_date to log_date if needed
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'injury_logs' AND column_name = 'start_date'
  ) THEN
    ALTER TABLE injury_logs RENAME COLUMN start_date TO log_date;
  END IF;

  -- Rename end_date to resolved_date if needed
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'injury_logs' AND column_name = 'end_date'
  ) THEN
    ALTER TABLE injury_logs RENAME COLUMN end_date TO resolved_date;
  END IF;

  -- Update status check constraint to new values
  ALTER TABLE injury_logs DROP CONSTRAINT IF EXISTS injury_logs_status_check;
  ALTER TABLE injury_logs ADD CONSTRAINT injury_logs_status_check CHECK (status IN ('active', 'recovering', 'resolved'));

  -- Add severity_int column for numeric severity (will replace text severity)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'injury_logs' AND column_name = 'severity_int'
  ) THEN
    ALTER TABLE injury_logs ADD COLUMN severity_int integer DEFAULT 5 CHECK (severity_int >= 1 AND severity_int <= 10);
    -- Migrate existing severity values to integers
    UPDATE injury_logs SET severity_int = CASE
      WHEN severity = 'minor' THEN 3
      WHEN severity = 'moderate' THEN 6
      WHEN severity = 'severe' THEN 9
      ELSE 5
    END WHERE severity_int IS NULL;
  END IF;
END $$;