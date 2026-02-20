/*
  # Add Social Features

  1. Purpose
    - Enable friend connections between users
    - Allow workout sharing with privacy controls
    - Support training groups for race preparation
    - Implement kudos/reactions system
    - Create activity feed for social engagement

  2. New Tables
    - `user_profiles` - User profile information
    - `friendships` - Friend connections between users
    - `workout_shares` - Shared workout activities
    - `training_groups` - Race-based training groups
    - `group_members` - Group membership tracking
    - `kudos` - Reactions/encouragement on shared workouts

  3. Security
    - Enable RLS on all tables
    - Users can only manage their own data
    - Privacy controls for workout sharing
    - Group admins have management privileges
*/

-- User profiles table for social features
CREATE TABLE IF NOT EXISTS user_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  display_name text,
  bio text,
  avatar_url text,
  location text,
  favorite_distance text,
  privacy_settings jsonb DEFAULT '{"shareWorkouts": true, "showProfile": true, "allowFriendRequests": true}'::jsonb,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

-- Friendships table
CREATE TABLE IF NOT EXISTS friendships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  friend_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  status text NOT NULL CHECK (status IN ('pending', 'accepted', 'rejected', 'blocked')),
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE(user_id, friend_id)
);

ALTER TABLE friendships ENABLE ROW LEVEL SECURITY;

-- Workout shares table
CREATE TABLE IF NOT EXISTS workout_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  workout_completion_id uuid REFERENCES workout_completions(id) ON DELETE CASCADE NOT NULL,
  caption text,
  visibility text NOT NULL DEFAULT 'friends' CHECK (visibility IN ('public', 'friends', 'groups')),
  workout_data jsonb NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE workout_shares ENABLE ROW LEVEL SECURITY;

-- Training groups table
CREATE TABLE IF NOT EXISTS training_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  race_name text,
  race_date date,
  race_distance text,
  admin_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  is_public boolean DEFAULT true NOT NULL,
  member_count integer DEFAULT 1 NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE training_groups ENABLE ROW LEVEL SECURITY;

-- Group members table
CREATE TABLE IF NOT EXISTS group_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid REFERENCES training_groups(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  joined_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE(group_id, user_id)
);

ALTER TABLE group_members ENABLE ROW LEVEL SECURITY;

-- Kudos table
CREATE TABLE IF NOT EXISTS kudos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  workout_share_id uuid REFERENCES workout_shares(id) ON DELETE CASCADE NOT NULL,
  emoji text NOT NULL DEFAULT '👏',
  created_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE(user_id, workout_share_id)
);

ALTER TABLE kudos ENABLE ROW LEVEL SECURITY;

-- RLS Policies for user_profiles
CREATE POLICY "Users can view public profiles"
  ON user_profiles FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid() OR
    (privacy_settings->>'showProfile')::boolean = true OR
    EXISTS (
      SELECT 1 FROM friendships
      WHERE (user_id = user_profiles.user_id AND friend_id = auth.uid() AND status = 'accepted')
         OR (friend_id = user_profiles.user_id AND user_id = auth.uid() AND status = 'accepted')
    )
  );

CREATE POLICY "Users can create their own profile"
  ON user_profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own profile"
  ON user_profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- RLS Policies for friendships
CREATE POLICY "Users can view their own friendships"
  ON friendships FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR auth.uid() = friend_id);

CREATE POLICY "Users can create friendship requests"
  ON friendships FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id AND user_id != friend_id);

CREATE POLICY "Users can update their friendship status"
  ON friendships FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id OR auth.uid() = friend_id)
  WITH CHECK (auth.uid() = user_id OR auth.uid() = friend_id);

CREATE POLICY "Users can delete their friendships"
  ON friendships FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id OR auth.uid() = friend_id);

-- RLS Policies for workout_shares
CREATE POLICY "Users can view public workout shares"
  ON workout_shares FOR SELECT
  TO authenticated
  USING (
    visibility = 'public' OR
    user_id = auth.uid() OR
    (visibility = 'friends' AND EXISTS (
      SELECT 1 FROM friendships
      WHERE (user_id = workout_shares.user_id AND friend_id = auth.uid() AND status = 'accepted')
         OR (friend_id = workout_shares.user_id AND user_id = auth.uid() AND status = 'accepted')
    ))
  );

CREATE POLICY "Users can create their own workout shares"
  ON workout_shares FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own workout shares"
  ON workout_shares FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own workout shares"
  ON workout_shares FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- RLS Policies for training_groups
CREATE POLICY "Anyone can view public training groups"
  ON training_groups FOR SELECT
  TO authenticated
  USING (
    is_public = true OR
    admin_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM group_members
      WHERE group_id = training_groups.id AND user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create training groups"
  ON training_groups FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = admin_id);

CREATE POLICY "Admins can update their groups"
  ON training_groups FOR UPDATE
  TO authenticated
  USING (auth.uid() = admin_id)
  WITH CHECK (auth.uid() = admin_id);

CREATE POLICY "Admins can delete their groups"
  ON training_groups FOR DELETE
  TO authenticated
  USING (auth.uid() = admin_id);

-- RLS Policies for group_members
CREATE POLICY "Group members can view members"
  ON group_members FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM training_groups
      WHERE id = group_members.group_id
      AND (is_public = true OR admin_id = auth.uid())
    ) OR
    user_id = auth.uid()
  );

CREATE POLICY "Users can join groups"
  ON group_members FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can leave groups"
  ON group_members FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id OR EXISTS (
    SELECT 1 FROM training_groups
    WHERE id = group_members.group_id AND admin_id = auth.uid()
  ));

-- RLS Policies for kudos
CREATE POLICY "Anyone can view kudos on visible shares"
  ON kudos FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM workout_shares
      WHERE id = kudos.workout_share_id
      AND (
        visibility = 'public' OR
        user_id = auth.uid() OR
        (visibility = 'friends' AND EXISTS (
          SELECT 1 FROM friendships
          WHERE (user_id = workout_shares.user_id AND friend_id = auth.uid() AND status = 'accepted')
             OR (friend_id = workout_shares.user_id AND user_id = auth.uid() AND status = 'accepted')
        ))
      )
    )
  );

CREATE POLICY "Users can give kudos"
  ON kudos FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can remove their kudos"
  ON kudos FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_friendships_user ON friendships(user_id, status);
CREATE INDEX IF NOT EXISTS idx_friendships_friend ON friendships(friend_id, status);
CREATE INDEX IF NOT EXISTS idx_workout_shares_user ON workout_shares(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_workout_shares_visibility ON workout_shares(visibility, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_training_groups_public ON training_groups(is_public, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_group_members_group ON group_members(group_id, joined_at);
CREATE INDEX IF NOT EXISTS idx_kudos_share ON kudos(workout_share_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_profiles_user ON user_profiles(user_id);

-- Function to update group member count
CREATE OR REPLACE FUNCTION update_group_member_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE training_groups
    SET member_count = member_count + 1
    WHERE id = NEW.group_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE training_groups
    SET member_count = member_count - 1
    WHERE id = OLD.group_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_group_member_count_trigger
AFTER INSERT OR DELETE ON group_members
FOR EACH ROW
EXECUTE FUNCTION update_group_member_count();