/*
  # Add Enjoyment Scale to Workout Completions

  1. Changes
    - Add `enjoyment` column to `workout_completions` table
      - Stores a text value representing how the user felt after the workout
      - Values: 'terrible', 'poor', 'okay', 'good', 'great', 'amazing'
      - Nullable to support existing records
  
  2. Notes
    - This allows users to track not just effort (RPE) but also how much they enjoyed the workout
    - Provides valuable feedback for training plan adjustments
    - Existing workout completion records will have NULL enjoyment values
*/

-- Add enjoyment column to workout_completions
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'workout_completions' AND column_name = 'enjoyment'
  ) THEN
    ALTER TABLE workout_completions ADD COLUMN enjoyment text CHECK (enjoyment IN ('terrible', 'poor', 'okay', 'good', 'great', 'amazing'));
  END IF;
END $$;