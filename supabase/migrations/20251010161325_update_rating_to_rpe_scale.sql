/*
  # Update Rating to RPE Scale (1-10)

  1. Changes
    - Update rating column constraint to allow 1-10 instead of 1-5
    - This aligns with RPE (Rate of Perceived Effort) scale
    
  2. Notes
    - Existing ratings (1-5) remain valid within new range
    - New ratings can use full 1-10 RPE scale
*/

DO $$
BEGIN
  ALTER TABLE workout_completions 
  DROP CONSTRAINT IF EXISTS workout_completions_rating_check;
  
  ALTER TABLE workout_completions
  ADD CONSTRAINT workout_completions_rating_check 
  CHECK (rating >= 1 AND rating <= 10);
END $$;