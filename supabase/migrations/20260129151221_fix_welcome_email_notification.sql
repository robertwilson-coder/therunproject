/*
  # Fix Welcome Email Notification

  1. Changes
    - Update create_welcome_notification() to include email_text
    - This ensures new users receive the welcome email
    
  2. Notes
    - Previously, the notification was created without email_text
    - This prevented the welcome email from being sent
*/

CREATE OR REPLACE FUNCTION create_welcome_notification()
RETURNS TRIGGER 
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  BEGIN
    -- Insert welcome notification with full email text for users who just signed up
    INSERT INTO public.notifications (user_id, title, message, type, email_text)
    VALUES (
      NEW.id,
      'Welcome to The Run Project!',
      'Great choice signing up! Your training plan is now saved and you can access it anytime. Explore your dashboard to track progress, chat with your AI coach, use pace calculators, monitor recovery, and discover all the tools to help you reach your goals.',
      'success',
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
  EXCEPTION
    WHEN OTHERS THEN
      -- Log the error but don't block user creation
      RAISE WARNING 'Failed to create welcome notification for user %: %', NEW.id, SQLERRM;
  END;
  RETURN NEW;
END;
$$;
