# Discord Feedback Notifications Setup

This guide will help you set up Discord notifications for beta feedback submissions.

## Step 1: Create a Discord Webhook

1. Open Discord and navigate to the channel where you want to receive feedback notifications
2. Click the gear icon next to the channel name to open Channel Settings
3. Go to **Integrations** → **Webhooks**
4. Click **New Webhook** or **Create Webhook**
5. Give your webhook a name (e.g., "Beta Feedback")
6. Copy the **Webhook URL** (it should look like: `https://discord.com/api/webhooks/...`)

## Step 2: Configure the Webhook in Supabase

1. Go to your Supabase Dashboard: https://supabase.com/dashboard
2. Select your project
3. Navigate to **Edge Functions** in the left sidebar
4. Find the `notify-feedback-discord` function
5. Click on it and go to the **Secrets** tab
6. Add a new secret:
   - **Name**: `DISCORD_WEBHOOK_URL`
   - **Value**: Paste your Discord webhook URL from Step 1
7. Click **Save**

## Step 3: Test the Setup

1. Submit feedback through your app
2. Check your Discord channel - you should receive a formatted message with the feedback details

## Notification Format

Each feedback notification includes:
- User ID (or "Anonymous" if not logged in)
- Most Useful section
- Confusing/Frustrating section
- Comparison to other plans
- Suggested improvements
- Other remarks
- Timestamp and feedback ID

## Troubleshooting

If notifications aren't working:

1. **Check the webhook URL**: Make sure it's correct and hasn't expired
2. **Check Edge Function logs**: Go to Edge Functions → notify-feedback-discord → Logs
3. **Verify the secret**: Ensure `DISCORD_WEBHOOK_URL` is properly set in the function secrets
4. **Test manually**: You can invoke the function manually from the Supabase dashboard

## How It Works

- When feedback is submitted to the `beta_feedback` table
- A database trigger automatically calls the `notify-feedback-discord` edge function
- The function formats the feedback and sends it to your Discord webhook
- You receive an instant notification in Discord
