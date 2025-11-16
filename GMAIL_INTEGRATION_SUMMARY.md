# Gmail Integration Summary

## Overview

The Daybreak backend now includes a complete Gmail integration system for analyzing emails and detecting booking inquiries in real-time.

## Available Endpoints

### 1. **GET /api/emails/analyze**
Analyzes recent emails (last 7 days) for booking inquiries using keyword detection.

**Usage:**
```bash
GET /api/emails/analyze
Authorization: Bearer <clerk-token>
```

**Response:**
```json
{
  "total": 20,
  "analyzed": 3,
  "emails": [
    {
      "id": "msg_123",
      "from": "client@example.com",
      "subject": "Wedding photography inquiry",
      "date": "Mon, 1 Jan 2024",
      "snippet": "Hi, I'm interested in...",
      "body": "Full email text...",
      "analysis": {
        "confidence": "high",
        "matchedKeywords": ["wedding", "booking", "interested"]
      }
    }
  ]
}
```

### 2. **POST /api/emails/watch**
Sets up Gmail push notifications for the authenticated user's inbox.

**Usage:**
```bash
POST /api/emails/watch
Authorization: Bearer <clerk-token>
```

**Response:**
```json
{
  "success": true,
  "historyId": "1234567",
  "expiration": "1700000000000",
  "gmailAddress": "user@gmail.com",
  "message": "Gmail watch set up successfully. Expires in 7 days."
}
```

**Notes:**
- Watch expires after 7 days and needs renewal
- Requires `GMAIL_PUBSUB_TOPIC` environment variable
- Stores user email mapping (currently logs only, needs database)

### 3. **POST /api/emails/stop-watch**
Stops Gmail push notifications for the authenticated user.

**Usage:**
```bash
POST /api/emails/stop-watch
Authorization: Bearer <clerk-token>
```

### 4. **GET /api/emails/process-new**
Manually processes new emails since a given history ID.

**Usage:**
```bash
GET /api/emails/process-new?historyId=1234567
Authorization: Bearer <clerk-token>
```

**Response:**
```json
{
  "newMessagesCount": 5,
  "bookingInquiriesFound": 2,
  "inquiries": [
    {
      "id": "msg_456",
      "from": "client@example.com",
      "subject": "Studio session availability",
      "analysis": {
        "confidence": "medium",
        "matchedKeywords": ["studio", "session"]
      }
    }
  ]
}
```

**Notes:**
- Uses Gmail History API to fetch only new messages
- More efficient than analyzing all emails
- Demonstrates how webhook processing would work

### 5. **POST /api/webhooks/gmail**
Receives Gmail push notifications from Google Cloud Pub/Sub.

**Called by:** Google Cloud Pub/Sub (not user-facing)

**Current Behavior:**
- Receives and decodes Pub/Sub notifications
- Logs email address and history ID
- Returns 200 to acknowledge receipt

**Future Behavior (needs database):**
- Look up user by email address
- Retrieve user's OAuth token
- Fetch new emails using history ID
- Analyze for booking inquiries
- Store results and send notifications

## Email Analysis System

### Keywords Detected
The system looks for these keywords in email subject and body:
- wedding
- studio
- recording
- session
- book / booking
- schedule
- event
- inquiry
- interested
- availability
- quote / price / pricing

### Confidence Levels
- **High**: 3+ keywords matched
- **Medium**: 1-2 keywords matched
- **Low**: 0 keywords matched

### Helper Functions

#### `analyzeEmailForBooking(subject, body)`
Analyzes email content for booking inquiry indicators.

Returns:
```typescript
{
  isBookingInquiry: boolean
  matchedKeywords: string[]
  confidence: 'high' | 'medium' | 'low'
}
```

#### `extractEmailBody(payload)`
Extracts plain text body from Gmail message payload.

Handles both:
- Multipart messages (extracts text/plain part)
- Simple messages (single body)

#### `fetchGmailHistory(gmail, startHistoryId)`
Fetches new messages since a given history ID using Gmail History API.

Returns:
```typescript
Array<{ id: string, threadId: string }>
```

## Architecture Flow

### Manual Analysis Flow
```
User → GET /api/emails/analyze
  ↓
Backend fetches last 7 days of emails
  ↓
Extract subject, from, date, body
  ↓
Analyze each email with keyword detection
  ↓
Return booking inquiries
```

### Webhook Flow (Current)
```
New Email → Gmail detects change
  ↓
Publishes to Pub/Sub topic
  ↓
Pub/Sub pushes to /api/webhooks/gmail
  ↓
Backend logs notification
  ↓
Returns 200 OK
```

### Webhook Flow (Future with Database)
```
New Email → Gmail detects change
  ↓
Publishes to Pub/Sub topic
  ↓
Pub/Sub pushes to /api/webhooks/gmail
  ↓
Backend looks up user by email
  ↓
Retrieves user's OAuth token
  ↓
Fetches new emails via History API
  ↓
Analyzes for booking inquiries
  ↓
Stores results in database
  ↓
Sends notification/alert to user
  ↓
Returns 200 OK
```

## Current Limitations

### No Database
The system currently doesn't have a database, which means:
- ❌ Can't store user email → Clerk ID mappings
- ❌ Can't track last processed history ID per user
- ❌ Can't automatically process webhook notifications
- ❌ Can't store booking inquiry results

### Manual Processing Required
- Users must call `/api/emails/process-new` manually
- Or use `/api/emails/analyze` for recent emails
- Webhooks only log notifications

## Next Steps

### 1. Add Database
Choose a database solution:
- **PostgreSQL** (recommended for relational data)
- **MongoDB** (for flexibility)
- **Supabase** (PostgreSQL with built-in auth)

### 2. Create Schema

**Users Table:**
```sql
CREATE TABLE gmail_watches (
  id SERIAL PRIMARY KEY,
  clerk_user_id VARCHAR(255) NOT NULL UNIQUE,
  gmail_address VARCHAR(255) NOT NULL,
  last_history_id VARCHAR(255) NOT NULL,
  expires_at BIGINT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

**Booking Inquiries Table:**
```sql
CREATE TABLE booking_inquiries (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL,
  email_id VARCHAR(255) NOT NULL UNIQUE,
  from_email VARCHAR(255) NOT NULL,
  subject TEXT,
  body TEXT,
  confidence VARCHAR(20),
  matched_keywords TEXT[],
  received_at TIMESTAMP,
  processed_at TIMESTAMP DEFAULT NOW(),
  status VARCHAR(50) DEFAULT 'new' -- new, reviewed, contacted, booked
);
```

### 3. Update Webhook Handler

```typescript
.post('/api/webhooks/gmail', async (c) => {
  const notification = JSON.parse(decodedData)
  const { emailAddress, historyId } = notification

  // Look up user in database
  const watch = await db.getWatchByEmail(emailAddress)
  if (!watch) return c.json({ success: true })

  // Get user's OAuth token from Clerk
  const token = await getOAuthToken(watch.clerkUserId)

  // Fetch new emails
  const gmail = setupGmail(token)
  const newMessages = await fetchGmailHistory(gmail, watch.lastHistoryId)

  // Process and store booking inquiries
  for (const msg of newMessages) {
    const analysis = await analyzeEmail(gmail, msg.id)
    if (analysis.isBookingInquiry) {
      await db.saveBookingInquiry({
        userId: watch.clerkUserId,
        ...analysis
      })

      // Send notification (email, SMS, push, etc.)
      await sendNotification(watch.clerkUserId, analysis)
    }
  }

  // Update last processed history ID
  await db.updateWatch(watch.id, { lastHistoryId: historyId })

  return c.json({ success: true })
})
```

### 4. Add AI Enhancement (Optional)

Replace keyword detection with AI analysis:

```typescript
import { Anthropic } from '@anthropic-ai/sdk'

async function analyzeEmailWithAI(subject: string, body: string) {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const response = await anthropic.messages.create({
    model: 'claude-3-5-sonnet-20241022',
    messages: [{
      role: 'user',
      content: `Analyze this email and determine if it's a booking inquiry for a photography/event business.

Subject: ${subject}
Body: ${body}

Return JSON with:
- isBookingInquiry (boolean)
- confidence (high/medium/low)
- extractedInfo (date, event type, location, etc.)
- suggestedResponse (optional)`
    }]
  })

  return JSON.parse(response.content[0].text)
}
```

### 5. Add Notification System

Options:
- Email notifications via SendGrid/Resend
- SMS via Twilio
- Push notifications via Firebase
- In-app notifications

## Environment Variables

Required in `apps/backend/.env`:

```env
# Clerk
CLERK_SECRET_KEY=sk_test_...
CLERK_PUBLISHABLE_KEY=pk_test_...

# Gmail Webhooks
GMAIL_PUBSUB_TOPIC=projects/YOUR_PROJECT_ID/topics/gmail-notifications

# Database (when added)
DATABASE_URL=postgresql://...

# AI Analysis (optional)
ANTHROPIC_API_KEY=sk-ant-...

# Notifications (optional)
SENDGRID_API_KEY=...
TWILIO_AUTH_TOKEN=...
```

## Testing Checklist

- [ ] Set up Google Cloud Pub/Sub topic
- [ ] Configure Pub/Sub subscription with webhook URL
- [ ] Call `/api/emails/watch` to start monitoring
- [ ] Send test email with booking keywords
- [ ] Check backend logs for webhook notification
- [ ] Call `/api/emails/process-new` with saved historyId
- [ ] Verify booking inquiry is detected
- [ ] Test confidence levels with different keyword counts
- [ ] Test watch renewal before 7 day expiration
- [ ] Test webhook with ngrok for local development

## Resources

- [Gmail Webhooks Setup Guide](./GMAIL_WEBHOOKS_SETUP.md)
- [Google Calendar Setup Guide](./GOOGLE_CALENDAR_SETUP.md)
- [Gmail Push Notifications](https://developers.google.com/gmail/api/guides/push)
- [Gmail History API](https://developers.google.com/gmail/api/reference/rest/v1/users.history)
