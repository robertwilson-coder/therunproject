/*
  # Fix New User Discord Notification Trigger

  1. Changes
    - Add exception handling to notify_new_user_discord function
    - Ensure user signup doesn't fail if Discord notification fails
    - Function now logs warnings instead of blocking user creation

  2. Security
    - Maintains SECURITY DEFINER for proper access
    - Non-blocking operation for better user experience
*/

CREATE OR REPLACE FUNCTION notify_new_user_discord()
RETURNS TRIGGER AS $$
DECLARE
  payload json;
  function_url text;
BEGIN
  -- Try to send Discord notification, but don't block user creation if it fails
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
  EXCEPTION
    WHEN OTHERS THEN
      -- Log warning but don't fail the user creation
      RAISE WARNING 'Failed to send Discord notification for new user: %', SQLERRM;
  END;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
