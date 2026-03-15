/*
  # Add User Timezone Support to Training Plans

  1. Changes
    - Add `timezone` column to `training_plans` table with default 'Europe/London'
    - Update existing plans to use Europe/London timezone

  2. Purpose
    - Enable accurate date resolution in user's local timezone
    - Prevent timezone-related date confusion in chat modifications
    - Critical for Gold Standard chat date resolution system
*/

-- Add timezone to training_plans table
ALTER TABLE training_plans
ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'Europe/London';

-- Add comment explaining the field
COMMENT ON COLUMN training_plans.timezone IS 'IANA timezone string (e.g., Europe/London, America/New_York) - used for accurate date resolution in chat modifications';
