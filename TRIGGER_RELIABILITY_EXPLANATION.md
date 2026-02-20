# Why Triggers Keep Breaking - Root Cause Analysis

## The Problem

You have **18 migrations** attempting to fix welcome emails and Discord notifications:

```
20260116114310_add_feedback_discord_notification.sql
20260116115655_fix_discord_notification_trigger.sql
20260116115924_make_discord_trigger_non_blocking.sql
20260116123737_fix_discord_notification_url.sql
20260119072106_add_welcome_email_trigger.sql
20260126161823_add_new_user_discord_notification.sql
20260128112341_fix_new_user_trigger_error_handling.sql
20260128112941_fix_user_creation_triggers.sql
20260128113058_improve_discord_notification_reliability.sql
20260128113124_improve_welcome_email_reliability.sql
20260129123339_fix_trigger_function_urls.sql
20260129124032_fix_edge_function_urls_properly.sql ✅ FINAL FIX
```

## Root Cause

**Database triggers don't have access to HTTP request context**, so all attempts to dynamically get the Supabase URL failed:

### Failed Attempt 1: App Settings (Migrations before 20260128)
```sql
v_supabase_url := current_setting('app.settings.supabase_url', true);
```
**Result**: Returns `NULL` - these settings were never configured

### Failed Attempt 2: Request Headers (Migration 20260128113124)
```sql
v_supabase_url := 'https://' || current_setting('request.headers', true)::json->>'host';
```
**Result**: Throws error - no request context exists in database triggers

### Failed Attempt 3: JWT Claims ISS (Migration 20260129123339)
```sql
function_url := current_setting('request.jwt.claims', true)::json->>'iss' || '/functions/v1/...';
```
**Result**: Returns `"supabase/functions/v1/..."` instead of `"https://wzluaszurokdeuxhersf.supabase.co/functions/v1/..."`

## Why They "Disappeared"

The triggers **never actually worked** - they failed silently because of this error handling:

```sql
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Failed to send notification: %', SQLERRM;
    RETURN NEW;  -- Don't block the insert
END;
```

This means:
- ✅ User creation succeeded
- ✅ Training plan creation succeeded
- ❌ Email never sent (silent failure)
- ❌ Discord notification never sent (silent failure)
- ⚠️ Only a WARNING was logged (not visible in app)

## The Permanent Fix (Migration 20260129124032)

**Hardcode the Supabase project URL directly in the trigger functions:**

```sql
CREATE OR REPLACE FUNCTION send_welcome_email_on_first_plan()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_function_url text;
BEGIN
  -- HARDCODED URL - This is the ONLY reliable method
  v_function_url := 'https://wzluaszurokdeuxhersf.supabase.co/functions/v1/send-welcome-email';

  PERFORM net.http_post(
    url := v_function_url,
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := jsonb_build_object('email', v_user_email),
    timeout_milliseconds := 5000
  );

  RETURN NEW;
END;
$$;
```

## Current Status

✅ **Both triggers NOW have hardcoded URLs and should work correctly**

To verify they're working:
1. Create a new test user: `rob1wilson+test3@hotmail.com`
2. Check for:
   - In-app notification in notification center
   - Email in inbox
   - Discord webhook message

## Why Hardcoding is OK

- Supabase projects have stable URLs that don't change
- If you migrate to a different Supabase project, you'd need to update many things anyway
- Trigger functions can be updated without downtime
- This is more reliable than trying to dynamically resolve URLs

## Prevention

To prevent this in the future:

1. **Test edge function calls from trigger context** before deploying
2. **Check database logs** for warnings after deployment
3. **Set up monitoring** on edge function invocations
4. **Don't rely on request context** in database triggers
5. **Accept that project-specific config needs to be hardcoded** in some places

## The Navigation Issue

This was a separate bug where I accidentally removed the navigation code when trying to "fix" the stuck button. The button was never actually stuck - the issue was the toast notification wasn't showing. I've now restored both:
- Toast notification: "Your full training plan is being generated!"
- Navigation: Redirects to "My Plans" page
- Button shows "Generating..." only during the API call
