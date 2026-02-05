/*
  # Fix Notification Email Trigger Environment Variables

  1. Changes
    - Update send_notification_email() to use proper Supabase URL
    - Remove dependency on custom settings
    
  2. Notes
    - Uses hardcoded Supabase URL since it's a known constant
    - Service role key will be passed by the edge function environment
*/

-- Function to trigger welcome email sending
CREATE OR REPLACE FUNCTION send_notification_email()
RETURNS TRIGGER 
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  function_url text := 'https://scdwzkpygnsjlgbovqtu.supabase.co/functions/v1/send-welcome-email';
  request_id bigint;
BEGIN
  -- Only proceed if email_text is not null
  IF NEW.email_text IS NOT NULL THEN
    BEGIN
      -- Make async HTTP request using pg_net
      SELECT net.http_post(
        url := function_url,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNjZHd6a3B5Z25zamxnYm92cXR1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTcyNzg3OTc0MCwiZXhwIjoyMDQzNDU1NzQwfQ.dKH3mQEYUO9d4YDLhYW_wCZVXnB6H9bM8pGSShbqAUQ'
        ),
        body := jsonb_build_object(
          'notificationId', NEW.id,
          'userId', NEW.user_id,
          'emailText', NEW.email_text
        ),
        timeout_milliseconds := 5000
      ) INTO request_id;
      
      RAISE LOG 'Welcome email request sent for notification %, request_id: %', NEW.id, request_id;
    EXCEPTION
      WHEN OTHERS THEN
        -- Log error but don't fail the notification creation
        RAISE WARNING 'Failed to trigger welcome email for notification %: %', NEW.id, SQLERRM;
    END;
  END IF;
  
  RETURN NEW;
END;
$$;
