/*
  # Remove Discord Notification Trigger
  
  1. Changes
    - Drop the trigger on beta_feedback table
    - Drop the notify_feedback_discord function
    
  2. Notes
    - Will call the edge function directly from frontend instead
    - This is more reliable and easier to debug
*/

DROP TRIGGER IF EXISTS on_feedback_submitted ON beta_feedback;
DROP FUNCTION IF EXISTS notify_feedback_discord();