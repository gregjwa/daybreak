# Daybreak - Organization & Invites

This document outlines the organization and invite system implemented in Daybreak.

## Features

### Organizations
- **Create Organizations**: Users can create organizations they own.
- **Membership**: Users can belong to multiple organizations.
- **Roles**: Owners can define custom roles (e.g., "Sound Engineer", "Staff") specific to their organization.

### Invite System
- **Secure Links**: Unique, 32-byte hex token links for invites.
- **Role Assignment**: Invites can pre-assign a role to the user upon acceptance.
- **Expiration**: Invites expire after 7 days by default.
- **Validation**: 
  - Prevents duplicate pending invites for the same email (rotates token instead).
  - Prevents users from joining if they are already a member.

## API Endpoints

### Organizations
- `GET /api/organizations`: List owned and member organizations.
- `POST /api/organizations`: Create a new organization.
- `GET /api/organizations/:id`: Get details (members, roles, invites) - *Protected*.

### Roles
- `GET /api/organizations/:orgId/roles`: List roles.
- `POST /api/organizations/:orgId/roles`: Create a role - *Owner only*.

### Invites
- `POST /api/organizations/:orgId/invites`: Create an invite link - *Owner only*.
- `GET /api/invites/public/:token`: Public metadata for landing page.
- `POST /api/invites/:token/accept`: Accept invite (requires auth).

## Database Schema

See `apps/backend/prisma/schema.prisma` for full details.
- `Organization`: `id`, `name`, `ownerId`
- `Role`: `id`, `name`, `organizationId`
- `Invite`: `token`, `email`, `roleId`, `expiresAt`
- `OrganizationMember`: Link table for `User` <-> `Organization` with `roleId`.

## Setup

1. Ensure `DATABASE_URL` is set in `apps/backend/.env`.
2. Run migrations: `cd apps/backend && npx prisma migrate dev`.
3. Start backend: `pnpm dev:backend`.
4. Start frontend: `pnpm dev:frontend`.

