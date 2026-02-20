/*
  # Add Email Text to Welcome Notification

  1. Changes
    - Update create_welcome_notification() to include email_text field
    - This triggers the send_notification_email_trigger to send the actual email
    
  2. Notes
    - email_text contains the full HTML email content
    - When notification is created with email_text, the email trigger fires automatically
*/

CREATE OR REPLACE FUNCTION create_welcome_notification()
RETURNS TRIGGER 
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  user_email text;
BEGIN
  BEGIN
    -- Get the user's email from auth.users
    SELECT email INTO user_email FROM auth.users WHERE id = NEW.id;
    
    -- Insert welcome notification with helpful exploration message and email content
    INSERT INTO public.notifications (user_id, title, message, type, email_text)
    VALUES (
      NEW.id,
      'Welcome to The Run Project!',
      'Thanks for joining! Take a look around your dashboard to explore features like progress tracking, pace calculators, heart rate zones, recovery tools, and more. When you''re ready, use the chat to speak with your AI coach about your training goals.',
      'success',
      '<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
    .content { background: white; padding: 30px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 8px 8px; }
    .feature { margin: 20px 0; padding: 15px; background: #f7fafc; border-radius: 6px; }
    .feature h3 { margin: 0 0 8px 0; color: #667eea; }
    .cta { display: inline-block; background: #667eea; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 20px 0; }
    .footer { text-align: center; margin-top: 30px; color: #718096; font-size: 14px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Welcome to The Run Project! 🎉</h1>
    </div>
    <div class="content">
      <p>Hi there!</p>
      
      <p>Thanks for joining The Run Project. We''re excited to help you achieve your running goals with personalized AI-powered training plans.</p>
      
      <p><strong>Here''s what you can do now:</strong></p>
      
      <div class="feature">
        <h3>📊 Track Your Progress</h3>
        <p>Log workouts, monitor your training load, and see your improvements over time.</p>
      </div>
      
      <div class="feature">
        <h3>💬 Chat with Your AI Coach</h3>
        <p>Ask questions about training, get advice on pacing, or request plan modifications.</p>
      </div>
      
      <div class="feature">
        <h3>🛠️ Use Training Tools</h3>
        <p>Access pace calculators, heart rate zone calculators, recovery tools, and more.</p>
      </div>
      
      <div class="feature">
        <h3>📅 Calendar Integration</h3>
        <p>Export your training plan to Google Calendar, Apple Calendar, or Outlook.</p>
      </div>
      
      <p>Ready to get started? Head over to your dashboard and explore the features, or jump right in and generate your first personalized training plan.</p>
      
      <a href="https://therunproject.app" class="cta">Go to Dashboard</a>
      
      <p>If you have any questions or need help, just reply to this email or use the in-app chat.</p>
      
      <p>Happy running!</p>
      <p><strong>The Run Project Team</strong></p>
    </div>
    <div class="footer">
      <p>You received this email because you signed up for The Run Project.</p>
    </div>
  </div>
</body>
</html>'
    );
  EXCEPTION
    WHEN OTHERS THEN
      -- Log the error but don't block user creation
      RAISE WARNING 'Failed to create welcome notification for user %: %', NEW.id, SQLERRM;
  END;
  RETURN NEW;
END;
$$;
