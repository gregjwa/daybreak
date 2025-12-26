/**
 * Testing Routes
 * 
 * API endpoints for status detection testing system.
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { prisma } from "../db";
import { 
  generatePersonas, 
  generateTestEmails, 
  createEmailSet, 
  getEmailSets 
} from "../lib/test-generator";
import {
  runTestSuite,
  getRunResults,
  getPromptsWithStats,
  compareRuns,
  initializeDefaultPrompt,
  buildDefaultSystemPromptForTests,
  exportRunForReview,
  pauseTestRun,
  resumeTestRun,
  cancelTestRun,
} from "../lib/test-runner";

const testing = new Hono();

// --- Personas ---

// GET /api/testing/personas - List all test personas
testing.get("/personas", async (c) => {
  const personas = await prisma.testPersona.findMany({
    orderBy: { name: "asc" },
    include: {
      _count: { select: { testCases: true } },
    },
  });

  return c.json(personas);
});

// GET /api/testing/personas/:id - Get single persona with stats
testing.get("/personas/:id", async (c) => {
  const { id } = c.req.param();

  const persona = await prisma.testPersona.findUnique({
    where: { id },
    include: {
      testCases: {
        include: {
          results: {
            select: {
              passed: true,
              runId: true,
            },
          },
        },
      },
    },
  });

  if (!persona) {
    return c.json({ error: "Persona not found" }, 404);
  }

  // Calculate pass rates
  const totalTests = persona.testCases.flatMap(tc => tc.results).length;
  const passedTests = persona.testCases.flatMap(tc => tc.results).filter(r => r.passed).length;

  return c.json({
    ...persona,
    stats: {
      totalCases: persona.testCases.length,
      totalTests,
      passedTests,
      passRate: totalTests > 0 ? passedTests / totalTests : null,
    },
  });
});

// POST /api/testing/personas/generate - Generate all personas
testing.post("/personas/generate", async (c) => {
  const result = await generatePersonas();
  return c.json(result);
});

// --- Email Sets ---

// GET /api/testing/email-sets - List all email sets
testing.get("/email-sets", async (c) => {
  const emailSets = await getEmailSets();
  return c.json(emailSets);
});

const createEmailSetSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
});

// POST /api/testing/email-sets - Create new email set
testing.post(
  "/email-sets",
  zValidator("json", createEmailSetSchema),
  async (c) => {
    const { name, description } = c.req.valid("json");
    const id = await createEmailSet(name, description);
    return c.json({ id, name });
  }
);

// GET /api/testing/email-sets/:id - Get email set with cases
testing.get("/email-sets/:id", async (c) => {
  const { id } = c.req.param();
  const page = parseInt(c.req.query("page") || "1");
  const pageSize = parseInt(c.req.query("pageSize") || "50");
  const direction = c.req.query("direction");
  const difficulty = c.req.query("difficulty");
  const status = c.req.query("status");

  const emailSet = await prisma.testEmailSet.findUnique({
    where: { id },
    include: {
      _count: { select: { cases: true, runs: true } },
    },
  });

  if (!emailSet) {
    return c.json({ error: "Email set not found" }, 404);
  }

  // Build where clause for filtering
  const where: Record<string, unknown> = { emailSetId: id };
  if (direction) where.direction = direction;
  if (difficulty) where.scenario = difficulty;
  if (status) where.expectedStatus = status;

  const [cases, total] = await Promise.all([
    prisma.testCase.findMany({
      where,
      include: {
        persona: {
          select: { name: true, category: true },
        },
      },
      orderBy: { createdAt: "asc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.testCase.count({ where }),
  ]);

  return c.json({
    emailSet,
    cases,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  });
});

const generateEmailsSchema = z.object({
  count: z.number().optional().default(500),
  useAI: z.boolean().optional().default(true),
});

// POST /api/testing/email-sets/:id/generate - Generate emails for set
testing.post(
  "/email-sets/:id/generate",
  zValidator("json", generateEmailsSchema),
  async (c) => {
    const { id } = c.req.param();
    const { count, useAI } = c.req.valid("json");

    // Verify email set exists
    const emailSet = await prisma.testEmailSet.findUnique({
      where: { id },
    });

    if (!emailSet) {
      return c.json({ error: "Email set not found" }, 404);
    }

    // Ensure personas exist
    await generatePersonas();

    const result = await generateTestEmails(id, { count, useAI });
    return c.json(result);
  }
);

// --- Test Cases ---

// GET /api/testing/cases/:id - Get single test case with history
testing.get("/cases/:id", async (c) => {
  const { id } = c.req.param();

  const testCase = await prisma.testCase.findUnique({
    where: { id },
    include: {
      persona: true,
      emailSet: { select: { name: true } },
      results: {
        include: {
          run: {
            select: {
              id: true,
              promptVersion: true,
              model: true,
              createdAt: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!testCase) {
    return c.json({ error: "Test case not found" }, 404);
  }

  return c.json(testCase);
});

// --- Prompts ---

// GET /api/testing/prompts - List all prompts with stats
testing.get("/prompts", async (c) => {
  // Ensure default prompt exists
  await initializeDefaultPrompt();

  const prompts = await getPromptsWithStats();
  return c.json(prompts);
});

// GET /api/testing/prompts/default - Get default prompt text from code
testing.get("/prompts/default", async (c) => {
  const defaultModel =
    process.env.THREAD_ANALYSIS_MODEL ||
    process.env.TEST_DEFAULT_MODEL ||
    "gpt-5-mini";

  const systemPrompt = await buildDefaultSystemPromptForTests();

  return c.json({
    systemPrompt,
    model: defaultModel,
    maxTokens: 1500,
  });
});

// GET /api/testing/prompts/:id - Get single prompt
testing.get("/prompts/:id", async (c) => {
  const { id } = c.req.param();

  const prompt = await prisma.testPrompt.findUnique({
    where: { id },
    include: {
      runs: {
        select: {
          id: true,
          accuracy: true,
          status: true,
          createdAt: true,
          emailSet: { select: { name: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 10,
      },
    },
  });

  if (!prompt) {
    return c.json({ error: "Prompt not found" }, 404);
  }

  return c.json(prompt);
});

const createPromptSchema = z.object({
  version: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  systemPrompt: z.string().min(1),
  model: z.string().optional().default("gpt-4o-mini"),
  maxTokens: z.number().optional().default(500),
});

// POST /api/testing/prompts - Create new prompt
testing.post(
  "/prompts",
  zValidator("json", createPromptSchema),
  async (c) => {
    const data = c.req.valid("json");

    // Check for duplicate version
    const existing = await prisma.testPrompt.findUnique({
      where: { version: data.version },
    });

    if (existing) {
      return c.json({ error: "Prompt version already exists" }, 400);
    }

    const prompt = await prisma.testPrompt.create({
      data: {
        version: data.version,
        name: data.name,
        description: data.description,
        systemPrompt: data.systemPrompt,
        model: data.model,
        maxTokens: data.maxTokens,
        isActive: true,
      },
    });

    return c.json(prompt, 201);
  }
);

const updatePromptSchema = z.object({
  name: z.string().optional(),
  description: z.string().optional(),
  systemPrompt: z.string().optional(),
  model: z.string().optional(),
  maxTokens: z.number().optional(),
  isActive: z.boolean().optional(),
});

// PATCH /api/testing/prompts/:id - Update prompt
testing.patch(
  "/prompts/:id",
  zValidator("json", updatePromptSchema),
  async (c) => {
    const { id } = c.req.param();
    const data = c.req.valid("json");

    const prompt = await prisma.testPrompt.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.systemPrompt !== undefined && { systemPrompt: data.systemPrompt }),
        ...(data.model !== undefined && { model: data.model }),
        ...(data.maxTokens !== undefined && { maxTokens: data.maxTokens }),
        ...(data.isActive !== undefined && { isActive: data.isActive }),
      },
    });

    return c.json(prompt);
  }
);

// DELETE /api/testing/prompts/:id - Delete prompt
testing.delete("/prompts/:id", async (c) => {
  const { id } = c.req.param();

  // Check if prompt exists
  const prompt = await prisma.testPrompt.findUnique({
    where: { id },
    include: { _count: { select: { runs: true } } },
  });

  if (!prompt) {
    return c.json({ error: "Prompt not found" }, 404);
  }

  // Delete associated runs and results first (cascade)
  if (prompt._count.runs > 0) {
    // Delete all results for runs using this prompt
    await prisma.testResult.deleteMany({
      where: { run: { promptId: id } },
    });
    // Delete runs
    await prisma.testRun.deleteMany({
      where: { promptId: id },
    });
  }

  // Delete the prompt
  await prisma.testPrompt.delete({
    where: { id },
  });

  return c.json({ success: true });
});

// --- Runs ---

// GET /api/testing/runs - List all runs
testing.get("/runs", async (c) => {
  const runs = await prisma.testRun.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      emailSet: { select: { name: true } },
      prompt: { select: { version: true, name: true } },
    },
  });

  return c.json(runs);
});

const startRunSchema = z.object({
  emailSetId: z.string(),
  promptId: z.string(),
  modelOverride: z.string().optional(),
});

// POST /api/testing/runs - Start new test run
testing.post(
  "/runs",
  zValidator("json", startRunSchema),
  async (c) => {
    const { emailSetId, promptId, modelOverride } = c.req.valid("json");

    // Start run in background
    const runId = await runTestSuite({ emailSetId, promptId, modelOverride });

    return c.json({ runId, status: "RUNNING" });
  }
);

// GET /api/testing/runs/:id - Get run with results
testing.get("/runs/:id", async (c) => {
  const { id } = c.req.param();
  const result = await getRunResults(id);

  if (!result) {
    return c.json({ error: "Run not found" }, 404);
  }

  return c.json(result);
});

// POST /api/testing/runs/:id/pause - Pause a running test
testing.post("/runs/:id/pause", async (c) => {
  const { id } = c.req.param();

  try {
    await pauseTestRun(id);
    return c.json({ success: true, status: "PAUSED" });
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : "Failed to pause" }, 400);
  }
});

// POST /api/testing/runs/:id/resume - Resume a paused test
testing.post("/runs/:id/resume", async (c) => {
  const { id } = c.req.param();

  try {
    // Resume in background (don't await completion)
    resumeTestRun(id).catch(err => {
      console.error(`[testing] Error resuming run ${id}:`, err);
    });
    return c.json({ success: true, status: "RUNNING" });
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : "Failed to resume" }, 400);
  }
});

// POST /api/testing/runs/:id/cancel - Cancel a running or paused test
testing.post("/runs/:id/cancel", async (c) => {
  const { id } = c.req.param();

  try {
    await cancelTestRun(id);
    return c.json({ success: true, status: "CANCELLED" });
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : "Failed to cancel" }, 400);
  }
});

// GET /api/testing/runs/:id/failures - Get only failed results
testing.get("/runs/:id/failures", async (c) => {
  const { id } = c.req.param();

  const failures = await prisma.testResult.findMany({
    where: { runId: id, passed: false },
    include: {
      case: {
        include: { persona: true },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  return c.json(failures);
});

// GET /api/testing/compare - Compare two runs
testing.get("/compare", async (c) => {
  const runId1 = c.req.query("run1");
  const runId2 = c.req.query("run2");

  if (!runId1 || !runId2) {
    return c.json({ error: "run1 and run2 query params required" }, 400);
  }

  const comparison = await compareRuns(runId1, runId2);
  return c.json(comparison);
});

// GET /api/testing/runs/:id/export - Export run results as Markdown for Claude Code review
testing.get("/runs/:id/export", async (c) => {
  const { id } = c.req.param();

  try {
    const markdown = await exportRunForReview(id);

    // Return as plain text markdown
    return new Response(markdown, {
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition": `attachment; filename="test-run-${id}-review.md"`,
      },
    });
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : "Export failed" }, 404);
  }
});

export default testing;


