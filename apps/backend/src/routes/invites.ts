import { Hono } from "hono";
import { getAuth } from "@hono/clerk-auth";
import { prisma } from "../db";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import crypto from "crypto";

const app = new Hono();

const createInviteSchema = z.object({
  email: z.string().email(),
  roleId: z.string().optional(), // Optional role assignment
});

// Middleware: Owner only for creating invites
async function checkOrgOwnership(c: any, next: any) {
  const auth = getAuth(c);
  const orgId = c.req.param("orgId");

  if (!auth?.userId) return c.json({ error: "Unauthorized" }, 401);

  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { ownerId: true },
  });

  if (!org || org.ownerId !== auth.userId) {
    return c.json({ error: "Forbidden" }, 403);
  }
  await next();
}

// POST /api/organizations/:orgId/invites - Create invite
app.post(
  "/:orgId/invites",
  checkOrgOwnership,
  zValidator("json", createInviteSchema),
  async (c) => {
    const orgId = c.req.param("orgId");
    const { email, roleId } = c.req.valid("json");

    // Generate secure token
    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days expiry

    try {
      // Check for existing pending invite
      const existingInvite = await prisma.invite.findFirst({
        where: {
          email,
          organizationId: orgId,
          status: "PENDING",
        },
      });

      if (existingInvite) {
        // Update existing invite instead of creating duplicate
        const updatedInvite = await prisma.invite.update({
          where: { id: existingInvite.id },
          data: {
            token, // Rotate token
            expiresAt,
            roleId, // Update role if changed
          },
        });

        return c.json(
          {
            ...updatedInvite,
            inviteLink: `${
              process.env.FRONTEND_URL || "http://localhost:5173"
            }/invite/${token}`,
          },
          201
        );
      }

      const invite = await prisma.invite.create({
        data: {
          email,
          token,
          organizationId: orgId,
          roleId,
          expiresAt,
        },
      });

      return c.json(
        {
          ...invite,
          inviteLink: `${
            process.env.FRONTEND_URL || "http://localhost:5173"
          }/invite/${token}`,
        },
        201
      );
    } catch (error) {
      console.error(error);
      return c.json({ error: "Failed to create invite" }, 500);
    }
  }
);

// GET /api/invites/:token - Get public invite info (landing page)
app.get("/public/:token", async (c) => {
  const token = c.req.param("token");

  const invite = await prisma.invite.findUnique({
    where: { token },
    include: {
      organization: { select: { name: true } },
      role: { select: { name: true } },
    },
  });

  if (!invite || invite.status !== "PENDING" || invite.expiresAt < new Date()) {
    return c.json({ error: "Invalid or expired invite" }, 404);
  }

  return c.json({
    organizationName: invite.organization.name,
    roleName: invite.role?.name,
    email: invite.email, // Intended recipient
  });
});

// POST /api/invites/:token/accept - Accept invite
app.post("/:token/accept", async (c) => {
  const auth = getAuth(c);
  const token = c.req.param("token");

  if (!auth?.userId) return c.json({ error: "Unauthorized" }, 401);

  // Transaction: Verify invite -> Create Member -> Update Invite
  try {
    const result = await prisma.$transaction(async (tx) => {
      const invite = await tx.invite.findUnique({
        where: { token },
      });

      if (
        !invite ||
        invite.status !== "PENDING" ||
        invite.expiresAt < new Date()
      ) {
        throw new Error("Invalid invite");
      }

      // Check if user is already a member
      const existingMember = await tx.organizationMember.findUnique({
        where: {
          organizationId_clerkUserId: {
            organizationId: invite.organizationId,
            clerkUserId: auth.userId,
          },
        },
      });

      if (existingMember) {
        throw new Error("You are already a member of this organization");
      }

      // Create membership
      await tx.organizationMember.create({
        data: {
          clerkUserId: auth.userId,
          organizationId: invite.organizationId,
          roleId: invite.roleId,
        },
      });

      // Mark invite accepted (only this specific token)
      // Use updateMany to avoid 'Unique constraint failed' error if there's some edge case,
      // but more importantly, to ensure we're not blocked by anything.
      // Actually, since token is unique, .update is correct.
      // But let's log the update to be sure it's happening.
      const updatedInvite = await tx.invite.update({
        where: { token },
        data: { status: "ACCEPTED" },
      });
      console.log("Invite updated to ACCEPTED:", updatedInvite);

      return { success: true, organizationId: invite.organizationId };
    });

    return c.json(result);
  } catch (error) {
    console.error("Accept invite error:", error);
    return c.json(
      { error: error instanceof Error ? error.message : "Failed" },
      400
    );
  }
});

export default app;
