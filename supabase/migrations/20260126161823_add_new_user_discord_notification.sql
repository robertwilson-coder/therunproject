/*
  # Add Discord Notification for New User Signups

  1. Changes
    - Create trigger function to notify Discord when a new user signs up
    - Create trigger on auth.users table to call the notification function
    - Uses Supabase Edge Function to send Discord webhook

  2. How it works
    - When a new user is inserted into auth.users table
    - Trigger calls the notify-new-user-discord edge function
    - Discord webhook receives formatted embed with user details

  3. Requirements
    - Edge function 'notify-new-user-discord' must be deployed
    - DISCORD_WEBHOOK_URL secret must be configured in edge function
*/

CREATE OR REPLACE FUNCTION notify_new_user_discord()
RETURNS TRIGGER AS $$
DECLARE
  payload json;
  function_url text;
BEGIN
  function_url := current_setting('app.settings.supabase_url', true) || '/functions/v1/notify-new-user-discord';
  
  IF function_url IS NULL OR function_url = '/functions/v1/notify-new-user-discord' THEN
    function_url := 'https://' || current_setting('request.headers')::json->>'host' || '/functions/v1/notify-new-user-discord';
  END IF;

  payload := json_build_object(
    'type', TG_OP,
    'table', TG_TABLE_NAME,
    'record', json_build_object(
      'id', NEW.id,
      'email', NEW.email,
      'created_at', NEW.created_at,
      'confirmed_at', NEW.confirmed_at
    )
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

DROP TRIGGER IF EXISTS on_user_signup ON auth.users;

CREATE TRIGGER on_user_signup
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION notify_new_user_discord();
