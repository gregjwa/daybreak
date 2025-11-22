import { Hono } from "hono";
import { getAuth } from "@hono/clerk-auth";
import { prisma } from "../db";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";

const app = new Hono();

const createRoleSchema = z.object({
  name: z.string().min(1, "Role name is required"),
});

// Middleware to check if user is owner of the organization
// Note: This expects :orgId param in the route
async function checkOrgOwnership(c: any, next: any) {
  const auth = getAuth(c);
  const orgId = c.req.param("orgId");

  if (!auth?.userId) return c.json({ error: "Unauthorized" }, 401);
  if (!orgId) return c.json({ error: "Organization ID required" }, 400);

  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { ownerId: true },
  });

  if (!org) return c.json({ error: "Organization not found" }, 404);
  if (org.ownerId !== auth.userId) return c.json({ error: "Forbidden" }, 403);

  await next();
}

// GET /api/organizations/:orgId/roles - List roles
app.get("/:orgId/roles", async (c) => {
  const auth = getAuth(c);
  const orgId = c.req.param("orgId");

  if (!auth?.userId) return c.json({ error: "Unauthorized" }, 401);

  // Access control: Check if member or owner
  const membership = await prisma.organizationMember.findUnique({
    where: {
      organizationId_clerkUserId: {
        organizationId: orgId,
        clerkUserId: auth.userId,
      },
    },
  });
  
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { ownerId: true },
  });

  if (!membership && org?.ownerId !== auth.userId) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const roles = await prisma.role.findMany({
    where: { organizationId: orgId },
    orderBy: { name: "asc" },
  });

  return c.json(roles);
});

// POST /api/organizations/:orgId/roles - Create role (Owner only)
app.post("/:orgId/roles", checkOrgOwnership, zValidator("json", createRoleSchema), async (c) => {
  const orgId = c.req.param("orgId");
  const { name } = c.req.valid("json");

  try {
    // Check if role exists
    const existingRole = await prisma.role.findUnique({
       where: {
          organizationId_name: {
             organizationId: orgId,
             name,
          }
       }
    });
    
    if (existingRole) {
        return c.json({ error: "Role already exists" }, 409);
    }

    const role = await prisma.role.create({
      data: {
        name,
        organizationId: orgId,
      },
    });
    return c.json(role, 201);
  } catch (error) {
    return c.json({ error: "Failed to create role" }, 500);
  }
});

export default app;

