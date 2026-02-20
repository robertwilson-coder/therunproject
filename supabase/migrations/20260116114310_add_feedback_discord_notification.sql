/*
  # Add Discord Notification for Beta Feedback

  1. Changes
    - Create trigger function to notify Discord when new feedback is submitted
    - Create trigger on beta_feedback table to call the notification function
    - Uses Supabase Edge Function to send Discord webhook

  2. How it works
    - When new feedback is inserted into beta_feedback table
    - Trigger calls the notify-feedback-discord edge function
    - Discord webhook receives formatted embed with feedback details

  3. Requirements
    - Edge function 'notify-feedback-discord' must be deployed
    - DISCORD_WEBHOOK_URL secret must be configured in edge function
*/

CREATE OR REPLACE FUNCTION notify_feedback_discord()
RETURNS TRIGGER AS $$
DECLARE
  payload json;
  function_url text;
BEGIN
  function_url := current_setting('app.settings.supabase_url', true) || '/functions/v1/notify-feedback-discord';
  
  IF function_url IS NULL OR function_url = '/functions/v1/notify-feedback-discord' THEN
    function_url := 'https://' || current_setting('request.headers')::json->>'host' || '/functions/v1/notify-feedback-discord';
  END IF;

  payload := json_build_object(
    'type', TG_OP,
    'table', TG_TABLE_NAME,
    'record', row_to_json(NEW)
  );

  PERFORM net.http_post(
    url := function_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
    ),
    body := payload::jsonb
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_feedback_submitted ON beta_feedback;

CREATE TRIGGER on_feedback_submitted
  AFTER INSERT ON beta_feedback
  FOR EACH ROW
  EXECUTE FUNCTION notify_feedback_discord();
