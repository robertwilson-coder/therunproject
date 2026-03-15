/*
  # Add Workout Version for Optimistic Locking

  ## Changes
  
  1. Add `workout_version` column for optimistic locking
     - Incremented on every plan_data modification
     - Used to prevent concurrent edit conflicts
  
  2. Update comment on plan_data column
     - Document required workout fields including status
  
  ## Notes
  
  - Workouts in plan_data MUST include:
    - workout_id (uuid) - stable identifier
    - scheduled_for (YYYY-MM-DD) - ISO date
    - status ('scheduled' | 'cancelled' | 'completed')
    - title, type, description, duration, distance
  
  - Workouts are NEVER deleted, only status changes
  - This enables undo, audit trails, and transactional integrity
*/

-- Add workout_version column to track workout updates
ALTER TABLE training_plans
ADD COLUMN IF NOT EXISTS workout_version INTEGER DEFAULT 1;

-- Add comment to plan_data column explaining the required structure
COMMENT ON COLUMN training_plans.plan_data IS 
'JSONB array of workout objects. Each workout MUST have: workout_id (uuid), scheduled_for (YYYY-MM-DD ISO date), status (scheduled|cancelled|completed), title, type, description, duration, distance. Week numbers are for display only.';
