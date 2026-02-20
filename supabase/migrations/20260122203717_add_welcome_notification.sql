/*
  # Add Welcome Notification on First Plan
  
  1. Changes
    - Updates the welcome email trigger to also create a welcome notification
    - Users will get a notification when they save their first training plan
  
  2. Security
    - Notification is only created for the user who owns the plan
    - Only triggers on first plan creation
*/

-- Update function to also create welcome notification
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
    -- Create welcome notification with email text
    INSERT INTO notifications (user_id, title, message, type, email_text)
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
    RAISE WARNING 'Failed to send welcome email/notification: %', SQLERRM;
    RETURN NEW;
END;
$$;