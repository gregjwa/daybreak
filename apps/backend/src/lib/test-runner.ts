/**
 * Test Runner
 *
 * Executes status detection tests against AI prompts/models.
 * Stores results for comparison and analysis.
 */

import { prisma } from "../db";
import { buildStatusDetectionSystemPrompt } from "./status-detection-prompt";
import { z } from "zod";

// Zod schema for structured AI responses (v1 model)
const AITestResponseSchemaV1 = z.object({
  currentStatus: z.string().nullable(),
  confidence: z.number().min(0).max(1),
  reasoning: z.string(),
});

// Zod schema for v2 model (primary/sub/actions)
const AITestResponseSchemaV2 = z.object({
  primaryStatus: z.enum(["contacting", "quoted", "booked", "completed", "cancelled"]),
  subStatus: z.string().nullable(),
  actionRequired: z.array(z.string()),
  confidence: z.number().min(0).max(1),
  reasoning: z.string(),
});

// Rate limits by model (TPM = tokens per minute, RPM = requests per minute)
// Using 90% of limits for safety margin
const MODEL_RATE_LIMITS: Record<string, { tpm: number; rpm: number }> = {
  // GPT-5.x models
  "gpt-5": { tpm: 450000, rpm: 450 },
  "gpt-5-mini": { tpm: 450000, rpm: 450 },
  "gpt-5-nano": { tpm: 180000, rpm: 450 },
  "gpt-5-pro": { tpm: 27000, rpm: 450 },
  "gpt-5.1": { tpm: 450000, rpm: 450 },
  "gpt-5.2": { tpm: 450000, rpm: 450 },
  "gpt-5.2-pro": { tpm: 450000, rpm: 450 },
  // GPT-4.x models
  "gpt-4.1": { tpm: 27000, rpm: 450 },
  "gpt-4.1-mini": { tpm: 180000, rpm: 450 },
  "gpt-4.1-nano": { tpm: 180000, rpm: 450 },
  "gpt-4o": { tpm: 27000, rpm: 450 },
  "gpt-4o-mini": { tpm: 180000, rpm: 450 },
  "gpt-4-turbo": { tpm: 27000, rpm: 450 },
  "gpt-4": { tpm: 9000, rpm: 450 },
  // GPT-3.5 models
  "gpt-3.5-turbo": { tpm: 180000, rpm: 450 },
  // Default fallback (conservative)
  "default": { tpm: 27000, rpm: 100 },
};

function getModelRateLimits(model: string): { tpm: number; rpm: number } {
  // Try exact match first
  if (MODEL_RATE_LIMITS[model]) {
    return MODEL_RATE_LIMITS[model];
  }
  // Try prefix match (e.g., "gpt-5-mini-2025-08-07" -> "gpt-5-mini")
  for (const [key, limits] of Object.entries(MODEL_RATE_LIMITS)) {
    if (model.startsWith(key)) {
      return limits;
    }
  }
  return MODEL_RATE_LIMITS["default"];
}

// Estimate tokens for a request (rough calculation)
function estimateRequestTokens(systemPrompt: string, userMessage: string, maxResponseTokens: number): number {
  // Rough estimate: 1 token ≈ 4 characters for English text
  const inputTokens = Math.ceil((systemPrompt.length + userMessage.length) / 4);
  return inputTokens + maxResponseTokens;
}

// Adaptive concurrency controller
class AdaptiveConcurrency {
  private model: string;
  private limits: { tpm: number; rpm: number };
  private currentConcurrency: number;
  private minConcurrency = 3;
  private maxConcurrency = 50;

  // Rolling window for tracking (last 60 seconds)
  private recentBatches: { tokens: number; requests: number; durationMs: number; timestamp: number; hadRateLimit: boolean }[] = [];
  private windowMs = 60000; // 1 minute window

  constructor(model: string, initialEstimatedTokens: number) {
    this.model = model;
    this.limits = getModelRateLimits(model);

    // Start with aggressive initial concurrency
    // Use 70% of limits initially (more aggressive than before)
    const requestsPerSecond = (this.limits.rpm * 0.7) / 60;
    const tokensPerSecond = (this.limits.tpm * 0.7) / 60;
    const maxByRpm = Math.floor(requestsPerSecond * 2); // Assume ~2s per request
    const maxByTpm = Math.floor(tokensPerSecond * 2 / initialEstimatedTokens);

    this.currentConcurrency = Math.min(
      Math.max(this.minConcurrency, Math.min(maxByRpm, maxByTpm)),
      this.maxConcurrency
    );

    // For high-TPM models, start even more aggressive
    if (this.limits.tpm >= 180000) {
      this.currentConcurrency = Math.max(this.currentConcurrency, 15);
    }

    console.log(`[adaptive] Initial concurrency: ${this.currentConcurrency} (TPM: ${this.limits.tpm}, RPM: ${this.limits.rpm})`);
  }

  getConcurrency(): number {
    return this.currentConcurrency;
  }

  // Record batch results and adjust concurrency
  recordBatch(tokens: number, requests: number, durationMs: number, hadRateLimit: boolean): void {
    const now = Date.now();

    // Add this batch
    this.recentBatches.push({ tokens, requests, durationMs, timestamp: now, hadRateLimit });

    // Remove old batches outside window
    this.recentBatches = this.recentBatches.filter(b => now - b.timestamp < this.windowMs);

    // Calculate effective rates over the window
    const windowDurationMs = this.recentBatches.length > 1
      ? now - this.recentBatches[0].timestamp + this.recentBatches[0].durationMs
      : durationMs;

    const totalTokens = this.recentBatches.reduce((sum, b) => sum + b.tokens, 0);
    const totalRequests = this.recentBatches.reduce((sum, b) => sum + b.requests, 0);
    const anyRateLimits = this.recentBatches.some(b => b.hadRateLimit);

    // Calculate effective rates (per minute)
    const effectiveTPM = (totalTokens / windowDurationMs) * 60000;
    const effectiveRPM = (totalRequests / windowDurationMs) * 60000;

    // Calculate utilization percentages
    const tpmUtilization = effectiveTPM / this.limits.tpm;
    const rpmUtilization = effectiveRPM / this.limits.rpm;
    const maxUtilization = Math.max(tpmUtilization, rpmUtilization);

    const oldConcurrency = this.currentConcurrency;

    if (hadRateLimit || anyRateLimits) {
      // Back off significantly on rate limits
      this.currentConcurrency = Math.max(
        this.minConcurrency,
        Math.floor(this.currentConcurrency * 0.6)
      );
      console.log(`[adaptive] Rate limit detected, reducing: ${oldConcurrency} → ${this.currentConcurrency}`);
    } else if (maxUtilization < 0.5 && this.recentBatches.length >= 2) {
      // Under 50% utilization with enough data - increase significantly
      this.currentConcurrency = Math.min(
        this.maxConcurrency,
        Math.ceil(this.currentConcurrency * 1.5)
      );
      if (this.currentConcurrency !== oldConcurrency) {
        console.log(`[adaptive] Low utilization (${(maxUtilization * 100).toFixed(0)}%), increasing: ${oldConcurrency} → ${this.currentConcurrency}`);
      }
    } else if (maxUtilization < 0.7 && this.recentBatches.length >= 2) {
      // Under 70% - increase moderately
      this.currentConcurrency = Math.min(
        this.maxConcurrency,
        this.currentConcurrency + 2
      );
      if (this.currentConcurrency !== oldConcurrency) {
        console.log(`[adaptive] Moderate utilization (${(maxUtilization * 100).toFixed(0)}%), increasing: ${oldConcurrency} → ${this.currentConcurrency}`);
      }
    } else if (maxUtilization > 0.85) {
      // Over 85% - slight decrease to stay safe
      this.currentConcurrency = Math.max(
        this.minConcurrency,
        this.currentConcurrency - 1
      );
      if (this.currentConcurrency !== oldConcurrency) {
        console.log(`[adaptive] High utilization (${(maxUtilization * 100).toFixed(0)}%), decreasing: ${oldConcurrency} → ${this.currentConcurrency}`);
      }
    }

    // Log stats periodically
    if (this.recentBatches.length % 5 === 0) {
      console.log(`[adaptive] Stats - TPM: ${effectiveTPM.toFixed(0)}/${this.limits.tpm} (${(tpmUtilization * 100).toFixed(0)}%), RPM: ${effectiveRPM.toFixed(0)}/${this.limits.rpm} (${(rpmUtilization * 100).toFixed(0)}%), Concurrency: ${this.currentConcurrency}`);
    }
  }
}

type AITestResponseTypeV1 = z.infer<typeof AITestResponseSchemaV1>;
type AITestResponseTypeV2 = z.infer<typeof AITestResponseSchemaV2>;

// JSON Schema for OpenAI structured outputs (v1 model)
const AI_RESPONSE_JSON_SCHEMA_V1 = {
  name: "status_detection",
  strict: true,
  schema: {
    type: "object",
    properties: {
      currentStatus: { type: ["string", "null"], description: "The detected status slug, or null if uncertain" },
      confidence: { type: "number", minimum: 0, maximum: 1, description: "Confidence score between 0 and 1" },
      reasoning: { type: "string", description: "Explanation of why this status was detected" },
    },
    required: ["currentStatus", "confidence", "reasoning"],
    additionalProperties: false,
  },
};

// JSON Schema for OpenAI structured outputs (v2 model)
const AI_RESPONSE_JSON_SCHEMA_V2 = {
  name: "status_detection_v2",
  strict: true,
  schema: {
    type: "object",
    properties: {
      primaryStatus: {
        type: "string",
        enum: ["contacting", "quoted", "booked", "completed", "cancelled"],
        description: "The primary status"
      },
      subStatus: { type: ["string", "null"], description: "The substatus, or null if unclear" },
      actionRequired: {
        type: "array",
        items: { type: "string" },
        description: "Action flags like reply-needed, review-quote, sign-contract, etc."
      },
      confidence: { type: "number", minimum: 0, maximum: 1, description: "Confidence score between 0 and 1" },
      reasoning: { type: "string", description: "Explanation of why this status was detected" },
    },
    required: ["primaryStatus", "subStatus", "actionRequired", "confidence", "reasoning"],
    additionalProperties: false,
  },
};

// Detect if a prompt is v2 format (checks for v2-specific keywords)
function isV2Prompt(systemPrompt: string): boolean {
  return systemPrompt.includes("PRIMARY STATUS") ||
    systemPrompt.includes("primaryStatus") ||
    systemPrompt.includes("SUB-STATUS") ||
    systemPrompt.includes("ACTION FLAGS");
}

export async function buildDefaultSystemPromptForTests(): Promise<string> {
  const statuses = await prisma.supplierStatus.findMany({
    where: { isSystem: true },
    orderBy: { order: "asc" },
    select: {
      slug: true,
      name: true,
      description: true,
      excludePatterns: true,
    },
  });

  return buildStatusDetectionSystemPrompt({
    statuses: statuses.map((s) => ({
      slug: s.slug,
      name: s.name,
      description: s.description,
      excludePatterns: s.excludePatterns || [],
    })),
  });
}

interface TestContext {
  subject: string;
  body: string;
  direction: "INBOUND" | "OUTBOUND";
  threadContext?: { direction: string; subject: string; body: string }[];
  previousStatus?: string; // Current status before this email arrived
}

// Unified response that can hold v1 or v2 data
interface AITestResponse {
  // V1 fields
  currentStatus: string | null;
  // V2 fields
  primaryStatus?: string;
  subStatus?: string | null;
  actionRequired?: string[];
  // Common
  confidence: number;
  reasoning: string;
  isV2: boolean;
}

/**
 * Initialize prompt versioning - save the default prompt as v1
 */
export async function initializeDefaultPrompt(): Promise<void> {
  const existing = await prisma.testPrompt.findUnique({
    where: { version: "v1-default" },
  });

  const defaultModel =
    process.env.THREAD_ANALYSIS_MODEL ||
    process.env.TEST_DEFAULT_MODEL ||
    "gpt-5-mini";

  const defaultPrompt = await buildDefaultSystemPromptForTests();

  if (!existing) {
    await prisma.testPrompt.create({
      data: {
        version: "v1-default",
        name: "Default Status Detection (Matches Ingestion)",
        description:
          "Default prompt for the test suite. Mirrors the production ingestion prompt (dynamic statuses from DB).",
        systemPrompt: defaultPrompt,
        model: defaultModel,
        maxTokens: 1500,
        isActive: true,
      },
    });
    console.log("[test-runner] Created default prompt v1-default (ingestion-aligned)");
    return;
  }

  // If the existing default prompt is empty (or clearly broken), repair it automatically.
  if (!existing.systemPrompt || existing.systemPrompt.trim().length === 0) {
    await prisma.testPrompt.update({
      where: { id: existing.id },
      data: {
        name: existing.name || "Default Status Detection (Matches Ingestion)",
        description:
          existing.description ||
          "Default prompt for the test suite. Mirrors the production ingestion prompt (dynamic statuses from DB).",
        systemPrompt: defaultPrompt,
        model: existing.model || defaultModel,
        maxTokens: existing.maxTokens || 1500,
        isActive: true,
      },
    });
    console.log("[test-runner] Repaired empty default prompt v1-default");
  }
}

/**
 * Get or create a prompt version
 */
export async function getOrCreatePrompt(version: string, systemPrompt?: string): Promise<string> {
  let prompt = await prisma.testPrompt.findUnique({
    where: { version },
  });

  if (!prompt && systemPrompt) {
    prompt = await prisma.testPrompt.create({
      data: {
        version,
        name: version,
        systemPrompt,
        model: "gpt-4o-mini",
        isActive: true,
      },
    });
  }

  if (!prompt) {
    throw new Error(`Prompt version "${version}" not found`);
  }

  return prompt.id;
}

/**
 * Build user message for test
 */
function buildTestUserMessage(testCase: TestContext): string {
  const lines: string[] = [];

  // Add current status context if available
  if (testCase.previousStatus) {
    lines.push(`CURRENT SUPPLIER STATUS: ${testCase.previousStatus}`);
    lines.push("(Analyze this email to determine if status should change)\n");
  }

  // Add thread context if present
  if (testCase.threadContext && testCase.threadContext.length > 0) {
    lines.push("THREAD CONTEXT (previous messages):\n");
    testCase.threadContext.forEach((msg, i) => {
      lines.push(`--- Previous Message ${i} ---`);
      lines.push(`Direction: ${msg.direction}`);
      lines.push(`Subject: ${msg.subject}`);
      lines.push(`Body: ${msg.body}`);
      lines.push("");
    });
    lines.push("---\n");
  }

  // Current message being tested
  lines.push("--- NEW MESSAGE (ANALYZE THIS) ---");
  lines.push(`Direction: ${testCase.direction}`);
  lines.push(`Subject: ${testCase.subject}`);
  lines.push(`Body: ${testCase.body}`);

  return lines.join("\n");
}

/**
 * Call AI with test case (supports both v1 and v2 prompts)
 */
async function callTestAI(
  systemPrompt: string,
  testCase: TestContext,
  model: string,
  maxTokens: number,
  retries = 3
): Promise<{ response: AITestResponse | null; latencyMs: number; tokens: number; rawResponse: string; hadRateLimit: boolean }> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return { response: null, latencyMs: 0, tokens: 0, rawResponse: "OPENAI_API_KEY not set", hadRateLimit: false };
  }

  const userMessage = buildTestUserMessage(testCase);
  const startTime = Date.now();
  let encounteredRateLimit = false;

  // Detect v1 vs v2 prompt format
  const useV2 = isV2Prompt(systemPrompt);
  const jsonSchema = useV2 ? AI_RESPONSE_JSON_SCHEMA_V2 : AI_RESPONSE_JSON_SCHEMA_V1;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      // Use structured outputs for guaranteed valid JSON
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
          max_completion_tokens: maxTokens,
          response_format: {
            type: "json_schema",
            json_schema: jsonSchema,
          },
        }),
      });

      const latencyMs = Date.now() - startTime;

      if (!res.ok) {
        const err = await res.text();
        // Retry on quota/rate limit errors
        const isRateLimit = res.status === 429 || err.includes("quota") || err.includes("rate");
        if (isRateLimit) {
          encounteredRateLimit = true;
          if (attempt < retries) {
            const delay = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s
            console.log(`[test-runner] Quota/rate error, retrying in ${delay}ms (attempt ${attempt + 1}/${retries})`);
            await new Promise(resolve => setTimeout(resolve, delay));
            continue;
          }
        }
        return { response: null, latencyMs, tokens: 0, rawResponse: `API Error: ${err}`, hadRateLimit: encounteredRateLimit };
      }

      const data = await res.json() as {
        choices?: { message?: { content?: string } }[];
        usage?: { total_tokens?: number };
      };

      const content = data.choices?.[0]?.message?.content;
      const tokens = data.usage?.total_tokens || 0;

      if (!content) {
        return { response: null, latencyMs, tokens, rawResponse: "Empty response from API", hadRateLimit: encounteredRateLimit };
      }

      // Parse based on prompt version
      if (useV2) {
        const parsed = AITestResponseSchemaV2.parse(JSON.parse(content));
        const response: AITestResponse = {
          currentStatus: null, // V1 field not used
          primaryStatus: parsed.primaryStatus,
          subStatus: parsed.subStatus,
          actionRequired: parsed.actionRequired,
          confidence: parsed.confidence,
          reasoning: parsed.reasoning,
          isV2: true,
        };
        return { response, latencyMs, tokens, rawResponse: content, hadRateLimit: encounteredRateLimit };
      } else {
        const parsed = AITestResponseSchemaV1.parse(JSON.parse(content));
        const response: AITestResponse = {
          currentStatus: parsed.currentStatus,
          confidence: parsed.confidence,
          reasoning: parsed.reasoning,
          isV2: false,
        };
        return { response, latencyMs, tokens, rawResponse: content, hadRateLimit: encounteredRateLimit };
      }
    } catch (error) {
      if (attempt < retries) {
        const delay = Math.pow(2, attempt) * 1000;
        console.log(`[test-runner] Error, retrying in ${delay}ms (attempt ${attempt + 1}/${retries})`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      const latencyMs = Date.now() - startTime;
      return {
        response: null,
        latencyMs,
        tokens: 0,
        rawResponse: `Error: ${error instanceof Error ? error.message : String(error)}`,
        hadRateLimit: encounteredRateLimit
      };
    }
  }

  // Should never reach here, but TypeScript needs it
  return { response: null, latencyMs: Date.now() - startTime, tokens: 0, rawResponse: "Max retries exceeded", hadRateLimit: encounteredRateLimit };
}

/**
 * Compare action arrays (order-independent)
 */
function actionsMatch(expected: string[], detected: string[]): boolean {
  if (expected.length !== detected.length) return false;
  const sortedExpected = [...expected].sort();
  const sortedDetected = [...detected].sort();
  return sortedExpected.every((e, i) => e === sortedDetected[i]);
}

/**
 * Run a full test suite
 */
export async function runTestSuite(params: {
  emailSetId: string;
  promptId: string;
  modelOverride?: string;
}): Promise<string> {
  const { emailSetId, promptId, modelOverride } = params;

  // Get the prompt
  const prompt = await prisma.testPrompt.findUnique({
    where: { id: promptId },
  });

  if (!prompt) {
    throw new Error(`Prompt ${promptId} not found`);
  }

  const model = modelOverride || prompt.model;
  const maxTokens = prompt.maxTokens || 1500;

  // Create the test run
  const run = await prisma.testRun.create({
    data: {
      emailSetId,
      promptId,
      promptVersion: prompt.version,
      model,
      promptSnapshot: prompt.systemPrompt,
      status: "RUNNING",
      startedAt: new Date(),
    },
  });

  // Get all test cases
  const testCases = await prisma.testCase.findMany({
    where: { emailSetId },
    include: { persona: true },
  });

  console.log(`[test-runner] Starting run ${run.id} with ${testCases.length} cases`);

  // Detect if we're using v2 prompt
  const isV2Run = isV2Prompt(prompt.systemPrompt);
  console.log(`[test-runner] Prompt format: ${isV2Run ? "v2 (primary/sub/actions)" : "v1 (single status)"}`);

  // V1 metrics
  let passed = 0;
  let failed = 0;
  // V2 metrics
  let primaryPassedCount = 0;
  let subPassedCount = 0;
  let actionsPassedCount = 0;

  let totalLatency = 0;
  let totalTokens = 0;
  let processed = 0;

  // Create adaptive concurrency controller
  const estimatedTokensPerRequest = estimateRequestTokens(prompt.systemPrompt, " ".repeat(500), maxTokens);
  const adaptiveConcurrency = new AdaptiveConcurrency(model, estimatedTokensPerRequest);
  console.log(`[test-runner] Model: ${model}, Est. tokens/req: ${estimatedTokensPerRequest}`);

  let i = 0;
  while (i < testCases.length) {
    const CONCURRENCY = adaptiveConcurrency.getConcurrency();
    // Check if run has been paused or cancelled
    const currentRun = await prisma.testRun.findUnique({
      where: { id: run.id },
      select: { status: true },
    });

    if (currentRun?.status === "PAUSED") {
      console.log(`[test-runner] Run ${run.id} paused at ${processed}/${testCases.length}`);
      return run.id; // Return early, can be resumed later
    }

    if (currentRun?.status === "CANCELLED") {
      console.log(`[test-runner] Run ${run.id} cancelled at ${processed}/${testCases.length}`);
      return run.id;
    }

    const batch = testCases.slice(i, i + CONCURRENCY);
    const batchStartTime = Date.now();

    const batchResults = await Promise.all(
      batch.map(async (tc) => {
        const context: TestContext = {
          subject: tc.subject,
          body: tc.body,
          direction: tc.direction as "INBOUND" | "OUTBOUND",
          threadContext: tc.threadContext as { direction: string; subject: string; body: string }[] | undefined,
          previousStatus: tc.previousStatus || undefined,
        };

        const { response, latencyMs, tokens, rawResponse, hadRateLimit } = await callTestAI(
          prompt.systemPrompt,
          context,
          model,
          maxTokens
        );

        // V1 comparison (single status)
        const detectedStatus = response?.currentStatus || null;
        const isPassed = detectedStatus === tc.expectedStatus;

        // V2 comparison (primary/sub/actions)
        let primaryPassed: boolean | null = null;
        let subPassed: boolean | null = null;
        let actionsPassed: boolean | null = null;

        if (response?.isV2 && tc.expectedPrimaryStatus) {
          primaryPassed = response.primaryStatus === tc.expectedPrimaryStatus;
          // Sub-status: if expected is null, any sub is ok. Otherwise must match.
          subPassed = tc.expectedSubStatus === null
            ? true
            : response.subStatus === tc.expectedSubStatus;
          // Actions: compare arrays (order-independent)
          const expectedActions = tc.expectedActions || [];
          const detectedActions = response.actionRequired || [];
          actionsPassed = actionsMatch(expectedActions, detectedActions);
        }

        return {
          tc,
          response,
          latencyMs,
          tokens,
          rawResponse,
          detectedStatus,
          isPassed,
          primaryPassed,
          subPassed,
          actionsPassed,
          hadRateLimit,
        };
      })
    );

    // Calculate batch stats for adaptive concurrency
    const batchDurationMs = Date.now() - batchStartTime;
    const batchTokens = batchResults.reduce((sum, r) => sum + r.tokens, 0);
    const batchHadRateLimit = batchResults.some(r => r.hadRateLimit);

    // Update adaptive concurrency based on this batch
    adaptiveConcurrency.recordBatch(batchTokens, batch.length, batchDurationMs, batchHadRateLimit);

    // Store results and accumulate stats
    for (const result of batchResults) {
      const { tc, response, latencyMs, tokens, rawResponse, detectedStatus, isPassed, primaryPassed, subPassed, actionsPassed } = result;

      // V1 metrics
      if (isPassed) passed++;
      else failed++;

      // V2 metrics
      if (primaryPassed === true) primaryPassedCount++;
      if (subPassed === true) subPassedCount++;
      if (actionsPassed === true) actionsPassedCount++;

      totalLatency += latencyMs;
      totalTokens += tokens;
      processed++;

      // Store result with both v1 and v2 fields
      await prisma.testResult.create({
        data: {
          runId: run.id,
          caseId: tc.id,
          // V1 fields
          passed: isPassed,
          expectedStatus: tc.expectedStatus,
          detectedStatus,
          confidence: response?.confidence,
          reasoning: response?.reasoning,
          // V2 fields
          detectedPrimaryStatus: response?.primaryStatus || null,
          detectedSubStatus: response?.subStatus,
          detectedActions: response?.actionRequired || [],
          primaryPassed,
          subPassed,
          actionsPassed,
          // Debug
          rawResponse,
          latencyMs,
          tokens,
        },
      });
    }

    // Update run progress after each batch
    const currentAccuracy = processed > 0 ? passed / processed : 0;
    const currentAvgLatency = processed > 0 ? totalLatency / processed : 0;

    // V2 accuracies (only count cases that have v2 expectations)
    const v2CasesProcessed = isV2Run ? processed : 0;
    const currentPrimaryAccuracy = v2CasesProcessed > 0 ? primaryPassedCount / v2CasesProcessed : null;
    const currentSubAccuracy = v2CasesProcessed > 0 ? subPassedCount / v2CasesProcessed : null;
    const currentActionsAccuracy = v2CasesProcessed > 0 ? actionsPassedCount / v2CasesProcessed : null;

    await prisma.testRun.update({
      where: { id: run.id },
      data: {
        totalCases: testCases.length,
        passed,
        failed,
        accuracy: currentAccuracy,
        // V2 metrics
        primaryPassed: isV2Run ? primaryPassedCount : null,
        primaryAccuracy: currentPrimaryAccuracy,
        subPassed: isV2Run ? subPassedCount : null,
        subAccuracy: currentSubAccuracy,
        actionsPassed: isV2Run ? actionsPassedCount : null,
        actionsAccuracy: currentActionsAccuracy,
        // Performance
        avgLatencyMs: currentAvgLatency,
        totalTokens,
        estimatedCost: calculateCost(totalTokens, model),
      },
    });

    if (isV2Run) {
      console.log(`[test-runner] Progress: ${processed}/${testCases.length} (Primary: ${primaryPassedCount}, Sub: ${subPassedCount}, Actions: ${actionsPassedCount})`);
    } else {
      console.log(`[test-runner] Progress: ${processed}/${testCases.length} (${passed} passed, ${failed} failed)`);
    }

    // Move to next batch
    i += CONCURRENCY;
  }

  // Calculate final stats
  const accuracy = testCases.length > 0 ? passed / testCases.length : 0;
  const avgLatencyMs = testCases.length > 0 ? totalLatency / testCases.length : 0;
  const estimatedCost = calculateCost(totalTokens, model);

  // V2 final accuracies
  const v2Cases = isV2Run ? testCases.length : 0;
  const primaryAccuracy = v2Cases > 0 ? primaryPassedCount / v2Cases : null;
  const subAccuracy = v2Cases > 0 ? subPassedCount / v2Cases : null;
  const actionsAccuracy = v2Cases > 0 ? actionsPassedCount / v2Cases : null;

  // Update run with final results
  await prisma.testRun.update({
    where: { id: run.id },
    data: {
      status: "COMPLETED",
      completedAt: new Date(),
      totalCases: testCases.length,
      passed,
      failed,
      accuracy,
      // V2 metrics
      primaryPassed: isV2Run ? primaryPassedCount : null,
      primaryAccuracy,
      subPassed: isV2Run ? subPassedCount : null,
      subAccuracy,
      actionsPassed: isV2Run ? actionsPassedCount : null,
      actionsAccuracy,
      // Performance
      avgLatencyMs,
      totalTokens,
      estimatedCost,
    },
  });

  if (isV2Run) {
    console.log(`[test-runner] Run ${run.id} complete:`);
    console.log(`  Primary: ${primaryPassedCount}/${testCases.length} (${((primaryAccuracy || 0) * 100).toFixed(1)}%)`);
    console.log(`  Sub: ${subPassedCount}/${testCases.length} (${((subAccuracy || 0) * 100).toFixed(1)}%)`);
    console.log(`  Actions: ${actionsPassedCount}/${testCases.length} (${((actionsAccuracy || 0) * 100).toFixed(1)}%)`);
  } else {
    console.log(`[test-runner] Run ${run.id} complete: ${passed}/${testCases.length} passed (${(accuracy * 100).toFixed(1)}%)`);
  }

  return run.id;
}

/**
 * Calculate estimated cost
 */
function calculateCost(tokens: number, model: string): number {
  // Approximate costs per 1M tokens (input + output averaged)
  const rates: Record<string, number> = {
    "gpt-4o-mini": 0.30,
    "gpt-4o": 5.00,
    "gpt-4-turbo": 10.00,
  };

  const rate = rates[model] || 1.00;
  return (tokens / 1_000_000) * rate;
}

/**
 * Get run results with detailed breakdown
 */
export async function getRunResults(runId: string) {
  const run = await prisma.testRun.findUnique({
    where: { id: runId },
    include: {
      prompt: true,
      emailSet: true,
      results: {
        include: {
          case: {
            include: { persona: true },
          },
        },
      },
    },
  });

  if (!run) return null;

  // Calculate breakdown stats
  const byDifficulty: Record<string, { passed: number; total: number }> = {};
  const byStatus: Record<string, { passed: number; total: number }> = {};
  const byScenario: Record<string, { passed: number; total: number }> = {};

  for (const result of run.results) {
    const difficulty = result.case.scenario;
    const status = result.expectedStatus;
    const scenario = result.case.scenario;

    // By difficulty/scenario
    if (!byDifficulty[difficulty]) byDifficulty[difficulty] = { passed: 0, total: 0 };
    byDifficulty[difficulty].total++;
    if (result.passed) byDifficulty[difficulty].passed++;

    // By expected status
    if (!byStatus[status]) byStatus[status] = { passed: 0, total: 0 };
    byStatus[status].total++;
    if (result.passed) byStatus[status].passed++;

    // By scenario type
    if (!byScenario[scenario]) byScenario[scenario] = { passed: 0, total: 0 };
    byScenario[scenario].total++;
    if (result.passed) byScenario[scenario].passed++;
  }

  return {
    run,
    breakdowns: {
      byDifficulty,
      byStatus,
      byScenario,
    },
    failures: run.results.filter(r => !r.passed),
  };
}

/**
 * Get all prompts with their run statistics
 */
export async function getPromptsWithStats() {
  const prompts = await prisma.testPrompt.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      runs: {
        select: {
          id: true,
          accuracy: true,
          totalCases: true,
          avgLatencyMs: true,
          estimatedCost: true,
          status: true,
          createdAt: true,
        },
      },
    },
  });

  return prompts.map(p => {
    const completedRuns = p.runs.filter(r => r.status === "COMPLETED");
    const avgAccuracy = completedRuns.length > 0
      ? completedRuns.reduce((sum, r) => sum + r.accuracy, 0) / completedRuns.length
      : null;

    return {
      ...p,
      runCount: p.runs.length,
      avgAccuracy,
    };
  });
}

/**
 * Export test results as Markdown for Claude Code review
 * Includes: all failures, 10% random successes, 10 lowest confidence successes
 */
export async function exportRunForReview(runId: string): Promise<string> {
  const run = await prisma.testRun.findUnique({
    where: { id: runId },
    include: {
      prompt: true,
      emailSet: true,
      results: {
        include: {
          case: {
            include: { persona: true },
          },
        },
      },
    },
  });

  if (!run) {
    throw new Error(`Run ${runId} not found`);
  }

  const failures = run.results.filter(r => !r.passed);
  const successes = run.results.filter(r => r.passed);
  const nullResponses = run.results.filter(r => r.detectedStatus === null);

  // Categorize null responses
  // API errors: rawResponse indicates an error, or no confidence (parsing failed)
  const apiErrors = nullResponses.filter(r =>
    r.rawResponse?.startsWith("Error:") ||
    r.rawResponse?.startsWith("API Error:") ||
    r.rawResponse === "Empty response from API" ||
    r.rawResponse === "OPENAI_API_KEY not set" ||
    r.confidence === null
  );
  // Intentional nulls: AI returned valid JSON with currentStatus: null and reasoning
  const intentionalNulls = nullResponses.filter(r =>
    r.confidence !== null && r.reasoning
  );

  // Get 10% random sample of successes
  const sampleSize = Math.ceil(successes.length * 0.1);
  const shuffled = [...successes].sort(() => Math.random() - 0.5);
  const randomSample = shuffled.slice(0, sampleSize);

  // Get 10 lowest confidence successes (that aren't already in random sample)
  const randomSampleIds = new Set(randomSample.map(r => r.id));
  const lowConfidenceSuccesses = successes
    .filter(r => !randomSampleIds.has(r.id))
    .sort((a, b) => (a.confidence ?? 1) - (b.confidence ?? 1))
    .slice(0, 10);

  // Build markdown
  const lines: string[] = [];

  lines.push(`# Test Run Review Export`);
  lines.push(``);
  lines.push(`**Run ID:** ${run.id}`);
  lines.push(`**Prompt Version:** ${run.promptVersion}`);
  lines.push(`**Model:** ${run.model}`);
  lines.push(`**Email Set:** ${run.emailSet?.name || "Unknown"}`);
  lines.push(`**Date:** ${run.createdAt.toISOString()}`);
  lines.push(``);
  lines.push(`## Summary`);
  lines.push(`- **Total Cases:** ${run.totalCases}`);
  lines.push(`- **Passed:** ${run.passed} (${((run.passed / run.totalCases) * 100).toFixed(1)}%)`);
  lines.push(`- **Failed:** ${run.failed} (${((run.failed / run.totalCases) * 100).toFixed(1)}%)`);
  lines.push(`- **Null Responses:** ${nullResponses.length} (${apiErrors.length} API errors, ${intentionalNulls.length} AI returned null)`);
  lines.push(``);

  // Calculate breakdowns
  const byScenario: Record<string, { passed: number; total: number }> = {};
  const byStatus: Record<string, { passed: number; total: number }> = {};

  for (const result of run.results) {
    const scenario = result.case.scenario;
    const status = result.expectedStatus;

    if (!byScenario[scenario]) byScenario[scenario] = { passed: 0, total: 0 };
    byScenario[scenario].total++;
    if (result.passed) byScenario[scenario].passed++;

    if (!byStatus[status]) byStatus[status] = { passed: 0, total: 0 };
    byStatus[status].total++;
    if (result.passed) byStatus[status].passed++;
  }

  lines.push(`## Accuracy by Scenario`);
  lines.push(``);
  lines.push(`| Scenario | Passed | Total | Accuracy |`);
  lines.push(`|----------|--------|-------|----------|`);
  for (const [scenario, stats] of Object.entries(byScenario).sort((a, b) => a[0].localeCompare(b[0]))) {
    const acc = stats.total > 0 ? ((stats.passed / stats.total) * 100).toFixed(1) : "0.0";
    lines.push(`| ${scenario} | ${stats.passed} | ${stats.total} | ${acc}% |`);
  }
  lines.push(``);

  lines.push(`## Accuracy by Expected Status`);
  lines.push(``);
  lines.push(`| Status | Passed | Total | Accuracy |`);
  lines.push(`|--------|--------|-------|----------|`);
  for (const [status, stats] of Object.entries(byStatus).sort((a, b) => a[0].localeCompare(b[0]))) {
    const acc = stats.total > 0 ? ((stats.passed / stats.total) * 100).toFixed(1) : "0.0";
    lines.push(`| ${status} | ${stats.passed} | ${stats.total} | ${acc}% |`);
  }
  lines.push(``);

  // Format a single result
  const formatResult = (r: typeof run.results[0], index: number, section: string): string => {
    const tc = r.case;
    const threadContext = tc.threadContext as { direction: string; subject: string; body: string }[] | null;

    const resultLines: string[] = [];
    resultLines.push(`### ${section} #${index + 1}`);
    resultLines.push(``);
    resultLines.push(`| Field | Value |`);
    resultLines.push(`|-------|-------|`);
    resultLines.push(`| **Scenario Type** | ${tc.scenario} |`);
    resultLines.push(`| **Direction** | ${tc.direction} |`);
    resultLines.push(`| **Previous Status** | ${tc.previousStatus || "none"} |`);
    resultLines.push(`| **Expected Status** | ${r.expectedStatus} |`);
    resultLines.push(`| **Detected Status** | ${r.detectedStatus || "null"} |`);
    resultLines.push(`| **Confidence** | ${r.confidence?.toFixed(2) ?? "N/A"} |`);
    resultLines.push(`| **Passed** | ${r.passed ? "YES" : "NO"} |`);
    if (tc.persona) {
      resultLines.push(`| **Persona** | ${tc.persona.name} (${tc.persona.communicationStyle}) |`);
    }
    resultLines.push(``);

    if (threadContext && threadContext.length > 0) {
      resultLines.push(`**Thread Context (previous messages):**`);
      threadContext.forEach((msg, i) => {
        resultLines.push(`\n> **Previous ${i + 1}** [${msg.direction}]`);
        resultLines.push(`> Subject: ${msg.subject}`);
        resultLines.push(`> ${msg.body.replace(/\n/g, "\n> ")}`);
      });
      resultLines.push(``);
    }

    resultLines.push(`**Email Subject:** ${tc.subject}`);
    resultLines.push(``);
    resultLines.push(`**Email Body:**`);
    resultLines.push("```");
    resultLines.push(tc.body);
    resultLines.push("```");
    resultLines.push(``);
    resultLines.push(`**AI Reasoning:**`);
    resultLines.push("```");
    resultLines.push(r.reasoning || "No reasoning provided");
    resultLines.push("```");
    resultLines.push(``);
    resultLines.push(`---`);
    resultLines.push(``);

    return resultLines.join("\n");
  };

  // Section 1: All Failures
  lines.push(`## FAILURES (${failures.length} total)`);
  lines.push(``);
  if (failures.length === 0) {
    lines.push(`No failures in this run.`);
    lines.push(``);
  } else {
    failures.forEach((r, i) => {
      lines.push(formatResult(r, i, "Failure"));
    });
  }

  // Section 2: Null Responses (if any)
  if (nullResponses.length > 0) {
    lines.push(`## NULL RESPONSES (${nullResponses.length} total)`);
    lines.push(``);
    lines.push(`**Breakdown:** ${apiErrors.length} API errors, ${intentionalNulls.length} AI returned null intentionally`);
    lines.push(``);

    if (apiErrors.length > 0) {
      lines.push(`### API Errors (${apiErrors.length})`);
      lines.push(``);
      apiErrors.forEach((r, i) => {
        lines.push(formatResult(r, i, "API Error"));
      });
    }

    if (intentionalNulls.length > 0) {
      lines.push(`### AI Returned Null (${intentionalNulls.length})`);
      lines.push(`These cases may indicate prompt confusion or edge cases the AI couldn't classify.`);
      lines.push(``);
      intentionalNulls.forEach((r, i) => {
        lines.push(formatResult(r, i, "Intentional Null"));
      });
    }
  }

  // Section 3: Low Confidence Successes
  lines.push(`## LOW CONFIDENCE SUCCESSES (${lowConfidenceSuccesses.length} lowest)`);
  lines.push(``);
  if (lowConfidenceSuccesses.length === 0) {
    lines.push(`No low confidence successes to show.`);
    lines.push(``);
  } else {
    lowConfidenceSuccesses.forEach((r, i) => {
      lines.push(formatResult(r, i, "Low Confidence"));
    });
  }

  // Section 4: Random Sample of Successes
  lines.push(`## RANDOM SUCCESS SAMPLE (${randomSample.length} of ${successes.length}, ~10%)`);
  lines.push(``);
  if (randomSample.length === 0) {
    lines.push(`No successes to sample.`);
    lines.push(``);
  } else {
    randomSample.forEach((r, i) => {
      lines.push(formatResult(r, i, "Success Sample"));
    });
  }

  return lines.join("\n");
}

/**
 * Pause a running test
 */
export async function pauseTestRun(runId: string): Promise<void> {
  const run = await prisma.testRun.findUnique({
    where: { id: runId },
    select: { status: true },
  });

  if (!run) {
    throw new Error(`Run ${runId} not found`);
  }

  if (run.status !== "RUNNING") {
    throw new Error(`Cannot pause run with status ${run.status}`);
  }

  await prisma.testRun.update({
    where: { id: runId },
    data: { status: "PAUSED" },
  });

  console.log(`[test-runner] Run ${runId} marked for pause`);
}

/**
 * Cancel a running or paused test
 */
export async function cancelTestRun(runId: string): Promise<void> {
  const run = await prisma.testRun.findUnique({
    where: { id: runId },
    select: { status: true },
  });

  if (!run) {
    throw new Error(`Run ${runId} not found`);
  }

  if (run.status !== "RUNNING" && run.status !== "PAUSED") {
    throw new Error(`Cannot cancel run with status ${run.status}`);
  }

  await prisma.testRun.update({
    where: { id: runId },
    data: { status: "CANCELLED" },
  });

  console.log(`[test-runner] Run ${runId} cancelled`);
}

/**
 * Resume a paused test
 */
export async function resumeTestRun(runId: string): Promise<string> {
  const run = await prisma.testRun.findUnique({
    where: { id: runId },
    include: { prompt: true },
  });

  if (!run) {
    throw new Error(`Run ${runId} not found`);
  }

  if (run.status !== "PAUSED") {
    throw new Error(`Cannot resume run with status ${run.status}`);
  }

  // Get already processed case IDs
  const processedResults = await prisma.testResult.findMany({
    where: { runId },
    select: { caseId: true },
  });
  const processedCaseIds = new Set(processedResults.map(r => r.caseId));

  // Get remaining test cases
  const remainingCases = await prisma.testCase.findMany({
    where: {
      emailSetId: run.emailSetId,
      id: { notIn: Array.from(processedCaseIds) },
    },
    include: { persona: true },
  });

  if (remainingCases.length === 0) {
    // All cases already processed, mark as completed
    await prisma.testRun.update({
      where: { id: runId },
      data: { status: "COMPLETED", completedAt: new Date() },
    });
    return runId;
  }

  // Mark as running again
  await prisma.testRun.update({
    where: { id: runId },
    data: { status: "RUNNING" },
  });

  console.log(`[test-runner] Resuming run ${runId} with ${remainingCases.length} remaining cases`);

  // Get current stats
  let { passed, failed, totalTokens } = run;
  passed = passed || 0;
  failed = failed || 0;
  totalTokens = totalTokens || 0;
  let totalLatency = (run.avgLatencyMs || 0) * processedCaseIds.size;
  let processed = processedCaseIds.size;

  const model = run.model;
  const maxTokens = run.prompt?.maxTokens || 1500;
  const systemPrompt = run.promptSnapshot;

  // Create adaptive concurrency controller
  const estimatedTokensPerRequest = estimateRequestTokens(systemPrompt, " ".repeat(500), maxTokens);
  const adaptiveConcurrency = new AdaptiveConcurrency(model, estimatedTokensPerRequest);
  console.log(`[test-runner] Resume - Model: ${model}, Est. tokens/req: ${estimatedTokensPerRequest}`);

  const totalCases = processed + remainingCases.length;

  let i = 0;
  while (i < remainingCases.length) {
    const CONCURRENCY = adaptiveConcurrency.getConcurrency();

    // Check if run has been paused or cancelled
    const currentRun = await prisma.testRun.findUnique({
      where: { id: runId },
      select: { status: true },
    });

    if (currentRun?.status === "PAUSED") {
      console.log(`[test-runner] Run ${runId} paused at ${processed}/${totalCases}`);
      return runId;
    }

    if (currentRun?.status === "CANCELLED") {
      console.log(`[test-runner] Run ${runId} cancelled at ${processed}/${totalCases}`);
      return runId;
    }

    const batch = remainingCases.slice(i, i + CONCURRENCY);
    const batchStartTime = Date.now();

    const batchResults = await Promise.all(
      batch.map(async (tc) => {
        const context: TestContext = {
          subject: tc.subject,
          body: tc.body,
          direction: tc.direction as "INBOUND" | "OUTBOUND",
          threadContext: tc.threadContext as { direction: string; subject: string; body: string }[] | undefined,
          previousStatus: tc.previousStatus || undefined,
        };

        const { response, latencyMs, tokens, rawResponse, hadRateLimit } = await callTestAI(
          systemPrompt,
          context,
          model,
          maxTokens
        );

        const detectedStatus = response?.currentStatus || null;
        const isPassed = detectedStatus === tc.expectedStatus;

        return { tc, response, latencyMs, tokens, rawResponse, detectedStatus, isPassed, hadRateLimit };
      })
    );

    // Calculate batch stats for adaptive concurrency
    const batchDurationMs = Date.now() - batchStartTime;
    const batchTokens = batchResults.reduce((sum, r) => sum + r.tokens, 0);
    const batchHadRateLimit = batchResults.some(r => r.hadRateLimit);

    // Update adaptive concurrency based on this batch
    adaptiveConcurrency.recordBatch(batchTokens, batch.length, batchDurationMs, batchHadRateLimit);

    // Store results
    for (const result of batchResults) {
      const { tc, response, latencyMs, tokens, rawResponse, detectedStatus, isPassed } = result;

      if (isPassed) passed++;
      else failed++;

      totalLatency += latencyMs;
      totalTokens += tokens;
      processed++;

      await prisma.testResult.create({
        data: {
          runId,
          caseId: tc.id,
          passed: isPassed,
          expectedStatus: tc.expectedStatus,
          detectedStatus,
          confidence: response?.confidence,
          reasoning: response?.reasoning,
          rawResponse,
          latencyMs,
          tokens,
        },
      });
    }

    // Update progress
    const currentAccuracy = processed > 0 ? passed / processed : 0;
    const currentAvgLatency = processed > 0 ? totalLatency / processed : 0;

    await prisma.testRun.update({
      where: { id: runId },
      data: {
        totalCases,
        passed,
        failed,
        accuracy: currentAccuracy,
        avgLatencyMs: currentAvgLatency,
        totalTokens,
        estimatedCost: calculateCost(totalTokens, model),
      },
    });

    console.log(`[test-runner] Progress: ${processed}/${totalCases} (${passed} passed, ${failed} failed)`);

    // Move to next batch
    i += CONCURRENCY;
  }

  // Mark completed
  const accuracy = totalCases > 0 ? passed / totalCases : 0;
  const avgLatencyMs = totalCases > 0 ? totalLatency / totalCases : 0;

  await prisma.testRun.update({
    where: { id: runId },
    data: {
      status: "COMPLETED",
      completedAt: new Date(),
      totalCases,
      passed,
      failed,
      accuracy,
      avgLatencyMs,
      totalTokens,
      estimatedCost: calculateCost(totalTokens, model),
    },
  });

  console.log(`[test-runner] Run ${runId} complete: ${passed}/${totalCases} passed (${(accuracy * 100).toFixed(1)}%)`);
  return runId;
}

export async function compareRuns(runId1: string, runId2: string) {
  const [run1, run2] = await Promise.all([
    getRunResults(runId1),
    getRunResults(runId2),
  ]);

  if (!run1 || !run2) {
    throw new Error("One or both runs not found");
  }

  // Find cases where results differ
  const run1ResultMap = new Map(run1.run.results.map(r => [r.caseId, r]));
  const run2ResultMap = new Map(run2.run.results.map(r => [r.caseId, r]));

  const differences: Array<{
    caseId: string;
    expectedStatus: string;
    run1Detected: string | null;
    run1Passed: boolean;
    run2Detected: string | null;
    run2Passed: boolean;
  }> = [];

  for (const [caseId, result1] of run1ResultMap) {
    const result2 = run2ResultMap.get(caseId);
    if (result2 && result1.passed !== result2.passed) {
      differences.push({
        caseId,
        expectedStatus: result1.expectedStatus,
        run1Detected: result1.detectedStatus,
        run1Passed: result1.passed,
        run2Detected: result2.detectedStatus,
        run2Passed: result2.passed,
      });
    }
  }

  return {
    run1: {
      id: run1.run.id,
      promptVersion: run1.run.promptVersion,
      model: run1.run.model,
      accuracy: run1.run.accuracy,
      passed: run1.run.passed,
      failed: run1.run.failed,
    },
    run2: {
      id: run2.run.id,
      promptVersion: run2.run.promptVersion,
      model: run2.run.model,
      accuracy: run2.run.accuracy,
      passed: run2.run.passed,
      failed: run2.run.failed,
    },
    differences,
    improvementRate: run2.run.accuracy - run1.run.accuracy,
  };
}


