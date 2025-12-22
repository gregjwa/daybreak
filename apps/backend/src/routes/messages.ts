import { Hono } from "hono";
import { getAuth } from "@hono/clerk-auth";
import { prisma } from "../db";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";

const createMessageSchema = z.object({
  projectId: z.string().optional(),
  supplierId: z.string().optional(),
  contactMethodId: z.string().optional(),
  content: z.string().min(1),
  direction: z.enum(["INBOUND", "OUTBOUND"]),
  sentAt: z.string().optional(), // ISO
});

const app = new Hono()
  // GET /api/messages - List messages
  .get("/", async (c) => {
    const auth = getAuth(c);
    if (!auth?.userId) return c.json({ error: "Unauthorized" }, 401);

    const user = await prisma.user.findUnique({ where: { clerkId: auth.userId } });
    if (!user) return c.json([]);

    const projectId = c.req.query("projectId");
    const supplierId = c.req.query("supplierId");

    // Build filter: Messages must belong to projects/suppliers owned by user
    // This is tricky because Message -> Project -> User OR Message -> Supplier -> User
    // Simplest: Check if Project/Supplier belongs to user before query, or join.
    // Given the schema, we can filter by joining.
    
    const messages = await prisma.message.findMany({
      where: {
        OR: [
          { project: { userId: user.id } },
          { supplier: { userId: user.id } }
        ],
        AND: [
            projectId ? { projectId } : {},
            supplierId ? { supplierId } : {}
        ]
      },
      include: {
        supplier: true,
        project: true,
        contactMethod: true,
      },
      orderBy: { sentAt: "desc" },
    });

    return c.json(messages);
  })

  // POST /api/messages - Log a message
  .post("/", zValidator("json", createMessageSchema), async (c) => {
    const auth = getAuth(c);
    if (!auth?.userId) return c.json({ error: "Unauthorized" }, 401);

    const user = await prisma.user.findUnique({ where: { clerkId: auth.userId } });
    if (!user) return c.json({ error: "User not found" }, 404);

    const data = c.req.valid("json");

    // Validation: ensure project/supplier belongs to user
    if (data.projectId) {
        const p = await prisma.project.findUnique({ where: { id: data.projectId } });
        if (!p || p.userId !== user.id) return c.json({ error: "Invalid Project" }, 403);
    }
    if (data.supplierId) {
        const s = await prisma.supplier.findUnique({ where: { id: data.supplierId } });
        if (!s || s.userId !== user.id) return c.json({ error: "Invalid Supplier" }, 403);
    }

    const message = await prisma.message.create({
      data: {
        projectId: data.projectId,
        supplierId: data.supplierId,
        contactMethodId: data.contactMethodId,
        content: data.content,
        direction: data.direction,
        sentAt: data.sentAt ? new Date(data.sentAt) : new Date(),
      },
    });

    return c.json(message, 201);
  });

export default app;

