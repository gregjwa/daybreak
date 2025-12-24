import { prisma } from "../db";
import { isPersonalDomain } from "./gmail-backfill";
import type { EmailContext } from "./email-utils";

// ============================================================================
// CATEGORY CONFIGURATION
// ============================================================================

export const CATEGORY_SLUGS = [
  "venue", "catering", "bar-service", "photography", "videography", "dj", "live-music",
  "officiant", "planner", "florist", "decor", "lighting", "rentals", "signage", "stationery",
  "hair-stylist", "makeup-artist", "dress-attire", "jewelry", "photo-booth", "entertainment",
  "games", "transportation", "bakery", "ice-cream", "coffee", "food-truck", "av-production",
  "live-streaming", "security", "valet", "childcare", "pet-services", "favors", "calligraphy",
  "travel", "insurance", "speakers", "team-building", "exhibitor", "registration", "swag",
];

const CATEGORY_LIST = `
Venue, Catering, Bar Service, Photography, Videography, DJ, Live Music, Officiant, Planner,
Florist, Decor, Lighting, Rentals, Signage, Stationery, Hair Stylist, Makeup Artist, Dress/Attire,
Jewelry, Photo Booth, Entertainment, Games, Transportation, Bakery, Ice Cream, Coffee, Food Truck,
AV Production, Live Streaming, Security, Valet, Childcare, Pet Services, Favors, Calligraphy,
Travel, Insurance, Speakers, Team Building, Exhibitor, Registration, Swag
`.trim();

function nameToSlug(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
}

// ============================================================================
// TYPES
// ============================================================================

interface CandidateForEnrichment {
  id: string;
  email: string;
  domain: string;
  displayName?: string | null;
  emailContextJson?: EmailContext[] | null;
}

interface EnrichmentResult {
  suggestedCompanyName: string | null;
  suggestedContactName: string | null;
  suggestedRole: string | null;
  categories: string[];
  primaryCategory: string | null;
  confidence: number;
  isRelevant: boolean;
}

interface BatchEnrichmentMetrics {
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  cost: number;
}

// ============================================================================
// A/B TESTING INFRASTRUCTURE
// ============================================================================

const PROMPT_VERSION = "v3-direction-aware";

/**
 * Get or create the active enrichment experiment
 */
async function getOrCreateActiveExperiment(): Promise<{ id: string; promptVersion: string }> {
  const model = process.env.ENRICHMENT_MODEL || "gpt-4o-mini";
  
  // Look for active experiment with this model/prompt
  let experiment = await prisma.enrichmentExperiment.findFirst({
    where: {
      isActive: true,
      promptVersion: PROMPT_VERSION,
    },
  });

  if (!experiment) {
    experiment = await prisma.enrichmentExperiment.create({
      data: {
        name: `${model} - ${PROMPT_VERSION}`,
        description: "Enrichment with email body snippets for context",
        promptVersion: PROMPT_VERSION,
        modelConfig: { model, maxCompletionTokens: 2000 },
        isActive: true,
      },
    });
    console.log(`[enrichment] Created new experiment: ${experiment.name}`);
  }

  return { id: experiment.id, promptVersion: experiment.promptVersion };
}

/**
 * Log an enrichment run with full metrics
 */
async function logEnrichmentRun(params: {
  experimentId: string;
  candidateId: string;
  model: string;
  promptVersion: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  cost: number;
  rawPrompt: string;
  rawResponse: string;
  resultJson: object | null;
}): Promise<string> {
  const run = await prisma.enrichmentRun.create({
    data: {
      experimentId: params.experimentId,
      candidateId: params.candidateId,
      model: params.model,
      promptVersion: params.promptVersion,
      inputTokens: params.inputTokens,
      outputTokens: params.outputTokens,
      latencyMs: params.latencyMs,
      cost: params.cost,
      rawPrompt: params.rawPrompt,
      rawResponse: params.rawResponse,
      resultJson: params.resultJson ?? undefined,
    },
  });
  return run.id;
}

/**
 * Calculate cost based on model and tokens
 * Prices are approximate and should be updated as needed
 */
function calculateCost(model: string, inputTokens: number, outputTokens: number): number {
  // Prices per 1M tokens (as of late 2024)
  const pricing: Record<string, { input: number; output: number }> = {
    "gpt-4o-mini": { input: 0.15, output: 0.60 },
    "gpt-4o": { input: 2.50, output: 10.00 },
    "gpt-5-mini": { input: 0.30, output: 1.20 }, // Estimated
    "gpt-5": { input: 5.00, output: 15.00 }, // Estimated
  };

  const price = pricing[model] || { input: 0.50, output: 2.00 };
  return (inputTokens * price.input + outputTokens * price.output) / 1_000_000;
}

// ============================================================================
// ENRICHMENT PROMPT BUILDING
// ============================================================================

/**
 * Build the system prompt for enrichment
 */
function buildSystemPrompt(eventContext: string): string {
  return `You classify email contacts for an event planner to identify potential SUPPLIERS/VENDORS who provide services TO the user.

USER'S EVENT TYPES: "${eventContext || "Various events (weddings, corporate, parties)"}"

AVAILABLE CATEGORIES (pick from this exact list, can assign multiple per contact):
${CATEGORY_LIST}

You will receive contacts with:
- Their email and domain
- Snippets from actual emails exchanged (subject + body content)

CRITICAL: Determine WHO IS PROVIDING SERVICES TO WHOM:
- A SUPPLIER is someone who provides services TO the user for events
- Look for: quotes, invoices, pricing, availability, bookings, contracts
- The email should show THEM offering services/products TO the user

Based on this, determine for each contact:
1. suggestedCompanyName: The business/company name
2. suggestedContactName: The individual person's name if identifiable
3. suggestedRole: Their role ("Owner", "Sales Rep", "Photographer", etc.)
4. categories: From the list above - ONLY if they clearly provide these services
5. primaryCategory: Main category if multiple apply
6. confidence: 0-1 based on how clear the supplier relationship is
7. isRelevant: TRUE ONLY if this is someone who provides event services TO the user

EXAMPLES - Mark isRelevant=TRUE:
- Email: "Here's the quote for your wedding photography - $3500 for 8 hours" → Photography supplier
- Email: "Confirming your venue booking for March 15th" → Venue supplier
- Email: "The catering menu you requested for 200 guests" → Catering supplier

EXAMPLES - Mark isRelevant=FALSE:
- Email where USER is pitching THEIR business to someone → Investor/partner, NOT a supplier
- Email: "Great to hear about your startup" → Investor/partner
- Email: "Would love to discuss investment" → Investor
- Email: "Let's catch up for coffee" → Personal contact
- Email: "Your Amazon order has shipped" → E-commerce, not event supplier
- Email: "Newsletter: 10 tips for..." → Newsletter/spam
- Email: "Meeting notes from yesterday" → Colleague/internal
- Email discussing fundraising, investment, startups → NOT a supplier
- Email where user is describing what THEY are building → Networking/sales, NOT supplier

RULES:
1. Direction matters: The contact must be offering services TO the user, not the other way around
2. Context matters: Just because an email mentions "studios" or "creative" doesn't make them a supplier
3. Transactional signals: Look for quotes, pricing, bookings, availability, deliverables
4. Be conservative: When in doubt, mark isRelevant=false. It's better to miss one than to include non-suppliers.
5. Categories ONLY if they match the supplier's actual services

Respond with ONLY a valid JSON array:
[{"index": 1, "suggestedCompanyName": null, "suggestedContactName": null, "suggestedRole": null, "categories": [], "primaryCategory": null, "confidence": 0.0, "isRelevant": false}]`;
}

/**
 * Build the user message with candidates and their email context
 */
function buildUserMessage(candidates: CandidateForEnrichment[]): string {
  const lines: string[] = [`Classify these ${candidates.length} contacts:\n`];

  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];
    lines.push(`${i + 1}. Email: ${c.email}, Domain: ${c.domain}`);
    
    if (c.displayName) {
      lines.push(`   Name from email header: ${c.displayName}`);
    }

    const emailContext = c.emailContextJson as EmailContext[] | null;
    if (emailContext && emailContext.length > 0) {
      lines.push(`   Recent emails:`);
      for (const ctx of emailContext.slice(0, 3)) {
        const content = ctx.content ? ` - "${ctx.content.slice(0, 150)}${ctx.content.length > 150 ? '...' : ''}"` : '';
        lines.push(`   - "${ctx.subject}"${content}`);
      }
    }
    lines.push('');
  }

  return lines.join('\n');
}

// ============================================================================
// CORE ENRICHMENT LOGIC
// ============================================================================

function chunk<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

/**
 * Call OpenAI with batch of candidates and log results
 */
async function enrichBatchWithLogging(
  candidates: CandidateForEnrichment[],
  eventContext: string,
  experimentId: string
): Promise<{ results: Map<string, EnrichmentResult>; metrics: BatchEnrichmentMetrics }> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY not configured");
  }

  const model = process.env.ENRICHMENT_MODEL || "gpt-4o-mini";
  const systemPrompt = buildSystemPrompt(eventContext);
  const userMessage = buildUserMessage(candidates);

  const startTime = Date.now();

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
        { role: "user", content: userMessage },
      ],
      max_completion_tokens: 2000,
    }),
  });

  const latencyMs = Date.now() - startTime;

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI API error: ${err}`);
  }

  const data = await res.json() as {
    choices?: { message?: { content?: string } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };

  const content = data.choices?.[0]?.message?.content || "[]";
  const inputTokens = data.usage?.prompt_tokens || 0;
  const outputTokens = data.usage?.completion_tokens || 0;
  const cost = calculateCost(model, inputTokens, outputTokens);

  // Parse results
  const results = new Map<string, EnrichmentResult>();
  let parsedArray: unknown[] = [];

  try {
    let jsonStr = content;
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1];
    }
    
    parsedArray = JSON.parse(jsonStr);
    
    if (Array.isArray(parsedArray)) {
      for (const item of parsedArray as Record<string, unknown>[]) {
        const index = ((item.index as number) || 1) - 1;
        if (index >= 0 && index < candidates.length) {
          const candidate = candidates[index];
          
          const categorySlugs = ((item.categories as string[]) || [])
            .map((c: string) => nameToSlug(c))
            .filter((s: string) => CATEGORY_SLUGS.includes(s));
          
          const primarySlug = item.primaryCategory ? nameToSlug(item.primaryCategory as string) : null;
          
          results.set(candidate.id, {
            suggestedCompanyName: (item.suggestedCompanyName as string) || null,
            suggestedContactName: (item.suggestedContactName as string) || null,
            suggestedRole: (item.suggestedRole as string) || null,
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

  // Fill in defaults for missing candidates
  for (const candidate of candidates) {
    if (!results.has(candidate.id)) {
      results.set(candidate.id, {
        suggestedCompanyName: null,
        suggestedContactName: null,
        suggestedRole: null,
        categories: [],
        primaryCategory: null,
        confidence: 0,
        isRelevant: false,
      });
    }
  }

  // Log each enrichment run
  for (const candidate of candidates) {
    const result = results.get(candidate.id);
    try {
      await logEnrichmentRun({
        experimentId,
        candidateId: candidate.id,
        model,
        promptVersion: PROMPT_VERSION,
        inputTokens: Math.round(inputTokens / candidates.length),
        outputTokens: Math.round(outputTokens / candidates.length),
        latencyMs: Math.round(latencyMs / candidates.length),
        cost: cost / candidates.length,
        rawPrompt: `${systemPrompt}\n\n---USER---\n\n${userMessage}`,
        rawResponse: content,
        resultJson: result || null,
      });
    } catch (logErr) {
      console.error(`[enrichment] Failed to log run for ${candidate.id}:`, logErr);
    }
  }

  return {
    results,
    metrics: { inputTokens, outputTokens, latencyMs, cost },
  };
}

/**
 * Enrich candidates in parallel batches with A/B logging
 */
export async function enrichCandidatesParallel(
  userId: string,
  eventContext: string,
  opts?: { batchSize?: number; concurrency?: number }
): Promise<{ enriched: number; errors: number; totalCost: number }> {
  const batchSize = opts?.batchSize || 8; // Slightly smaller due to email context
  const concurrency = opts?.concurrency || 5;

  // Get or create experiment
  const experiment = await getOrCreateActiveExperiment();

  // Get all unenriched candidates WITH email context
  const candidates = await prisma.supplierCandidate.findMany({
    where: {
      userId,
      status: "NEW",
      confidence: null,
    },
    select: {
      id: true,
      email: true,
      domain: true,
      displayName: true,
      emailContextJson: true,
    },
  });

  if (candidates.length === 0) {
    return { enriched: 0, errors: 0, totalCost: 0 };
  }

  console.log(`[enrichment] Starting parallel enrichment for ${candidates.length} candidates`);

  const batches = chunk(candidates, batchSize);
  let enriched = 0;
  let errors = 0;
  let totalCost = 0;

  for (let i = 0; i < batches.length; i += concurrency) {
    const wave = batches.slice(i, i + concurrency);
    console.log(`[enrichment] Processing wave ${Math.floor(i / concurrency) + 1}/${Math.ceil(batches.length / concurrency)}`);

    const waveResults = await Promise.allSettled(
      wave.map(batch => enrichBatchWithLogging(
        batch as CandidateForEnrichment[],
        eventContext,
        experiment.id
      ))
    );

    for (let j = 0; j < waveResults.length; j++) {
      const result = waveResults[j];
      const batch = wave[j];

      if (result.status === "fulfilled") {
        const { results: resultMap, metrics } = result.value;
        totalCost += metrics.cost;

        for (const candidate of batch) {
          const enrichResult = resultMap.get(candidate.id);
          if (enrichResult) {
            try {
              await prisma.supplierCandidate.update({
                where: { id: candidate.id },
                data: {
                  suggestedSupplierName: enrichResult.suggestedCompanyName,
                  suggestedContactName: enrichResult.suggestedContactName,
                  suggestedRole: enrichResult.suggestedRole,
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

  console.log(`[enrichment] Completed: ${enriched} enriched, ${errors} errors, $${totalCost.toFixed(4)} cost`);
  return { enriched, errors, totalCost };
}

// ============================================================================
// AUTO-IMPORT (COMPANY/CONTACT MODEL)
// ============================================================================

/**
 * Auto-import high-confidence relevant candidates as Suppliers + Contacts
 * - Groups by domain for business emails
 * - Creates standalone for personal email domains
 */
export async function autoImportCandidates(
  userId: string,
  opts?: { threshold?: number }
): Promise<{ imported: number; dismissed: number; needsReview: number }> {
  const threshold = opts?.threshold || 0.65;

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

  // Group candidates by domain for business emails
  const domainGroups = new Map<string, typeof candidates>();
  const personalCandidates: typeof candidates = [];

  for (const candidate of candidates) {
    if (!candidate.isRelevant) {
      // Auto-dismiss irrelevant
      await prisma.supplierCandidate.update({
        where: { id: candidate.id },
        data: { status: "DISMISSED" },
      });
      dismissed++;
      continue;
    }

    if ((candidate.confidence || 0) < threshold) {
      needsReview++;
      continue;
    }

    // Separate personal domain candidates
    if (isPersonalDomain(candidate.domain)) {
      personalCandidates.push(candidate);
    } else {
      const group = domainGroups.get(candidate.domain) || [];
      group.push(candidate);
      domainGroups.set(candidate.domain, group);
    }
  }

  // Process business domain groups (create one Supplier per domain)
  for (const [domain, group] of domainGroups) {
    try {
      // Use the highest confidence candidate's suggested name
      const bestCandidate = group.reduce((a, b) => 
        (a.confidence || 0) > (b.confidence || 0) ? a : b
      );

      // Check if supplier with this domain already exists
      let supplier = await prisma.supplier.findFirst({
        where: { userId, domain },
      });

      if (!supplier) {
        // Collect all unique categories from the group
        const allCategories = new Set<string>();
        let primaryCategory: string | null = null;
        
        for (const c of group) {
          for (const cat of c.suggestedCategories || []) {
            allCategories.add(cat);
          }
          if (!primaryCategory && c.primaryCategory) {
            primaryCategory = c.primaryCategory;
          }
        }

        supplier = await prisma.supplier.create({
          data: {
            userId,
            name: bestCandidate.suggestedSupplierName || domain.split('.')[0],
            domain,
            isPersonalDomain: false,
          },
        });

        // Link categories
        for (const slug of allCategories) {
          const category = await prisma.supplierCategory.findUnique({ where: { slug } });
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
      }

      // Create contacts for each candidate in the group
      for (const candidate of group) {
        const contact = await prisma.supplierContact.create({
          data: {
            supplierId: supplier.id,
            name: candidate.suggestedContactName || candidate.displayName || candidate.email.split('@')[0],
            email: candidate.email,
            role: candidate.suggestedRole,
            isPrimary: candidate === bestCandidate,
          },
        });

        // Create contact method
        await prisma.contactMethod.create({
          data: {
            contactId: contact.id,
            type: "EMAIL",
            value: candidate.email,
            isPrimary: true,
          },
        });

        await prisma.supplierCandidate.update({
          where: { id: candidate.id },
          data: { status: "ACCEPTED", supplierId: supplier.id },
        });

        imported++;
      }
    } catch (err) {
      console.error(`[auto-import] Failed to import domain ${domain}:`, err);
      needsReview += group.length;
    }
  }

  // Process personal domain candidates (each becomes standalone Supplier)
  for (const candidate of personalCandidates) {
    try {
      const supplierName = candidate.suggestedSupplierName || 
                           candidate.suggestedContactName || 
                           candidate.displayName || 
                           candidate.email.split('@')[0];

      const supplier = await prisma.supplier.create({
        data: {
          userId,
          name: supplierName,
          domain: null, // Personal domains don't get grouped
          isPersonalDomain: true,
        },
      });

      // Link categories
      for (const slug of candidate.suggestedCategories || []) {
        const category = await prisma.supplierCategory.findUnique({ where: { slug } });
        if (category) {
          await prisma.supplierToCategory.create({
            data: {
              supplierId: supplier.id,
              categoryId: category.id,
              isPrimary: slug === candidate.primaryCategory,
            },
          });
        }
      }

      // Create contact
      const contact = await prisma.supplierContact.create({
        data: {
          supplierId: supplier.id,
          name: candidate.suggestedContactName || candidate.displayName || candidate.email.split('@')[0],
          email: candidate.email,
          role: candidate.suggestedRole,
          isPrimary: true,
        },
      });

      // Create contact method
      await prisma.contactMethod.create({
        data: {
          contactId: contact.id,
          type: "EMAIL",
          value: candidate.email,
          isPrimary: true,
        },
      });

      await prisma.supplierCandidate.update({
        where: { id: candidate.id },
        data: { status: "ACCEPTED", supplierId: supplier.id },
      });

      imported++;
    } catch (err) {
      console.error(`[auto-import] Failed to import ${candidate.email}:`, err);
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
): Promise<{ enriched: number; imported: number; dismissed: number; needsReview: number; totalCost: number }> {
  const run = await prisma.backfillRun.findUnique({ where: { id: runId } });
  if (!run) throw new Error("BackfillRun not found");

  await prisma.backfillRun.update({
    where: { id: runId },
    data: { enrichmentStatus: "RUNNING" },
  });

  try {
    const enrichResult = await enrichCandidatesParallel(run.userId, eventContext);

    await prisma.backfillRun.update({
      where: { id: runId },
      data: { enrichedCount: enrichResult.enriched },
    });

    const importResult = await autoImportCandidates(run.userId);

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
      totalCost: enrichResult.totalCost,
    };
  } catch (err) {
    await prisma.backfillRun.update({
      where: { id: runId },
      data: { enrichmentStatus: "FAILED" },
    });
    throw err;
  }
}
