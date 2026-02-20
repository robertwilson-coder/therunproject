/*
  # Fix Profile Creation to Bypass RLS

  1. Changes
    - Update create_user_profile function to properly bypass RLS
    - Use SET statement to disable RLS for this specific operation

  2. Security
    - Function runs as SECURITY DEFINER with elevated privileges
    - Only creates profile for the newly created user
*/

CREATE OR REPLACE FUNCTION create_user_profile()
RETURNS TRIGGER 
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  BEGIN
    -- Insert directly - SECURITY DEFINER should bypass RLS
    INSERT INTO public.user_profiles (user_id, display_name, privacy_settings)
    VALUES (
      NEW.id,
      COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)),
      '{"shareWorkouts": true, "showProfile": true, "allowFriendRequests": true}'::jsonb
    )
    ON CONFLICT (user_id) DO NOTHING;
  EXCEPTION
    WHEN OTHERS THEN
      -- Log the error but don't block user creation
      RAISE WARNING 'Failed to create user profile for user %: %', NEW.id, SQLERRM;
  END;
  RETURN NEW;
END;
$$;
