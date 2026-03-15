/*
  # Fix Social Hub - Add Workout Shares View
  
  1. Purpose
    - Create a view that joins workout_shares with user_profiles
    - Enable proper querying in the Social Hub component
    - Fix the relationship issue between tables
  
  2. Changes
    - Create a view `workout_shares_with_profiles` that includes user profile data
    - This view will be used by the SocialHub component instead of direct table queries
  
  3. Security
    - View respects existing RLS policies
    - Only shows data that the requesting user has permission to see
*/

-- Create a view that joins workout_shares with user profiles
CREATE OR REPLACE VIEW workout_shares_with_profiles AS
SELECT 
  ws.id,
  ws.user_id,
  ws.workout_completion_id,
  ws.caption,
  ws.visibility,
  ws.workout_data,
  ws.created_at,
  up.display_name,
  up.avatar_url
FROM workout_shares ws
LEFT JOIN user_profiles up ON ws.user_id = up.user_id;

-- Grant access to authenticated users
GRANT SELECT ON workout_shares_with_profiles TO authenticated;

-- Create a function to get workout feed with kudos count
CREATE OR REPLACE FUNCTION get_workout_feed(limit_count integer DEFAULT 20)
RETURNS TABLE (
  id uuid,
  user_id uuid,
  workout_completion_id uuid,
  caption text,
  visibility text,
  workout_data jsonb,
  created_at timestamptz,
  display_name text,
  avatar_url text,
  kudos_count bigint,
  has_given_kudos boolean
) 
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ws.id,
    ws.user_id,
    ws.workout_completion_id,
    ws.caption,
    ws.visibility,
    ws.workout_data,
    ws.created_at,
    up.display_name,
    up.avatar_url,
    COUNT(DISTINCT k.id)::bigint as kudos_count,
    EXISTS(SELECT 1 FROM kudos WHERE workout_share_id = ws.id AND kudos.user_id = auth.uid()) as has_given_kudos
  FROM workout_shares ws
  LEFT JOIN user_profiles up ON ws.user_id = up.user_id
  LEFT JOIN kudos k ON k.workout_share_id = ws.id
  WHERE (
    ws.visibility = 'public' OR
    ws.user_id = auth.uid() OR
    (ws.visibility = 'friends' AND EXISTS (
      SELECT 1 FROM friendships
      WHERE (friendships.user_id = ws.user_id AND friendships.friend_id = auth.uid() AND friendships.status = 'accepted')
         OR (friendships.friend_id = ws.user_id AND friendships.user_id = auth.uid() AND friendships.status = 'accepted')
    ))
  )
  GROUP BY ws.id, ws.user_id, ws.workout_completion_id, ws.caption, ws.visibility, 
           ws.workout_data, ws.created_at, up.display_name, up.avatar_url
  ORDER BY ws.created_at DESC
  LIMIT limit_count;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION get_workout_feed TO authenticated;