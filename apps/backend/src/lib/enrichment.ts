import { prisma } from "../db";
import crypto from "crypto";

interface EnrichmentInput {
  email: string;
  domain: string;
  displayName?: string | null;
  subjectSamples?: string[];
}

interface EnrichmentResult {
  suggestedSupplierName: string | null;
  suggestedCategoryName: string | null;
  confidence: number;
  reason: string;
}

// Create a hash of input for caching
function hashInput(input: EnrichmentInput): string {
  const str = JSON.stringify({
    email: input.email,
    domain: input.domain,
    displayName: input.displayName || "",
    subjects: (input.subjectSamples || []).slice(0, 5).join("|"),
  });
  return crypto.createHash("sha256").update(str).digest("hex").slice(0, 32);
}

// Check if we have a cached domain info
async function getDomainInfo(domain: string) {
  return prisma.domainInfo.findUnique({ where: { domain } });
}

// Save/update domain info
async function saveDomainInfo(
  domain: string,
  data: {
    title?: string;
    description?: string;
    industry?: string;
    services?: string;
    fetchError?: string;
  }
) {
  return prisma.domainInfo.upsert({
    where: { domain },
    create: {
      domain,
      ...data,
      lastFetchedAt: new Date(),
    },
    update: {
      ...data,
      lastFetchedAt: new Date(),
    },
  });
}

// Simple domain scraping (fetch homepage and extract metadata)
async function scrapeDomain(domain: string): Promise<{
  title?: string;
  description?: string;
  error?: string;
}> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const res = await fetch(`https://${domain}`, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; DaybreakBot/1.0)",
      },
    });
    clearTimeout(timeout);

    if (!res.ok) {
      return { error: `HTTP ${res.status}` };
    }

    const html = await res.text();

    // Extract title
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim().slice(0, 200) : undefined;

    // Extract meta description
    const descMatch = html.match(
      /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i
    );
    const description = descMatch ? descMatch[1].trim().slice(0, 500) : undefined;

    return { title, description };
  } catch (err: any) {
    return { error: err.message || "Fetch failed" };
  }
}

// Call OpenAI to enrich supplier candidate
async function callOpenAI(
  input: EnrichmentInput,
  domainContext?: { title?: string; description?: string }
): Promise<EnrichmentResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY not configured");
  }

  const model = process.env.ENRICHMENT_MODEL || "gpt-4o-mini";

  // Build context
  let context = `Email: ${input.email}\nDomain: ${input.domain}`;
  if (input.displayName) {
    context += `\nDisplay Name: ${input.displayName}`;
  }
  if (input.subjectSamples && input.subjectSamples.length > 0) {
    context += `\nRecent email subjects:\n${input.subjectSamples.map((s) => `- ${s}`).join("\n")}`;
  }
  if (domainContext?.title) {
    context += `\nWebsite title: ${domainContext.title}`;
  }
  if (domainContext?.description) {
    context += `\nWebsite description: ${domainContext.description}`;
  }

  const systemPrompt = `You are a helpful assistant that categorizes business contacts.
Given information about an email contact, determine:
1. The likely business/supplier name
2. The industry or service category (e.g., Florist, Photographer, Caterer, Venue, DJ, etc.)
3. Your confidence level (0-1)

Respond ONLY with valid JSON in this exact format:
{
  "suggestedSupplierName": "Business Name or null",
  "suggestedCategoryName": "Category or null",
  "confidence": 0.8,
  "reason": "Brief explanation"
}`;

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
        { role: "user", content: context },
      ],
      temperature: 0.3,
      max_tokens: 200,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI API error: ${err}`);
  }

  const data = await res.json() as { choices?: { message?: { content?: string } }[] };
  const content = data.choices?.[0]?.message?.content || "{}";

  try {
    const parsed = JSON.parse(content);
    return {
      suggestedSupplierName: parsed.suggestedSupplierName || null,
      suggestedCategoryName: parsed.suggestedCategoryName || null,
      confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.5,
      reason: parsed.reason || "",
    };
  } catch {
    return {
      suggestedSupplierName: null,
      suggestedCategoryName: null,
      confidence: 0,
      reason: "Failed to parse LLM response",
    };
  }
}

/**
 * Enrich a supplier candidate with AI suggestions
 */
export async function enrichSupplierCandidate(
  candidateId: string,
  opts?: { scrapeDomain?: boolean; subjectSamples?: string[] }
): Promise<EnrichmentResult> {
  const candidate = await prisma.supplierCandidate.findUnique({
    where: { id: candidateId },
  });

  if (!candidate) {
    throw new Error("Candidate not found");
  }

  const input: EnrichmentInput = {
    email: candidate.email,
    domain: candidate.domain,
    displayName: candidate.displayName,
    subjectSamples: opts?.subjectSamples,
  };

  const inputHash = hashInput(input);

  // Check for cached enrichment
  const cachedJob = await prisma.supplierEnrichmentJob.findFirst({
    where: { inputHash, resultJson: { not: null } },
    orderBy: { createdAt: "desc" },
  });

  if (cachedJob && cachedJob.resultJson) {
    const cached = cachedJob.resultJson as unknown as EnrichmentResult;
    // Update candidate with cached result
    await prisma.supplierCandidate.update({
      where: { id: candidateId },
      data: {
        suggestedSupplierName: cached.suggestedSupplierName,
        suggestedCategoryName: cached.suggestedCategoryName,
        confidence: cached.confidence,
        enrichmentJson: cachedJob.resultJson,
      },
    });
    return cached;
  }

  // Check for domain info
  let domainContext: { title?: string; description?: string } | undefined;

  if (opts?.scrapeDomain) {
    let domainInfo = await getDomainInfo(candidate.domain);

    if (!domainInfo || !domainInfo.lastFetchedAt) {
      // Scrape domain
      const scraped = await scrapeDomain(candidate.domain);
      domainInfo = await saveDomainInfo(candidate.domain, {
        title: scraped.title,
        description: scraped.description,
        fetchError: scraped.error,
      });
    }

    if (domainInfo.title || domainInfo.description) {
      domainContext = {
        title: domainInfo.title || undefined,
        description: domainInfo.description || undefined,
      };
    }
  }

  // Call LLM
  const result = await callOpenAI(input, domainContext);

  // Save enrichment job
  await prisma.supplierEnrichmentJob.create({
    data: {
      userId: candidate.userId,
      candidateId: candidate.id,
      provider: "openai",
      model: process.env.ENRICHMENT_MODEL || "gpt-4o-mini",
      promptVersion: "v1",
      inputHash,
      resultJson: result,
      confidence: result.confidence,
    },
  });

  // Update candidate
  await prisma.supplierCandidate.update({
    where: { id: candidateId },
    data: {
      suggestedSupplierName: result.suggestedSupplierName,
      suggestedCategoryName: result.suggestedCategoryName,
      confidence: result.confidence,
      enrichmentJson: result,
    },
  });

  return result;
}

/**
 * Batch enrich multiple candidates (with rate limiting)
 */
export async function enrichCandidatesBatch(
  candidateIds: string[],
  opts?: { scrapeDomain?: boolean; delayMs?: number }
): Promise<{ enriched: number; errors: number }> {
  const delayMs = opts?.delayMs || 500;
  let enriched = 0;
  let errors = 0;

  for (const id of candidateIds) {
    try {
      await enrichSupplierCandidate(id, { scrapeDomain: opts?.scrapeDomain });
      enriched++;
    } catch (err) {
      console.error(`Enrichment error for ${id}:`, err);
      errors++;
    }

    // Rate limit
    if (delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  return { enriched, errors };
}

