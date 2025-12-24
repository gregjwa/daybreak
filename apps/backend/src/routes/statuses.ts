import { Hono } from "hono";
import { getAuth } from "@hono/clerk-auth";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { prisma } from "../db";

const updateConfigSchema = z.object({
  isEnabled: z.boolean(),
});

const app = new Hono()
  // GET /api/statuses - List all statuses with user config
  .get("/", async (c) => {
    const auth = getAuth(c);
    if (!auth?.userId) return c.json({ error: "Unauthorized" }, 401);

    try {
      const user = await prisma.user.findUnique({ where: { clerkId: auth.userId } });
      if (!user) return c.json({ error: "User not found" }, 404);

      // Get all system statuses
      const statuses = await prisma.supplierStatus.findMany({
        where: { isSystem: true },
        orderBy: { order: "asc" },
        include: {
          userConfigs: {
            where: { userId: user.id },
          },
        },
      });

      return c.json({
        statuses: statuses.map(s => ({
          id: s.id,
          slug: s.slug,
          name: s.name,
          description: s.description,
          order: s.order,
          color: s.color,
          inboundSignals: s.inboundSignals,
          outboundSignals: s.outboundSignals,
          threadPatterns: s.threadPatterns,
          // isEnabled defaults to true if no config exists
          isEnabled: s.userConfigs.length === 0 || s.userConfigs[0].isEnabled,
        })),
      });
    } catch (error) {
      console.error("Error fetching statuses:", error);
      return c.json({ error: "Failed to fetch statuses" }, 500);
    }
  })

  // GET /api/statuses/enabled - Get only enabled statuses for the user
  .get("/enabled", async (c) => {
    const auth = getAuth(c);
    if (!auth?.userId) return c.json({ error: "Unauthorized" }, 401);

    try {
      const user = await prisma.user.findUnique({ where: { clerkId: auth.userId } });
      if (!user) return c.json({ error: "User not found" }, 404);

      // Get all statuses with user config
      const statuses = await prisma.supplierStatus.findMany({
        where: { isSystem: true },
        orderBy: { order: "asc" },
        include: {
          userConfigs: {
            where: { userId: user.id },
          },
        },
      });

      // Filter to only enabled statuses
      const enabledStatuses = statuses.filter(s => 
        s.userConfigs.length === 0 || s.userConfigs[0].isEnabled
      );

      return c.json({
        statuses: enabledStatuses.map(s => ({
          slug: s.slug,
          name: s.name,
          color: s.color,
          order: s.order,
        })),
      });
    } catch (error) {
      console.error("Error fetching enabled statuses:", error);
      return c.json({ error: "Failed to fetch statuses" }, 500);
    }
  })

  // PATCH /api/statuses/:slug/config - Enable/disable a status for the user
  .patch("/:slug/config", zValidator("json", updateConfigSchema), async (c) => {
    const auth = getAuth(c);
    if (!auth?.userId) return c.json({ error: "Unauthorized" }, 401);

    const slug = c.req.param("slug");
    const { isEnabled } = c.req.valid("json");

    try {
      const user = await prisma.user.findUnique({ where: { clerkId: auth.userId } });
      if (!user) return c.json({ error: "User not found" }, 404);

      // Get the status
      const status = await prisma.supplierStatus.findUnique({
        where: { slug },
      });

      if (!status) return c.json({ error: "Status not found" }, 404);

      // Upsert the user config
      await prisma.userStatusConfig.upsert({
        where: {
          userId_statusId: {
            userId: user.id,
            statusId: status.id,
          },
        },
        update: { isEnabled },
        create: {
          userId: user.id,
          statusId: status.id,
          isEnabled,
        },
      });

      return c.json({ success: true, slug, isEnabled });
    } catch (error) {
      console.error("Error updating status config:", error);
      return c.json({ error: "Failed to update config" }, 500);
    }
  })

  // GET /api/statuses/:slug - Get details for a single status
  .get("/:slug", async (c) => {
    const auth = getAuth(c);
    if (!auth?.userId) return c.json({ error: "Unauthorized" }, 401);

    const slug = c.req.param("slug");

    try {
      const user = await prisma.user.findUnique({ where: { clerkId: auth.userId } });
      if (!user) return c.json({ error: "User not found" }, 404);

      const status = await prisma.supplierStatus.findUnique({
        where: { slug },
        include: {
          userConfigs: {
            where: { userId: user.id },
          },
        },
      });

      if (!status) return c.json({ error: "Status not found" }, 404);

      return c.json({
        id: status.id,
        slug: status.slug,
        name: status.name,
        description: status.description,
        order: status.order,
        color: status.color,
        inboundSignals: status.inboundSignals,
        outboundSignals: status.outboundSignals,
        threadPatterns: status.threadPatterns,
        isEnabled: status.userConfigs.length === 0 || status.userConfigs[0].isEnabled,
      });
    } catch (error) {
      console.error("Error fetching status:", error);
      return c.json({ error: "Failed to fetch status" }, 500);
    }
  });

export default app;

