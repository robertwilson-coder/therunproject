/*
  # Add plan_duration_weeks Column

  1. Changes
    - Add `plan_duration_weeks` (integer, nullable) to `training_plans` table
    - This stores the total number of weeks for the training plan
    - Useful for preview plans to track the full plan duration
  
  2. Notes
    - Column is nullable to support existing records
    - Can be derived from race_date and start_date if needed
*/

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'training_plans' AND column_name = 'plan_duration_weeks'
  ) THEN
    ALTER TABLE training_plans 
    ADD COLUMN plan_duration_weeks integer;
  END IF;
END $$;