/*
  # Expand plan_edit_proposals intent constraint for gold structural intents

  ## Summary
  The plan_edit_proposals table has a CHECK constraint on the `intent` column that only
  allows legacy values: 'delete', 'move', 'reinstate', 'modify', 'reduce', 'swap'.

  The gold chat system uses structural intent values: 'insert_recovery_week', 'suggest_pause'.
  These were being rejected by the constraint, blocking the V1 mutation pathway.

  ## Changes
  - Drop the existing CHECK constraint on plan_edit_proposals.intent
  - Add a new CHECK constraint that includes both legacy and gold intent values

  ## Notes
  - No data is modified, only the constraint definition changes
  - Legacy intents are preserved for backwards compatibility with existing proposal records
*/

ALTER TABLE plan_edit_proposals
  DROP CONSTRAINT IF EXISTS plan_edit_proposals_intent_check;

ALTER TABLE plan_edit_proposals
  ADD CONSTRAINT plan_edit_proposals_intent_check
  CHECK (intent IN (
    'delete', 'move', 'reinstate', 'modify', 'reduce', 'swap',
    'insert_recovery_week', 'suggest_pause', 'suggest_recalibration'
  ));
