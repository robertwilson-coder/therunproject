/*
  # Add Welcome Email Trigger

  1. Changes
    - Creates a function to send welcome email when user saves their first training plan
    - Adds a trigger on training_plans table to call this function after insert
    - Only sends email for the user's first plan
  
  2. Security
    - Function uses security definer to access auth.users
    - Only triggers for authenticated users
*/

-- Function to send welcome email on first plan save
CREATE OR REPLACE FUNCTION send_welcome_email_on_first_plan()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_plan_count int;
  v_user_email text;
  v_supabase_url text;
  v_supabase_anon_key text;
BEGIN
  -- Count how many plans this user has (including the one just inserted)
  SELECT COUNT(*) INTO v_plan_count
  FROM training_plans
  WHERE user_id = NEW.user_id;

  -- Only send welcome email if this is their first plan
  IF v_plan_count = 1 THEN
    -- Get user email
    SELECT email INTO v_user_email
    FROM auth.users
    WHERE id = NEW.user_id;

    -- Get environment variables
    v_supabase_url := current_setting('app.settings.supabase_url', true);
    v_supabase_anon_key := current_setting('app.settings.supabase_anon_key', true);

    -- If env vars not set, use default from supabase
    IF v_supabase_url IS NULL THEN
      v_supabase_url := 'https://' || current_setting('request.headers', true)::json->>'host';
    END IF;

    -- Call the edge function asynchronously (non-blocking)
    PERFORM net.http_post(
      url := v_supabase_url || '/functions/v1/send-welcome-email',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || v_supabase_anon_key
      ),
      body := jsonb_build_object(
        'email', v_user_email
      )
    );
  END IF;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Log error but don't fail the insert
    RAISE WARNING 'Failed to send welcome email: %', SQLERRM;
    RETURN NEW;
END;
$$;

-- Create trigger
DROP TRIGGER IF EXISTS on_first_plan_send_welcome ON training_plans;
CREATE TRIGGER on_first_plan_send_welcome
  AFTER INSERT ON training_plans
  FOR EACH ROW
  EXECUTE FUNCTION send_welcome_email_on_first_plan();
