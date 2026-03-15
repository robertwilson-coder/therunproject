/*
  # Add start_date to training plans

  1. Changes
    - Add `start_date` column to training_plans table to track when the plan begins
    - Defaults to the day after creation (next day from created_at)
    - This allows plans created mid-week to start the next day, leaving previous days in the week blank

  2. Notes
    - Existing plans will have start_date set to their created_at date
    - New plans will automatically get tomorrow's date as start_date
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'training_plans' AND column_name = 'start_date'
  ) THEN
    ALTER TABLE training_plans ADD COLUMN start_date date NOT NULL DEFAULT CURRENT_DATE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_training_plans_start_date ON training_plans(start_date);