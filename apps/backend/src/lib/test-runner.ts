/**
 * Test Runner
 *
 * Executes status detection tests against AI prompts/models.
 * Stores results for comparison and analysis.
 */

import { prisma } from "../db";
import { buildStatusDetectionSystemPrompt } from "./status-detection-prompt";
import { z } from "zod";

// Zod schema for structured AI responses
const AITestResponseSchema = z.object({
  currentStatus: z.string().nullable(),
  confidence: z.number().min(0).max(1),
  reasoning: z.string(),
});

type AITestResponseType = z.infer<typeof AITestResponseSchema>;

// JSON Schema for OpenAI structured outputs
const AI_RESPONSE_JSON_SCHEMA = {
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

interface AITestResponse {
  currentStatus: string | null;
  confidence: number;
  reasoning: string;
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
 * Call AI with test case
 */
async function callTestAI(
  systemPrompt: string,
  testCase: TestContext,
  model: string,
  maxTokens: number
): Promise<{ response: AITestResponse | null; latencyMs: number; tokens: number; rawResponse: string }> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return { response: null, latencyMs: 0, tokens: 0, rawResponse: "OPENAI_API_KEY not set" };
  }

  const userMessage = buildTestUserMessage(testCase);
  const startTime = Date.now();

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
          json_schema: AI_RESPONSE_JSON_SCHEMA,
        },
      }),
    });

    const latencyMs = Date.now() - startTime;

    if (!res.ok) {
      const err = await res.text();
      return { response: null, latencyMs, tokens: 0, rawResponse: `API Error: ${err}` };
    }

    const data = await res.json() as {
      choices?: { message?: { content?: string } }[];
      usage?: { total_tokens?: number };
    };

    const content = data.choices?.[0]?.message?.content;
    const tokens = data.usage?.total_tokens || 0;

    if (!content) {
      return { response: null, latencyMs, tokens, rawResponse: "Empty response from API" };
    }

    // With structured outputs, parsing should be guaranteed valid
    const parsed = AITestResponseSchema.parse(JSON.parse(content));
    return { response: parsed, latencyMs, tokens, rawResponse: content };
  } catch (error) {
    const latencyMs = Date.now() - startTime;
    return { 
      response: null, 
      latencyMs, 
      tokens: 0, 
      rawResponse: `Error: ${error instanceof Error ? error.message : String(error)}` 
    };
  }
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

  let passed = 0;
  let failed = 0;
  let totalLatency = 0;
  let totalTokens = 0;
  let processed = 0;

  // Process in parallel batches for speed
  // Concurrency of 15 balances speed with API rate limits
  const CONCURRENCY = 15;

  for (let i = 0; i < testCases.length; i += CONCURRENCY) {
    const batch = testCases.slice(i, i + CONCURRENCY);

    const batchResults = await Promise.all(
      batch.map(async (tc) => {
        const context: TestContext = {
          subject: tc.subject,
          body: tc.body,
          direction: tc.direction as "INBOUND" | "OUTBOUND",
          threadContext: tc.threadContext as { direction: string; subject: string; body: string }[] | undefined,
          previousStatus: tc.previousStatus || undefined,
        };

        const { response, latencyMs, tokens, rawResponse } = await callTestAI(
          prompt.systemPrompt,
          context,
          model,
          maxTokens
        );

        const detectedStatus = response?.currentStatus || null;
        const isPassed = detectedStatus === tc.expectedStatus;

        return {
          tc,
          response,
          latencyMs,
          tokens,
          rawResponse,
          detectedStatus,
          isPassed,
        };
      })
    );

    // Store results and accumulate stats
    for (const result of batchResults) {
      const { tc, response, latencyMs, tokens, rawResponse, detectedStatus, isPassed } = result;

      if (isPassed) passed++;
      else failed++;

      totalLatency += latencyMs;
      totalTokens += tokens;
      processed++;

      // Store result
      await prisma.testResult.create({
        data: {
          runId: run.id,
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

    // Update run progress after each batch
    const currentAccuracy = processed > 0 ? passed / processed : 0;
    const currentAvgLatency = processed > 0 ? totalLatency / processed : 0;

    await prisma.testRun.update({
      where: { id: run.id },
      data: {
        totalCases: testCases.length,
        passed,
        failed,
        accuracy: currentAccuracy,
        avgLatencyMs: currentAvgLatency,
        totalTokens,
        estimatedCost: calculateCost(totalTokens, model),
      },
    });

    console.log(`[test-runner] Progress: ${processed}/${testCases.length} (${passed} passed, ${failed} failed)`);
  }

  // Calculate stats
  const accuracy = testCases.length > 0 ? passed / testCases.length : 0;
  const avgLatencyMs = testCases.length > 0 ? totalLatency / testCases.length : 0;
  const estimatedCost = calculateCost(totalTokens, model);

  // Update run with results
  await prisma.testRun.update({
    where: { id: run.id },
    data: {
      status: "COMPLETED",
      completedAt: new Date(),
      totalCases: testCases.length,
      passed,
      failed,
      accuracy,
      avgLatencyMs,
      totalTokens,
      estimatedCost,
    },
  });

  console.log(`[test-runner] Run ${run.id} complete: ${passed}/${testCases.length} passed (${(accuracy * 100).toFixed(1)}%)`);

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

  // Section 2: Low Confidence Successes
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

  // Section 3: Random Sample of Successes
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


