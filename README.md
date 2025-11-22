# Daybreak

A modern TypeScript monorepo combining **Hono** for the backend API and **Vite + React** for the frontend, with end-to-end type safety through Hono RPC.

## Overview

Daybreak is a full-stack monorepo that demonstrates modern web development practices:
- **Backend**: Hono - A lightweight, ultrafast web framework for edge and Node.js
- **Frontend**: Vite + React - Modern React development with instant HMR
- **Type Safety**: Hono RPC provides automatic type inference from backend to frontend
- **Authentication**: Clerk for secure, production-ready auth
- **State Management**: TanStack Query for efficient server state
- **Database**: Prisma ORM (PostgreSQL)
- **Package Management**: pnpm workspaces for efficient monorepo management

## Features

✅ **End-to-end Type Safety** - Types flow automatically from backend routes to frontend
✅ **Hono RPC** - No code generation, just pure TypeScript type inference
✅ **Clerk Authentication** - Secure auth with minimal setup
✅ **Organization Management** - Create orgs, manage members, custom roles, and invite flows
✅ **TanStack Query** - Powerful async state management with optimistic updates
✅ **Fast Development** - Vite's instant HMR + tsx watch mode
✅ **Monorepo Architecture** - Share code and types between apps

## Project Structure

```
Daybreak/
├── apps/
│   ├── backend/              # Hono API server (Node.js)
│   │   ├── src/
│   │   │   ├── routes/       # API routes (orgs, invites, etc.)
│   │   │   └── index.ts      # Entry point + type exports
│   │   ├── prisma/           # Database schema
│   │   ├── .env              # Backend environment variables
│   │   └── package.json      # Backend dependencies
│   │
│   └── frontend/             # Vite + React application
│       ├── src/
│       │   ├── lib/          # API client (Hono RPC)
│       │   ├── api/          # TanStack Query hooks (useOrganizations, etc.)
│       │   ├── pages/        # Feature pages
│       │   ├── ui/           # shadcn/ui components
│       │   └── main.tsx      # Entry point with providers
│       ├── .env.local        # Frontend environment variables
│       └── package.json      # Frontend dependencies
│
├── pnpm-workspace.yaml       # Workspace configuration
└── package.json              # Root package with scripts
```

## Getting Started

### Prerequisites

- **Node.js** 18 or higher
- **pnpm** - Install with `npm install -g pnpm`
- **Clerk Account** - Sign up at [clerk.com](https://clerk.com)
- **PostgreSQL Database** - Local or hosted (e.g., Railway, Supabase, Neon)

### 1. Installation

Clone the repository and install dependencies:

```bash
cd Daybreak
pnpm install
```

### 2. Environment Setup

#### Backend (apps/backend/.env)

Get your Clerk keys from [Clerk Dashboard → API Keys](https://dashboard.clerk.com/last-active?path=api-keys)

```env
CLERK_SECRET_KEY=sk_test_...
CLERK_PUBLISHABLE_KEY=pk_test_...
DATABASE_URL="postgresql://user:password@localhost:5432/daybreak?schema=public"
FRONTEND_URL="http://localhost:5173"
```

#### Frontend (apps/frontend/.env.local)

```env
VITE_CLERK_PUBLISHABLE_KEY=pk_test_...
VITE_API_URL="http://localhost:3000"
```

> **Note**: `.env.local` is for local development and is already in `.gitignore`

### 3. Database Setup

Run the initial migration to set up your database schema:

```bash
cd apps/backend
npx prisma migrate dev
```

### 4. Development

Run both frontend and backend in parallel:

```bash
pnpm dev
```

Or run them separately:

```bash
# Terminal 1 - Backend API (http://localhost:3000)
pnpm dev:backend

# Terminal 2 - Frontend (http://localhost:5173)
pnpm dev:frontend
```

The frontend will be available at **http://localhost:5173**

## Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Backend Framework | [Hono](https://hono.dev) | Lightweight, ultrafast web framework |
| Frontend Framework | [React](https://react.dev) | UI library |
| Build Tool | [Vite](https://vitejs.dev) | Fast bundler with HMR |
| Type Safety | [Hono RPC](https://hono.dev/docs/guides/rpc) | End-to-end type inference |
| Authentication | [Clerk](https://clerk.com) | User management & auth |
| Database | [Prisma](https://prisma.io) | ORM for PostgreSQL |
| State Management | [TanStack Query](https://tanstack.com/query) | Server state & caching |
| UI Library | [shadcn/ui](https://ui.shadcn.com) | Reusable components |
| Styling | [Tailwind CSS](https://tailwindcss.com) | Utility-first CSS |

## Documentation

- [Organization & Invite System](./ORGANIZATION_FEATURE.md) - Detailed guide on the invite system architecture.

## License

MIT
