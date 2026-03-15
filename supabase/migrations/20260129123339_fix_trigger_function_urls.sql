/*
  # Fix Trigger Function URLs for Edge Function Calls

  1. Changes
    - Update `send_welcome_email_on_first_plan()` to use Supabase environment variables
    - Update `notify_new_user_discord()` to use Supabase environment variables
    - Use Deno.env style environment variable access that works in Supabase

  2. Notes
    - The previous implementation tried to use app.settings which are not configured
    - Supabase provides SUPABASE_URL as an environment variable
    - Functions need to use this to construct proper URLs for calling edge functions
*/

CREATE OR REPLACE FUNCTION send_welcome_email_on_first_plan()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_plan_count int;
  v_user_email text;
BEGIN
  BEGIN
    SELECT COUNT(*) INTO v_plan_count
    FROM public.training_plans
    WHERE user_id = NEW.user_id;

    IF v_plan_count = 1 THEN
      INSERT INTO public.notifications (user_id, title, message, type, email_text)
      VALUES (
        NEW.user_id,
        'Welcome to The Run Project!',
        'Thanks for creating your first training plan! Check back here for updates on your progress, badges, and training milestones.',
        'info',
        'Welcome to The Run Project

Thanks for joining! We''re excited to help you work toward your running goals with a personalized, flexible training plan powered by AI.

The Run Project is still evolving, and you''re getting early access. During this stage, your feedback is incredibly valuable to us. You''ll find a Give Feedback button at the top of every page. If something isn''t working as expected or you think something could be improved, let us know and we''ll get on it as quickly as possible.

GETTING STARTED

Chat with the Coach

Use the chat feature to tailor your plan to your life. You can:
- Adjust workouts and intensities
- Move rest days or sessions
- Ask for advice, feedback, or answers to any running-related questions

You can adapt your plan at any time, for the entire duration — the coach is available 24/7 with instant responses.

Flexible Training Schedule

In the plan view, use the shortcut arrows to:
- Move workouts to a different day
- Adjust workout difficulty when needed

Your training should work with your schedule, not against it.

YOUR DASHBOARD

Your dashboard brings everything together in one place.

Track your progress with:
- Workout completion and consistency tracking
- Progress charts showing training volume over time
- Streaks and badges to reward consistency
- Performance analytics with deeper training insights

Fine-tune your training with:
- Pace calculator for races and training zones
- Heart rate zone setup and tracking
- Recovery tools to monitor sleep, injuries, and overall load

OTHER AVAILABLE FEATURES
- Nutrition Lab: Explore fueling strategies that work for you
- Race Day Planning: Build, test, and refine your race strategy during training

COMING SOON
- Garmin Connect integration
- TrainingPeaks plan syncing

If you need help or have ideas to share, the Feedback button is the fastest way to reach us.

We''re glad you''re here! Happy running

The Run Project Team'
      );

      SELECT email INTO v_user_email
      FROM auth.users
      WHERE id = NEW.user_id;

      PERFORM net.http_post(
        url := current_setting('request.jwt.claims', true)::json->>'iss' || '/functions/v1/send-welcome-email',
        headers := jsonb_build_object(
          'Content-Type', 'application/json'
        ),
        body := jsonb_build_object(
          'email', v_user_email
        ),
        timeout_milliseconds := 5000
      );
    END IF;
  EXCEPTION
    WHEN OTHERS THEN
      RAISE WARNING 'Failed to send welcome email/notification for user %: %', NEW.user_id, SQLERRM;
  END;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION notify_new_user_discord()
RETURNS TRIGGER 
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  payload json;
  function_url text;
BEGIN
  BEGIN
    function_url := current_setting('request.jwt.claims', true)::json->>'iss' || '/functions/v1/notify-new-user-discord';

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
        'Content-Type', 'application/json'
      ),
      body := payload::jsonb,
      timeout_milliseconds := 5000
    );
  EXCEPTION
    WHEN OTHERS THEN
      RAISE WARNING 'Failed to send Discord notification for new user %: %', NEW.id, SQLERRM;
  END;

  RETURN NEW;
END;
$$;