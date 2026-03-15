/*
  # Update Welcome Notification

  1. Changes
    - Update welcome notification to show helpful exploration message
    - Keep it on signup trigger (not first plan creation)
    - Remove the unhelpful "create your first plan" message

  2. Notes
    - Message now encourages users to explore dashboard features
    - Mentions chat functionality and other tools
*/

CREATE OR REPLACE FUNCTION create_welcome_notification()
RETURNS TRIGGER 
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  BEGIN
    -- Insert welcome notification with helpful exploration message
    INSERT INTO public.notifications (user_id, title, message, type)
    VALUES (
      NEW.id,
      'Welcome to The Run Project!',
      'Thanks for joining! Take a look around your dashboard to explore features like progress tracking, pace calculators, heart rate zones, recovery tools, and more. When you''re ready, use the chat to speak with your AI coach about your training goals.',
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
