import { Hono } from "hono";
import { getAuth } from "@hono/clerk-auth";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { prisma } from "../db";
import { enrichSupplierCandidate, enrichCandidatesBatch } from "../lib/enrichment";

const acceptCandidateSchema = z.object({
  supplierName: z.string().min(1).optional(), // Override suggested name
  categoryName: z.string().optional(), // Override suggested category
});

const enrichCandidatesSchema = z.object({
  candidateIds: z.array(z.string()).min(1).max(50),
  scrapeDomain: z.boolean().optional(),
});

const bulkAcceptSchema = z.object({
  candidateIds: z.array(z.string()).min(1).max(100),
});

// Helper: slugify category name
function slugify(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
}

// Helper: get or create category by name
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
  // GET /api/supplier-candidates - List candidates for user
  .get("/", async (c) => {
    const auth = getAuth(c);
    if (!auth?.userId) return c.json({ error: "Unauthorized" }, 401);

    const user = await prisma.user.findUnique({ where: { clerkId: auth.userId } });
    if (!user) return c.json([]);

    const status = c.req.query("status"); // Optional filter: NEW, ACCEPTED, DISMISSED
    const search = c.req.query("search"); // Optional search term

    const candidates = await prisma.supplierCandidate.findMany({
      where: {
        userId: user.id,
        ...(status && { status }),
        ...(search && {
          OR: [
            { email: { contains: search, mode: "insensitive" } },
            { displayName: { contains: search, mode: "insensitive" } },
            { domain: { contains: search, mode: "insensitive" } },
            { suggestedSupplierName: { contains: search, mode: "insensitive" } },
          ],
        }),
      },
      orderBy: [{ confidence: "desc" }, { messageCount: "desc" }, { lastSeenAt: "desc" }],
      take: 200,
    });

    return c.json(candidates);
  })

  // GET /api/supplier-candidates/:id - Get single candidate
  .get("/:id", async (c) => {
    const auth = getAuth(c);
    const candidateId = c.req.param("id");

    if (!auth?.userId) return c.json({ error: "Unauthorized" }, 401);

    const user = await prisma.user.findUnique({ where: { clerkId: auth.userId } });
    if (!user) return c.json({ error: "User not found" }, 404);

    const candidate = await prisma.supplierCandidate.findUnique({
      where: { id: candidateId },
      include: {
        supplier: true,
        enrichmentJobs: {
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
    });

    if (!candidate || candidate.userId !== user.id) {
      return c.json({ error: "Candidate not found" }, 404);
    }

    return c.json(candidate);
  })

  // POST /api/supplier-candidates/:id/accept - Accept and create Supplier
  .post("/:id/accept", zValidator("json", acceptCandidateSchema), async (c) => {
    const auth = getAuth(c);
    const candidateId = c.req.param("id");

    if (!auth?.userId) return c.json({ error: "Unauthorized" }, 401);

    const user = await prisma.user.findUnique({ where: { clerkId: auth.userId } });
    if (!user) return c.json({ error: "User not found" }, 404);

    const candidate = await prisma.supplierCandidate.findUnique({
      where: { id: candidateId },
    });

    if (!candidate || candidate.userId !== user.id) {
      return c.json({ error: "Candidate not found" }, 404);
    }

    if (candidate.status === "ACCEPTED") {
      return c.json({ error: "Candidate already accepted", supplierId: candidate.supplierId }, 409);
    }

    const data = c.req.valid("json");

    // Determine supplier name
    const supplierName =
      data.supplierName ||
      candidate.suggestedSupplierName ||
      candidate.displayName ||
      candidate.email.split("@")[0];

    // Determine category
    let categoryId: string | null = null;
    const categoryName = data.categoryName || candidate.suggestedCategoryName;
    if (categoryName) {
      const category = await getOrCreateCategory(user.id, categoryName);
      categoryId = category?.id || null;
    }

    // Create Supplier with ContactMethod
    const supplier = await prisma.supplier.create({
      data: {
        userId: user.id,
        name: supplierName,
        categoryId,
        contactMethods: {
          create: {
            type: "EMAIL",
            value: candidate.email,
            isPrimary: true,
          },
        },
      },
      include: {
        category: true,
        contactMethods: true,
      },
    });

    // Update candidate status
    await prisma.supplierCandidate.update({
      where: { id: candidateId },
      data: {
        status: "ACCEPTED",
        supplierId: supplier.id,
      },
    });

    return c.json({ success: true, supplier });
  })

  // POST /api/supplier-candidates/:id/dismiss - Dismiss a candidate
  .post("/:id/dismiss", async (c) => {
    const auth = getAuth(c);
    const candidateId = c.req.param("id");

    if (!auth?.userId) return c.json({ error: "Unauthorized" }, 401);

    const user = await prisma.user.findUnique({ where: { clerkId: auth.userId } });
    if (!user) return c.json({ error: "User not found" }, 404);

    const candidate = await prisma.supplierCandidate.findUnique({
      where: { id: candidateId },
    });

    if (!candidate || candidate.userId !== user.id) {
      return c.json({ error: "Candidate not found" }, 404);
    }

    await prisma.supplierCandidate.update({
      where: { id: candidateId },
      data: { status: "DISMISSED" },
    });

    return c.json({ success: true });
  })

  // POST /api/supplier-candidates/bulk-accept - Accept multiple candidates
  .post("/bulk-accept", zValidator("json", bulkAcceptSchema), async (c) => {
    const auth = getAuth(c);
    if (!auth?.userId) return c.json({ error: "Unauthorized" }, 401);

    const user = await prisma.user.findUnique({ where: { clerkId: auth.userId } });
    if (!user) return c.json({ error: "User not found" }, 404);

    const data = c.req.valid("json");
    const results: { candidateId: string; supplierId?: string; error?: string }[] = [];

    for (const candidateId of data.candidateIds) {
      try {
        const candidate = await prisma.supplierCandidate.findUnique({
          where: { id: candidateId },
        });

        if (!candidate || candidate.userId !== user.id) {
          results.push({ candidateId, error: "Not found" });
          continue;
        }

        if (candidate.status === "ACCEPTED") {
          results.push({ candidateId, supplierId: candidate.supplierId || undefined, error: "Already accepted" });
          continue;
        }

        // Determine name and category
        const supplierName =
          candidate.suggestedSupplierName ||
          candidate.displayName ||
          candidate.email.split("@")[0];

        let categoryId: string | null = null;
        if (candidate.suggestedCategoryName) {
          const category = await getOrCreateCategory(user.id, candidate.suggestedCategoryName);
          categoryId = category?.id || null;
        }

        // Create Supplier
        const supplier = await prisma.supplier.create({
          data: {
            userId: user.id,
            name: supplierName,
            categoryId,
            contactMethods: {
              create: {
                type: "EMAIL",
                value: candidate.email,
                isPrimary: true,
              },
            },
          },
        });

        // Update candidate
        await prisma.supplierCandidate.update({
          where: { id: candidateId },
          data: {
            status: "ACCEPTED",
            supplierId: supplier.id,
          },
        });

        results.push({ candidateId, supplierId: supplier.id });
      } catch (err: any) {
        results.push({ candidateId, error: err.message || "Failed" });
      }
    }

    return c.json({
      success: true,
      accepted: results.filter((r) => r.supplierId && !r.error).length,
      failed: results.filter((r) => r.error).length,
      results,
    });
  })

  // POST /api/supplier-candidates/bulk-dismiss - Dismiss multiple candidates
  .post("/bulk-dismiss", zValidator("json", bulkAcceptSchema), async (c) => {
    const auth = getAuth(c);
    if (!auth?.userId) return c.json({ error: "Unauthorized" }, 401);

    const user = await prisma.user.findUnique({ where: { clerkId: auth.userId } });
    if (!user) return c.json({ error: "User not found" }, 404);

    const data = c.req.valid("json");

    await prisma.supplierCandidate.updateMany({
      where: {
        id: { in: data.candidateIds },
        userId: user.id,
      },
      data: { status: "DISMISSED" },
    });

    return c.json({ success: true });
  })

  // POST /api/supplier-candidates/enrich - Enrich candidates with AI
  .post("/enrich", zValidator("json", enrichCandidatesSchema), async (c) => {
    const auth = getAuth(c);
    if (!auth?.userId) return c.json({ error: "Unauthorized" }, 401);

    const user = await prisma.user.findUnique({ where: { clerkId: auth.userId } });
    if (!user) return c.json({ error: "User not found" }, 404);

    const data = c.req.valid("json");

    // Verify all candidates belong to user
    const candidates = await prisma.supplierCandidate.findMany({
      where: {
        id: { in: data.candidateIds },
        userId: user.id,
      },
      select: { id: true },
    });

    const validIds = candidates.map((c) => c.id);
    if (validIds.length === 0) {
      return c.json({ error: "No valid candidates" }, 400);
    }

    // Start enrichment (this could be slow, so we return immediately and process async)
    // For now, we'll do it synchronously but with rate limiting
    const result = await enrichCandidatesBatch(validIds, {
      scrapeDomain: data.scrapeDomain,
      delayMs: 500,
    });

    return c.json({
      success: true,
      enriched: result.enriched,
      errors: result.errors,
    });
  })

  // DELETE /api/supplier-candidates/:id - Delete a candidate
  .delete("/:id", async (c) => {
    const auth = getAuth(c);
    const candidateId = c.req.param("id");

    if (!auth?.userId) return c.json({ error: "Unauthorized" }, 401);

    const user = await prisma.user.findUnique({ where: { clerkId: auth.userId } });
    if (!user) return c.json({ error: "User not found" }, 404);

    const candidate = await prisma.supplierCandidate.findUnique({
      where: { id: candidateId },
    });

    if (!candidate || candidate.userId !== user.id) {
      return c.json({ error: "Candidate not found" }, 404);
    }

    await prisma.supplierCandidate.delete({ where: { id: candidateId } });

    return c.json({ success: true });
  });

export default app;

