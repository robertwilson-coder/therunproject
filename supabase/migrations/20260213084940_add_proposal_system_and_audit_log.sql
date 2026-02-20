/*
  # Add Proposal System and Audit Log for Gold-Standard Date Resolution

  ## Overview
  Implements a two-phase commit system for plan modifications to eliminate date ambiguity.
  LLM produces proposals → Backend resolves ISO dates → User approves → Changes apply.

  ## New Tables

  ### `plan_edit_proposals`
  Stores LLM proposals before date resolution
  - `id` (uuid, primary key)
  - `training_plan_id` (uuid, foreign key)
  - `user_id` (uuid, foreign key to auth.users)
  - `intent` (text) - "delete", "move", "reinstate", "modify"
  - `reference_phrases` (jsonb) - Array of natural language references
  - `llm_explanation` (text) - Coach's explanation
  - `raw_llm_response` (jsonb) - Full LLM output for debugging
  - `status` (text) - "pending_resolution", "resolved", "ambiguous", "applied", "rejected"
  - `created_at` (timestamptz)

  ### `plan_edit_resolutions`
  Stores resolved ISO dates and operations
  - `id` (uuid, primary key)
  - `proposal_id` (uuid, foreign key)
  - `resolved_targets` (jsonb) - Array of {iso_date, weekday, relative, human_label, days_from_today}
  - `ambiguity_detected` (boolean)
  - `ambiguity_question` (text) - Question to ask user if ambiguous
  - `ambiguity_options` (jsonb) - Structured options for user
  - `operations` (jsonb) - Array of {iso_date, action, workout, tips}
  - `resolved_at` (timestamptz)

  ### `plan_edit_audit_log`
  Immutable audit trail of all applied changes
  - `id` (uuid, primary key)
  - `training_plan_id` (uuid, foreign key)
  - `user_id` (uuid, foreign key to auth.users)
  - `proposal_id` (uuid, foreign key)
  - `resolution_id` (uuid, foreign key)
  - `iso_date` (date) - Exact date modified
  - `operation` (text) - "cancel", "replace", "reinstate"
  - `before_workout` (text)
  - `after_workout` (text)
  - `before_status` (text)
  - `after_status` (text)
  - `applied_at` (timestamptz)

  ## Schema Updates
  Add status tracking to workout days (via jsonb in plan_data)
  Status values: "scheduled", "cancelled", "completed"

  ## Security
  - Enable RLS on all tables
  - Users can only access their own proposals, resolutions, and audit logs
  - Audit log is read-only after insertion

  ## Notes
  - This implements structural safety: dates are resolved deterministically
  - Ambiguity is detected and requires explicit user clarification
  - All modifications are audited and reversible
  - Past completed workouts are protected by invariant validation
*/

-- Plan Edit Proposals Table
CREATE TABLE IF NOT EXISTS plan_edit_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  training_plan_id uuid NOT NULL REFERENCES training_plans(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  intent text NOT NULL CHECK (intent IN ('delete', 'move', 'reinstate', 'modify', 'reduce', 'swap')),
  reference_phrases jsonb NOT NULL DEFAULT '[]'::jsonb,
  llm_explanation text NOT NULL,
  raw_llm_response jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending_resolution' CHECK (status IN ('pending_resolution', 'resolved', 'ambiguous', 'applied', 'rejected')),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE plan_edit_proposals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own proposals"
  ON plan_edit_proposals FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own proposals"
  ON plan_edit_proposals FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own proposals"
  ON plan_edit_proposals FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Plan Edit Resolutions Table
CREATE TABLE IF NOT EXISTS plan_edit_resolutions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id uuid NOT NULL REFERENCES plan_edit_proposals(id) ON DELETE CASCADE,
  resolved_targets jsonb NOT NULL DEFAULT '[]'::jsonb,
  ambiguity_detected boolean NOT NULL DEFAULT false,
  ambiguity_question text,
  ambiguity_options jsonb DEFAULT '[]'::jsonb,
  operations jsonb NOT NULL DEFAULT '[]'::jsonb,
  resolved_at timestamptz DEFAULT now()
);

ALTER TABLE plan_edit_resolutions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own resolutions"
  ON plan_edit_resolutions FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM plan_edit_proposals
      WHERE plan_edit_proposals.id = plan_edit_resolutions.proposal_id
      AND plan_edit_proposals.user_id = auth.uid()
    )
  );

CREATE POLICY "System can create resolutions"
  ON plan_edit_resolutions FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM plan_edit_proposals
      WHERE plan_edit_proposals.id = plan_edit_resolutions.proposal_id
      AND plan_edit_proposals.user_id = auth.uid()
    )
  );

-- Plan Edit Audit Log Table
CREATE TABLE IF NOT EXISTS plan_edit_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  training_plan_id uuid NOT NULL REFERENCES training_plans(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  proposal_id uuid REFERENCES plan_edit_proposals(id) ON DELETE SET NULL,
  resolution_id uuid REFERENCES plan_edit_resolutions(id) ON DELETE SET NULL,
  iso_date date NOT NULL,
  operation text NOT NULL CHECK (operation IN ('cancel', 'replace', 'reinstate', 'swap')),
  before_workout text,
  after_workout text,
  before_status text,
  after_status text,
  applied_at timestamptz DEFAULT now()
);

ALTER TABLE plan_edit_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own audit log"
  ON plan_edit_audit_log FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "System can insert audit log"
  ON plan_edit_audit_log FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_proposals_user_id ON plan_edit_proposals(user_id);
CREATE INDEX IF NOT EXISTS idx_proposals_training_plan_id ON plan_edit_proposals(training_plan_id);
CREATE INDEX IF NOT EXISTS idx_proposals_status ON plan_edit_proposals(status);
CREATE INDEX IF NOT EXISTS idx_resolutions_proposal_id ON plan_edit_resolutions(proposal_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_training_plan_id ON plan_edit_audit_log(training_plan_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_iso_date ON plan_edit_audit_log(iso_date);
CREATE INDEX IF NOT EXISTS idx_audit_log_user_id ON plan_edit_audit_log(user_id);
