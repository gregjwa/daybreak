import { Hono } from "hono";
import { getAuth } from "@hono/clerk-auth";
import { prisma } from "../db";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";

const createCategorySchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
});

const updateCategorySchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
});

// Helper: slugify category name
function slugify(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
}

const app = new Hono()
  // GET /api/supplier-categories - List/search categories (system + user-created)
  .get("/", async (c) => {
    const auth = getAuth(c);
    if (!auth?.userId) return c.json({ error: "Unauthorized" }, 401);

    const user = await prisma.user.findUnique({
      where: { clerkId: auth.userId },
    });

    const query = c.req.query("query")?.trim().toLowerCase() || "";

    // Get system categories + user-created categories
    const categories = await prisma.supplierCategory.findMany({
      where: {
        OR: [
          { isSystem: true }, // All system categories
          { userId: user?.id }, // User-created categories
        ],
        ...(query && {
          AND: {
            OR: [
              { name: { contains: query, mode: "insensitive" } },
              { slug: { contains: query, mode: "insensitive" } },
              { description: { contains: query, mode: "insensitive" } },
            ],
          },
        }),
      },
      orderBy: [{ isSystem: "desc" }, { name: "asc" }],
      take: 100,
    });

    return c.json(categories);
  })

  // POST /api/supplier-categories - Create a new user category
  .post("/", zValidator("json", createCategorySchema), async (c) => {
    const auth = getAuth(c);
    if (!auth?.userId) return c.json({ error: "Unauthorized" }, 401);

    const user = await prisma.user.findUnique({
      where: { clerkId: auth.userId },
    });

    if (!user) return c.json({ error: "User not found" }, 404);

    const data = c.req.valid("json");
    const slug = slugify(data.name);

    if (!slug) {
      return c.json({ error: "Invalid category name" }, 400);
    }

    // Check for duplicate (global unique slug)
    const existing = await prisma.supplierCategory.findUnique({
      where: { slug },
    });

    if (existing) {
      // Return existing instead of error (dedupe behavior)
      return c.json(existing);
    }

    const category = await prisma.supplierCategory.create({
      data: {
        userId: user.id,
        name: data.name.trim(),
        slug,
        description: data.description,
        isSystem: false,
      },
    });

    return c.json(category, 201);
  })

  // PATCH /api/supplier-categories/:id - Update a category (user-created only)
  .patch("/:id", zValidator("json", updateCategorySchema), async (c) => {
    const auth = getAuth(c);
    const categoryId = c.req.param("id");

    if (!auth?.userId) return c.json({ error: "Unauthorized" }, 401);

    const user = await prisma.user.findUnique({
      where: { clerkId: auth.userId },
    });

    if (!user) return c.json({ error: "User not found" }, 404);

    // Verify ownership - can only edit user-created categories
    const existing = await prisma.supplierCategory.findUnique({
      where: { id: categoryId },
    });

    if (!existing) {
      return c.json({ error: "Category not found" }, 404);
    }

    if (existing.isSystem) {
      return c.json({ error: "Cannot edit system categories" }, 403);
    }

    if (existing.userId !== user.id) {
      return c.json({ error: "Category not found" }, 404);
    }

    const data = c.req.valid("json");

    // If renaming, check for duplicate slug
    let newSlug = existing.slug;
    if (data.name) {
      newSlug = slugify(data.name);
      if (!newSlug) {
        return c.json({ error: "Invalid category name" }, 400);
      }

      if (newSlug !== existing.slug) {
        const duplicate = await prisma.supplierCategory.findUnique({
          where: { slug: newSlug },
        });

        if (duplicate) {
          return c.json({ error: "A category with this name already exists" }, 409);
        }
      }
    }

    const category = await prisma.supplierCategory.update({
      where: { id: categoryId },
      data: {
        ...(data.name && { name: data.name.trim(), slug: newSlug }),
        ...(data.description !== undefined && { description: data.description }),
      },
    });

    return c.json(category);
  })

  // DELETE /api/supplier-categories/:id - Delete a category (user-created only)
  .delete("/:id", async (c) => {
    const auth = getAuth(c);
    const categoryId = c.req.param("id");

    if (!auth?.userId) return c.json({ error: "Unauthorized" }, 401);

    const user = await prisma.user.findUnique({
      where: { clerkId: auth.userId },
    });

    if (!user) return c.json({ error: "User not found" }, 404);

    // Verify ownership - can only delete user-created categories
    const existing = await prisma.supplierCategory.findUnique({
      where: { id: categoryId },
    });

    if (!existing) {
      return c.json({ error: "Category not found" }, 404);
    }

    if (existing.isSystem) {
      return c.json({ error: "Cannot delete system categories" }, 403);
    }

    if (existing.userId !== user.id) {
      return c.json({ error: "Category not found" }, 404);
    }

    // Delete category (will cascade delete SupplierToCategory links)
    await prisma.supplierCategory.delete({
      where: { id: categoryId },
    });

    return c.json({ success: true });
  });

export default app;
