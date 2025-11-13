/*
  # Update Training Plans Schema for Plan Types

  1. Changes
    - Add `plan_type` column to training_plans table ('static' or 'responsive')
    - Add `chat_history` column to store conversation history
    - Add `is_active` column to track current active plans
    - Add index on plan_type for efficient filtering
  
  2. Security
    - No changes to RLS policies (existing policies still apply)
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'training_plans' AND column_name = 'plan_type'
  ) THEN
    ALTER TABLE training_plans ADD COLUMN plan_type text NOT NULL DEFAULT 'static' CHECK (plan_type IN ('static', 'responsive'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'training_plans' AND column_name = 'chat_history'
  ) THEN
    ALTER TABLE training_plans ADD COLUMN chat_history jsonb NOT NULL DEFAULT '[]'::jsonb;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'training_plans' AND column_name = 'is_active'
  ) THEN
    ALTER TABLE training_plans ADD COLUMN is_active boolean DEFAULT true;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_training_plans_plan_type ON training_plans(plan_type);
CREATE INDEX IF NOT EXISTS idx_training_plans_is_active ON training_plans(is_active);