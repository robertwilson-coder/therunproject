/*
  # Fix Welcome Email Trigger Environment Variables

  1. Changes
    - Update trigger function to use hardcoded Supabase URL instead of database settings
    - Remove Authorization header requirement for internal edge function calls
    - Edge function will use its own service role key from environment
    
  2. Notes
    - Database triggers cannot access Deno.env, so we pass minimal data
    - Edge function handles authentication using its own environment variables
*/

CREATE OR REPLACE FUNCTION send_notification_email()
RETURNS TRIGGER 
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  function_url text;
BEGIN
  IF NEW.email_text IS NOT NULL THEN
    BEGIN
      function_url := 'https://wzluaszurokdeuxhersf.supabase.co/functions/v1/send-welcome-email';
      
      PERFORM net.http_post(
        url := function_url,
        headers := jsonb_build_object(
          'Content-Type', 'application/json'
        ),
        body := jsonb_build_object(
          'userId', NEW.user_id,
          'emailText', NEW.email_text
        ),
        timeout_milliseconds := 5000
      );
      
      RAISE LOG 'Welcome email triggered for notification % (user %)', NEW.id, NEW.user_id;
    EXCEPTION
      WHEN OTHERS THEN
        RAISE WARNING 'Failed to trigger welcome email for notification %: %', NEW.id, SQLERRM;
    END;
  END IF;
  
  RETURN NEW;
END;
$$;
