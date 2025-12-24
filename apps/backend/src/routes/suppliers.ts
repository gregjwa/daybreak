import { Hono } from "hono";
import { getAuth } from "@hono/clerk-auth";
import { prisma } from "../db";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";

const createSupplierSchema = z.object({
  name: z.string().min(1),
  categorySlugs: z.array(z.string()).optional(), // Category slugs to link
  primaryCategory: z.string().optional(), // Primary category slug
  notes: z.string().optional(),
  email: z.string().email().optional(), // Initial contact method
  phone: z.string().optional(), // Initial contact method
});

const updateSupplierSchema = z.object({
  name: z.string().min(1).optional(),
  categorySlugs: z.array(z.string()).optional(),
  primaryCategory: z.string().optional(),
  notes: z.string().optional(),
});

const addContactMethodSchema = z.object({
  type: z.enum(["EMAIL", "PHONE", "WHATSAPP", "OTHER"]),
  value: z.string().min(1),
  label: z.string().optional(),
  isPrimary: z.boolean().default(false),
});

const app = new Hono()
  // GET /api/suppliers - List all suppliers for the user
  .get("/", async (c) => {
    const auth = getAuth(c);
    if (!auth?.userId) return c.json({ error: "Unauthorized" }, 401);

    const user = await prisma.user.findUnique({
      where: { clerkId: auth.userId },
    });

    if (!user) {
      return c.json([]); // No user record = no suppliers
    }

    const suppliers = await prisma.supplier.findMany({
      where: { userId: user.id },
      include: {
        categories: {
          include: { category: true },
          orderBy: { isPrimary: "desc" },
        },
        contactMethods: true,
        _count: { select: { projectSuppliers: true, messages: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return c.json(suppliers);
  })

  // GET /api/suppliers/:id - Get supplier detail with projects + messages
  .get("/:id", async (c) => {
    const auth = getAuth(c);
    const supplierId = c.req.param("id");

    if (!auth?.userId) return c.json({ error: "Unauthorized" }, 401);

    const user = await prisma.user.findUnique({
      where: { clerkId: auth.userId },
    });

    if (!user) return c.json({ error: "User not found" }, 404);

    const supplier = await prisma.supplier.findUnique({
      where: { id: supplierId },
      include: {
        categories: {
          include: { category: true },
          orderBy: { isPrimary: "desc" },
        },
        contactMethods: true,
        projectSuppliers: {
          include: {
            project: {
              select: {
                id: true,
                name: true,
                type: true,
                date: true,
              },
            },
          },
          orderBy: { createdAt: "desc" },
        },
        messages: {
          take: 20,
          orderBy: { sentAt: "desc" },
          select: {
            id: true,
            content: true,
            direction: true,
            sentAt: true,
            project: {
              select: { id: true, name: true },
            },
          },
        },
      },
    });

    if (!supplier || supplier.userId !== user.id) {
      return c.json({ error: "Supplier not found" }, 404);
    }

    return c.json(supplier);
  })

  // POST /api/suppliers - Create a new supplier
  .post("/", zValidator("json", createSupplierSchema), async (c) => {
    const auth = getAuth(c);
    if (!auth?.userId) return c.json({ error: "Unauthorized" }, 401);

    const data = c.req.valid("json");

    let user = await prisma.user.findUnique({
      where: { clerkId: auth.userId },
    });

    if (!user) {
      // Fetch user details from Clerk to get email
      const clerkClient = c.get("clerk");
      const clerkUser = await clerkClient.users.getUser(auth.userId);
      const email = clerkUser.emailAddresses[0]?.emailAddress;

      if (!email) {
        return c.json({ error: "User email not found" }, 400);
      }

      user = await prisma.user.create({
        data: {
          clerkId: auth.userId,
          email: email,
        },
      });
    }

    // Create Supplier
    const supplier = await prisma.supplier.create({
      data: {
        name: data.name,
        notes: data.notes,
        userId: user.id,
        contactMethods: {
          create: [
            ...(data.email ? [{ type: "EMAIL", value: data.email, isPrimary: true }] : []),
            ...(data.phone ? [{ type: "PHONE", value: data.phone, isPrimary: !data.email }] : []),
          ],
        },
      },
    });

    // Link categories
    const categorySlugs = data.categorySlugs || [];
    for (const slug of categorySlugs) {
      const category = await prisma.supplierCategory.findUnique({ where: { slug } });
      if (category) {
        await prisma.supplierToCategory.create({
          data: {
            supplierId: supplier.id,
            categoryId: category.id,
            isPrimary: slug === data.primaryCategory,
          },
        });
      }
    }

    // Fetch with categories
    const result = await prisma.supplier.findUnique({
      where: { id: supplier.id },
      include: {
        categories: { include: { category: true } },
        contactMethods: true,
      },
    });

    return c.json(result, 201);
  })

  // PATCH /api/suppliers/:id - Update a supplier
  .patch("/:id", zValidator("json", updateSupplierSchema), async (c) => {
    const auth = getAuth(c);
    const supplierId = c.req.param("id");

    if (!auth?.userId) return c.json({ error: "Unauthorized" }, 401);

    const user = await prisma.user.findUnique({ where: { clerkId: auth.userId } });
    if (!user) return c.json({ error: "User not found" }, 404);

    // Verify ownership
    const existing = await prisma.supplier.findUnique({ where: { id: supplierId } });
    if (!existing || existing.userId !== user.id) {
      return c.json({ error: "Supplier not found" }, 404);
    }

    const data = c.req.valid("json");

    // Update basic fields
    await prisma.supplier.update({
      where: { id: supplierId },
      data: {
        ...(data.name && { name: data.name }),
        ...(data.notes !== undefined && { notes: data.notes }),
      },
    });

    // Update categories if provided
    if (data.categorySlugs !== undefined) {
      // Remove existing category links
      await prisma.supplierToCategory.deleteMany({
        where: { supplierId },
      });

      // Add new category links
      for (const slug of data.categorySlugs) {
        const category = await prisma.supplierCategory.findUnique({ where: { slug } });
        if (category) {
          await prisma.supplierToCategory.create({
            data: {
              supplierId,
              categoryId: category.id,
              isPrimary: slug === data.primaryCategory,
            },
          });
        }
      }
    }

    // Fetch updated supplier
    const supplier = await prisma.supplier.findUnique({
      where: { id: supplierId },
      include: {
        categories: { include: { category: true } },
        contactMethods: true,
      },
    });

    return c.json(supplier);
  })

  // POST /api/suppliers/:id/contacts - Add contact method
  .post("/:id/contacts", zValidator("json", addContactMethodSchema), async (c) => {
    const auth = getAuth(c);
    const supplierId = c.req.param("id");

    if (!auth?.userId) return c.json({ error: "Unauthorized" }, 401);

    const user = await prisma.user.findUnique({ where: { clerkId: auth.userId } });
    if (!user) return c.json({ error: "User not found" }, 404);

    // Verify ownership
    const supplier = await prisma.supplier.findUnique({
      where: { id: supplierId },
    });

    if (!supplier || supplier.userId !== user.id) {
      return c.json({ error: "Supplier not found or unauthorized" }, 404);
    }

    const data = c.req.valid("json");

    const contactMethod = await prisma.contactMethod.create({
      data: {
        supplierId,
        type: data.type,
        value: data.value,
        label: data.label,
        isPrimary: data.isPrimary,
      },
    });

    return c.json(contactMethod, 201);
  });

export default app;
