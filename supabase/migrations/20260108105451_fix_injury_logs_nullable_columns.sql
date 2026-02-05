/*
  # Fix injury_logs table columns

  1. Changes
    - Make `severity` column nullable with default 'moderate' (legacy column)
    - Make `injury_type` column nullable with default 'general' (legacy column)
    - These columns are kept for backwards compatibility but not actively used
    - New columns `severity_int` and `pain_type` are used instead

  2. Notes
    - Existing data is preserved
    - New inserts will use severity_int and pain_type instead
*/

-- Make severity nullable with default
ALTER TABLE injury_logs ALTER COLUMN severity DROP NOT NULL;
ALTER TABLE injury_logs ALTER COLUMN severity SET DEFAULT 'moderate';

-- Make injury_type nullable with default
ALTER TABLE injury_logs ALTER COLUMN injury_type DROP NOT NULL;
ALTER TABLE injury_logs ALTER COLUMN injury_type SET DEFAULT 'general';

-- Update any existing rows that might have null values
UPDATE injury_logs SET severity = 'moderate' WHERE severity IS NULL;
UPDATE injury_logs SET injury_type = 'general' WHERE injury_type IS NULL;