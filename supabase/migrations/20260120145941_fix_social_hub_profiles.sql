/*
  # Fix Social Hub - Create User Profiles
  
  1. Purpose
    - Create user profiles for all existing users
    - Add trigger to automatically create profiles for new users
    - Ensure social features work for all users
  
  2. Changes
    - Create profiles for existing users
    - Add trigger function for automatic profile creation
    - Add trigger on auth.users table
  
  3. Notes
    - Uses display name from email if not set
    - All profiles created with default privacy settings
*/

-- Create profiles for all existing users who don't have one
INSERT INTO user_profiles (user_id, display_name, privacy_settings)
SELECT 
  id,
  COALESCE(raw_user_meta_data->>'display_name', split_part(email, '@', 1)),
  '{"shareWorkouts": true, "showProfile": true, "allowFriendRequests": true}'::jsonb
FROM auth.users
WHERE NOT EXISTS (
  SELECT 1 FROM user_profiles WHERE user_profiles.user_id = auth.users.id
);

-- Create function to automatically create user profile on signup
CREATE OR REPLACE FUNCTION create_user_profile()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO user_profiles (user_id, display_name, privacy_settings)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)),
    '{"shareWorkouts": true, "showProfile": true, "allowFriendRequests": true}'::jsonb
  )
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger to call the function after user signup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION create_user_profile();