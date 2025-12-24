import { Hono } from "hono";
import { getAuth } from "@hono/clerk-auth";
import { prisma } from "../db";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";

const createProjectSchema = z.object({
  name: z.string().min(1),
  type: z.string().min(1),
  date: z.string().optional(), // ISO string
  budget: z.number().optional(),
  description: z.string().optional(),
});

const addProjectSupplierSchema = z.object({
  supplierId: z.string().cuid(),
  role: z.string().min(1), // e.g., "Florist"
  status: z.string().default("NEEDED"),
  quoteAmount: z.number().optional(),
  notes: z.string().optional(),
});

const app = new Hono()
  // GET /api/projects - List projects
  .get("/", async (c) => {
    const auth = getAuth(c);
    if (!auth?.userId) return c.json({ error: "Unauthorized" }, 401);

    const user = await prisma.user.findUnique({ where: { clerkId: auth.userId } });
    if (!user) return c.json([]);

    const projects = await prisma.project.findMany({
      where: { userId: user.id },
      include: {
        _count: { select: { suppliers: true } }
      },
      orderBy: { createdAt: "desc" },
    });

    return c.json(projects);
  })

  // GET /api/projects/:id - Get project details
  .get("/:id", async (c) => {
    const auth = getAuth(c);
    const projectId = c.req.param("id");
    
    if (!auth?.userId) return c.json({ error: "Unauthorized" }, 401);

    const user = await prisma.user.findUnique({ where: { clerkId: auth.userId } });
    if (!user) return c.json({ error: "User not found" }, 404);

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        suppliers: {
          include: {
            supplier: {
              include: { 
                categories: {
                  include: { category: true },
                  orderBy: { isPrimary: "desc" },
                },
                contacts: {
                  include: { contactMethods: true },
                  orderBy: { isPrimary: "desc" },
                },
                // Include the supplier's most recent message
                messages: {
                  take: 1,
                  orderBy: { sentAt: "desc" },
                  select: {
                    id: true,
                    content: true,
                    direction: true,
                    sentAt: true,
                  }
                }
              }
            }
          }
        },
      },
    });

    if (!project || project.userId !== user.id) {
      return c.json({ error: "Project not found" }, 404);
    }

    return c.json(project);
  })

  // POST /api/projects - Create project
  .post("/", zValidator("json", createProjectSchema), async (c) => {
    const auth = getAuth(c);
    if (!auth?.userId) return c.json({ error: "Unauthorized" }, 401);

    const data = c.req.valid("json");

    let user = await prisma.user.findUnique({ where: { clerkId: auth.userId } });
    if (!user) {
        // Fetch from Clerk if needed, similar to suppliers.ts
        const clerkClient = c.get("clerk");
        const clerkUser = await clerkClient.users.getUser(auth.userId);
        const email = clerkUser.emailAddresses[0]?.emailAddress;
        
        user = await prisma.user.create({
            data: { clerkId: auth.userId, email: email! }
        });
    }

    const project = await prisma.project.create({
      data: {
        userId: user.id,
        name: data.name,
        type: data.type,
        date: data.date ? new Date(data.date) : null,
        budget: data.budget,
        description: data.description,
      },
    });

    return c.json(project, 201);
  })

  // POST /api/projects/:id/suppliers - Add supplier to project
  .post("/:id/suppliers", zValidator("json", addProjectSupplierSchema), async (c) => {
    const auth = getAuth(c);
    const projectId = c.req.param("id");

    if (!auth?.userId) return c.json({ error: "Unauthorized" }, 401);

    const user = await prisma.user.findUnique({ where: { clerkId: auth.userId } });
    if (!user) return c.json({ error: "User not found" }, 404);

    // Verify Project ownership
    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project || project.userId !== user.id) {
        return c.json({ error: "Project not found" }, 404);
    }

    const data = c.req.valid("json");

    // Verify Supplier ownership
    const supplier = await prisma.supplier.findUnique({ where: { id: data.supplierId } });
    if (!supplier || supplier.userId !== user.id) {
        return c.json({ error: "Supplier not found" }, 404);
    }

    // Create link
    const projectSupplier = await prisma.projectSupplier.create({
      data: {
        projectId,
        supplierId: data.supplierId,
        role: data.role,
        status: data.status,
        quoteAmount: data.quoteAmount,
        notes: data.notes,
      },
    });

    return c.json(projectSupplier, 201);
  });

export default app;
