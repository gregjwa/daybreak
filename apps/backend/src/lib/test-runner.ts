/**
 * Test Runner
 * 
 * Executes status detection tests against AI prompts/models.
 * Stores results for comparison and analysis.
 */

import { prisma } from "../db";

// Prompt for test execution (separate from production)
const DEFAULT_SYSTEM_PROMPT = `You are analyzing an email thread between an event planner and a vendor/supplier.

Your task is to identify what stage the vendor relationship is at based on the email content.

AVAILABLE STATUSES:
- needed: Supplier/service identified as required for the project (not yet contacted)
- shortlisted: Added to consideration list, may have been researched
- rfq-sent: Request for quote/availability has been sent (outbound inquiry)
- quote-received: Supplier responded with pricing or availability (actual $ amounts)
- confirmed: Vendor has AGREED to do the work (verbal or written agreement)
- negotiating: Active price or terms negotiation underway
- contracted: Legal contract has been signed by both parties
- deposit-paid: Initial payment or deposit has been made
- fulfilled: Service has been delivered (post-event only)
- paid-in-full: All payments complete, transaction closed
- cancelled: One party has BACKED OUT of the agreement

DETECTION RULES:
1. INBOUND = message FROM vendor. OUTBOUND = message FROM planner.
2. If vendor says YES/AGREE/AVAILABLE = "confirmed" (even if quote promised later)
3. If vendor provides ACTUAL $ amounts = "quote-received" 
4. "Can no longer fulfill" or backing out = "cancelled" (NOT fulfilled!)
5. Post-event thank you = "fulfilled"
6. Focus on the NEW/LATEST message to determine current status.

Respond with ONLY valid JSON:
{
  "currentStatus": "status-slug or null",
  "confidence": 0.0-1.0,
  "reasoning": "Explain why you chose this status"
}`;

interface TestContext {
  subject: string;
  body: string;
  direction: "INBOUND" | "OUTBOUND";
  threadContext?: { direction: string; subject: string; body: string }[];
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

  if (!existing) {
    await prisma.testPrompt.create({
      data: {
        version: "v1-default",
        name: "Default Status Detection",
        description: "The baseline prompt for status detection testing.",
        systemPrompt: DEFAULT_SYSTEM_PROMPT,
        model: "gpt-4o-mini",
        maxTokens: 500,
        isActive: true,
      },
    });
    console.log("[test-runner] Created default prompt v1");
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
  model: string
): Promise<{ response: AITestResponse | null; latencyMs: number; tokens: number; rawResponse: string }> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return { response: null, latencyMs: 0, tokens: 0, rawResponse: "OPENAI_API_KEY not set" };
  }

  const userMessage = buildTestUserMessage(testCase);
  const startTime = Date.now();

  try {
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
        max_completion_tokens: 500,
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

    const content = data.choices?.[0]?.message?.content || "{}";
    const tokens = data.usage?.total_tokens || 0;

    // Parse JSON
    let jsonStr = content;
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1];
    }

    // Try to find JSON object in response
    const objMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (objMatch) {
      jsonStr = objMatch[0];
    }

    const parsed = JSON.parse(jsonStr) as AITestResponse;
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

  // Process each test case
  for (let i = 0; i < testCases.length; i++) {
    const tc = testCases[i];

    const context: TestContext = {
      subject: tc.subject,
      body: tc.body,
      direction: tc.direction as "INBOUND" | "OUTBOUND",
      threadContext: tc.threadContext as { direction: string; subject: string; body: string }[] | undefined,
    };

    const { response, latencyMs, tokens, rawResponse } = await callTestAI(
      prompt.systemPrompt,
      context,
      model
    );

    const detectedStatus = response?.currentStatus || null;
    const isPassed = detectedStatus === tc.expectedStatus;

    if (isPassed) passed++;
    else failed++;

    totalLatency += latencyMs;
    totalTokens += tokens;

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

    // Update run progress every 10 cases for real-time UI updates
    if ((i + 1) % 10 === 0 || i === testCases.length - 1) {
      const currentAccuracy = (i + 1) > 0 ? passed / (i + 1) : 0;
      const currentAvgLatency = (i + 1) > 0 ? totalLatency / (i + 1) : 0;
      
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
      
      console.log(`[test-runner] Progress: ${i + 1}/${testCases.length} (${passed} passed, ${failed} failed)`);
    }

    // Small delay to avoid rate limiting
    await new Promise(r => setTimeout(r, 100));
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
 * Compare two test runs
 */
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


