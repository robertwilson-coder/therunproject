/*
  # Add preview_hash column to preview_sets table

  1. Changes
    - Add `preview_hash` column to `preview_sets` table
    - This enables validation that preview matches commit

  2. Notes
    - preview_hash is a SHA-256 hash of modifications + plan_id + plan_version
    - Ensures transactional integrity between preview and commit phases
*/

-- Add preview_hash column if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'preview_sets' AND column_name = 'preview_hash'
  ) THEN
    ALTER TABLE preview_sets ADD COLUMN preview_hash TEXT;
  END IF;
END $$;
