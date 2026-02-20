/*
  # Enhanced Calibration Data Fields

  1. Changes to calibration_completions
    - Add `stopped_or_walked` (boolean) - Required: Did runner stop/walk during work segment
    - Add `effort_consistency` (integer 1-10) - Required: How even the effort felt (slider)
    - Add `lap_splits` (jsonb) - Optional: Array of per-km or per-5min pace splits in seconds
    - Add `feedback_text` (text) - Generated coach-like feedback for the runner
    - Add `confidence_level` (text) - HIGH, MEDIUM, or LOW confidence assessment
    - Add `pacing_quality` (text) - EXCELLENT, GOOD, or POOR pacing control classification

  2. Purpose
    - Improves calibration assessment accuracy
    - Distinguishes gradual fatigue from pacing blow-ups
    - Provides runner-facing feedback that's supportive and coach-like
    - Stores confidence signals for plan generation
*/

-- Add new fields to calibration_completions table
DO $$
BEGIN
  -- Required fields
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'calibration_completions' AND column_name = 'stopped_or_walked'
  ) THEN
    ALTER TABLE calibration_completions 
    ADD COLUMN stopped_or_walked boolean DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'calibration_completions' AND column_name = 'effort_consistency'
  ) THEN
    ALTER TABLE calibration_completions 
    ADD COLUMN effort_consistency integer CHECK (effort_consistency >= 1 AND effort_consistency <= 10);
  END IF;

  -- Optional advanced field
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'calibration_completions' AND column_name = 'lap_splits'
  ) THEN
    ALTER TABLE calibration_completions 
    ADD COLUMN lap_splits jsonb DEFAULT '[]'::jsonb;
  END IF;

  -- Assessment results
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'calibration_completions' AND column_name = 'feedback_text'
  ) THEN
    ALTER TABLE calibration_completions 
    ADD COLUMN feedback_text text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'calibration_completions' AND column_name = 'confidence_level'
  ) THEN
    ALTER TABLE calibration_completions 
    ADD COLUMN confidence_level text CHECK (confidence_level IN ('HIGH', 'MEDIUM', 'LOW'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'calibration_completions' AND column_name = 'pacing_quality'
  ) THEN
    ALTER TABLE calibration_completions 
    ADD COLUMN pacing_quality text CHECK (pacing_quality IN ('EXCELLENT', 'GOOD', 'POOR'));
  END IF;
END $$;