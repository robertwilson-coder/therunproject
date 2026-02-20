/*
  # Fix Discord Notification Trigger
  
  1. Changes
    - Update trigger function to use correct pg_net schema (extensions.http_post)
    - Fix the service role key retrieval from environment
    
  2. Notes
    - The pg_net extension functions are in the extensions schema
    - This ensures the trigger can successfully send HTTP requests
*/

CREATE OR REPLACE FUNCTION notify_feedback_discord()
RETURNS TRIGGER AS $$
DECLARE
  payload json;
  function_url text;
  request_id bigint;
BEGIN
  -- Build the function URL using the Supabase URL from environment
  function_url := current_setting('app.settings.supabase_url', true) || '/functions/v1/notify-feedback-discord';
  
  -- If not set, try to build from request headers
  IF function_url IS NULL OR function_url = '/functions/v1/notify-feedback-discord' THEN
    function_url := 'https://' || current_setting('request.headers', true)::json->>'host' || '/functions/v1/notify-feedback-discord';
  END IF;

  -- Build the payload
  payload := json_build_object(
    'type', TG_OP,
    'table', TG_TABLE_NAME,
    'record', row_to_json(NEW)
  );

  -- Make async HTTP request using pg_net
  SELECT extensions.http_post(
    url := function_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
    ),
    body := payload::jsonb
  ) INTO request_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;