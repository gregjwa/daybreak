# Google Calendar Integration Setup

This guide walks you through setting up Google Calendar integration with Clerk OAuth.

## Overview

The Daybreak app now fetches your real Google Calendar events from the past month instead of showing mock data. This requires:
1. Setting up Google OAuth in Clerk
2. Requesting the `calendar.readonly` scope
3. Users connecting their Google account

## Step 1: Create Google OAuth Credentials

### 1. Go to Google Cloud Console

Visit [Google Cloud Console](https://console.cloud.google.com/)

### 2. Create a New Project (or select existing)

1. Click the project dropdown at the top
2. Click "New Project"
3. Name it "Daybreak" (or your app name)
4. Click "Create"

### 3. Enable Required APIs

1. In the left sidebar, go to **APIs & Services** → **Library**
2. Search for and enable the following APIs:
   - **Google Calendar API** - Click **Enable**
   - **Gmail API** - Search, click, then **Enable**

### 4. Configure OAuth Consent Screen

1. Go to **APIs & Services** → **OAuth consent screen**
2. Select **External** (unless you have a Google Workspace)
3. Click **Create**

4. Fill in the required fields:
   - **App name**: Daybreak
   - **User support email**: Your email
   - **Developer contact**: Your email
5. Click **Save and Continue**

6. **Scopes** page:
   - Click **Add or Remove Scopes**
   - Search for "Google Calendar API" and "Gmail API"
   - Select the following scopes:
     - `https://www.googleapis.com/auth/calendar.readonly` (for calendar access)
     - `https://www.googleapis.com/auth/gmail.readonly` (for email analysis)
   - Click **Update**
   - Click **Save and Continue**

7. **Test users** (for development):
   - Add your email address
   - Click **Save and Continue**

8. Review and click **Back to Dashboard**

### 5. Create OAuth Credentials

1. Go to **APIs & Services** → **Credentials**
2. Click **Create Credentials** → **OAuth client ID**
3. Select **Web application**
4. Name it "Daybreak Web Client"

5. **Authorized JavaScript origins**:
   ```
   http://localhost:5173
   https://your-production-domain.com
   ```

6. **Authorized redirect URIs**:
   ```
   https://accounts.clerk.dev/oauth/callback
   ```

   > **Note**: This is Clerk's OAuth callback URL. Clerk handles the OAuth flow.

7. Click **Create**
8. **Copy** your Client ID and Client Secret (you'll need these for Clerk)

## Step 2: Configure Clerk OAuth

### 1. Go to Clerk Dashboard

Visit [Clerk Dashboard](https://dashboard.clerk.com/)

### 2. Enable Google OAuth

1. In your application, go to **Configure** → **SSO Connections**
2. Click on **Google**
3. Toggle **Enable Google**

### 3. Add OAuth Credentials

1. Paste your **Google Client ID**
2. Paste your **Google Client Secret**
3. Click **Save**

### 4. Add Custom Scopes

In the Google OAuth settings in Clerk:

1. Find the **Scopes** section
2. Add the following scopes:
   ```
   https://www.googleapis.com/auth/calendar.readonly
   https://www.googleapis.com/auth/gmail.readonly
   ```
3. Click **Save**

> **Important**:
> - `calendar.readonly` - Allows reading calendar events
> - `gmail.readonly` - Allows reading emails for booking inquiry analysis

## Step 3: Configure User Connection

### Option A: Require Google Connection on Sign-up

In Clerk Dashboard:
1. Go to **Configure** → **SSO Connections** → **Google**
2. Enable **"Users must connect Google to sign up"**

### Option B: Allow Users to Connect Later

Users can connect their Google account after signing up:
1. Click on their user profile (UserButton)
2. Go to "Connected Accounts"
3. Click "Connect" next to Google
4. Grant calendar permissions

## Step 4: Test the Integration

### 1. Start Your Development Server

```bash
pnpm dev
```

### 2. Sign In

1. Go to http://localhost:5173
2. Click "Sign In" or "Sign Up"
3. Choose "Continue with Google"
4. Select your Google account
5. **Grant calendar.readonly permission when prompted**

### 3. View Your Calendar Events

After signing in, you should see your Google Calendar events from the past month!

## Troubleshooting

### Error: "Not Connected"

**Problem**: User hasn't connected their Google account or didn't grant calendar permissions.

**Solution**:
1. Click on user profile (top right)
2. Go to "Connected Accounts"
3. Connect Google account
4. Make sure to grant calendar permissions

### Error: "Unauthorized" or "403"

**Problem**: Missing `calendar.readonly` scope or token expired.

**Solution**:
1. Verify the scope is added in both:
   - Google Cloud Console (OAuth consent screen)
   - Clerk Dashboard (Google OAuth settings)
2. Disconnect and reconnect Google account in user profile
3. Re-authorize with calendar permissions

### Error: "Failed to fetch calendar events"

**Problem**: Google Calendar API might not be enabled or credentials are wrong.

**Solution**:
1. Verify Google Calendar API is **Enabled** in Google Cloud Console
2. Check that Client ID and Secret in Clerk match Google Cloud Console
3. Check backend logs for specific error messages

### No Events Showing

**Problem**: You might not have any events in the past month.

**Solution**:
- Add some test events to your Google Calendar
- Check the date range (backend fetches events from past 30 days)

## Production Deployment

### 1. Update OAuth Consent Screen

Before going to production:
1. Go to Google Cloud Console → **OAuth consent screen**
2. Click **Publish App**
3. Submit for verification if needed (required for > 100 users)

### 2. Add Production Redirect URIs

In Google Cloud Console → Credentials:

**Authorized JavaScript origins**:
```
https://your-production-domain.com
```

**Authorized redirect URIs**:
```
https://accounts.clerk.dev/oauth/callback
```

### 3. Update Clerk Settings

Make sure your production Clerk instance has:
- Correct Google Client ID and Secret
- `calendar.readonly` scope configured

## Security Notes

- ✅ Only `calendar.readonly` scope is requested (read-only access)
- ✅ OAuth tokens are managed securely by Clerk
- ✅ Backend validates authentication before accessing calendar
- ✅ Users can revoke access anytime from Google account settings

## API Limits

Google Calendar API has these limits:
- **Queries per day**: 1,000,000
- **Queries per 100 seconds per user**: 250

For most applications, these limits are more than sufficient.

## Resources

- [Google Calendar API Documentation](https://developers.google.com/calendar/api)
- [Clerk OAuth Documentation](https://clerk.com/docs/authentication/social-connections/google)
- [Google OAuth 2.0 Documentation](https://developers.google.com/identity/protocols/oauth2)
