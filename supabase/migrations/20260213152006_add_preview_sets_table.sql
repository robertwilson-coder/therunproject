/*
  # Add Preview Sets Table for Transaction Integrity

  1. New Tables
    - `chat_preview_sets`: Stores preview operations before commit
      - `id` (uuid, primary key)
      - `plan_id` (uuid, references training_plans)
      - `user_id` (uuid, references auth.users)
      - `preview_hash` (text) - Hash of operations for integrity check
      - `operations` (jsonb) - Array of preview operations
      - `summary` (text) - Human-readable summary
      - `affected_dates` (text[]) - ISO dates affected
      - `created_at` (timestamptz)
      - `expires_at` (timestamptz) - Auto-expire after 1 hour

  2. Security
    - Enable RLS on `chat_preview_sets` table
    - Add policy for users to manage their own previews
    - Add cleanup function for expired previews
*/

-- Create preview sets table
CREATE TABLE IF NOT EXISTS chat_preview_sets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES training_plans(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  preview_hash text NOT NULL,
  operations jsonb NOT NULL,
  summary text NOT NULL,
  affected_dates text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '1 hour')
);

-- Enable RLS
ALTER TABLE chat_preview_sets ENABLE ROW LEVEL SECURITY;

-- Policy: Users can manage their own preview sets
CREATE POLICY "Users can manage own preview sets"
  ON chat_preview_sets
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_chat_preview_sets_user_id ON chat_preview_sets(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_preview_sets_plan_id ON chat_preview_sets(plan_id);
CREATE INDEX IF NOT EXISTS idx_chat_preview_sets_expires_at ON chat_preview_sets(expires_at);

-- Function to cleanup expired previews
CREATE OR REPLACE FUNCTION cleanup_expired_preview_sets()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM chat_preview_sets
  WHERE expires_at < now();
END;
$$;

COMMENT ON TABLE chat_preview_sets IS 'Stores preview operations for chat-based plan modifications before commit - ensures transaction integrity';
COMMENT ON COLUMN chat_preview_sets.preview_hash IS 'Hash of operations to verify integrity between preview and commit';
COMMENT ON COLUMN chat_preview_sets.operations IS 'Array of PreviewOperation objects with workout_id, operation type, before/after snapshots';
