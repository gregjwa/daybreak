# Daybreak

A modern monorepo with Hono RPC, React, TypeScript, and TanStack Query.

## Features

- **Backend**: Hono with full TypeScript support
- **Frontend**: Vite + React + TypeScript
- **Type Safety**: End-to-end type safety with Hono RPC
- **State Management**: TanStack Query for server state
- **Monorepo**: pnpm workspaces for package management

## Project Structure

```
Daybreak/
├── apps/
│   ├── backend/          # Hono API server
│   │   └── src/
│   │       └── index.ts  # API routes with type exports
│   └── frontend/         # React application
│       └── src/
│           ├── lib/      # API client
│           ├── hooks/    # React Query hooks
│           └── components/
└── packages/             # Shared packages (future)
```

## Getting Started

### Prerequisites

- Node.js 18+
- pnpm (install with `npm install -g pnpm`)

### Installation

```bash
# Install all dependencies
pnpm install
```

### Development

Run both frontend and backend in parallel:

```bash
pnpm dev
```

Or run them separately:

```bash
# Terminal 1 - Backend (http://localhost:3000)
pnpm dev:backend

# Terminal 2 - Frontend (http://localhost:5173)
pnpm dev:frontend
```

### Building for Production

```bash
# Build both apps
pnpm build

# Or build separately
pnpm build:backend
pnpm build:frontend
```

## How Hono RPC Works

1. **Backend exports types** (`apps/backend/src/index.ts`):
   ```ts
   export type AppType = typeof app
   ```

2. **Frontend imports types** (`apps/frontend/src/lib/api.ts`):
   ```ts
   import type { AppType } from '@daybreak/backend'
   const client = hc<AppType>('http://localhost:5173')
   ```

3. **Full type safety** in React hooks:
   ```ts
   const res = await client.api.users.$get()
   const data = await res.json() // Fully typed!
   ```

## Deployment

### Backend
Deploy to:
- Railway
- Fly.io
- Render
- AWS Lambda
- Cloudflare Workers

### Frontend
Deploy to:
- Vercel
- Netlify
- Cloudflare Pages
- AWS S3 + CloudFront

**Important**: Update the API URL in `apps/frontend/src/lib/api.ts` to your production backend URL.

## Adding New API Routes

1. Add route in `apps/backend/src/index.ts`
2. Types automatically available in frontend
3. Create React Query hooks in `apps/frontend/src/hooks/`
4. Use in components with full type safety

## License

MIT
