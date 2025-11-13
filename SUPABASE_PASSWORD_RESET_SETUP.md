# CRITICAL: Supabase Password Reset Configuration Required

## The Problem
When users click the password reset link in their email, they get "localhost refused to connect" or "This site can't be reached - localhost refused to connect" error.

## Why This Happens
Supabase's authentication system uses a "Site URL" setting in the dashboard that determines where password reset email links redirect to. Currently, your Supabase project's Site URL is set to `localhost`, which is why the password reset links don't work in production.

**This cannot be fixed in code - it must be changed in the Supabase dashboard.**

## THE FIX (Required Manual Step)

### Step 1: Find Your Production URL

First, you need to know where your app is deployed. Check:
- **Netlify**: Look for a URL like `https://[your-app-name].netlify.app`
- **Vercel**: Look for a URL like `https://[your-app-name].vercel.app`
- **Custom Domain**: If you set up a custom domain, use that

### Step 2: Update Supabase Dashboard Settings

1. **Open Supabase Dashboard**
   - Go to: https://supabase.com/dashboard/project/wzluaszurokdeuxhersf/auth/url-configuration
   - Log in if prompted

2. **Update the Site URL**
   - Find the field labeled **"Site URL"**
   - It's currently set to something like:
     - `http://localhost:3000` or
     - `http://localhost:5173`
   - **CHANGE IT** to your production URL
   - Example: `https://your-app-name.netlify.app`
   - **Important**: No trailing slash, no wildcards here

3. **Update Redirect URLs**
   - Scroll to the **"Redirect URLs"** section
   - You should see `http://localhost:5173/**` listed (for local development - keep this)
   - Click **"Add URL"**
   - Add your production URL with wildcard: `https://your-app-name.netlify.app/**`
   - The `/**` at the end is important - it allows redirects to any page

4. **Save**
   - Click the **"Save"** button at the bottom
   - Wait for the confirmation message

### What It Should Look Like After:

**Site URL:**
```
https://your-app-name.netlify.app
```

**Redirect URLs:**
```
http://localhost:5173/**
https://your-app-name.netlify.app/**
```

## Testing the Fix

1. Go to your **production website** (not localhost)
2. Click **"Login"** or the login button
3. Click **"Forgot password?"**
4. Enter your email address
5. Click **"Send Reset Link"**
6. Check your email inbox
7. Click the **"Reset Password"** link
8. **Expected result**: You should be taken to your production site's password update page (NOT localhost)
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
