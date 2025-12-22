import { Hono } from "hono";
import { getAuth } from "@hono/clerk-auth";
import { prisma } from "../db";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";

const createSupplierSchema = z.object({
  name: z.string().min(1),
  categoryId: z.string().optional(),    // Link to existing category
  categoryName: z.string().optional(),  // Or create new category by name (hybrid)
  notes: z.string().optional(),
  email: z.string().email().optional(), // Initial contact method
  phone: z.string().optional(),         // Initial contact method
});

const updateSupplierSchema = z.object({
  name: z.string().min(1).optional(),
  categoryId: z.string().optional(),
  categoryName: z.string().optional(),
  notes: z.string().optional(),
});

const addContactMethodSchema = z.object({
  type: z.enum(["EMAIL", "PHONE", "WHATSAPP", "OTHER"]),
  value: z.string().min(1),
  label: z.string().optional(),
  isPrimary: z.boolean().default(false),
});

// Helper: slugify category name
function slugify(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
}

// Helper: get or create category by name (hybrid suggest + dedupe)
async function getOrCreateCategory(userId: string, categoryName: string) {
  const slug = slugify(categoryName);
  if (!slug) return null;
  
  let category = await prisma.supplierCategory.findUnique({
    where: { userId_slug: { userId, slug } },
  });
  
  if (!category) {
    category = await prisma.supplierCategory.create({
      data: {
        userId,
        name: categoryName.trim(),
        slug,
      },
    });
  }
  
  return category;
}

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
        category: true,
        contactMethods: true,
        _count: { select: { projectSuppliers: true, messages: true } }
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
        category: true,
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

    // Resolve category: use categoryId, or create from categoryName (hybrid)
    let categoryId: string | null = null;
    if (data.categoryId) {
      categoryId = data.categoryId;
    } else if (data.categoryName) {
      const category = await getOrCreateCategory(user.id, data.categoryName);
      categoryId = category?.id || null;
    }

    // Create Supplier and ContactMethods
    const supplier = await prisma.supplier.create({
      data: {
        name: data.name,
        categoryId,
        notes: data.notes,
        userId: user.id,
        contactMethods: {
          create: [
            ...(data.email ? [{ type: "EMAIL", value: data.email, isPrimary: true }] : []),
            ...(data.phone ? [{ type: "PHONE", value: data.phone, isPrimary: !data.email }] : []),
          ],
        },
      },
      include: {
        category: true,
        contactMethods: true,
      },
    });

    return c.json(supplier, 201);
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

    // Resolve category
    let categoryId: string | undefined = undefined;
    if (data.categoryId !== undefined) {
      categoryId = data.categoryId;
    } else if (data.categoryName) {
      const category = await getOrCreateCategory(user.id, data.categoryName);
      categoryId = category?.id;
    }

    const supplier = await prisma.supplier.update({
      where: { id: supplierId },
      data: {
        ...(data.name && { name: data.name }),
        ...(categoryId !== undefined && { categoryId }),
        ...(data.notes !== undefined && { notes: data.notes }),
      },
      include: {
        category: true,
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

