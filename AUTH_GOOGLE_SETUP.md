# Daybreak Google Auth + Gmail Push (WORKED SETUP)

This is the **exact start-to-finish setup** that worked for Daybreak, including the “gotchas” encountered in a Google Workspace org.

## Your project URLs (used throughout)

- **Frontend**: `https://use.dayback.app`
- **Backend**: `https://daybreakbackend-production-a194.up.railway.app`
- **Gmail webhook endpoint**: `https://daybreakbackend-production-a194.up.railway.app/api/webhooks/gmail`
- **Clerk domain** (example from the working setup): `https://magnetic-buzzard-80.clerk.accounts.dev`

> Replace values above if you’re using different environments.

---

## What you are setting up (in plain English)

- **Google OAuth**: lets users sign in with Google and grants permissions for Gmail/Calendar.
- **Clerk**: stores the Google connection and OAuth access tokens. Your backend asks Clerk for the token using `oauth_google`.
- **Gmail Push (Pub/Sub)**: Gmail publishes “new mail” notifications to Pub/Sub, and Pub/Sub pushes them to your backend webhook.

---

## Part A — Google Cloud Console (OAuth + APIs)

### A1) Create/select the Google Cloud project

1. Go to `https://console.cloud.google.com`
2. Use the project picker (top bar) → **New Project** (or select the right one).
3. Ensure **Billing** is enabled for the project (Billing → link an account).

### A2) Enable required APIs

Google Cloud Console → **APIs & Services** → **Library** → enable:

- **Gmail API**
- **Google Calendar API**
- **Cloud Pub/Sub API**

### A3) Configure OAuth consent screen

Google Cloud Console → **APIs & Services** → **OAuth consent screen**

1. **User type**
   - If you’re on Google Workspace and only want your org users: choose **Internal**
   - Otherwise: choose **External**
2. Fill required details (App name, support email, developer contact email).
3. Add scopes:
   - `https://www.googleapis.com/auth/calendar.readonly`
   - `https://www.googleapis.com/auth/gmail.readonly`

#### Add “Test users” (where we found it)

If your app is in **Testing**:

OAuth consent screen → **Audience** → **Test users** → **Add users**

Add the emails you’ll use for sign-in (example: `greg@dayback.app`).

### A4) Create OAuth Client ID + Secret (Web application)

Google Cloud Console → **APIs & Services** → **Credentials** → **Create Credentials** → **OAuth client ID**

1. Application type: **Web application**
2. **Authorized JavaScript origins**:
   - `https://use.dayback.app`
   - (optional for local dev) `http://localhost:5173`
3. **Authorized redirect URIs**:
   - IMPORTANT: this must match the redirect URI used by Clerk **exactly**.
   - We fixed this using the redirect URI shown in the Google error details (see Part C).

After creating it, copy:

- **Client ID**
- **Client Secret**

---

## Part B — Clerk (Google connection + where to find the redirect URI)

Daybreak’s backend expects Clerk’s Google connection to be named **`oauth_google`** and fetches tokens from Clerk on the backend.

### B1) Find your Clerk “Frontend API” domain (NOT a secret)

Clerk Dashboard → **Developers** → **API keys**

Copy **Frontend API** (it looks like: `https://xxxxx.clerk.accounts.dev`).

Example (working setup):

- `https://magnetic-buzzard-80.clerk.accounts.dev`

### B2) Configure Google in Clerk

Clerk Dashboard → **Authentication** → **Social connections / SSO connections** → **Google**

1. Enable Google
2. Paste:
   - **Google Client ID**
   - **Google Client Secret**
3. Ensure scopes include:
   - `https://www.googleapis.com/auth/calendar.readonly`
   - `https://www.googleapis.com/auth/gmail.readonly`
4. Save

> Clerk UI changes over time; the redirect/callback URL isn’t always labeled “callback”. If you can’t find it in Clerk, use Part C to discover it from the Google error page.

---

## Part C — Fix “Error 400: redirect_uri_mismatch” (the exact fix that worked)

If Google sign-in shows:

- “Access blocked: This app’s request is invalid”
- `Error 400: redirect_uri_mismatch`

Do this:

1. On the Google error page, click **error details**
2. Copy the `redirect_uri` value shown.

In the working setup, the redirect URI was:

- `https://magnetic-buzzard-80.clerk.accounts.dev/v1/oauth_callback`

> IMPORTANT: This is `/v1/oauth_callback` (underscore). It must match exactly.

Now add it in Google Cloud Console:

1. **APIs & Services → Credentials**
2. Click your **OAuth 2.0 Client**
3. Under **Authorized redirect URIs** add the exact `redirect_uri` you copied
4. Save
5. Try Google sign-in again

---

## Part D — Gmail Push (Pub/Sub → webhook)

### D1) Create Pub/Sub topic

Google Cloud Console → **Pub/Sub** → **Topics** → **Create topic**

- Topic ID: `gmail-notifications`

Copy the full topic path, which looks like:

- `projects/YOUR_PROJECT_ID/topics/gmail-notifications`

### D2) IMPORTANT GOTCHA: Domain-restricted sharing blocked Gmail publishing

When we tried to grant Gmail permission to publish to the topic, saving failed with:

> Domain-restricted sharing org policy (constraints/iam.allowedPolicyMemberDomains) is enforced…

**Fix that worked**: disable the restriction **for this project only** by reverting to the Google-managed default at the project level.

1. In Google Cloud Console **top bar**, switch the resource to your **PROJECT** (not Organization).
2. Go to **IAM & Admin → Organization policies**
3. Find **Domain restricted sharing** (`constraints/iam.allowedPolicyMemberDomains`)
4. Edit policy:
   - **Policy source**: select **Google-managed default**
   - Save (“Set policy”)
5. Wait 1–5 minutes for it to apply.

### D3) Grant Gmail permission to publish to the topic

Pub/Sub → Topics → `gmail-notifications` → **Permissions** → **Grant access**

- Principal: `gmail-api-push@system.gserviceaccount.com`
- Role: **Pub/Sub Publisher**
  - If you don’t see it immediately, type **Publisher** into the role search box.

### D4) Create Push subscription (Pub/Sub calls your webhook)

Pub/Sub → **Subscriptions** → **Create subscription**

- Subscription ID: `gmail-notifications-push`
- Topic: `gmail-notifications`
- Delivery type: **Push**
- Endpoint URL:
  - `https://daybreakbackend-production-a194.up.railway.app/api/webhooks/gmail`

Create the subscription.

---

## Part E — Railway environment variables (what Daybreak needs)

### E1) Frontend (`https://use.dayback.app`)

Set:

- `VITE_CLERK_PUBLISHABLE_KEY` = your Clerk publishable key

### E2) Backend (`https://daybreakbackend-production-a194.up.railway.app`)

Set:

- `CLERK_SECRET_KEY` = your Clerk secret key
- `GMAIL_PUBSUB_TOPIC` = `projects/YOUR_PROJECT_ID/topics/gmail-notifications`

Notes:

- The backend uses `CLERK_SECRET_KEY` to fetch Google OAuth tokens from Clerk and to process emails after webhook notifications.
- The backend’s Gmail watch setup will return an error if `GMAIL_PUBSUB_TOPIC` is missing.

---

## Part F — Turn on Gmail watch + test end-to-end

### F1) Sign in with Google (via Clerk)

1. Go to your app (frontend).
2. Sign up / sign in with Google.
3. Approve requested permissions.

### F2) Enable Gmail watch

Once signed in, call the backend endpoint:

- `POST /api/emails/watch`

This sets up Gmail watch to publish to your Pub/Sub topic.

### F3) Test delivery

1. Send a test email to the connected Gmail inbox.
2. Check backend logs on Railway.
3. You should see the webhook receiving Pub/Sub notifications and processing.

---

## Troubleshooting

### “redirect_uri_mismatch”

Use the exact redirect URI from Google “error details” and add it to the OAuth client’s Authorized redirect URIs.

### Can’t add `gmail-api-push@system.gserviceaccount.com` as a principal

Your org/project is enforcing Domain restricted sharing. Apply the project-level fix in **Part D2**.

### Role picker doesn’t show “Pub/Sub Publisher”

In the role dropdown, use the search box and type **Publisher**.

### Backend logs show webhook received but no processing happens

Check backend env vars:

- `CLERK_SECRET_KEY` is set
- `GMAIL_PUBSUB_TOPIC` is set

---

## Reference endpoints in this repo

- **Webhook**: `POST /api/webhooks/gmail`
- **Watch setup**: `POST /api/emails/watch`
- **Manual process**: `GET /api/emails/process-new`



