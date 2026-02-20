/*
  # Add Preview Sets for Gold Standard Proposal System

  ## Changes
  
  1. Create `preview_sets` table
     - Stores preview data for Draft → Preview → Commit pipeline
     - Expires after 15 minutes
     - Enables transactional integrity
  
  2. Add RLS policies
     - Users can only access their own preview sets
  
  ## Notes
  
  - Preview sets are temporary staging for workout modifications
  - They ensure what user sees in preview === what gets committed
  - Auto-cleanup via expires_at timestamp
*/

-- Create preview_sets table
CREATE TABLE IF NOT EXISTS preview_sets (
  preview_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  plan_id UUID REFERENCES training_plans(id) ON DELETE CASCADE NOT NULL,
  plan_version INTEGER NOT NULL,
  modifications JSONB NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE preview_sets ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view own preview sets"
  ON preview_sets
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own preview sets"
  ON preview_sets
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own preview sets"
  ON preview_sets
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_preview_sets_user_id ON preview_sets(user_id);
CREATE INDEX IF NOT EXISTS idx_preview_sets_expires_at ON preview_sets(expires_at);
CREATE INDEX IF NOT EXISTS idx_preview_sets_plan_id ON preview_sets(plan_id);

-- Function to auto-cleanup expired previews
CREATE OR REPLACE FUNCTION cleanup_expired_previews()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM preview_sets WHERE expires_at < now();
END;
$$;

-- Note: In production, you would schedule this function to run periodically
-- For now, it can be called manually or via a cron job
