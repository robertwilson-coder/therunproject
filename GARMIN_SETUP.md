# Garmin Connect Integration Setup

This application integrates with Garmin Connect to sync workouts directly to users' Garmin devices.

## Quick Links

- **Apply for Access**: https://www.garmin.com/en-US/forms/GarminConnectDeveloperAccess/
- **Developer Portal Login**: https://developerportal.garmin.com/
- **API Documentation**: https://developer.garmin.com/gc-developer-program/overview/
- **Support Email**: connect-support@developer.garmin.com

## Prerequisites

You need to register your application with the Garmin Connect Developer Program to get API credentials.

## Registration Steps

### Step 1: Apply for Developer Program Access

1. Visit the application form: https://www.garmin.com/en-US/forms/GarminConnectDeveloperAccess/
2. Fill out the required information:
   - Company/Organization name
   - Your role and contact information
   - Brief description of your integration
   - Expected number of users
3. Submit the application
4. Wait for approval (typically 1-2 business days)
5. You'll receive an email with access to the Garmin Developer Portal

### Step 2: Access the Developer Portal

1. Once approved, log in to: https://developerportal.garmin.com/
2. Use the credentials from your approval email
3. You'll be directed to your developer dashboard

### Step 3: Create Your Application

1. In the Developer Portal, navigate to **"My Applications"** or **"Applications"**
2. Click **"Create Application"** or **"New Application"**
3. Fill in your application details:
   - **Application Name**: Your app name (e.g., "TheRunProject")
   - **Application Type**: Select "Web Application" or "Server-side Application"
   - **Description**: Brief description of your training plan app
4. Select which APIs you need access to:
   - ✅ **Training API** (required - for pushing workouts)
   - ✅ **Activity API** (required - for importing completed runs)
   - ⬜ **Health API** (optional - for heart rate, sleep data)
5. Save your application

### Step 4: Configure OAuth and Get Credentials

1. In your application settings, find the **"OAuth Configuration"** section
2. Add your **Redirect URI**:
   ```
   https://<your-supabase-project-id>.supabase.co/functions/v1/garmin-oauth-callback
   ```
   Replace `<your-supabase-project-id>` with your actual Supabase project ID
3. Save the OAuth configuration
4. On your application's main page, you should now see:
   - **Consumer Key** (also called Client ID) - Copy this
   - **Consumer Secret** (also called Client Secret) - Copy this

   ⚠️ **IMPORTANT**: Keep these credentials secure! Never commit them to your repository.

### Step 5: Where to Find Your API Credentials Later

If you need to find your credentials again:
1. Log in to https://developerportal.garmin.com/
2. Go to **"My Applications"**
3. Click on your application name
4. Your **Consumer Key** and **Consumer Secret** will be displayed on the application details page

## Environment Variables Setup

### Setting Up Supabase Secrets

You need to add your Garmin credentials as secrets in Supabase:

1. Go to your Supabase project dashboard
2. Navigate to **Project Settings** → **Edge Functions** → **Secrets**
3. Add the following secrets:
   - **Name**: `GARMIN_CLIENT_ID` → **Value**: Your Consumer Key
   - **Name**: `GARMIN_CLIENT_SECRET` → **Value**: Your Consumer Secret
4. Click **Save** for each secret

Alternatively, you can use the Supabase CLI:
```bash
supabase secrets set GARMIN_CLIENT_ID=your_consumer_key_here
supabase secrets set GARMIN_CLIENT_SECRET=your_consumer_secret_here
```

### Setting Up Frontend Environment Variables

Add to your `.env` file in the project root:

```bash
VITE_GARMIN_CLIENT_ID=your_consumer_key_here
```

⚠️ **Note**: The frontend only needs the Client ID (not the secret). Never expose the Client Secret in frontend code!

## Features

### Push Workouts to Garmin
- Workouts from training plans are pushed to Garmin Connect calendar
- Workouts automatically sync to compatible Garmin devices
- Structured workouts include pace zones, intervals, and duration targets

### Import Activities
- Completed activities are pulled from Garmin Connect
- Activities are automatically matched to planned workouts
- Distance, duration, and heart rate data are imported

### Device Compatibility
- Works with all Garmin devices that support structured workouts
- Includes: Forerunner, Fenix, Vivoactive, and more
- Requires Garmin Connect Mobile app or Garmin Express for sync

## API Documentation

For more information about the Garmin Connect APIs:
- Training API: https://developer.garmin.com/gc-developer-program/training-api/
- Activity API: https://developer.garmin.com/gc-developer-program/activity-api/
- OAuth Documentation: https://developer.garmin.com/gc-developer-program/overview/

## Support

If you encounter issues:
- Check that your Garmin account is properly connected
- Ensure your device is synced with Garmin Connect
- Verify that structured workouts are supported on your device
- Contact Garmin Developer Support: connect-support@developer.garmin.com
