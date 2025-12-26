import { Hono } from "hono";
import { getAuth } from "@hono/clerk-auth";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { prisma } from "../db";
import { acceptProposal, rejectProposal, expireOldProposals } from "../lib/status-detector";
import { linkThreadToProject, getThreadsNeedingProjectLink } from "../lib/project-linker";

const resolveSchema = z.object({
  action: z.enum(["accept", "reject"]),
});

const linkProjectSchema = z.object({
  projectId: z.string().cuid(),
  confidence: z.number().optional(),
});

const app = new Hono()
  // GET /api/proposals - List pending status proposals
  .get("/", async (c) => {
    const auth = getAuth(c);
    if (!auth?.userId) return c.json({ error: "Unauthorized" }, 401);

    try {
      const user = await prisma.user.findUnique({ where: { clerkId: auth.userId } });
      if (!user) return c.json({ error: "User not found" }, 404);

      // Expire old proposals first
      await expireOldProposals();

      const proposals = await prisma.statusProposal.findMany({
        where: {
          status: "PENDING",
          project: { userId: user.id },
        },
        include: {
          projectSupplier: {
            include: {
              project: { select: { id: true, name: true, date: true } },
              supplier: { select: { id: true, name: true } },
            },
          },
        },
        orderBy: { createdAt: "desc" },
      });

      return c.json({
        proposals: proposals.map(p => ({
          id: p.id,
          project: {
            id: p.projectSupplier.project.id,
            name: p.projectSupplier.project.name,
            date: p.projectSupplier.project.date,
          },
          supplier: {
            id: p.projectSupplier.supplier.id,
            name: p.projectSupplier.supplier.name,
          },
          fromStatus: p.fromStatus,
          toStatus: p.toStatus,
          confidence: p.confidence,
          matchedSignals: p.matchedSignals,
          reasoning: p.reasoning,
          createdAt: p.createdAt,
          expiresAt: p.expiresAt,
        })),
      });
    } catch (error) {
      console.error("Error fetching proposals:", error);
      return c.json({ error: "Failed to fetch proposals" }, 500);
    }
  })

  // GET /api/proposals/count - Get count of pending items
  .get("/count", async (c) => {
    const auth = getAuth(c);
    if (!auth?.userId) return c.json({ error: "Unauthorized" }, 401);

    try {
      const user = await prisma.user.findUnique({ where: { clerkId: auth.userId } });
      if (!user) return c.json({ error: "User not found" }, 404);

      const [statusProposals, ambiguousThreads] = await Promise.all([
        prisma.statusProposal.count({
          where: {
            status: "PENDING",
            project: { userId: user.id },
          },
        }),
        prisma.emailThread.count({
          where: {
            userId: user.id,
            detectedProjectId: null,
            messages: {
              some: { supplierId: { not: null } },
            },
          },
        }),
      ]);

      return c.json({
        statusProposals,
        ambiguousThreads,
        total: statusProposals + ambiguousThreads,
      });
    } catch (error) {
      console.error("Error counting proposals:", error);
      return c.json({ error: "Failed to count proposals" }, 500);
    }
  })

  // POST /api/proposals/:id/resolve - Accept or reject a proposal
  .post("/:id/resolve", zValidator("json", resolveSchema), async (c) => {
    const auth = getAuth(c);
    if (!auth?.userId) return c.json({ error: "Unauthorized" }, 401);

    const proposalId = c.req.param("id");
    const { action } = c.req.valid("json");

    try {
      const user = await prisma.user.findUnique({ where: { clerkId: auth.userId } });
      if (!user) return c.json({ error: "User not found" }, 404);

      // Verify ownership
      const proposal = await prisma.statusProposal.findUnique({
        where: { id: proposalId },
        include: { project: { select: { userId: true } } },
      });

      if (!proposal) return c.json({ error: "Proposal not found" }, 404);
      if (proposal.project?.userId !== user.id) return c.json({ error: "Unauthorized" }, 403);

      if (action === "accept") {
        await acceptProposal(proposalId, user.id);
      } else {
        await rejectProposal(proposalId, user.id);
      }

      return c.json({ success: true, action });
    } catch (error) {
      console.error("Error resolving proposal:", error);
      return c.json({ error: "Failed to resolve proposal" }, 500);
    }
  })

  // GET /api/proposals/threads - Get threads needing project link
  .get("/threads", async (c) => {
    const auth = getAuth(c);
    if (!auth?.userId) return c.json({ error: "Unauthorized" }, 401);

    try {
      const user = await prisma.user.findUnique({ where: { clerkId: auth.userId } });
      if (!user) return c.json({ error: "User not found" }, 404);

      const threads = await getThreadsNeedingProjectLink(user.id);

      return c.json({ threads });
    } catch (error) {
      console.error("Error fetching threads needing link:", error);
      return c.json({ error: "Failed to fetch threads" }, 500);
    }
  })

  // POST /api/proposals/threads/:threadId/link - Link a thread to a project
  .post("/threads/:threadId/link", zValidator("json", linkProjectSchema), async (c) => {
    const auth = getAuth(c);
    if (!auth?.userId) return c.json({ error: "Unauthorized" }, 401);

    const threadId = c.req.param("threadId");
    const { projectId, confidence } = c.req.valid("json");

    try {
      const user = await prisma.user.findUnique({ where: { clerkId: auth.userId } });
      if (!user) return c.json({ error: "User not found" }, 404);

      // Verify thread ownership
      const thread = await prisma.emailThread.findUnique({
        where: { id: threadId },
      });

      if (!thread) return c.json({ error: "Thread not found" }, 404);
      if (thread.userId !== user.id) return c.json({ error: "Unauthorized" }, 403);

      // Verify project ownership
      const project = await prisma.project.findUnique({
        where: { id: projectId },
      });

      if (!project) return c.json({ error: "Project not found" }, 404);
      if (project.userId !== user.id) return c.json({ error: "Unauthorized" }, 403);

      await linkThreadToProject(threadId, projectId, {
        confidence: confidence || 1.0,
        method: "USER",
      });

      return c.json({ success: true });
    } catch (error) {
      console.error("Error linking thread to project:", error);
      return c.json({ error: "Failed to link thread" }, 500);
    }
  })

  // POST /api/proposals/threads/:threadId/dismiss - Mark thread as not project-related
  .post("/threads/:threadId/dismiss", async (c) => {
    const auth = getAuth(c);
    if (!auth?.userId) return c.json({ error: "Unauthorized" }, 401);

    const threadId = c.req.param("threadId");

    try {
      const user = await prisma.user.findUnique({ where: { clerkId: auth.userId } });
      if (!user) return c.json({ error: "User not found" }, 404);

      // Verify thread ownership
      const thread = await prisma.emailThread.findUnique({
        where: { id: threadId },
      });

      if (!thread) return c.json({ error: "Thread not found" }, 404);
      if (thread.userId !== user.id) return c.json({ error: "Unauthorized" }, 403);

      // Mark as dismissed by setting detectedProjectId to a special value
      // For now, we'll just set confidence to 0 to indicate it was reviewed
      await prisma.emailThread.update({
        where: { id: threadId },
        data: {
          detectedProjectConf: 0,
        },
      });

      return c.json({ success: true });
    } catch (error) {
      console.error("Error dismissing thread:", error);
      return c.json({ error: "Failed to dismiss thread" }, 500);
    }
  });

export default app;


