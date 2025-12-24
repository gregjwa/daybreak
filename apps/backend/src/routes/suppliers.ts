import { Hono } from "hono";
import { getAuth } from "@hono/clerk-auth";
import { prisma } from "../db";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";

// ============================================================================
// SCHEMAS
// ============================================================================

const createSupplierSchema = z.object({
  name: z.string().min(1),
  domain: z.string().optional(),
  isPersonalDomain: z.boolean().default(false),
  categorySlugs: z.array(z.string()).optional(),
  primaryCategory: z.string().optional(),
  notes: z.string().optional(),
  // Initial contact (optional)
  contact: z.object({
    name: z.string().min(1),
    email: z.string().email(),
    role: z.string().optional(),
  }).optional(),
});

const updateSupplierSchema = z.object({
  name: z.string().min(1).optional(),
  notes: z.string().optional(),
  categorySlugs: z.array(z.string()).optional(),
  primaryCategory: z.string().optional(),
});

const addContactSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  role: z.string().optional(),
  isPrimary: z.boolean().default(false),
  phone: z.string().optional(),
});

const addContactMethodSchema = z.object({
  contactId: z.string(),
  type: z.enum(["EMAIL", "PHONE", "WHATSAPP", "OTHER"]),
  value: z.string().min(1),
  label: z.string().optional(),
  isPrimary: z.boolean().default(false),
});

// ============================================================================
// ROUTES
// ============================================================================

const app = new Hono()
  // GET /api/suppliers - List all suppliers for the user
  .get("/", async (c) => {
    const auth = getAuth(c);
    if (!auth?.userId) return c.json({ error: "Unauthorized" }, 401);

    const user = await prisma.user.findUnique({
      where: { clerkId: auth.userId },
    });

    if (!user) {
      return c.json([]);
    }

    const suppliers = await prisma.supplier.findMany({
      where: { userId: user.id },
      include: {
        categories: {
          include: { category: true },
          orderBy: { isPrimary: "desc" },
        },
        contacts: {
          include: {
            contactMethods: true,
          },
          orderBy: { isPrimary: "desc" },
        },
        _count: { select: { projectSuppliers: true, messages: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return c.json(suppliers);
  })

  // GET /api/suppliers/:id - Get supplier detail with contacts, projects, and messages
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
        contacts: {
          include: {
            contactMethods: true,
          },
          orderBy: { isPrimary: "desc" },
        },
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
        domain: data.domain,
        isPersonalDomain: data.isPersonalDomain,
        notes: data.notes,
        userId: user.id,
      },
    });

    // Create initial contact if provided
    if (data.contact) {
      const contact = await prisma.supplierContact.create({
        data: {
          supplierId: supplier.id,
          name: data.contact.name,
          email: data.contact.email,
          role: data.contact.role,
          isPrimary: true,
        },
      });

      // Create email contact method
      await prisma.contactMethod.create({
        data: {
          contactId: contact.id,
          type: "EMAIL",
          value: data.contact.email,
          isPrimary: true,
        },
      });
    }

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

    // Fetch with all relations
    const result = await prisma.supplier.findUnique({
      where: { id: supplier.id },
      include: {
        categories: { include: { category: true } },
        contacts: { include: { contactMethods: true } },
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

    const existing = await prisma.supplier.findUnique({ where: { id: supplierId } });
    if (!existing || existing.userId !== user.id) {
      return c.json({ error: "Supplier not found" }, 404);
    }

    const data = c.req.valid("json");

    await prisma.supplier.update({
      where: { id: supplierId },
      data: {
        ...(data.name && { name: data.name }),
        ...(data.notes !== undefined && { notes: data.notes }),
      },
    });

    // Update categories if provided
    if (data.categorySlugs !== undefined) {
      await prisma.supplierToCategory.deleteMany({
        where: { supplierId },
      });

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

    const supplier = await prisma.supplier.findUnique({
      where: { id: supplierId },
      include: {
        categories: { include: { category: true } },
        contacts: { include: { contactMethods: true } },
      },
    });

    return c.json(supplier);
  })

  // DELETE /api/suppliers/:id - Delete a supplier
  .delete("/:id", async (c) => {
    const auth = getAuth(c);
    const supplierId = c.req.param("id");

    if (!auth?.userId) return c.json({ error: "Unauthorized" }, 401);

    const user = await prisma.user.findUnique({ where: { clerkId: auth.userId } });
    if (!user) return c.json({ error: "User not found" }, 404);

    const existing = await prisma.supplier.findUnique({ where: { id: supplierId } });
    if (!existing || existing.userId !== user.id) {
      return c.json({ error: "Supplier not found" }, 404);
    }

    await prisma.supplier.delete({ where: { id: supplierId } });

    return c.json({ success: true });
  })

  // ============================================================================
  // CONTACTS
  // ============================================================================

  // POST /api/suppliers/:id/contacts - Add a contact to a supplier
  .post("/:id/contacts", zValidator("json", addContactSchema), async (c) => {
    const auth = getAuth(c);
    const supplierId = c.req.param("id");

    if (!auth?.userId) return c.json({ error: "Unauthorized" }, 401);

    const user = await prisma.user.findUnique({ where: { clerkId: auth.userId } });
    if (!user) return c.json({ error: "User not found" }, 404);

    const supplier = await prisma.supplier.findUnique({
      where: { id: supplierId },
    });

    if (!supplier || supplier.userId !== user.id) {
      return c.json({ error: "Supplier not found" }, 404);
    }

    const data = c.req.valid("json");

    // Create contact
    const contact = await prisma.supplierContact.create({
      data: {
        supplierId,
        name: data.name,
        email: data.email,
        role: data.role,
        isPrimary: data.isPrimary,
      },
    });

    // Create email contact method
    await prisma.contactMethod.create({
      data: {
        contactId: contact.id,
        type: "EMAIL",
        value: data.email,
        isPrimary: true,
      },
    });

    // Create phone contact method if provided
    if (data.phone) {
      await prisma.contactMethod.create({
        data: {
          contactId: contact.id,
          type: "PHONE",
          value: data.phone,
          isPrimary: false,
        },
      });
    }

    const result = await prisma.supplierContact.findUnique({
      where: { id: contact.id },
      include: { contactMethods: true },
    });

    return c.json(result, 201);
  })

  // DELETE /api/suppliers/:supplierId/contacts/:contactId - Remove a contact
  .delete("/:supplierId/contacts/:contactId", async (c) => {
    const auth = getAuth(c);
    const { supplierId, contactId } = c.req.param();

    if (!auth?.userId) return c.json({ error: "Unauthorized" }, 401);

    const user = await prisma.user.findUnique({ where: { clerkId: auth.userId } });
    if (!user) return c.json({ error: "User not found" }, 404);

    const supplier = await prisma.supplier.findUnique({ where: { id: supplierId } });
    if (!supplier || supplier.userId !== user.id) {
      return c.json({ error: "Supplier not found" }, 404);
    }

    const contact = await prisma.supplierContact.findUnique({ where: { id: contactId } });
    if (!contact || contact.supplierId !== supplierId) {
      return c.json({ error: "Contact not found" }, 404);
    }

    await prisma.supplierContact.delete({ where: { id: contactId } });

    return c.json({ success: true });
  })

  // ============================================================================
  // CONTACT METHODS
  // ============================================================================

  // POST /api/suppliers/:id/contact-methods - Add contact method to a contact
  .post("/:id/contact-methods", zValidator("json", addContactMethodSchema), async (c) => {
    const auth = getAuth(c);
    const supplierId = c.req.param("id");

    if (!auth?.userId) return c.json({ error: "Unauthorized" }, 401);

    const user = await prisma.user.findUnique({ where: { clerkId: auth.userId } });
    if (!user) return c.json({ error: "User not found" }, 404);

    const supplier = await prisma.supplier.findUnique({ where: { id: supplierId } });
    if (!supplier || supplier.userId !== user.id) {
      return c.json({ error: "Supplier not found" }, 404);
    }

    const data = c.req.valid("json");

    // Verify contact belongs to this supplier
    const contact = await prisma.supplierContact.findUnique({
      where: { id: data.contactId },
    });
    if (!contact || contact.supplierId !== supplierId) {
      return c.json({ error: "Contact not found" }, 404);
    }

    const contactMethod = await prisma.contactMethod.create({
      data: {
        contactId: data.contactId,
        type: data.type,
        value: data.value,
        label: data.label,
        isPrimary: data.isPrimary,
      },
    });

    return c.json(contactMethod, 201);
  });

export default app;
