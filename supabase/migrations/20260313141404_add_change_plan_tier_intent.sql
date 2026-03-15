/*
  # Add change_plan_tier to proposal intent constraint

  1. Changes
    - Expands the intent check constraint on plan_edit_proposals to include 'change_plan_tier'
    - This allows tier change proposals to be stored in the system
*/

ALTER TABLE plan_edit_proposals 
DROP CONSTRAINT IF EXISTS plan_edit_proposals_intent_check;

ALTER TABLE plan_edit_proposals 
ADD CONSTRAINT plan_edit_proposals_intent_check 
CHECK (intent = ANY (ARRAY[
  'delete'::text, 
  'move'::text, 
  'reinstate'::text, 
  'modify'::text, 
  'reduce'::text, 
  'swap'::text, 
  'insert_recovery_week'::text, 
  'suggest_pause'::text, 
  'suggest_recalibration'::text,
  'change_plan_tier'::text
]));
