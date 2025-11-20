# Railway Deployment Guide

This guide walks you through deploying the Daybreak backend to Railway with PostgreSQL database.

## Prerequisites

- Railway account ([sign up here](https://railway.app/))
- GitHub repository connected to Railway
- Clerk account with API keys

## Step 1: Install Dependencies Locally

First, install the new dependencies on your local machine:

```bash
cd /Users/gregwallace/Documents/daybreak
pnpm install
```

This installs:
- `@prisma/client` - Prisma database client
- `prisma` - Prisma CLI (dev dependency)
- `nanoid` - For generating invite codes

## Step 2: Set Up Railway Project

1. Go to [Railway Dashboard](https://railway.app/dashboard)
2. Click **"New Project"**
3. Select **"Deploy from GitHub repo"**
4. Choose your `daybreak` repository
5. Railway will detect your monorepo structure

## Step 3: Add PostgreSQL Database

1. In your Railway project, click **"+ New"**
2. Select **"Database"** → **"PostgreSQL"**
3. Railway will provision a new PostgreSQL database
4. Copy the **DATABASE_URL** from the database service

## Step 4: Configure Backend Environment Variables

In your Railway backend service, add these environment variables:

### Required Variables

```env
# Clerk Authentication
CLERK_SECRET_KEY=sk_live_...
CLERK_PUBLISHABLE_KEY=pk_live_...

# Database (Railway auto-generates this, but verify it's set)
DATABASE_URL=postgresql://postgres:...@...railway.app:5432/railway

# Gmail Webhooks
GMAIL_PUBSUB_TOPIC=projects/daybreak-478723/topics/gmail-notifications

# Frontend URL (for invite links)
FRONTEND_URL=https://your-frontend-domain.vercel.app

# Node Environment
NODE_ENV=production
```

### How to Add Environment Variables in Railway

1. Click on your **backend service**
2. Go to **"Variables"** tab
3. Click **"+ New Variable"**
4. Add each variable above

## Step 5: Update Build Configuration

Railway should auto-detect your build settings, but verify:

1. **Root Directory**: `apps/backend`
2. **Build Command**: `pnpm db:generate && pnpm build`
3. **Start Command**: `node dist/index.js`

### To set these manually:

1. Go to **Settings** in your backend service
2. Under **"Build"**:
   - **Root Directory**: `apps/backend`
   - **Build Command**: `pnpm db:generate && pnpm build`
3. Under **"Deploy"**:
   - **Start Command**: `node dist/index.js`

## Step 6: Push Database Schema

You need to push the Prisma schema to your Railway database.

### Option A: From Local Machine (Recommended)

1. Create a file `apps/backend/.env` with your Railway DATABASE_URL:

```env
DATABASE_URL=postgresql://postgres:...@...railway.app:5432/railway
```

2. Run Prisma commands:

```bash
cd apps/backend
pnpm db:push
```

This creates all tables in your Railway database.

### Option B: Using Railway CLI

```bash
# Install Railway CLI
npm i -g @railway/cli

# Login to Railway
railway login

# Link to your project
railway link

# Push schema
cd apps/backend
railway run pnpm db:push
```

## Step 7: Deploy Backend

1. **Commit and push your changes** to GitHub:

```bash
git add .
git commit -m "Add Prisma database integration"
git push origin master
```

2. Railway will **automatically deploy** when you push to GitHub

3. Monitor deployment in Railway dashboard

## Step 8: Verify Deployment

Once deployed, test the endpoints:

### Health Check

```bash
curl https://your-backend.railway.app/health
```

Expected response:
```json
{
  "status": "ok",
  "timestamp": "2025-11-20T..."
}
```

### Test Gmail Watch (requires authentication)

Use your frontend to log in with `bookings.flow@gmail.com` and it will automatically call the watch endpoint.

Check Railway logs to confirm:
- Database connection successful
- Gmail watch stored in database
- No errors

## Step 9: Update Frontend API URL

Update your frontend environment variables to point to Railway:

**In Vercel (or your frontend host):**

```env
VITE_API_URL=https://your-backend.railway.app
```

**Or in `apps/frontend/.env.local` for local development:**

```env
VITE_API_URL=https://your-backend.railway.app
```

## Database Management

### View Database

You can view your database using Prisma Studio:

```bash
cd apps/backend
pnpm db:studio
```

This opens a GUI at `http://localhost:5555` to browse your data.

### Run Migrations

When you change the schema:

```bash
cd apps/backend
pnpm db:push  # For quick prototyping
# OR
pnpm db:migrate  # For production migrations with history
```

## Testing the System

### 1. Create a Business User

Sign up via your frontend with a new email. The user will be created with `accountType: BUSINESS` when they set up Gmail watch.

### 2. Create an Invite

```bash
curl -X POST https://your-backend.railway.app/api/invites/create \
  -H "Authorization: Bearer YOUR_CLERK_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "inviteType": "PERSON",
    "email": "engineer@example.com",
    "expiresInDays": 7
  }'
```

Response:
```json
{
  "success": true,
  "invite": {
    "code": "abc123xyz789",
    "inviteType": "PERSON",
    "email": "engineer@example.com",
    "expiresAt": "2025-11-27T...",
    "inviteUrl": "https://your-frontend.vercel.app/invite/abc123xyz789"
  }
}
```

### 3. Validate Invite

```bash
curl https://your-backend.railway.app/api/invites/validate/abc123xyz789
```

### 4. Accept Invite

The invited person signs up on your frontend, then calls:

```bash
curl -X POST https://your-backend.railway.app/api/invites/accept \
  -H "Authorization: Bearer THEIR_CLERK_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "inviteCode": "abc123xyz789",
    "name": "John Engineer",
    "roles": ["ENGINEER", "ASSISTANT"]
  }'
```

### 5. Check Gmail Integration

1. Send a test email to `bookings.flow@gmail.com` with booking keywords
2. Check Railway logs for webhook notification
3. Check database for new `Enquiry` record

```bash
# Using Prisma Studio
cd apps/backend
pnpm db:studio
# Navigate to Enquiry table
```

## Troubleshooting

### "Cannot connect to database"

- Verify `DATABASE_URL` is set in Railway environment variables
- Check if PostgreSQL service is running in Railway
- Ensure Railway services are in the same project (they auto-connect)

### "Prisma Client not generated"

Add `prisma generate` to your build command:

```bash
pnpm db:generate && pnpm build
```

### "Gmail webhook not saving enquiries"

- Check if user exists in `User` table with correct `clerkId`
- Check if `GmailWatch` record exists for the Gmail address
- Check if user has a `Business` record (only Business accounts receive enquiries)
- Check Railway logs for error messages

### Database schema out of sync

If you change the schema:

```bash
cd apps/backend
pnpm db:push  # Push changes to Railway
```

Then redeploy in Railway to regenerate Prisma Client.

## Monitoring

### Railway Logs

View real-time logs in Railway dashboard:
1. Click on your backend service
2. Go to **"Logs"** tab
3. Filter by log level if needed

### Database Queries

In Prisma Client initialization (`lib/prisma.ts`), we log queries in development:

```typescript
log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"]
```

Set `NODE_ENV=development` temporarily in Railway to see all queries.

## Security Notes

1. **Never commit `.env` files** - they're in `.gitignore`
2. **Rotate Clerk keys** if exposed
3. **Use HTTPS only** - Railway provides this automatically
4. **Validate invite codes** - implemented in `/api/invites/validate`
5. **Check user permissions** - only Business accounts can create invites

## Next Steps

- [ ] Set up automatic watch renewal (cron job or Railway scheduler)
- [ ] Add endpoint to fetch user's enquiries: `GET /api/enquiries`
- [ ] Add endpoint to update enquiry status: `PATCH /api/enquiries/:id`
- [ ] Add endpoint to fetch user's team members: `GET /api/team`
- [ ] Implement frontend invite flow
- [ ] Add email notifications when booking inquiries arrive

## Resources

- [Railway Documentation](https://docs.railway.app/)
- [Prisma Documentation](https://www.prisma.io/docs)
- [Clerk Documentation](https://clerk.com/docs)
- [Gmail Push Notifications](https://developers.google.com/gmail/api/guides/push)


