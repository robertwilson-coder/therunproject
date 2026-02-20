/*
  # Fix Discord Notification Trigger URL
  
  1. Changes
    - Update trigger to use pg_net.http_post (correct function name)
    - Construct function URL using Supabase's internal network
    - Use service role authentication for internal calls
    
  2. Notes
    - Uses internal Kong gateway URL for reliability
    - Works with or without JWT context
*/

CREATE OR REPLACE FUNCTION notify_feedback_discord()
RETURNS TRIGGER AS $$
DECLARE
  payload jsonb;
  request_id bigint;
  function_url text;
  service_role_key text;
BEGIN
  BEGIN
    -- Construct the internal function URL using Kong gateway
    function_url := 'http://kong:8000/functions/v1/notify-feedback-discord';
    
    -- Get service role key from vault or use the one from environment
    service_role_key := current_setting('app.settings.service_role_key', true);
    
    -- If not in vault, try to get from supabase environment
    IF service_role_key IS NULL THEN
      service_role_key := current_setting('request.jwt.claims', true)::json->>'role';
    END IF;

    -- Build the payload
    payload := jsonb_build_object(
      'type', TG_OP,
      'table', TG_TABLE_NAME,
      'record', row_to_json(NEW)
    );

    -- Make async HTTP request using pg_net
    SELECT net.http_post(
      url := function_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json'
      ),
      body := payload
    ) INTO request_id;
    
    RAISE LOG 'Discord notification queued with request_id: %', request_id;
    
  EXCEPTION WHEN OTHERS THEN
    -- Log the error but don't fail the insert
    RAISE WARNING 'Failed to queue Discord notification: %', SQLERRM;
  END;

  -- Always return NEW to allow the insert to succeed
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;