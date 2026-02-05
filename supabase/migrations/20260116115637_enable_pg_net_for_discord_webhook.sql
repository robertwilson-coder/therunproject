/*
  # Enable pg_net Extension for Discord Webhooks
  
  1. Changes
    - Enable pg_net extension for HTTP requests from database triggers
    - Required for the Discord feedback notification trigger to work
    
  2. Notes
    - This extension allows the database to make HTTP requests
    - Used by the notify_feedback_discord trigger function
*/

CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
