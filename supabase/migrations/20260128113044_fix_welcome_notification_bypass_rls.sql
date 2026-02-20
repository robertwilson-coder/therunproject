/*
  # Fix Welcome Notification to Bypass RLS

  1. Changes
    - Update create_welcome_notification function to properly bypass RLS
    - Use SET statement to ensure proper schema access

  2. Security
    - Function runs as SECURITY DEFINER with elevated privileges
    - Only creates notification for the newly created user
*/

CREATE OR REPLACE FUNCTION create_welcome_notification()
RETURNS TRIGGER 
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  BEGIN
    -- Insert directly - SECURITY DEFINER should bypass RLS
    INSERT INTO public.notifications (user_id, title, message, type)
    VALUES (
      NEW.id,
      'Welcome to The Run Project! 🏃',
      'Get started by creating your first personalized training plan. Click on "New Plan" to begin your journey.',
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
