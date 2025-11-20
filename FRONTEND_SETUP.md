# Frontend Setup Instructions

Complete setup guide for the Daybreak frontend with invite system.

## Step 1: Install Dependencies

```bash
cd /Users/gregwallace/Documents/daybreak

# Install all dependencies (including new frontend deps)
pnpm install
```

## Step 2: Install shadcn UI Components

```bash
cd apps/frontend

# Install the UI components we need
npx shadcn@latest add button dialog input label select badge card
```

When prompted, accept the defaults.

## Step 3: Deploy Backend Changes

The backend now has new endpoints for invites and profile setup. Deploy them:

```bash
# From project root
git add .
git commit -m "Add frontend invite system and profile setup"
git push origin master
```

Railway will auto-deploy the backend.

## Step 4: Push Database Schema (If Not Done Yet)

```bash
cd apps/backend
pnpm db:push
```

This creates/updates the database tables.

## Step 5: Start Frontend

```bash
cd apps/frontend
pnpm dev
```

The app will be available at `http://localhost:5173`

---

## What Was Built

### Backend Endpoints (New)

1. **POST `/api/profile/setup-business`** - Convert existing User to Business
2. **POST `/api/profile/me`** - Get current user profile
3. **POST `/api/invites/create`** - Create invite (Business only)
4. **GET `/api/invites/validate/:code`** - Validate invite code
5. **POST `/api/invites/accept`** - Accept invite and create account

### Frontend Pages

1. **`/` (Dashboard)**
   - Shows calendar events
   - Business users see "Create Invite" button
   - Non-business users see setup form

2. **`/invite/:code` (Invite Acceptance)**
   - Shows invite details
   - Sign in with Google button
   - Form to accept invite (name + roles for PERSON, name only for BUSINESS)

3. **`/welcome` (Post-Acceptance)**
   - Welcome message
   - Shows account type and linked businesses
   - "Go to Dashboard" button

### Components

- **`BusinessSetupForm`** - Convert existing user to Business
- **`CreateInviteDialog`** - Generate invite links (modal)
- **UI Components** - button, dialog, input, label, select, badge, card (shadcn)

---

## User Flows

### Flow 1: Business User Creates Invite

1. Sign in at `/`
2. If no Business profile, fill out business name
3. Click "Create Invite" button in header
4. Fill in form:
   - Invite type: PERSON or BUSINESS
   - Email (optional)
   - Expires in: 1-30 days
5. Copy generated invite URL
6. Share with team member

### Flow 2: Person Accepts Invite

1. Click invite link: `https://your-app.com/invite/abc123xyz789`
2. See invite details (business name, type)
3. Click "Sign In with Google to Accept"
4. After sign-in, fill in:
   - Name
   - Roles (ENGINEER, ASSISTANT - can select multiple)
5. Click "Accept Invite"
6. Redirected to `/welcome` showing success
7. Click "Go to Dashboard"
8. Now linked to the Business, calendar synced

### Flow 3: Existing User Converts to Business

1. Sign in at `/`
2. See "Set Up Your Business" form
3. Enter business name
4. Click "Create Business Profile"
5. Now can create invites

---

## Testing Locally

### 1. Set Up Your Test Account as Business

1. Go to `http://localhost:5173`
2. Sign in with your test account
3. Fill in business name (e.g., "Test Studio")
4. Click "Create Business Profile"

### 2. Create an Invite

1. Click "Create Invite" button
2. Select "PERSON"
3. Leave email blank
4. Click "Generate Invite"
5. Copy the invite URL

### 3. Test Invite Acceptance (Incognito/Different Browser)

1. Open invite URL in incognito window
2. Sign in with a different Google account
3. Enter name: "Test Engineer"
4. Select role: "ENGINEER"
5. Click "Accept Invite"
6. Should see welcome page
7. Click "Go to Dashboard"

---

## Environment Variables

Make sure you have these set:

**Backend (`apps/backend/.env` or Railway):**
```env
DATABASE_URL=postgresql://...
CLERK_SECRET_KEY=sk_...
CLERK_PUBLISHABLE_KEY=pk_...
GMAIL_PUBSUB_TOPIC=projects/.../topics/gmail-notifications
FRONTEND_URL=http://localhost:5173
NODE_ENV=development
```

**Frontend (`apps/frontend/.env.local`):**
```env
VITE_API_URL=http://localhost:3000
VITE_CLERK_PUBLISHABLE_KEY=pk_test_...
```

---

## Troubleshooting

### "Cannot find module '@/ui/button'"

Run: `npx shadcn@latest add button`

### "Cannot find module 'react-router-dom'"

Already installed in package.json. Run: `pnpm install`

### Backend: "User not found"

The user needs to either:
- Set up Gmail watch (creates User record automatically)
- Or set up business profile via the form

### Invite code invalid

Check:
- Invite hasn't expired
- Invite hasn't been used already
- Code is correct (case-sensitive)

---

## Next Steps

- [ ] Add endpoint to list user's enquiries: `GET /api/enquiries`
- [ ] Add endpoint to update enquiry status: `PATCH /api/enquiries/:id`
- [ ] Build enquiries dashboard page
- [ ] Add endpoint to list team members: `GET /api/team`
- [ ] Build team management page
- [ ] Add explicit Google Calendar OAuth permissions (beyond Gmail)
- [ ] Build full scheduling interface

---

## API Reference

See `API_REFERENCE.md` for complete API documentation.

---

## File Structure

```
apps/frontend/src/
├── api/
│   ├── useProfile.ts       # Profile hooks
│   └── useInvites.ts       # Invite hooks
├── pages/
│   ├── dashboard/
│   │   ├── components/
│   │   │   ├── BusinessSetupForm.tsx
│   │   │   ├── CreateInviteDialog.tsx
│   │   │   └── index.ts
│   │   ├── DashboardPage.tsx
│   │   └── index.ts
│   ├── invite/
│   │   ├── InviteAcceptPage.tsx
│   │   └── index.ts
│   └── welcome/
│       ├── WelcomePage.tsx
│       └── index.ts
├── ui/                     # shadcn components
├── lib/
│   ├── api.ts             # Hono RPC client
│   └── utils.ts           # Tailwind merge util
├── hooks/
│   ├── useEvents.ts
│   └── useGmailWatch.ts
├── App.tsx                # Router setup
├── main.tsx
└── index.css              # Tailwind styles
```

---

## Support

For issues:
- Check browser console for errors
- Check backend logs in Railway
- Verify environment variables are set
- Use Prisma Studio to inspect database: `pnpm db:studio`

