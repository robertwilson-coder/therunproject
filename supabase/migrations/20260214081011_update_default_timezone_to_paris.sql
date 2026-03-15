/*
  # Update default timezone to Europe/Paris

  1. Changes
    - Update default timezone for training_plans from Europe/London to Europe/Paris
    - Update existing NULL timezones to Europe/Paris
  
  2. Notes
    - This migration ensures consistent timezone handling across the application
    - Europe/Paris covers Paris/Rome timezone as requested
*/

-- Update the default value for new plans
ALTER TABLE training_plans 
ALTER COLUMN timezone SET DEFAULT 'Europe/Paris';

-- Update existing plans with NULL or London timezone to Paris
UPDATE training_plans 
SET timezone = 'Europe/Paris' 
WHERE timezone IS NULL OR timezone = 'Europe/London';