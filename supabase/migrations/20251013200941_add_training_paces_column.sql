/*
  # Add training paces column

  1. Changes
    - Add `training_paces` column to `training_plans` table
      - `training_paces` (jsonb, nullable) - stores calculated training paces for different workout types
  
  2. Notes
    - Column is nullable to support existing plans without paces
    - Stores pace data including easy, long run, tempo, interval, and race paces
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'training_plans' AND column_name = 'training_paces'
  ) THEN
    ALTER TABLE training_plans ADD COLUMN training_paces jsonb;
  END IF;
END $$;
