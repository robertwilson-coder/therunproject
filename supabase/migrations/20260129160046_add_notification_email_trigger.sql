/*
  # Add Notification Email Trigger

  1. Changes
    - Create function to send email when notification with email_text is created
    - Add trigger on notifications table to call this function
    
  2. Notes
    - This completes the welcome email flow
    - When a notification is created with email_text, it will trigger the send-welcome-email edge function
    - Uses pg_net for async HTTP request to avoid blocking
*/

-- Function to trigger welcome email sending
CREATE OR REPLACE FUNCTION send_notification_email()
RETURNS TRIGGER 
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  function_url text;
  service_role_key text;
BEGIN
  -- Only proceed if email_text is not null
  IF NEW.email_text IS NOT NULL THEN
    BEGIN
      -- Get the Supabase URL and service role key
      function_url := current_setting('app.settings.supabase_url', true) || '/functions/v1/send-welcome-email';
      service_role_key := current_setting('app.settings.service_role_key', true);
      
      -- Make async HTTP request using pg_net
      PERFORM net.http_post(
        url := function_url,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || service_role_key
        ),
        body := jsonb_build_object(
          'notificationId', NEW.id,
          'userId', NEW.user_id,
          'emailText', NEW.email_text
        ),
        timeout_milliseconds := 5000
      );
      
      RAISE LOG 'Welcome email triggered for notification %', NEW.id;
    EXCEPTION
      WHEN OTHERS THEN
        -- Log error but don't fail the notification creation
        RAISE WARNING 'Failed to trigger welcome email for notification %: %', NEW.id, SQLERRM;
    END;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger on notifications table
DROP TRIGGER IF EXISTS send_notification_email_trigger ON public.notifications;
CREATE TRIGGER send_notification_email_trigger
  AFTER INSERT ON public.notifications
  FOR EACH ROW
  WHEN (NEW.email_text IS NOT NULL)
  EXECUTE FUNCTION send_notification_email();
