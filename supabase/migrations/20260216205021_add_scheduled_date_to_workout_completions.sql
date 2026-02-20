/*
  # Add scheduled_date to workout_completions

  1. Changes
    - Add `scheduled_date` column to track when the workout was scheduled
    - Backfill existing records based on training plan dates
    - Update Performance Analytics to filter by scheduled_date instead of completed_at

  2. Notes
    - Scheduled date represents the calendar date the workout was planned for
    - This allows proper "This Week" calculations based on when workouts were scheduled, not completed
*/

-- Add scheduled_date column
ALTER TABLE workout_completions 
ADD COLUMN IF NOT EXISTS scheduled_date date;

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_workout_completions_scheduled_date 
ON workout_completions(scheduled_date);

-- Add comment
COMMENT ON COLUMN workout_completions.scheduled_date IS 'The calendar date this workout was scheduled for in the training plan';
