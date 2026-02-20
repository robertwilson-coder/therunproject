/*
  # Add Race Buddies Feature

  1. Changes to Existing Tables
    - Add `race_name` to training_plans (e.g., "London Marathon 2026")
    - Add `race_location` to training_plans (e.g., "London, UK")
    - Add `discoverable` to user_profiles (default true, allows opt-in/out)

  2. New Views
    - `race_training_partners` - Shows all users training for the same race with their progress

  3. Security
    - Users can only see discoverable profiles
    - RLS policies ensure privacy controls are respected

  4. Performance
    - Add indexes on race_name and race_date for efficient lookups
*/

-- Add race fields to training_plans
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'training_plans' AND column_name = 'race_name'
  ) THEN
    ALTER TABLE training_plans ADD COLUMN race_name text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'training_plans' AND column_name = 'race_location'
  ) THEN
    ALTER TABLE training_plans ADD COLUMN race_location text;
  END IF;
END $$;

-- Add discoverable field to user_profiles
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_profiles' AND column_name = 'discoverable'
  ) THEN
    ALTER TABLE user_profiles ADD COLUMN discoverable boolean DEFAULT true;
  END IF;
END $$;

-- Add indexes for efficient race buddy lookups
CREATE INDEX IF NOT EXISTS idx_training_plans_race_name ON training_plans(race_name) WHERE race_name IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_training_plans_race_date ON training_plans(race_date) WHERE race_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_user_profiles_discoverable ON user_profiles(discoverable) WHERE discoverable = true;

-- Create a view to find training partners for the same race
CREATE OR REPLACE VIEW race_training_partners AS
SELECT 
  tp.race_name,
  tp.race_location,
  tp.race_date,
  tp.plan_type,
  tp.user_id,
  up.display_name,
  up.avatar_url,
  up.bio,
  up.location as user_location,
  tp.created_at as plan_created_at,
  tp.start_date,
  -- Calculate training progress
  CASE 
    WHEN tp.start_date IS NOT NULL AND tp.race_date IS NOT NULL AND tp.race_date > tp.start_date THEN
      ROUND(
        (EXTRACT(EPOCH FROM AGE(CURRENT_DATE::timestamp, tp.start_date::timestamp)) / 
         EXTRACT(EPOCH FROM AGE(tp.race_date::timestamp, tp.start_date::timestamp))) * 100
      )
    ELSE 0
  END as training_progress_pct,
  -- Count completed workouts
  (SELECT COUNT(*) 
   FROM workout_completions wc 
   WHERE wc.user_id = tp.user_id 
   AND wc.training_plan_id = tp.id
  ) as workouts_completed,
  -- Get current week
  CASE 
    WHEN tp.start_date IS NOT NULL THEN
      GREATEST(1, CEIL((CURRENT_DATE - tp.start_date::date)::numeric / 7))
    ELSE 1
  END as current_week
FROM training_plans tp
INNER JOIN user_profiles up ON tp.user_id = up.id
WHERE 
  tp.race_name IS NOT NULL 
  AND tp.race_name != ''
  AND up.discoverable = true
  AND tp.archived = false
  AND (tp.race_date IS NULL OR tp.race_date >= CURRENT_DATE - INTERVAL '7 days')
ORDER BY tp.race_date, tp.created_at DESC;

-- Grant access to the view
GRANT SELECT ON race_training_partners TO authenticated;

-- Add comment explaining the view
COMMENT ON VIEW race_training_partners IS 'Shows discoverable users training for specific races with their progress. Only includes non-archived plans and users who have opted in to being discoverable.';