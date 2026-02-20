/*
  # Add Metadata to Chat Messages

  1. Changes
    - Add `metadata` column to `chat_messages` table
      - JSONB type for flexible metadata storage
      - Used for coach intervention dedupe and traceability
      - Example structure:
        {
          "source": "rpe_deviation",
          "completionId": "uuid",
          "workoutKey": "week-day",
          "deviationValue": 2,
          "timestamp": "ISO timestamp"
        }

  2. Purpose
    - Enable dedupe of coach intervention messages
    - Track message source and context
    - Support future metadata needs
*/

-- Add metadata column to chat_messages
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'chat_messages' AND column_name = 'metadata'
  ) THEN
    ALTER TABLE chat_messages ADD COLUMN metadata jsonb DEFAULT NULL;
  END IF;
END $$;

-- Add index for querying by metadata source
CREATE INDEX IF NOT EXISTS idx_chat_messages_metadata_source
  ON chat_messages((metadata->>'source'));