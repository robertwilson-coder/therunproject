/*
  # Add skeleton_state and batch_index to plan_generation_jobs

  1. Changes
    - `skeleton_state` (jsonb): stores the in-progress skeleton between batch invocations
    - `batch_index` (integer): tracks which batch to process next

  These columns enable the chunked plan generation to resume across separate
  edge function invocations without hitting the 150s timeout limit.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'plan_generation_jobs' AND column_name = 'skeleton_state'
  ) THEN
    ALTER TABLE plan_generation_jobs ADD COLUMN skeleton_state jsonb;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'plan_generation_jobs' AND column_name = 'batch_index'
  ) THEN
    ALTER TABLE plan_generation_jobs ADD COLUMN batch_index integer DEFAULT 0;
  END IF;
END $$;
