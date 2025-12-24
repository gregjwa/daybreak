import { prisma } from "../db";
import crypto from "crypto";

// System category slugs for AI to pick from
export const CATEGORY_SLUGS = [
  "venue", "catering", "bar-service", "photography", "videography", "dj", "live-music",
  "officiant", "planner", "florist", "decor", "lighting", "rentals", "signage", "stationery",
  "hair-stylist", "makeup-artist", "dress-attire", "jewelry", "photo-booth", "entertainment",
  "games", "transportation", "bakery", "ice-cream", "coffee", "food-truck", "av-production",
  "live-streaming", "security", "valet", "childcare", "pet-services", "favors", "calligraphy",
  "travel", "insurance", "speakers", "team-building", "exhibitor", "registration", "swag",
];

// Human-readable category names for the prompt
const CATEGORY_LIST = `
Venue, Catering, Bar Service, Photography, Videography, DJ, Live Music, Officiant, Planner,
Florist, Decor, Lighting, Rentals, Signage, Stationery, Hair Stylist, Makeup Artist, Dress/Attire,
Jewelry, Photo Booth, Entertainment, Games, Transportation, Bakery, Ice Cream, Coffee, Food Truck,
AV Production, Live Streaming, Security, Valet, Childcare, Pet Services, Favors, Calligraphy,
Travel, Insurance, Speakers, Team Building, Exhibitor, Registration, Swag
`.trim();

// Map display name to slug
function nameToSlug(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
}

interface CandidateInput {
  id: string;
  email: string;
  domain: string;
  displayName?: string | null;
}

interface BatchEnrichmentResult {
  suggestedName: string | null;
  categories: string[]; // Array of category slugs
  primaryCategory: string | null;
  confidence: number;
  isRelevant: boolean;
}

// Utility to chunk array
function chunk<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

// Create hash for caching
function hashBatchInput(candidates: CandidateInput[], eventContext: string): string {
  const str = JSON.stringify({
    candidates: candidates.map(c => ({ email: c.email, domain: c.domain, displayName: c.displayName })),
    eventContext,
  });
  return crypto.createHash("sha256").update(str).digest("hex").slice(0, 32);
}

/**
 * Call OpenAI with batch of candidates
 */
async function enrichBatch(
  candidates: CandidateInput[],
  eventContext: string
): Promise<Map<string, BatchEnrichmentResult>> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY not configured");
  }

  const model = process.env.ENRICHMENT_MODEL || "gpt-4o-mini";

  // Build input list
  const inputList = candidates.map((c, i) => 
    `${i + 1}. Email: ${c.email}, Domain: ${c.domain}${c.displayName ? `, Name: ${c.displayName}` : ""}`
  ).join("\n");

  const systemPrompt = `You classify email contacts for an event planner.

USER'S EVENT TYPES: "${eventContext || "Various events"}"

AVAILABLE CATEGORIES (pick from this exact list, can assign multiple per contact):
${CATEGORY_LIST}

For each contact in the list below, respond with a JSON array where each element has:
{
  "index": 1,
  "suggestedName": "Business Name" | null,
  "categories": ["Photography", "Videography"],
  "primaryCategory": "Photography" | null,
  "confidence": 0.85,
  "isRelevant": true | false
}

Rules:
- A freelancer using gmail.com can still be a supplier - judge by name/context, not email domain
- Mark isRelevant=false for: personal contacts, newsletters, unrelated businesses, marketing emails
- Only mark isRelevant=true if contact could plausibly provide services for the events described
- Categories must be from the list above
- confidence: 0-1 (how confident you are this is a relevant supplier)
- Return results in the same order as input

Respond with ONLY a valid JSON array.`;

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Classify these ${candidates.length} contacts:\n\n${inputList}` },
      ],
      temperature: 0.2,
      max_tokens: 2000,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI API error: ${err}`);
  }

  const data = await res.json() as { choices?: { message?: { content?: string } }[] };
  const content = data.choices?.[0]?.message?.content || "[]";

  // Parse results
  const results = new Map<string, BatchEnrichmentResult>();
  
  try {
    // Try to extract JSON from the response (handle markdown code blocks)
    let jsonStr = content;
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1];
    }
    
    const parsed = JSON.parse(jsonStr);
    
    if (Array.isArray(parsed)) {
      for (const item of parsed) {
        const index = (item.index || 1) - 1;
        if (index >= 0 && index < candidates.length) {
          const candidate = candidates[index];
          
          // Normalize categories to slugs
          const categorySlugs = (item.categories || [])
            .map((c: string) => nameToSlug(c))
            .filter((s: string) => CATEGORY_SLUGS.includes(s));
          
          const primarySlug = item.primaryCategory ? nameToSlug(item.primaryCategory) : null;
          
          results.set(candidate.id, {
            suggestedName: item.suggestedName || null,
            categories: categorySlugs,
            primaryCategory: primarySlug && CATEGORY_SLUGS.includes(primarySlug) ? primarySlug : categorySlugs[0] || null,
            confidence: typeof item.confidence === "number" ? item.confidence : 0.5,
            isRelevant: item.isRelevant === true,
          });
        }
      }
    }
  } catch (parseErr) {
    console.error("Failed to parse batch enrichment response:", parseErr, content);
  }

  // Fill in defaults for any missing candidates
  for (const candidate of candidates) {
    if (!results.has(candidate.id)) {
      results.set(candidate.id, {
        suggestedName: null,
        categories: [],
        primaryCategory: null,
        confidence: 0,
        isRelevant: false,
      });
    }
  }

  return results;
}

/**
 * Enrich candidates in parallel batches
 * - batchSize: candidates per LLM call (default 10)
 * - concurrency: parallel LLM calls (default 5)
 */
export async function enrichCandidatesParallel(
  userId: string,
  eventContext: string,
  opts?: { batchSize?: number; concurrency?: number }
): Promise<{ enriched: number; errors: number }> {
  const batchSize = opts?.batchSize || 10;
  const concurrency = opts?.concurrency || 5;

  // Get all unenriched candidates
  const candidates = await prisma.supplierCandidate.findMany({
    where: {
      userId,
      status: "NEW",
      confidence: null, // Not yet enriched
    },
    select: {
      id: true,
      email: true,
      domain: true,
      displayName: true,
    },
  });

  if (candidates.length === 0) {
    return { enriched: 0, errors: 0 };
  }

  console.log(`[enrichment] Starting parallel enrichment for ${candidates.length} candidates`);

  // Split into batches
  const batches = chunk(candidates, batchSize);
  let enriched = 0;
  let errors = 0;

  // Process batches in parallel waves
  for (let i = 0; i < batches.length; i += concurrency) {
    const wave = batches.slice(i, i + concurrency);
    console.log(`[enrichment] Processing wave ${Math.floor(i / concurrency) + 1}/${Math.ceil(batches.length / concurrency)} (${wave.length} batches)`);

    const waveResults = await Promise.allSettled(
      wave.map(batch => enrichBatch(batch, eventContext))
    );

    // Process results
    for (let j = 0; j < waveResults.length; j++) {
      const result = waveResults[j];
      const batch = wave[j];

      if (result.status === "fulfilled") {
        const resultMap = result.value;

        // Update candidates in DB
        for (const candidate of batch) {
          const enrichResult = resultMap.get(candidate.id);
          if (enrichResult) {
            try {
              await prisma.supplierCandidate.update({
                where: { id: candidate.id },
                data: {
                  suggestedSupplierName: enrichResult.suggestedName,
                  suggestedCategories: enrichResult.categories,
                  primaryCategory: enrichResult.primaryCategory,
                  confidence: enrichResult.confidence,
                  isRelevant: enrichResult.isRelevant,
                  enrichmentJson: enrichResult as object,
                },
              });
              enriched++;
            } catch (updateErr) {
              console.error(`[enrichment] Failed to update candidate ${candidate.id}:`, updateErr);
              errors++;
            }
          }
        }
      } else {
        console.error("[enrichment] Batch failed:", result.reason);
        errors += batch.length;
      }
    }
  }

  console.log(`[enrichment] Completed: ${enriched} enriched, ${errors} errors`);
  return { enriched, errors };
}

/**
 * Auto-import high-confidence relevant candidates as Suppliers
 */
export async function autoImportCandidates(
  userId: string,
  opts?: { threshold?: number }
): Promise<{ imported: number; dismissed: number; needsReview: number }> {
  const threshold = opts?.threshold || 0.65;

  // Get enriched candidates
  const candidates = await prisma.supplierCandidate.findMany({
    where: {
      userId,
      status: "NEW",
      confidence: { not: null },
    },
  });

  let imported = 0;
  let dismissed = 0;
  let needsReview = 0;

  for (const candidate of candidates) {
    const confidence = candidate.confidence || 0;
    const isRelevant = candidate.isRelevant === true;

    if (!isRelevant) {
      // Auto-dismiss irrelevant contacts
      await prisma.supplierCandidate.update({
        where: { id: candidate.id },
        data: { status: "DISMISSED" },
      });
      dismissed++;
    } else if (confidence >= threshold) {
      // Auto-import high-confidence relevant contacts
      try {
        // Create Supplier
        const supplier = await prisma.supplier.create({
          data: {
            userId,
            name: candidate.suggestedSupplierName || candidate.displayName || candidate.email.split("@")[0],
            contactMethods: {
              create: {
                type: "EMAIL",
                value: candidate.email,
                isPrimary: true,
              },
            },
          },
        });

        // Link categories
        const categories = candidate.suggestedCategories || [];
        const primaryCategory = candidate.primaryCategory;

        for (const slug of categories) {
          const category = await prisma.supplierCategory.findUnique({
            where: { slug },
          });

          if (category) {
            await prisma.supplierToCategory.create({
              data: {
                supplierId: supplier.id,
                categoryId: category.id,
                isPrimary: slug === primaryCategory,
              },
            });
          }
        }

        // Mark candidate as accepted
        await prisma.supplierCandidate.update({
          where: { id: candidate.id },
          data: {
            status: "ACCEPTED",
            supplierId: supplier.id,
          },
        });

        imported++;
      } catch (err) {
        console.error(`[auto-import] Failed to import ${candidate.email}:`, err);
        needsReview++;
      }
    } else {
      // Low confidence - needs human review
      needsReview++;
    }
  }

  console.log(`[auto-import] Imported: ${imported}, Dismissed: ${dismissed}, Needs review: ${needsReview}`);
  return { imported, dismissed, needsReview };
}

/**
 * Run full enrichment + auto-import pipeline for a backfill run
 */
export async function runEnrichmentPipeline(
  runId: string,
  eventContext: string
): Promise<{ enriched: number; imported: number; dismissed: number; needsReview: number }> {
  // Get the run
  const run = await prisma.backfillRun.findUnique({ where: { id: runId } });
  if (!run) throw new Error("BackfillRun not found");

  // Update status
  await prisma.backfillRun.update({
    where: { id: runId },
    data: { enrichmentStatus: "RUNNING" },
  });

  try {
    // Phase 1: Enrich candidates
    const enrichResult = await enrichCandidatesParallel(run.userId, eventContext);

    // Update enriched count
    await prisma.backfillRun.update({
      where: { id: runId },
      data: { enrichedCount: enrichResult.enriched },
    });

    // Phase 2: Auto-import
    const importResult = await autoImportCandidates(run.userId);

    // Update final status
    await prisma.backfillRun.update({
      where: { id: runId },
      data: {
        enrichmentStatus: "COMPLETED",
        autoImportedCount: importResult.imported,
      },
    });

    return {
      enriched: enrichResult.enriched,
      imported: importResult.imported,
      dismissed: importResult.dismissed,
      needsReview: importResult.needsReview,
    };
  } catch (err) {
    await prisma.backfillRun.update({
      where: { id: runId },
      data: { enrichmentStatus: "FAILED" },
    });
    throw err;
  }
}
