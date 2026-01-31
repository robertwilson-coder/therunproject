/*
  # Add archive feature to training plans

  1. Changes
    - Add `archived` boolean column to `training_plans` table
    - Default to false for existing and new plans
    - Add index for better query performance
  
  2. Purpose
    - Allow users to archive plans instead of deleting them
    - Prevent accidental data loss
    - Keep plan history for future reference
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'training_plans' AND column_name = 'archived'
  ) THEN
    ALTER TABLE training_plans ADD COLUMN archived boolean DEFAULT false NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_training_plans_archived ON training_plans(user_id, archived);
  END IF;
END $$;