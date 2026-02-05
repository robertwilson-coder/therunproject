/*
  # Add Email Text to Notifications

  1. Changes
    - Add `email_text` column to `notifications` table
      - This stores the full email content that was sent to the user
      - Nullable field (not all notifications will have associated emails)
  
  2. Notes
    - This allows users to view the exact email content within the notification center
    - Particularly useful for workout reminders and other email-based notifications
*/

-- Add email_text column to notifications table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'notifications' AND column_name = 'email_text'
  ) THEN
    ALTER TABLE notifications ADD COLUMN email_text text;
  END IF;
END $$;
