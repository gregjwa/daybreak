# Gmail Webhooks Setup Guide

This guide shows you how to set up real-time Gmail push notifications using Google Cloud Pub/Sub.

## Overview

When a new email arrives in the user's inbox, Google will send a webhook notification to your backend, allowing you to:
- Analyze emails immediately
- Detect booking inquiries in real-time
- Trigger automated workflows

## Prerequisites

- Google Cloud Project (the same one used for Calendar/Gmail API)
- Backend deployed and accessible via HTTPS (webhooks require HTTPS)
- For local development: Use ngrok or similar tunneling service

## Step 1: Enable Pub/Sub API

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Select your project (Daybreak)
3. Go to **APIs & Services** → **Library**
4. Search for **"Cloud Pub/Sub API"**
5. Click **Enable**

## Step 2: Create a Pub/Sub Topic

1. In Google Cloud Console, go to **Pub/Sub** → **Topics**
2. Click **Create Topic**
3. **Topic ID**: `gmail-notifications`
4. Leave other settings as default
5. Click **Create**
6. Copy the full topic name (e.g., `projects/daybreak-123456/topics/gmail-notifications`)

## Step 3: Grant Gmail Permission to Publish

Gmail needs permission to publish to your Pub/Sub topic:

1. In the **Pub/Sub Topics** page, click on your topic (`gmail-notifications`)
2. Click **Permissions** tab
3. Click **Add Principal**
4. **New principals**: `gmail-api-push@system.gserviceaccount.com`
5. **Role**: Select **Pub/Sub Publisher**
6. Click **Save**

## Step 4: Create a Push Subscription

1. In **Pub/Sub** → **Subscriptions**
2. Click **Create Subscription**
3. **Subscription ID**: `gmail-notifications-push`
4. **Select a Cloud Pub/Sub topic**: Choose `gmail-notifications`
5. **Delivery type**: Select **Push**
6. **Endpoint URL**: Your backend webhook URL
   - Production: `https://your-api-domain.com/api/webhooks/gmail`
   - Development: `https://your-ngrok-url.ngrok.io/api/webhooks/gmail`
7. Click **Create**

## Step 5: Set Up ngrok (For Local Development)

If testing locally, you need a public URL:

```bash
# Install ngrok
brew install ngrok  # or download from ngrok.com

# Run ngrok pointing to your backend port
ngrok http 3000

# Copy the HTTPS URL (e.g., https://abc123.ngrok.io)
# Use this as your webhook endpoint
```

**Update your Pub/Sub subscription** with the ngrok URL:
```
https://abc123.ngrok.io/api/webhooks/gmail
```

## Step 6: Add Environment Variable

Add to `apps/backend/.env`:

```env
GMAIL_PUBSUB_TOPIC=projects/YOUR_PROJECT_ID/topics/gmail-notifications
```

Replace `YOUR_PROJECT_ID` with your actual Google Cloud project ID.

## Step 7: Enable Gmail Watch

Once your backend is running and accessible, enable the watch:

### Via API (Recommended)

```bash
# Call your backend endpoint (user must be authenticated)
curl -X POST https://your-api-domain.com/api/emails/watch \
  -H "Authorization: Bearer YOUR_AUTH_TOKEN"
```

### Response

```json
{
  "success": true,
  "historyId": "1234567",
  "expiration": "1700000000000",
  "message": "Gmail watch set up successfully. Expires in 7 days."
}
```

## How It Works

```
New Email Arrives
       ↓
Gmail detects change
       ↓
Publishes to Pub/Sub topic
       ↓
Pub/Sub pushes to your webhook
       ↓
POST /api/webhooks/gmail
       ↓
Your backend processes notification
       ↓
Fetch new email via Gmail API
       ↓
Analyze for booking inquiries
       ↓
Store/Alert as needed
```

## Important Notes

### Current Implementation Status

**What's Working:**
- ✅ Webhook endpoint receives Pub/Sub notifications
- ✅ Email analysis with keyword detection
- ✅ Manual processing via `/api/emails/process-new` endpoint
- ✅ Watch setup and renewal endpoints

**What Needs Implementation (Database Required):**
- ⏳ Storing user email → Clerk user ID mapping
- ⏳ Storing last processed historyId per user
- ⏳ Automatic email processing when webhook arrives
- ⏳ Notification/alerting for booking inquiries

The webhook currently logs notifications but doesn't automatically process emails. To enable automatic processing, you need to:
1. Add a database (e.g., PostgreSQL, MongoDB)
2. Store user mappings when watch is set up
3. Retrieve user credentials when webhook arrives
4. Process emails and store/alert results

### Watch Expiration
- Gmail watches **expire after 7 days**
- You need to renew them before expiration
- Set up a cron job to call `/api/emails/watch` every 6 days

### Webhook Security
- Webhooks should verify requests are from Google
- Check the `Authorization` header contains a valid token
- Validate the Pub/Sub message format

### Rate Limits
- Pub/Sub delivers at-least-once (may receive duplicates)
- Implement idempotency in your webhook handler
- Use the `historyId` to track which changes you've processed

## Testing

### 1. Set up the watch

Call your `/api/emails/watch` endpoint (while authenticated):

```bash
curl -X POST http://localhost:3000/api/emails/watch \
  -H "Authorization: Bearer YOUR_AUTH_TOKEN"
```

Save the `historyId` from the response for testing.

### 2. Send a test email

Send an email to your Gmail account with keywords like:
- "Hey, I'm interested in booking a wedding session"
- "Do you have availability for a studio recording?"
- "Quote for an event photography"

### 3. Check backend logs for webhook

You should see:
```
Gmail webhook received: { message: { data: "...", messageId: "..." } }
Gmail notification: { emailAddress: "user@gmail.com", historyId: "123456" }
New email notification for user@gmail.com, historyId: 123456
```

### 4. Test email processing manually

Use the `/api/emails/process-new` endpoint to manually process emails since a history ID:

```bash
curl "http://localhost:3000/api/emails/process-new?historyId=YOUR_HISTORY_ID" \
  -H "Authorization: Bearer YOUR_AUTH_TOKEN"
```

Response:
```json
{
  "newMessagesCount": 3,
  "bookingInquiriesFound": 1,
  "inquiries": [
    {
      "id": "abc123",
      "from": "client@example.com",
      "subject": "Wedding photography inquiry",
      "date": "Mon, 1 Jan 2024 10:00:00 +0000",
      "snippet": "Hi, I'm interested in booking...",
      "body": "Full email body...",
      "analysis": {
        "confidence": "high",
        "matchedKeywords": ["wedding", "booking", "interested"]
      }
    }
  ]
}
```

### 5. Verify in Pub/Sub

Go to **Pub/Sub** → **Subscriptions** → Click your subscription → **View Metrics**

You should see message delivery attempts.

## Troubleshooting

### "Permission denied" error
- Verify `gmail-api-push@system.gserviceaccount.com` has Pub/Sub Publisher role
- Check topic name is correct

### "Invalid topic name" error
- Topic name format: `projects/PROJECT_ID/topics/TOPIC_NAME`
- Make sure topic exists in your project

### Webhook not receiving notifications
- Verify endpoint URL is HTTPS
- Check endpoint returns 200 status
- For ngrok: Make sure tunnel is running
- Check Pub/Sub subscription delivery status

### Watch expired
- Watches last 7 days maximum
- Set up auto-renewal before expiration
- Call `/api/emails/watch` again to renew

## Production Deployment

### Renew Watch Automatically

Create a cron job that runs every 6 days:

```typescript
// Example: Daily check and renew if needed
setInterval(async () => {
  // Check if watch is expiring soon
  // Call /api/emails/watch to renew
}, 24 * 60 * 60 * 1000) // Daily
```

### Monitor Webhook Health

- Set up logging/monitoring for webhook endpoint
- Alert if webhook stops receiving notifications
- Track processing success/failure rates

### Scale Considerations

- Pub/Sub handles high throughput automatically
- Your webhook should process quickly (< 10s)
- For heavy processing, queue jobs for async processing

## Security Best Practices

1. **Verify webhook requests** - Check they're from Google
2. **Use HTTPS** - Required for Pub/Sub push
3. **Implement idempotency** - Handle duplicate notifications
4. **Rate limit** - Prevent abuse of webhook endpoint
5. **Monitor** - Track webhook activity and anomalies

## Next Steps

- [ ] Set up Pub/Sub topic and subscription
- [ ] Deploy backend to HTTPS endpoint (or use ngrok)
- [ ] Call `/api/emails/watch` to start receiving notifications
- [ ] Implement email processing logic in webhook handler
- [ ] Set up auto-renewal for watches
- [ ] Add monitoring and alerts

## Resources

- [Gmail Push Notifications Guide](https://developers.google.com/gmail/api/guides/push)
- [Cloud Pub/Sub Documentation](https://cloud.google.com/pubsub/docs)
- [Gmail API Watch Reference](https://developers.google.com/gmail/api/reference/rest/v1/users/watch)
