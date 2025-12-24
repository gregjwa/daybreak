import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { prisma } from "../db";

const enrichmentRouter = new Hono();

// ============================================================================
// EXPERIMENTS
// ============================================================================

/**
 * GET /api/enrichment/experiments
 * List all enrichment experiments with stats
 */
enrichmentRouter.get("/experiments", async (c) => {
  const experiments = await prisma.enrichmentExperiment.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      _count: {
        select: { runs: true },
      },
    },
  });

  // Calculate stats for each experiment
  const experimentsWithStats = await Promise.all(
    experiments.map(async (exp) => {
      const runs = await prisma.enrichmentRun.findMany({
        where: { experimentId: exp.id },
        select: {
          latencyMs: true,
          cost: true,
          feedback: {
            select: { isCorrect: true },
          },
        },
      });

      const totalRuns = runs.length;
      const avgLatencyMs = totalRuns > 0
        ? runs.reduce((sum, r) => sum + r.latencyMs, 0) / totalRuns
        : 0;
      const totalCost = runs.reduce((sum, r) => sum + r.cost, 0);
      
      const feedbackRuns = runs.filter(r => r.feedback !== null);
      const correctRuns = feedbackRuns.filter(r => r.feedback?.isCorrect === true);
      const accuracyRate = feedbackRuns.length > 0
        ? correctRuns.length / feedbackRuns.length
        : null;

      return {
        id: exp.id,
        name: exp.name,
        description: exp.description,
        promptVersion: exp.promptVersion,
        modelConfig: exp.modelConfig,
        isActive: exp.isActive,
        createdAt: exp.createdAt,
        stats: {
          totalRuns,
          avgLatencyMs: Math.round(avgLatencyMs),
          totalCost: Math.round(totalCost * 10000) / 10000,
          feedbackCount: feedbackRuns.length,
          accuracyRate: accuracyRate !== null ? Math.round(accuracyRate * 100) : null,
        },
      };
    })
  );

  return c.json(experimentsWithStats);
});

/**
 * GET /api/enrichment/experiments/:id
 * Get a single experiment with detailed stats
 */
enrichmentRouter.get("/experiments/:id", async (c) => {
  const { id } = c.req.param();

  const experiment = await prisma.enrichmentExperiment.findUnique({
    where: { id },
  });

  if (!experiment) {
    return c.json({ error: "Experiment not found" }, 404);
  }

  // Get all runs with feedback
  const runs = await prisma.enrichmentRun.findMany({
    where: { experimentId: id },
    include: {
      feedback: true,
      candidate: {
        select: {
          email: true,
          domain: true,
          displayName: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 100, // Last 100 runs
  });

  // Calculate detailed stats
  const totalRuns = runs.length;
  const avgLatencyMs = totalRuns > 0
    ? runs.reduce((sum, r) => sum + r.latencyMs, 0) / totalRuns
    : 0;
  const totalCost = runs.reduce((sum, r) => sum + r.cost, 0);
  const avgInputTokens = totalRuns > 0
    ? runs.reduce((sum, r) => sum + r.inputTokens, 0) / totalRuns
    : 0;
  const avgOutputTokens = totalRuns > 0
    ? runs.reduce((sum, r) => sum + r.outputTokens, 0) / totalRuns
    : 0;

  const feedbackRuns = runs.filter(r => r.feedback !== null);
  const correctRuns = feedbackRuns.filter(r => r.feedback?.isCorrect === true);
  const accuracyRate = feedbackRuns.length > 0
    ? correctRuns.length / feedbackRuns.length
    : null;

  return c.json({
    experiment: {
      id: experiment.id,
      name: experiment.name,
      description: experiment.description,
      promptVersion: experiment.promptVersion,
      modelConfig: experiment.modelConfig,
      isActive: experiment.isActive,
      createdAt: experiment.createdAt,
    },
    stats: {
      totalRuns,
      avgLatencyMs: Math.round(avgLatencyMs),
      avgInputTokens: Math.round(avgInputTokens),
      avgOutputTokens: Math.round(avgOutputTokens),
      totalCost: Math.round(totalCost * 10000) / 10000,
      feedbackCount: feedbackRuns.length,
      correctCount: correctRuns.length,
      accuracyRate: accuracyRate !== null ? Math.round(accuracyRate * 100) : null,
    },
    recentRuns: runs.map(r => ({
      id: r.id,
      candidateEmail: r.candidate.email,
      candidateDomain: r.candidate.domain,
      model: r.model,
      latencyMs: r.latencyMs,
      cost: r.cost,
      hasFeedback: r.feedback !== null,
      isCorrect: r.feedback?.isCorrect ?? null,
      createdAt: r.createdAt,
    })),
  });
});

/**
 * PATCH /api/enrichment/experiments/:id
 * Update experiment (e.g., deactivate)
 */
enrichmentRouter.patch(
  "/experiments/:id",
  zValidator(
    "json",
    z.object({
      isActive: z.boolean().optional(),
      name: z.string().optional(),
      description: z.string().optional(),
    })
  ),
  async (c) => {
    const { id } = c.req.param();
    const data = c.req.valid("json");

    const experiment = await prisma.enrichmentExperiment.update({
      where: { id },
      data,
    });

    return c.json(experiment);
  }
);

// ============================================================================
// RUNS
// ============================================================================

/**
 * GET /api/enrichment/runs/:id
 * Get a single run with full details (including raw prompt/response)
 */
enrichmentRouter.get("/runs/:id", async (c) => {
  const { id } = c.req.param();

  const run = await prisma.enrichmentRun.findUnique({
    where: { id },
    include: {
      experiment: {
        select: {
          name: true,
          promptVersion: true,
        },
      },
      candidate: {
        select: {
          email: true,
          domain: true,
          displayName: true,
          emailContextJson: true,
        },
      },
      feedback: true,
    },
  });

  if (!run) {
    return c.json({ error: "Run not found" }, 404);
  }

  return c.json({
    id: run.id,
    experiment: run.experiment,
    candidate: run.candidate,
    model: run.model,
    promptVersion: run.promptVersion,
    inputTokens: run.inputTokens,
    outputTokens: run.outputTokens,
    latencyMs: run.latencyMs,
    cost: run.cost,
    rawPrompt: run.rawPrompt,
    rawResponse: run.rawResponse,
    resultJson: run.resultJson,
    feedback: run.feedback,
    createdAt: run.createdAt,
  });
});

// ============================================================================
// FEEDBACK
// ============================================================================

/**
 * POST /api/enrichment/feedback
 * Submit feedback for an enrichment run
 */
enrichmentRouter.post(
  "/feedback",
  zValidator(
    "json",
    z.object({
      runId: z.string(),
      isCorrect: z.boolean(),
      correctedName: z.string().optional(),
      correctedCategories: z.array(z.string()).optional(),
      correctedRelevance: z.boolean().optional(),
      notes: z.string().optional(),
    })
  ),
  async (c) => {
    const data = c.req.valid("json");
    
    // Verify run exists
    const run = await prisma.enrichmentRun.findUnique({
      where: { id: data.runId },
    });

    if (!run) {
      return c.json({ error: "Run not found" }, 404);
    }

    // Upsert feedback
    const feedback = await prisma.enrichmentFeedback.upsert({
      where: { runId: data.runId },
      create: {
        runId: data.runId,
        isCorrect: data.isCorrect,
        correctedName: data.correctedName,
        correctedCategories: data.correctedCategories,
        correctedRelevance: data.correctedRelevance,
        notes: data.notes,
        feedbackAt: new Date(),
      },
      update: {
        isCorrect: data.isCorrect,
        correctedName: data.correctedName,
        correctedCategories: data.correctedCategories,
        correctedRelevance: data.correctedRelevance,
        notes: data.notes,
        feedbackAt: new Date(),
      },
    });

    return c.json(feedback);
  }
);

/**
 * GET /api/enrichment/feedback/pending
 * Get runs that need feedback (no feedback yet)
 */
enrichmentRouter.get("/feedback/pending", async (c) => {
  const limit = parseInt(c.req.query("limit") || "20");

  const runs = await prisma.enrichmentRun.findMany({
    where: {
      feedback: null,
    },
    include: {
      candidate: {
        select: {
          email: true,
          domain: true,
          displayName: true,
          suggestedSupplierName: true,
          suggestedCategories: true,
          isRelevant: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return c.json(
    runs.map(r => ({
      runId: r.id,
      candidateEmail: r.candidate.email,
      candidateDomain: r.candidate.domain,
      candidateDisplayName: r.candidate.displayName,
      result: {
        suggestedName: r.candidate.suggestedSupplierName,
        categories: r.candidate.suggestedCategories,
        isRelevant: r.candidate.isRelevant,
      },
      createdAt: r.createdAt,
    }))
  );
});

// ============================================================================
// COMPARISON
// ============================================================================

/**
 * GET /api/enrichment/compare
 * Compare two experiments side by side
 */
enrichmentRouter.get("/compare", async (c) => {
  const exp1Id = c.req.query("exp1");
  const exp2Id = c.req.query("exp2");

  if (!exp1Id || !exp2Id) {
    return c.json({ error: "Both exp1 and exp2 query params required" }, 400);
  }

  const [exp1, exp2] = await Promise.all([
    prisma.enrichmentExperiment.findUnique({ where: { id: exp1Id } }),
    prisma.enrichmentExperiment.findUnique({ where: { id: exp2Id } }),
  ]);

  if (!exp1 || !exp2) {
    return c.json({ error: "One or both experiments not found" }, 404);
  }

  // Get stats for both
  const getStats = async (expId: string) => {
    const runs = await prisma.enrichmentRun.findMany({
      where: { experimentId: expId },
      include: { feedback: true },
    });

    const total = runs.length;
    const withFeedback = runs.filter(r => r.feedback);
    const correct = withFeedback.filter(r => r.feedback?.isCorrect);

    return {
      totalRuns: total,
      avgLatencyMs: total > 0 ? Math.round(runs.reduce((s, r) => s + r.latencyMs, 0) / total) : 0,
      avgCost: total > 0 ? runs.reduce((s, r) => s + r.cost, 0) / total : 0,
      feedbackCount: withFeedback.length,
      accuracyRate: withFeedback.length > 0 ? correct.length / withFeedback.length : null,
    };
  };

  const [stats1, stats2] = await Promise.all([
    getStats(exp1Id),
    getStats(exp2Id),
  ]);

  return c.json({
    experiment1: {
      id: exp1.id,
      name: exp1.name,
      promptVersion: exp1.promptVersion,
      stats: stats1,
    },
    experiment2: {
      id: exp2.id,
      name: exp2.name,
      promptVersion: exp2.promptVersion,
      stats: stats2,
    },
    comparison: {
      latencyDiff: stats1.avgLatencyMs - stats2.avgLatencyMs,
      costDiff: stats1.avgCost - stats2.avgCost,
      accuracyDiff: stats1.accuracyRate !== null && stats2.accuracyRate !== null
        ? stats1.accuracyRate - stats2.accuracyRate
        : null,
    },
  });
});

export { enrichmentRouter };

