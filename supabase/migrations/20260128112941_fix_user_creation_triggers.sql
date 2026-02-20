/*
  # Fix User Creation Triggers

  1. Changes
    - Add exception handling to create_user_profile function
    - Add exception handling to create_welcome_notification function
    - Ensure user signup doesn't fail if profile or notification creation fails

  2. Security
    - Maintains SECURITY DEFINER for proper access
    - Non-blocking operations for better user experience
*/

-- Fix user profile creation trigger
CREATE OR REPLACE FUNCTION create_user_profile()
RETURNS TRIGGER AS $$
BEGIN
  BEGIN
    INSERT INTO user_profiles (user_id, display_name, privacy_settings)
    VALUES (
      NEW.id,
      COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)),
      '{"shareWorkouts": true, "showProfile": true, "allowFriendRequests": true}'::jsonb
    )
    ON CONFLICT (user_id) DO NOTHING;
  EXCEPTION
    WHEN OTHERS THEN
      RAISE WARNING 'Failed to create user profile: %', SQLERRM;
  END;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Fix welcome notification creation trigger
CREATE OR REPLACE FUNCTION create_welcome_notification()
RETURNS TRIGGER AS $$
BEGIN
  BEGIN
    INSERT INTO notifications (user_id, title, message, type)
    VALUES (
      NEW.id,
      'Welcome to The Run Project! 🏃',
      'Get started by creating your first personalized training plan. Click on "New Plan" to begin your journey.',
      'success'
    );
  EXCEPTION
    WHEN OTHERS THEN
      RAISE WARNING 'Failed to create welcome notification: %', SQLERRM;
  END;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
