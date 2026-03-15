/*
  # Add advisory_pending column to preview_sets

  ## Summary
  Adds a boolean flag to the preview_sets table to distinguish between:
  - advisory_pending = true: A coaching advisory stored server-side, awaiting user confirmation before the change modal is shown
  - advisory_pending = false: A fully confirmed preview ready to commit

  This supports the two-stage advisory architecture where the coach explains the impact
  of a change and asks for confirmation before presenting the change review modal.

  ## Changes
  - `preview_sets`: adds `advisory_pending` boolean column (default false)
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'preview_sets' AND column_name = 'advisory_pending'
  ) THEN
    ALTER TABLE preview_sets ADD COLUMN advisory_pending boolean NOT NULL DEFAULT false;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_preview_sets_advisory_pending
  ON preview_sets (user_id, plan_id, advisory_pending)
  WHERE advisory_pending = true;
