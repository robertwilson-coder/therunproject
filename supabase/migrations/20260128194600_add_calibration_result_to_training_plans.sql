/*
  # Add Calibration Result Support to Training Plans

  1. Changes
    - Add `calibration_result` JSONB column to `training_plans` table
    - This stores the structured calibration test data after user completes test workout
    
  2. Data Structure
    The calibration_result column will contain:
    - testType: Type of test based on race distance ('5K', '10K', 'HM', 'MARATHON', 'ULTRA')
    - completedAtISO: Timestamp when test was completed
    - workSegmentDurationMinutes: Duration of the work segment
    - workSegmentDistanceMeters: Distance covered in work segment
    - averagePaceSecPerKm: Average pace in seconds per kilometer
    - paceVariabilityPct: Optional pace variability percentage
    - firstHalfVsSecondHalfSplitPct: Optional split percentage
    - pausedTimeSeconds: Time paused during test
    - elevationGainMeters: Elevation gain during test
    - avgHeartRate: Optional average heart rate
    - hrDriftPct: Optional heart rate drift percentage
    - validity: 'high' | 'medium' | 'low' - derived quality score
    - pacingQuality: 'good' | 'mixed' | 'poor' - pacing assessment
    - confidence: 'high' | 'medium' | 'low' - overall confidence in test results
    
  3. Notes
    - Column is nullable for backward compatibility
    - Existing plans without calibration continue to work
    - Used to inform plan regeneration from Week 3 onward
*/

-- Add calibration_result column to training_plans
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'training_plans' AND column_name = 'calibration_result'
  ) THEN
    ALTER TABLE training_plans 
    ADD COLUMN calibration_result JSONB DEFAULT NULL;
  END IF;
END $$;

-- Add index for querying plans with calibration results
CREATE INDEX IF NOT EXISTS idx_training_plans_calibration_result 
ON training_plans ((calibration_result IS NOT NULL))
WHERE calibration_result IS NOT NULL;