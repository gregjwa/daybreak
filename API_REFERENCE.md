# Daybreak API Reference

Complete API documentation for the Daybreak backend.

## Base URL

- **Local**: `http://localhost:3000`
- **Production**: `https://your-backend.railway.app`

## Authentication

Most endpoints require a Clerk authentication token in the `Authorization` header:

```
Authorization: Bearer <clerk-token>
```

---

## Invite System

### Create Invite

Creates a new invite code for Person or Business accounts.

**Endpoint**: `POST /api/invites/create`  
**Auth**: Required (Business accounts only)

**Request Body**:
```json
{
  "inviteType": "PERSON",
  "email": "engineer@example.com",
  "expiresInDays": 7
}
```

**Fields**:
- `inviteType` (required): `"PERSON"` or `"BUSINESS"`
- `email` (optional): Pre-assign invite to specific email
- `expiresInDays` (optional): Number of days until expiry (default: 7)

**Response** (200):
```json
{
  "success": true,
  "invite": {
    "code": "abc123xyz789",
    "inviteType": "PERSON",
    "email": "engineer@example.com",
    "expiresAt": "2025-11-27T14:00:00.000Z",
    "inviteUrl": "https://your-frontend.vercel.app/invite/abc123xyz789"
  }
}
```

**Errors**:
- `401` Unauthorized - Not logged in
- `403` Forbidden - Not a Business account
- `400` Bad Request - Invalid invite type

---

### Validate Invite

Checks if an invite code is valid and not expired.

**Endpoint**: `GET /api/invites/validate/:code`  
**Auth**: Not required

**Response** (200):
```json
{
  "valid": true,
  "invite": {
    "inviteType": "PERSON",
    "email": "engineer@example.com",
    "expiresAt": "2025-11-27T14:00:00.000Z",
    "senderBusiness": "Acme Recording Studio"
  }
}
```

**Errors**:
- `404` Not Found - Invite code doesn't exist
- `400` Bad Request - Invite already used or expired

---

### Accept Invite

Accept an invite and create a new Person or Business account.

**Endpoint**: `POST /api/invites/accept`  
**Auth**: Required

**Request Body** (for PERSON invite):
```json
{
  "inviteCode": "abc123xyz789",
  "name": "John Engineer",
  "roles": ["ENGINEER", "ASSISTANT"]
}
```

**Request Body** (for BUSINESS invite):
```json
{
  "inviteCode": "abc123xyz789",
  "name": "Partner Studio Inc"
}
```

**Fields**:
- `inviteCode` (required): The invite code
- `name` (required): Person's name or Business name
- `roles` (required for PERSON): Array of roles (`["ENGINEER", "ASSISTANT"]`)

**Response** (200):
```json
{
  "success": true,
  "user": {
    "accountType": "PERSON",
    "person": {
      "id": "...",
      "name": "John Engineer",
      "roles": ["ENGINEER", "ASSISTANT"]
    }
  },
  "message": "Person account created successfully"
}
```

**Errors**:
- `401` Unauthorized - Not logged in
- `404` Not Found - Invite not found
- `400` Bad Request - Invite expired, already used, or missing required fields
- `403` Forbidden - Email doesn't match invite

---

## Gmail Integration

### Set Up Gmail Watch

Registers Gmail push notifications for the authenticated user's inbox.

**Endpoint**: `POST /api/emails/watch`  
**Auth**: Required

**Response** (200):
```json
{
  "success": true,
  "historyId": "1234567",
  "expiration": "1700000000000",
  "gmailAddress": "bookings.flow@gmail.com",
  "message": "Gmail watch set up successfully. Expires in 7 days."
}
```

**Notes**:
- Creates a User record if it doesn't exist (defaults to BUSINESS account type)
- Stores GmailWatch record in database
- Watch expires after 7 days and must be renewed

---

### Stop Gmail Watch

Stops Gmail push notifications.

**Endpoint**: `POST /api/emails/stop-watch`  
**Auth**: Required

**Response** (200):
```json
{
  "success": true,
  "message": "Gmail watch stopped successfully."
}
```

---

### Process New Emails

Manually process new emails since a given history ID.

**Endpoint**: `GET /api/emails/process-new?historyId=1234567`  
**Auth**: Required

**Query Parameters**:
- `historyId` (required): Gmail history ID to start from

**Response** (200):
```json
{
  "newMessagesCount": 5,
  "bookingInquiriesFound": 2,
  "inquiries": [
    {
      "id": "msg123",
      "from": "client@example.com",
      "subject": "Wedding photography inquiry",
      "date": "Mon, 20 Nov 2025 10:00:00 +0000",
      "snippet": "Hi, I'm interested in booking...",
      "body": "Full email body...",
      "analysis": {
        "isBookingInquiry": true,
        "matchedKeywords": ["wedding", "booking", "interested"],
        "confidence": "high"
      }
    }
  ]
}
```

---

### Analyze Recent Emails

Analyzes recent emails (last 7 days) for booking inquiries.

**Endpoint**: `GET /api/emails/analyze`  
**Auth**: Required

**Response** (200):
```json
{
  "total": 20,
  "analyzed": 10,
  "bookingInquiriesFound": 3,
  "inquiries": [
    {
      "id": "msg456",
      "from": "client@example.com",
      "subject": "Studio session inquiry",
      "date": "Mon, 20 Nov 2025 10:00:00 +0000",
      "snippet": "Do you have availability...",
      "body": "Full email body...",
      "analysis": {
        "isBookingInquiry": true,
        "matchedKeywords": ["studio", "session"],
        "confidence": "medium"
      }
    }
  ]
}
```

---

### Gmail Webhook (Internal)

Receives Gmail push notifications from Google Cloud Pub/Sub.

**Endpoint**: `POST /api/webhooks/gmail`  
**Auth**: Not required (called by Google)

**Behavior**:
- Decodes Pub/Sub notification
- Looks up user by Gmail address
- Fetches new emails using Gmail History API
- Analyzes emails for booking inquiries
- Saves enquiries to database
- Updates history ID

**Note**: This endpoint is called automatically by Google when new emails arrive. You don't call it directly.

---

## Calendar Integration

### Get Calendar Events

Fetches Google Calendar events from the past month.

**Endpoint**: `GET /api/events`  
**Auth**: Required

**Response** (200):
```json
[
  {
    "id": "event123",
    "name": "Studio Session - Band XYZ",
    "date": "2025-11-20T14:00:00.000Z",
    "description": "Recording session",
    "location": "Studio A"
  }
]
```

---

## Database Models

### User

```typescript
{
  id: string
  clerkId: string (unique)
  email: string (unique)
  accountType: "BUSINESS" | "PERSON"
  createdAt: Date
  updatedAt: Date
}
```

### Business

```typescript
{
  id: string
  userId: string (unique)
  name: string
  createdAt: Date
  updatedAt: Date
}
```

### Person

```typescript
{
  id: string
  userId: string (unique)
  name: string
  roles: ("ENGINEER" | "ASSISTANT")[]
  createdAt: Date
  updatedAt: Date
}
```

### PersonBusinessLink

Links a Person to a Business (many-to-many relationship).

```typescript
{
  id: string
  personId: string
  businessId: string
  linkedAt: Date
}
```

### BusinessPartnership

Links two Businesses in a partnership.

```typescript
{
  id: string
  mainBusinessId: string
  partnerBusinessId: string
  createdAt: Date
}
```

### Invite

```typescript
{
  id: string
  code: string (unique)
  senderUserId: string
  inviteType: "PERSON" | "BUSINESS"
  email: string | null
  expiresAt: Date
  usedAt: Date | null
  usedByEmail: string | null
  createdAt: Date
}
```

### GmailWatch

```typescript
{
  id: string
  userId: string (unique)
  gmailAddress: string (unique)
  historyId: string
  expiresAt: bigint
  createdAt: Date
  updatedAt: Date
}
```

### Enquiry

```typescript
{
  id: string
  businessId: string
  emailId: string (unique, Gmail message ID)
  fromEmail: string
  subject: string | null
  body: string | null
  snippet: string | null
  confidence: "HIGH" | "MEDIUM" | "LOW"
  matchedKeywords: string[]
  receivedAt: Date
  processedAt: Date
  status: "NEW" | "REVIEWED" | "CONTACTED" | "BOOKED" | "DECLINED"
}
```

---

## Email Analysis

### Keywords Detected

The system looks for these booking-related keywords:

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

- **HIGH**: 3+ keywords matched
- **MEDIUM**: 1-2 keywords matched
- **LOW**: 0 keywords matched

---

## Error Responses

All errors follow this format:

```json
{
  "error": "Error type",
  "message": "Detailed error message"
}
```

Common HTTP status codes:
- `400` Bad Request - Invalid input
- `401` Unauthorized - Not authenticated
- `403` Forbidden - Authenticated but not authorized
- `404` Not Found - Resource doesn't exist
- `500` Internal Server Error - Server-side error

---

## Environment Variables

Required environment variables:

```env
# Clerk
CLERK_SECRET_KEY=sk_...
CLERK_PUBLISHABLE_KEY=pk_...

# Database
DATABASE_URL=postgresql://...

# Gmail
GMAIL_PUBSUB_TOPIC=projects/.../topics/gmail-notifications

# Frontend (for invite URLs)
FRONTEND_URL=https://your-frontend.vercel.app

# Environment
NODE_ENV=development|production
```

---

## Rate Limits

Currently no rate limits are enforced, but consider implementing:
- Max 100 invites per Business per day
- Max 10 API calls per minute per user
- Max 50 Gmail analysis requests per hour

---

## Webhooks Security

The Gmail webhook endpoint should verify requests are from Google:
- Check `Authorization` header
- Validate Pub/Sub message format
- Implement idempotency (using `emailId` uniqueness)

---

## Next Steps for Frontend Integration

1. **Invite Flow**:
   - Create invite form (POST `/api/invites/create`)
   - Build invite acceptance page (GET `/api/invites/validate/:code`, POST `/api/invites/accept`)

2. **Enquiries Dashboard**:
   - Fetch enquiries (needs new endpoint: `GET /api/enquiries`)
   - Display confidence levels and matched keywords
   - Update enquiry status (needs new endpoint: `PATCH /api/enquiries/:id`)

3. **Team Management**:
   - List team members (needs new endpoint: `GET /api/team`)
   - Show Person roles and linked businesses

4. **Notifications**:
   - Real-time alerts when booking inquiries arrive
   - Email/SMS notifications

---

## Support

For issues or questions:
- Check Railway logs for backend errors
- Use Prisma Studio to inspect database: `pnpm db:studio`
- Review Gmail webhook setup in Google Cloud Console


