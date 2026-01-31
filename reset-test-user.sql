-- Run this in your Supabase SQL Editor to delete a test user and all their data
-- Replace 'your-test-email@example.com' with your actual test email

-- First, get the user ID (optional - for verification)
SELECT id, email FROM auth.users WHERE email = 'your-test-email@example.com';

-- Delete all user data (cascading will handle most relations)
DO $$
DECLARE
  user_uuid UUID;
BEGIN
  -- Get the user ID
  SELECT id INTO user_uuid FROM auth.users WHERE email = 'your-test-email@example.com';

  IF user_uuid IS NOT NULL THEN
    -- Delete user data from all tables
    DELETE FROM training_plans WHERE user_id = user_uuid;
    DELETE FROM workout_completions WHERE user_id = user_uuid;
    DELETE FROM user_profiles WHERE id = user_uuid;
    DELETE FROM user_streaks WHERE user_id = user_uuid;
    DELETE FROM user_badges WHERE user_id = user_uuid;
    DELETE FROM chat_messages WHERE user_id = user_uuid;
    DELETE FROM notifications WHERE user_id = user_uuid;
    DELETE FROM beta_feedback WHERE user_id = user_uuid;

    -- Delete the auth user (this will cascade to related tables)
    DELETE FROM auth.users WHERE id = user_uuid;

    RAISE NOTICE 'Successfully deleted user: %', user_uuid;
  ELSE
    RAISE NOTICE 'User not found with email: your-test-email@example.com';
  END IF;
END $$;
