import { Hono } from "hono";
import { getAuth } from "@hono/clerk-auth";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { prisma } from "../db";
import { enrichCandidatesParallel, autoImportCandidates, CATEGORY_SLUGS } from "../lib/enrichment";

const acceptCandidateSchema = z.object({
  supplierName: z.string().min(1).optional(), // Override suggested name
  categories: z.array(z.string()).optional(), // Override suggested categories (slugs)
  primaryCategory: z.string().optional(), // Override primary category
});

const enrichCandidatesSchema = z.object({
  eventContext: z.string().optional(),
});

const bulkAcceptSchema = z.object({
  candidateIds: z.array(z.string()).min(1).max(100),
});

const autoImportSchema = z.object({
  threshold: z.number().min(0).max(1).optional(),
});

// Helper: slugify category name
function slugify(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
}

// Helper: get category by slug (system or user-created)
async function getCategoryBySlug(slug: string) {
  return prisma.supplierCategory.findUnique({ where: { slug } });
}

// Helper: extract domain from email
function extractDomain(email: string): string {
  const parts = email.split("@");
  return parts.length === 2 ? parts[1].toLowerCase() : "";
}

// Personal email domains (no domain grouping)
const PERSONAL_DOMAINS = new Set([
  "gmail.com", "yahoo.com", "hotmail.com", "outlook.com",
  "icloud.com", "aol.com", "protonmail.com", "me.com",
  "live.com", "msn.com",
]);

// Helper: create supplier with contact and category links
async function createSupplierWithCategories(
  userId: string,
  supplierName: string,
  contactName: string,
  email: string,
  categorySlugs: string[],
  primarySlug: string | null
) {
  const domain = extractDomain(email);
  const isPersonal = PERSONAL_DOMAINS.has(domain);

  // Create supplier
  const supplier = await prisma.supplier.create({
    data: {
      userId,
      name: supplierName,
      domain: isPersonal ? null : domain,
      isPersonalDomain: isPersonal,
    },
  });

  // Create contact
  const contact = await prisma.supplierContact.create({
    data: {
      supplierId: supplier.id,
      name: contactName || email.split("@")[0],
      email,
      isPrimary: true,
    },
  });

  // Create email contact method
  await prisma.contactMethod.create({
    data: {
      contactId: contact.id,
      type: "EMAIL",
      value: email,
      isPrimary: true,
    },
  });

  // Link categories
  for (const slug of categorySlugs) {
    const category = await getCategoryBySlug(slug);
    if (category) {
      await prisma.supplierToCategory.create({
        data: {
          supplierId: supplier.id,
          categoryId: category.id,
          isPrimary: slug === primarySlug,
        },
      });
    }
  }

  // Fetch with categories and contacts
  return prisma.supplier.findUnique({
    where: { id: supplier.id },
    include: {
      categories: { include: { category: true } },
      contacts: { include: { contactMethods: true } },
    },
  });
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
        enrichmentRuns: {
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

    // Determine categories (use provided, or fall back to AI suggestions)
    const categorySlugs = data.categories || candidate.suggestedCategories || [];
    const primarySlug = data.primaryCategory || candidate.primaryCategory || categorySlugs[0] || null;

    // Create Supplier with categories
    const contactName = candidate.suggestedContactName || candidate.displayName || candidate.email.split("@")[0];
    const supplier = await createSupplierWithCategories(
      user.id,
      supplierName,
      contactName,
      candidate.email,
      categorySlugs,
      primarySlug
    );

    if (!supplier) {
      return c.json({ error: "Failed to create supplier" }, 500);
    }

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

        // Determine name and categories
        const supplierName =
          candidate.suggestedSupplierName ||
          candidate.displayName ||
          candidate.email.split("@")[0];
        const contactName = candidate.suggestedContactName || candidate.displayName || candidate.email.split("@")[0];

        const categorySlugs = candidate.suggestedCategories || [];
        const primarySlug = candidate.primaryCategory || categorySlugs[0] || null;

        // Create Supplier with categories
        const supplier = await createSupplierWithCategories(
          user.id,
          supplierName,
          contactName,
          candidate.email,
          categorySlugs,
          primarySlug
        );

        if (!supplier) {
          results.push({ candidateId, error: "Failed to create" });
          continue;
        }

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

  // POST /api/supplier-candidates/enrich - Enrich candidates with AI (parallel batch)
  .post("/enrich", zValidator("json", enrichCandidatesSchema), async (c) => {
    const auth = getAuth(c);
    if (!auth?.userId) return c.json({ error: "Unauthorized" }, 401);

    const user = await prisma.user.findUnique({ where: { clerkId: auth.userId } });
    if (!user) return c.json({ error: "User not found" }, 404);

    const data = c.req.valid("json");
    const eventContext = data.eventContext || user.eventContext || "";

    // Run parallel batch enrichment
    const result = await enrichCandidatesParallel(user.id, eventContext);

    return c.json({
      success: true,
      enriched: result.enriched,
      errors: result.errors,
    });
  })

  // POST /api/supplier-candidates/auto-import - Auto-import high-confidence candidates
  .post("/auto-import", zValidator("json", autoImportSchema), async (c) => {
    const auth = getAuth(c);
    if (!auth?.userId) return c.json({ error: "Unauthorized" }, 401);

    const user = await prisma.user.findUnique({ where: { clerkId: auth.userId } });
    if (!user) return c.json({ error: "User not found" }, 404);

    const data = c.req.valid("json");
    
    const result = await autoImportCandidates(user.id, { threshold: data.threshold });

    return c.json({
      success: true,
      imported: result.imported,
      dismissed: result.dismissed,
      needsReview: result.needsReview,
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


