/*
  # Make Discord Notification Trigger Non-Blocking
  
  1. Changes
    - Update trigger function to not fail the insert if notification fails
    - Wrap HTTP call in exception handler
    - Log errors but allow feedback submission to succeed
    
  2. Notes
    - Feedback submissions should NEVER fail due to Discord notification issues
    - This ensures user experience is not impacted by external service problems
*/

CREATE OR REPLACE FUNCTION notify_feedback_discord()
RETURNS TRIGGER AS $$
DECLARE
  payload json;
  function_url text;
  request_id bigint;
BEGIN
  BEGIN
    -- Build the function URL
    SELECT current_setting('request.jwt.claims', true)::json->>'iss' INTO function_url;
    
    IF function_url IS NOT NULL THEN
      function_url := function_url || '/functions/v1/notify-feedback-discord';
    END IF;

    -- Only attempt notification if we have a valid URL
    IF function_url IS NOT NULL AND function_url != '/functions/v1/notify-feedback-discord' THEN
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
          'Authorization', 'Bearer ' || current_setting('request.jwt.claim.sub', true)
        ),
        body := payload::jsonb
      ) INTO request_id;
    END IF;
    
  EXCEPTION WHEN OTHERS THEN
    -- Log the error but don't fail the insert
    RAISE WARNING 'Failed to send Discord notification: %', SQLERRM;
  END;

  -- Always return NEW to allow the insert to succeed
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;