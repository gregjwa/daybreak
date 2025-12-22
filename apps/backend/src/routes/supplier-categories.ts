import { Hono } from "hono";
import { getAuth } from "@hono/clerk-auth";
import { prisma } from "../db";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";

const createCategorySchema = z.object({
  name: z.string().min(1).max(100),
});

const updateCategorySchema = z.object({
  name: z.string().min(1).max(100),
});

// Helper: slugify category name
function slugify(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
}

const app = new Hono()
  // GET /api/supplier-categories - List/search categories (autosuggest)
  .get("/", async (c) => {
    const auth = getAuth(c);
    if (!auth?.userId) return c.json({ error: "Unauthorized" }, 401);

    const user = await prisma.user.findUnique({
      where: { clerkId: auth.userId },
    });

    if (!user) return c.json([]);

    const query = c.req.query("query")?.trim().toLowerCase() || "";

    const categories = await prisma.supplierCategory.findMany({
      where: {
        userId: user.id,
        ...(query && {
          OR: [
            { name: { contains: query, mode: "insensitive" } },
            { slug: { contains: query, mode: "insensitive" } },
          ],
        }),
      },
      orderBy: { name: "asc" },
      take: 50,
    });

    return c.json(categories);
  })

  // POST /api/supplier-categories - Create a new category
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

    // Check for duplicate
    const existing = await prisma.supplierCategory.findUnique({
      where: { userId_slug: { userId: user.id, slug } },
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
      },
    });

    return c.json(category, 201);
  })

  // PATCH /api/supplier-categories/:id - Rename a category
  .patch("/:id", zValidator("json", updateCategorySchema), async (c) => {
    const auth = getAuth(c);
    const categoryId = c.req.param("id");

    if (!auth?.userId) return c.json({ error: "Unauthorized" }, 401);

    const user = await prisma.user.findUnique({
      where: { clerkId: auth.userId },
    });

    if (!user) return c.json({ error: "User not found" }, 404);

    // Verify ownership
    const existing = await prisma.supplierCategory.findUnique({
      where: { id: categoryId },
    });

    if (!existing || existing.userId !== user.id) {
      return c.json({ error: "Category not found" }, 404);
    }

    const data = c.req.valid("json");
    const newSlug = slugify(data.name);

    if (!newSlug) {
      return c.json({ error: "Invalid category name" }, 400);
    }

    // Check for duplicate slug (if renaming to existing name)
    if (newSlug !== existing.slug) {
      const duplicate = await prisma.supplierCategory.findUnique({
        where: { userId_slug: { userId: user.id, slug: newSlug } },
      });

      if (duplicate) {
        return c.json({ error: "A category with this name already exists" }, 409);
      }
    }

    const category = await prisma.supplierCategory.update({
      where: { id: categoryId },
      data: {
        name: data.name.trim(),
        slug: newSlug,
      },
    });

    return c.json(category);
  })

  // DELETE /api/supplier-categories/:id - Delete a category
  .delete("/:id", async (c) => {
    const auth = getAuth(c);
    const categoryId = c.req.param("id");

    if (!auth?.userId) return c.json({ error: "Unauthorized" }, 401);

    const user = await prisma.user.findUnique({
      where: { clerkId: auth.userId },
    });

    if (!user) return c.json({ error: "User not found" }, 404);

    // Verify ownership
    const existing = await prisma.supplierCategory.findUnique({
      where: { id: categoryId },
    });

    if (!existing || existing.userId !== user.id) {
      return c.json({ error: "Category not found" }, 404);
    }

    // Deleting category will set categoryId to null on associated suppliers (due to optional relation)
    await prisma.supplierCategory.delete({
      where: { id: categoryId },
    });

    return c.json({ success: true });
  });

export default app;

