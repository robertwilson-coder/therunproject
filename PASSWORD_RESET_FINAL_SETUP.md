# Custom Password Reset Email - Final Setup

## What Changed

I've created a **custom edge function** that sends beautifully styled password reset emails directly using Resend, completely bypassing Supabase's email template system.

This means your password reset emails will now be fully styled with HTML, CSS, and your brand colors - no more plain text emails!

## What You Need to Do

There are 2 steps to complete the setup:

---

## Step 1: Configure Resend API Key in Supabase

The edge function needs your Resend API key to send emails.

### Get Your Resend API Key

1. Go to [resend.com](https://resend.com) and log in
2. Navigate to **API Keys** in the sidebar
3. Click **Create API Key**
4. Give it a name like "The Run Project Auth Emails"
5. Copy the API key (starts with `re_`)

### Add the Secret to Supabase

1. Go to your Supabase Dashboard: https://supabase.com/dashboard/project/wzluaszurokdeuxhersf/settings/functions
2. Navigate to **Edge Functions** in the left sidebar
3. Click on **Secrets** or **Environment Variables**
4. Click **Add New Secret**
5. Enter:
   - **Name**: `RESEND_API_KEY`
   - **Value**: [Paste your Resend API key]
6. Click **Save**

---

## Step 2: Verify Your Domain in Resend

For emails to be sent from `noreply@therunproject.app`, you need to verify your domain.

### Add Your Domain to Resend

1. In Resend dashboard, go to **Domains**
2. Click **Add Domain**
3. Enter `therunproject.app`
4. Resend will show you DNS records to add

### Add DNS Records

You'll need to add these records to your domain's DNS settings (wherever you manage your domain):

1. **SPF Record** (TXT record)
   - Helps verify you're authorized to send emails from your domain

2. **DKIM Record** (TXT record)
   - Adds a digital signature to your emails

3. **DMARC Record** (TXT record) - Optional but recommended
   - Tells email providers how to handle emails that fail SPF/DKIM checks

Copy the exact values from Resend and add them to your DNS provider.

### Wait for Verification

1. After adding the DNS records, go back to Resend
2. Click **Verify** next to your domain
3. Verification usually takes 5-10 minutes (sometimes up to 48 hours for DNS propagation)
4. Once verified, you'll see a green checkmark next to `therunproject.app`

---

## Testing the Password Reset

Once both steps are complete:

1. Go to https://therunproject.app
2. Click **Login**
3. Click **Forgot password?**
4. Enter your email address
5. Click **Send Reset Link**
6. Check your inbox

You should receive a **beautifully styled email** with:
- The Run Project branding
- Blue gradient header
- Styled "Reset Password" button
- Professional footer
- Security notice

---

## What the Email Looks Like

The email will have:
- **Header**: Blue gradient with "The Run Project" title
- **Body**: Clear instructions with a styled button
- **Button**: Blue gradient button that says "Reset Password"
- **Alternative Link**: The full URL in case the button doesn't work
- **Security Notice**: Warning that the link expires in 1 hour
- **Footer**: Professional footer with your branding

---

## Troubleshooting

### Email Not Arriving

1. **Check Resend Dashboard**
   - Go to [resend.com/emails](https://resend.com/emails)
   - Look for recent password reset emails
   - Check the status (delivered, bounced, etc.)

2. **Check Spam Folder**
   - Sometimes the first email goes to spam
   - Mark it as "Not Spam" to help future deliverability

3. **Verify Domain Status**
   - Make sure your domain shows as "Verified" in Resend
   - If not, check your DNS records

### Email is Plain Text

If the email still arrives as plain text:
1. Check that the edge function deployed successfully
2. Verify the RESEND_API_KEY secret is set correctly in Supabase
3. Check the Resend email logs to see if it was sent as HTML

### Error When Sending

1. **Check Browser Console**
   - Open Developer Tools (F12)
   - Look for error messages when clicking "Send Reset Link"

2. **Check Supabase Logs**
   - Go to: https://supabase.com/dashboard/project/wzluaszurokdeuxhersf/logs/edge-functions
   - Look for errors in the `send-password-reset` function
   - Common issues:
     - RESEND_API_KEY not set
     - Invalid email address
     - Resend API rate limit

---

## Important Notes

- **Old email templates in Supabase are no longer used** - we're now using our custom edge function
- **The email HTML is in the edge function code** - if you want to customize it, edit `/supabase/functions/send-password-reset/index.ts`
- **The link expires in 1 hour** - this is controlled by Supabase's token expiration
- **Domain verification is crucial** - without it, emails will be sent from `onboarding@resend.dev` which looks unprofessional

---

## Need to Customize the Email?

The email template is in: `/supabase/functions/send-password-reset/index.ts`

You can customize:
- Colors (change the blue gradients to your brand colors)
- Text content
- Footer information
- Logo (add an image URL)

After making changes, redeploy the edge function.

---

## Summary

1. ✅ Custom edge function created and deployed
2. ✅ Frontend updated to use the new function
3. ⏳ **You need to**: Add RESEND_API_KEY to Supabase
4. ⏳ **You need to**: Verify therunproject.app domain in Resend
5. ⏳ **Then**: Test password reset

Once you complete steps 3 and 4, your password reset emails will be beautifully styled!
