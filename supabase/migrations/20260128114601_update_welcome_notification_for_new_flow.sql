/*
  # Update Welcome Notification for New User Flow

  1. Changes
    - Update welcome notification message for users who have just signed up after creating a plan
    - Message now congratulates them on saving their first plan and invites exploration
    
  2. Notes
    - Users now complete questionnaire before signup
    - Welcome message acknowledges they've already created their first plan
*/

CREATE OR REPLACE FUNCTION create_welcome_notification()
RETURNS TRIGGER 
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  BEGIN
    -- Insert welcome notification for users who just signed up after creating a plan
    INSERT INTO public.notifications (user_id, title, message, type)
    VALUES (
      NEW.id,
      'Welcome to The Run Project!',
      'Great choice signing up! Your training plan is now saved and you can access it anytime. Explore your dashboard to track progress, chat with your AI coach, use pace calculators, monitor recovery, and discover all the tools to help you reach your goals.',
      'success'
    );
  EXCEPTION
    WHEN OTHERS THEN
      -- Log the error but don't block user creation
      RAISE WARNING 'Failed to create welcome notification for user %: %', NEW.id, SQLERRM;
  END;
  RETURN NEW;
END;
$$;
