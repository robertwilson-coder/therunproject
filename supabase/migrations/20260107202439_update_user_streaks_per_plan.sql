/*
  # Update User Streaks to Track Per Training Plan

  ## Changes
  
  1. Modifications to `user_streaks` table
    - Add `training_plan_id` column to track streaks per plan
    - Remove UNIQUE constraint on `user_id` alone
    - Add UNIQUE constraint on (`user_id`, `training_plan_id`) combination
    - This allows users to have separate streaks for different training plans
  
  ## Security
  - No changes to RLS policies needed as they filter by user_id which remains valid

  ## Important Notes
  - Users can now have multiple streak records, one per training plan
  - Existing streak data will be preserved but won't have a training_plan_id
  - New streak records will require a training_plan_id
*/

-- Add training_plan_id column to user_streaks
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'user_streaks' AND column_name = 'training_plan_id'
  ) THEN
    ALTER TABLE user_streaks 
    ADD COLUMN training_plan_id uuid REFERENCES training_plans(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Drop the old unique constraint on user_id if it exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'user_streaks_user_id_key'
  ) THEN
    ALTER TABLE user_streaks DROP CONSTRAINT user_streaks_user_id_key;
  END IF;
END $$;

-- Add new unique constraint on user_id and training_plan_id combination
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'user_streaks_user_plan_unique'
  ) THEN
    ALTER TABLE user_streaks 
    ADD CONSTRAINT user_streaks_user_plan_unique 
    UNIQUE(user_id, training_plan_id);
  END IF;
END $$;

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_user_streaks_user_plan 
ON user_streaks(user_id, training_plan_id);