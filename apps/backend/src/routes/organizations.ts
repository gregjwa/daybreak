import { Hono } from "hono";
import { getAuth } from "@hono/clerk-auth";
import { prisma } from "../db";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";

// Schema for creating an organization
const createOrgSchema = z.object({
  name: z.string().min(1, "Name is required"),
});

const app = new Hono()
  // GET /api/organizations - List organizations user owns or is a member of
  .get("/", async (c) => {
    const auth = getAuth(c);
    if (!auth?.userId) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    try {
      // Fetch organizations owned by user OR where user is a member
      const organizations = await prisma.organization.findMany({
        where: {
          OR: [
            { ownerId: auth.userId },
            { members: { some: { clerkUserId: auth.userId } } },
          ],
        },
        include: {
          members: {
            where: { clerkUserId: auth.userId },
            include: { role: true },
          },
          _count: {
            select: { members: true },
          },
        },
      });

      // Transform to add "isOwner" flag and flatten membership info
      const result = organizations.map((org) => {
        const membership = org.members[0]; // Will be defined if they are a member, undefined if only owner
        const isOwner = org.ownerId === auth.userId;
        
        return {
          id: org.id,
          name: org.name,
          isOwner,
          role: isOwner ? "Owner" : membership?.role?.name || "Member",
          memberCount: org._count.members,
          createdAt: org.createdAt,
        };
      });

      return c.json(result);
    } catch (error) {
      console.error("Error fetching organizations:", error);
      return c.json({ error: "Failed to fetch organizations" }, 500);
    }
  })

  // POST /api/organizations - Create a new organization
  .post("/", zValidator("json", createOrgSchema), async (c) => {
    const auth = getAuth(c);
    if (!auth?.userId) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const { name } = c.req.valid("json");

    try {
      const org = await prisma.organization.create({
        data: {
          name,
          ownerId: auth.userId,
          // Automatically add creator as a member (optional, depending on logic, usually good to have)
          members: {
            create: {
              clerkUserId: auth.userId,
              // Owner might not need a roleId if logic handles ownership separately, 
              // or we could create an "Owner" role by default. 
              // For now, let's keep it simple: they are just a member without a specific role entity, 
              // but we know they are owner via ownerId.
            },
          },
        },
      });

      return c.json(org, 201);
    } catch (error) {
      console.error("Error creating organization:", error);
      return c.json({ error: "Failed to create organization" }, 500);
    }
  })

  // GET /api/organizations/:id - Get organization details
  .get("/:id", async (c) => {
    const auth = getAuth(c);
    if (!auth?.userId) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const orgId = c.req.param("id");

    try {
      const org = await prisma.organization.findUnique({
        where: { id: orgId },
        include: {
          members: {
            include: { role: true },
          },
          roles: true,
          invites: true,
        },
      });

      if (!org) {
        return c.json({ error: "Organization not found" }, 404);
      }

      // Check access: must be owner or member
      const isMember = org.members.some((m) => m.clerkUserId === auth.userId);
      const isOwner = org.ownerId === auth.userId;

      if (!isMember && !isOwner) {
        return c.json({ error: "Forbidden" }, 403);
      }

      // Enrich members with Clerk user data
      const clerkClient = c.get("clerk");
      
      const enrichedMembers = await Promise.all(
        org.members.map(async (member) => {
          try {
            const user = await clerkClient.users.getUser(member.clerkUserId);
            return {
              ...member,
              user: {
                firstName: user.firstName,
                lastName: user.lastName,
                email: user.emailAddresses.find(e => e.id === user.primaryEmailAddressId)?.emailAddress,
                imageUrl: user.imageUrl
              }
            };
          } catch (e) {
            console.error(`Failed to fetch Clerk user ${member.clerkUserId}`, e);
            return { ...member, user: { firstName: 'Unknown', lastName: 'User' } };
          }
        })
      );

      return c.json({ ...org, members: enrichedMembers, isOwner });
    } catch (error) {
      console.error("Error fetching organization details:", error);
      return c.json({ error: "Failed to fetch organization details" }, 500);
    }
  })

  // DELETE /api/organizations/:id - Delete an organization
  .delete("/:id", async (c) => {
    const auth = getAuth(c);
    if (!auth?.userId) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const orgId = c.req.param("id");

    try {
      const org = await prisma.organization.findUnique({
        where: { id: orgId },
        select: { ownerId: true },
      });

      if (!org) {
        return c.json({ error: "Organization not found" }, 404);
      }

      if (org.ownerId !== auth.userId) {
        return c.json({ error: "Forbidden: Only the owner can delete the organization" }, 403);
      }

      await prisma.organization.delete({
        where: { id: orgId },
      });

      return c.json({ success: true });
    } catch (error) {
      console.error("Error deleting organization:", error);
      return c.json({ error: "Failed to delete organization" }, 500);
    }
  });

export default app;
