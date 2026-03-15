# CRITICAL: Supabase Password Reset Configuration Required

## Two Steps Required

This guide covers TWO separate configurations needed for password reset:
1. **SMTP Setup** - Configure custom email sending (using Resend)
2. **Site URL Setup** - Configure where reset links redirect to

---

## PART 1: SMTP Configuration for Custom Emails

### Why Configure SMTP?

By default, Supabase sends auth emails (password reset, email confirmation, etc.) from their servers. Setting up custom SMTP allows you to:
- Send emails from your own domain (e.g., `noreply@therunproject.com`)
- Customize email templates with your branding
- Have better deliverability and control

### Setting Up Resend SMTP with Supabase

**Step 1: Get Resend SMTP Credentials**

1. Go to [resend.com](https://resend.com) and log in
2. Navigate to **API Keys** in the sidebar
3. Click **Create API Key**
4. Give it a name like "Supabase Auth Emails"
5. Copy the API key (starts with `re_`)

**Step 2: Get Resend SMTP Settings**

Resend provides SMTP access. Here are the settings you'll need:

```
SMTP Host: smtp.resend.com
SMTP Port: 465 (SSL) or 587 (TLS)
SMTP Username: resend
SMTP Password: [Your Resend API Key from Step 1]
```

**Step 3: Configure SMTP in Supabase Dashboard**

1. Go to your Supabase Dashboard: https://supabase.com/dashboard/project/wzluaszurokdeuxhersf
2. Navigate to **Authentication > Email Templates** in the left sidebar
3. Scroll down to **SMTP Settings**
4. Click **Enable Custom SMTP**
5. Fill in the following:
   - **Sender email**: `noreply@therunproject.com` (or your preferred email)
   - **Sender name**: `The Run Project`
   - **Host**: `smtp.resend.com`
   - **Port number**: `465`
   - **Username**: `resend`
   - **Password**: [Paste your Resend API key]
   - **Secure connection**: Select **SSL**
6. Click **Save**

**Step 4: Verify Your Domain in Resend**

1. In Resend dashboard, go to **Domains**
2. Click **Add Domain**
3. Enter `therunproject.com`
4. Follow the instructions to add DNS records (SPF, DKIM, DMARC)
5. Wait for verification (usually takes a few minutes)

**Step 5: Test the SMTP Configuration**

1. In Supabase Dashboard, on the SMTP Settings page
2. Look for the **Send Test Email** button
3. Enter your email address
4. Click **Send Test Email**
5. Check your inbox to confirm it works

### Customizing Email Templates

Once SMTP is set up, you MUST customize the email templates to add proper formatting:

1. In Supabase Dashboard, go to **Authentication > Email Templates**
2. You'll see templates for:
   - Confirm signup
   - Invite user
   - Magic Link
   - **Reset Password** (this is the one for password reset)
   - Email Change
3. Click on **Reset Password**
4. Replace the default template with the formatted HTML below
5. Click **Save**

**Formatted Password Reset Email Template:**

```html
<html>
<head>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      line-height: 1.6;
      color: #333;
      background-color: #f4f4f4;
      margin: 0;
      padding: 0;
    }
    .container {
      max-width: 600px;
      margin: 40px auto;
      background: #ffffff;
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    }
    .header {
      background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);
      padding: 40px 20px;
      text-align: center;
    }
    .header h1 {
      margin: 0;
      color: #ffffff;
      font-size: 28px;
      font-weight: 600;
    }
    .content {
      padding: 40px 30px;
    }
    .content h2 {
      color: #1f2937;
      font-size: 22px;
      margin-top: 0;
      margin-bottom: 20px;
    }
    .content p {
      color: #4b5563;
      font-size: 16px;
      margin-bottom: 20px;
    }
    .button {
      display: inline-block;
      padding: 14px 32px;
      background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);
      color: #ffffff;
      text-decoration: none;
      border-radius: 6px;
      font-weight: 600;
      font-size: 16px;
      margin: 20px 0;
      box-shadow: 0 4px 6px rgba(37, 99, 235, 0.3);
      transition: all 0.2s;
    }
    .button:hover {
      box-shadow: 0 6px 12px rgba(37, 99, 235, 0.4);
    }
    .footer {
      background: #f9fafb;
      padding: 30px;
      text-align: center;
      border-top: 1px solid #e5e7eb;
    }
    .footer p {
      margin: 5px 0;
      color: #6b7280;
      font-size: 14px;
    }
    .security-notice {
      background: #fef3c7;
      border-left: 4px solid #f59e0b;
      padding: 15px;
      margin: 20px 0;
      border-radius: 4px;
    }
    .security-notice p {
      margin: 0;
      color: #92400e;
      font-size: 14px;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>The Run Project</h1>
    </div>
    <div class="content">
      <h2>Reset Your Password</h2>
      <p>Hello,</p>
      <p>We received a request to reset your password. Click the button below to create a new password:</p>
      <div style="text-align: center;">
        <a href="{{ .ConfirmationURL }}" class="button">Reset Password</a>
      </div>
      <p style="margin-top: 30px;">Or copy and paste this link into your browser:</p>
      <p style="word-break: break-all; color: #2563eb; font-size: 14px;">{{ .ConfirmationURL }}</p>
      <div class="security-notice">
        <p><strong>Security Notice:</strong> This link will expire in 1 hour. If you didn't request a password reset, you can safely ignore this email.</p>
      </div>
    </div>
    <div class="footer">
      <p><strong>The Run Project</strong></p>
      <p>Your personalized training companion</p>
      <p style="margin-top: 20px;">Questions? Contact us at support@therunproject.com</p>
    </div>
  </div>
</body>
</html>
```

**Important Notes:**

- The `{{ .ConfirmationURL }}` variable is automatically replaced by Supabase with the actual reset link
- You can customize colors, fonts, and styling to match your brand
- Test the template by requesting a password reset after saving
- The inline CSS ensures compatibility with most email clients

### Troubleshooting Unformatted Emails

If you're still receiving unformatted emails after setting up the template and SMTP:

#### 1. Verify Template is Saved in Supabase

- Go to **Authentication > Email Templates** in Supabase Dashboard
- Click on **Reset Password**
- Confirm your HTML template is there (should be the full HTML above, not the simple default)
- Make absolutely sure you clicked **Save** (not just pasted and closed the modal)
- After saving, scroll down and click **Save** again if there's a save button at the bottom

#### 2. Add DOCTYPE and Meta Tags

Some email systems need explicit HTML declarations. Update your template to include DOCTYPE at the very top:

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      /* ... rest of your styles ... */
```

#### 3. Check Your Email Client

Some email clients strip or don't render HTML:
- **Test with Gmail**: Gmail has excellent HTML email support
- **Try Outlook.com**: Good HTML rendering in web version
- **Check Yahoo Mail**: Also supports HTML emails well
- **Avoid corporate email clients initially**: Some strip HTML for security

#### 4. Verify SMTP Configuration

Double-check your SMTP settings in Supabase:

1. Go to **Authentication > Email Templates > SMTP Settings**
2. Verify:
   - **Host**: `smtp.resend.com`
   - **Port**: `465`
   - **Username**: `resend`
   - **Password**: Your Resend API key (starts with `re_`)
   - **Sender email**: Must be from a verified domain in Resend
3. Click **Send Test Email** to verify it works
4. Check the test email - if it's formatted, then SMTP is working

#### 5. Verify Domain in Resend

If emails are still plain text:

1. Go to your [Resend Dashboard](https://resend.com/domains)
2. Make sure your domain (`therunproject.com`) shows as **Verified**
3. If not verified:
   - Add the DNS records (SPF, DKIM) shown in Resend
   - Wait 5-10 minutes for DNS propagation
   - Click **Verify** in Resend dashboard

#### 6. Check Resend Email Logs

1. Go to [Resend Emails](https://resend.com/emails)
2. Look for recent password reset emails
3. Click on one to see details
4. Check if it was sent as `text/html` or `text/plain`
5. If it shows `text/plain`, the template isn't being used

#### 7. Try Alternative: Inline Everything

If the template still doesn't work, try this simplified version with everything inline (no CSS classes):

```html
<!DOCTYPE html>
<html>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f4f4f4;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f4f4f4; padding: 40px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" border="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden;">
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%); padding: 40px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 28px;">The Run Project</h1>
            </td>
          </tr>
          <!-- Content -->
          <tr>
            <td style="padding: 40px;">
              <h2 style="color: #1f2937; font-size: 22px; margin-top: 0;">Reset Your Password</h2>
              <p style="color: #4b5563; font-size: 16px; line-height: 1.6;">Hello,</p>
              <p style="color: #4b5563; font-size: 16px; line-height: 1.6;">We received a request to reset your password. Click the button below to create a new password:</p>
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin: 20px 0;">
                <tr>
                  <td align="center">
                    <a href="{{ .ConfirmationURL }}" style="display: inline-block; padding: 14px 32px; background: #2563eb; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px;">Reset Password</a>
                  </td>
                </tr>
              </table>
              <p style="color: #4b5563; font-size: 14px; line-height: 1.6;">Or copy and paste this link:<br><span style="color: #2563eb; word-break: break-all;">{{ .ConfirmationURL }}</span></p>
              <div style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0;">
                <p style="margin: 0; color: #92400e; font-size: 14px;"><strong>Security Notice:</strong> This link expires in 1 hour. If you didn't request this, ignore this email.</p>
              </div>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background: #f9fafb; padding: 30px; text-align: center; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0; color: #6b7280; font-size: 14px;"><strong>The Run Project</strong></p>
              <p style="margin: 5px 0; color: #6b7280; font-size: 14px;">Your personalized training companion</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
```

This table-based layout works better with older email clients.

#### 8. Last Resort: Contact Supabase Support

If none of the above works:
1. Go to [Supabase Support](https://supabase.com/dashboard/support/new)
2. Describe the issue: "Email templates not rendering as HTML"
3. Mention you've configured custom SMTP with Resend
4. They can check server-side logs to see why HTML isn't being sent

---

## PART 2: Site URL Configuration

### The Problem
When users click the password reset link in their email, they get "localhost refused to connect" or "This site can't be reached - localhost refused to connect" error.

### Why This Happens
Supabase's authentication system uses a "Site URL" setting in the dashboard that determines where password reset email links redirect to. Currently, your Supabase project's Site URL is set to `localhost`, which is why the password reset links don't work in production.

**This cannot be fixed in code - it must be changed in the Supabase dashboard.**

## THE FIX (Required Manual Step)

### Step 1: Your Production URL

Your app is deployed at: **https://therunproject.app**

### Step 2: Update Supabase Dashboard Settings

1. **Open Supabase Dashboard**
   - Go to: https://supabase.com/dashboard/project/wzluaszurokdeuxhersf/auth/url-configuration
   - Log in if prompted

2. **Update the Site URL**
   - Find the field labeled **"Site URL"**
   - It's currently set to something like:
     - `http://localhost:3000` or
     - `http://localhost:5173`
   - **CHANGE IT** to: `https://therunproject.app`
   - **Important**: No trailing slash, no wildcards here

3. **Update Redirect URLs**
   - Scroll to the **"Redirect URLs"** section
   - You should see `http://localhost:5173/**` listed (for local development - keep this)
   - Click **"Add URL"**
   - Add: `https://therunproject.app/**`
   - The `/**` at the end is important - it allows redirects to any page

4. **Save**
   - Click the **"Save"** button at the bottom
   - Wait for the confirmation message

### What It Should Look Like After:

**Site URL:**
```
https://therunproject.app
```

**Redirect URLs:**
```
http://localhost:5173/**
https://therunproject.app/**
```

## Testing the Fix

1. Go to **https://therunproject.app** (not localhost)
2. Click **"Login"**
3. Click **"Forgot password?"**
4. Enter your email address
5. Click **"Send Reset Link"**
6. Check your email inbox
7. Click the **"Reset Password"** link
8. **Expected result**: You should be taken to https://therunproject.app with the password update page (NOT localhost)
9. Enter your new password
10. Click **"Update Password"**
11. You should be redirected back to your app's home page

## Common Issues

### "Still getting localhost error"
- Make sure you requested a NEW reset email AFTER changing the Supabase settings
- Old emails still contain the old localhost URL
- Clear your browser cache and try again

### "Can't find the Site URL setting"
- Make sure you're in the correct Supabase project
- Navigate to: Authentication > URL Configuration (in the left sidebar)
- The Site URL field should be at the top

### "Save button is grayed out"
- Make sure your Site URL is a valid URL format
- It should start with `https://` (or `http://` for local)
- No spaces, no trailing slash

## Important Notes

- **The code is already set up correctly** - no further code changes are needed
- **This is purely a Supabase dashboard configuration issue**
- **The change takes effect immediately** - no need to redeploy your app
- **Keep the localhost URL** in Redirect URLs so password reset works during local development too
- **Test from production** - testing from localhost won't show if it's fixed

## Why This Can't Be Done in Code

The Supabase authentication system's Site URL is a project-level configuration that can only be changed through the Supabase dashboard web interface. It's a security feature to prevent unauthorized redirect URLs. The `redirectTo` parameter in the code is validated against this setting, so even if we pass the correct URL in code, Supabase will still use the Site URL from the dashboard settings.
