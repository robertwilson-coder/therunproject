/*
  # Add Rate Limiting Infrastructure

  1. New Tables
    - `rate_limits`
      - `id` (uuid, primary key)
      - `identifier` (text) - User ID or IP address
      - `function_name` (text) - Name of the edge function
      - `created_at` (timestamptz) - When the request was made

  2. Indexes
    - Index on (identifier, function_name, created_at) for fast lookups
    - Index on created_at for cleanup queries

  3. Security
    - Enable RLS
    - Only service role can access (edge functions use service role key)
*/

-- Create rate_limits table
CREATE TABLE IF NOT EXISTS rate_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  identifier text NOT NULL,
  function_name text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_rate_limits_lookup
  ON rate_limits(identifier, function_name, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_rate_limits_cleanup
  ON rate_limits(created_at);

-- Enable RLS
ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;

-- Only service role can access (no policies needed as edge functions use service role)
-- This prevents regular users from manipulating rate limit data
