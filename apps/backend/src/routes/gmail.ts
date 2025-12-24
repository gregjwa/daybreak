import { Hono } from "hono";
import { getAuth } from "@hono/clerk-auth";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { google } from "googleapis";
import { prisma } from "../db";
import { processEmailsWithToken } from "../lib/gmail-service";
import {
  createBackfillRun,
  processBackfillTick,
  getBackfillRunStatus,
  cancelBackfillRun,
} from "../lib/gmail-backfill";
import { runEnrichmentPipeline } from "../lib/enrichment";

const startBackfillSchema = z.object({
  timeframeMonths: z.number().min(1).max(24).default(6),
  eventContext: z.string().optional(), // "I plan weddings and corporate events"
});

const tickBackfillSchema = z.object({
  maxMessagesPerTick: z.number().min(10).max(100).optional(),
});

const enrichSchema = z.object({
  threshold: z.number().min(0).max(1).optional(),
});

const app = new Hono()
  // POST /api/emails/watch - Setup Gmail Watch
  .post("/watch", async (c) => {
    const auth = getAuth(c);
    if (!auth?.userId) return c.json({ error: "Unauthorized" }, 401);

    try {
      const clerkClient = c.get("clerk");
      const tokenResponse = await clerkClient.users.getUserOauthAccessToken(
        auth.userId,
        "oauth_google"
      );

      if (!tokenResponse.data || tokenResponse.data.length === 0) {
        return c.json({ error: "No Token" }, 403);
      }

      const accessToken = tokenResponse.data[0].token;
      const oauth2Client = new google.auth.OAuth2();
      oauth2Client.setCredentials({ access_token: accessToken });
      const gmail = google.gmail({ version: "v1", auth: oauth2Client });

      const topicName = process.env.GMAIL_PUBSUB_TOPIC;
      if (!topicName) return c.json({ error: "GMAIL_PUBSUB_TOPIC not configured" }, 500);

      const watchResponse = await gmail.users.watch({
        userId: "me",
        requestBody: {
            topicName,
            labelIds: ["INBOX"],
        },
      });

      const profile = await gmail.users.getProfile({ userId: "me" });
      const gmailAddress = profile.data.emailAddress!;

      // Ensure User exists
      const clerkUser = await clerkClient.users.getUser(auth.userId);
      const email = clerkUser.emailAddresses[0]?.emailAddress;
      
      const user = await prisma.user.upsert({
        where: { clerkId: auth.userId },
        update: { email: email! },
        create: { clerkId: auth.userId, email: email! }
      });

      // Save Watch to DB
      await prisma.gmailWatch.upsert({
        where: { userId: user.id },
        update: {
            emailAddress: gmailAddress,
            historyId: watchResponse.data.historyId!,
            expiration: BigInt(watchResponse.data.expiration!),
        },
        create: {
            userId: user.id,
            emailAddress: gmailAddress,
            historyId: watchResponse.data.historyId!,
            expiration: BigInt(watchResponse.data.expiration!),
        }
      });

      return c.json({
        success: true,
        historyId: watchResponse.data.historyId,
        expiration: watchResponse.data.expiration,
        gmailAddress,
        message: "Gmail watch set up successfully.",
      });
    } catch (error) {
      console.error("Error setting up Gmail watch:", error);
      return c.json({ error: "Failed to setup watch" }, 500);
    }
  })

  // POST /api/emails/stop-watch
  .post("/stop-watch", async (c) => {
    const auth = getAuth(c);
    if (!auth?.userId) return c.json({ error: "Unauthorized" }, 401);

    try {
        const clerkClient = c.get("clerk");
        const tokenResponse = await clerkClient.users.getUserOauthAccessToken(
            auth.userId,
            "oauth_google"
        );
        
        if (tokenResponse.data && tokenResponse.data.length > 0) {
            const accessToken = tokenResponse.data[0].token;
            const oauth2Client = new google.auth.OAuth2();
            oauth2Client.setCredentials({ access_token: accessToken });
            const gmail = google.gmail({ version: "v1", auth: oauth2Client });
            await gmail.users.stop({ userId: "me" });
        }

        // Remove from DB
        const user = await prisma.user.findUnique({ where: { clerkId: auth.userId } });
        if (user) {
            await prisma.gmailWatch.deleteMany({ where: { userId: user.id } });
        }

        return c.json({ success: true });
    } catch (error) {
        return c.json({ error: "Failed to stop watch" }, 500);
    }
  })

  // GET /api/emails/process-new (Manual Trigger)
  .get("/process-new", async (c) => {
    const auth = getAuth(c);
    if (!auth?.userId) return c.json({ error: "Unauthorized" }, 401);

    const historyIdParam = c.req.query("historyId");
    
    try {
        const user = await prisma.user.findUnique({ 
            where: { clerkId: auth.userId },
            include: { gmailWatch: true }
        });

        if (!user) return c.json({ error: "User not found" }, 404);

        const startHistoryId = historyIdParam || user.gmailWatch?.historyId;
        if (!startHistoryId) return c.json({ error: "No historyId found. Setup watch first." }, 400);

        // Get Token
        const clerkClient = c.get("clerk");
        const tokenResponse = await clerkClient.users.getUserOauthAccessToken(auth.userId, "oauth_google");
        if (!tokenResponse.data || tokenResponse.data.length === 0) return c.json({ error: "No Token" }, 403);
        
        const accessToken = tokenResponse.data[0].token;

        const result = await processEmailsWithToken(accessToken, startHistoryId, user.id);
        
        return c.json(result);

    } catch (error) {
        console.error("Error processing emails:", error);
        return c.json({ error: "Processing failed" }, 500);
    }
  })

  // --- Backfill Endpoints ---

  // POST /api/emails/backfill/start - Start a new backfill run
  .post("/backfill/start", zValidator("json", startBackfillSchema), async (c) => {
    const auth = getAuth(c);
    if (!auth?.userId) return c.json({ error: "Unauthorized" }, 401);

    try {
      // Ensure user exists
      let user = await prisma.user.findUnique({ where: { clerkId: auth.userId } });
      if (!user) {
        const clerkClient = c.get("clerk");
        const clerkUser = await clerkClient.users.getUser(auth.userId);
        const email = clerkUser.emailAddresses[0]?.emailAddress;
        if (!email) return c.json({ error: "User email not found" }, 400);

        user = await prisma.user.create({
          data: { clerkId: auth.userId, email },
        });
      }

      // Check for existing active run
      const activeRun = await prisma.backfillRun.findFirst({
        where: {
          userId: user.id,
          status: { in: ["PENDING", "RUNNING"] },
        },
      });

      if (activeRun) {
        return c.json({
          error: "A backfill run is already in progress",
          runId: activeRun.id,
        }, 409);
      }

      const data = c.req.valid("json");
      const run = await createBackfillRun(user.id, data.timeframeMonths, data.eventContext);

      return c.json({
        success: true,
        runId: run.id,
        gmailQuery: run.gmailQuery,
        eventContext: data.eventContext,
      }, 201);
    } catch (error) {
      console.error("Error starting backfill:", error);
      return c.json({ error: "Failed to start backfill" }, 500);
    }
  })

  // GET /api/emails/backfill/:runId/status - Get backfill run status
  .get("/backfill/:runId/status", async (c) => {
    const auth = getAuth(c);
    if (!auth?.userId) return c.json({ error: "Unauthorized" }, 401);

    const runId = c.req.param("runId");

    try {
      const user = await prisma.user.findUnique({ where: { clerkId: auth.userId } });
      if (!user) return c.json({ error: "User not found" }, 404);

      const status = await getBackfillRunStatus(runId);
      if (!status) return c.json({ error: "Run not found" }, 404);

      // Verify ownership (run userId matches)
      const run = await prisma.backfillRun.findUnique({ where: { id: runId } });
      if (run?.userId !== user.id) return c.json({ error: "Unauthorized" }, 403);

      return c.json(status);
    } catch (error) {
      console.error("Error getting backfill status:", error);
      return c.json({ error: "Failed to get status" }, 500);
    }
  })

  // POST /api/emails/backfill/:runId/tick - Process one page of backfill
  .post("/backfill/:runId/tick", zValidator("json", tickBackfillSchema), async (c) => {
    const auth = getAuth(c);
    if (!auth?.userId) return c.json({ error: "Unauthorized" }, 401);

    const runId = c.req.param("runId");

    try {
      const user = await prisma.user.findUnique({ where: { clerkId: auth.userId } });
      if (!user) return c.json({ error: "User not found" }, 404);

      // Verify ownership
      const run = await prisma.backfillRun.findUnique({ where: { id: runId } });
      if (!run || run.userId !== user.id) return c.json({ error: "Run not found" }, 404);

      // Get OAuth token
      const clerkClient = c.get("clerk");
      const tokenResponse = await clerkClient.users.getUserOauthAccessToken(auth.userId, "oauth_google");
      if (!tokenResponse.data || tokenResponse.data.length === 0) {
        return c.json({ error: "No Google token. Please reconnect Google." }, 403);
      }

      const accessToken = tokenResponse.data[0].token;
      const data = c.req.valid("json");

      const result = await processBackfillTick(accessToken, runId, {
        maxMessagesPerTick: data.maxMessagesPerTick,
      });

      return c.json(result);
    } catch (error) {
      console.error("Error processing backfill tick:", error);
      return c.json({ error: "Failed to process tick" }, 500);
    }
  })

  // POST /api/emails/backfill/:runId/cancel - Cancel a backfill run
  .post("/backfill/:runId/cancel", async (c) => {
    const auth = getAuth(c);
    if (!auth?.userId) return c.json({ error: "Unauthorized" }, 401);

    const runId = c.req.param("runId");

    try {
      const user = await prisma.user.findUnique({ where: { clerkId: auth.userId } });
      if (!user) return c.json({ error: "User not found" }, 404);

      // Verify ownership
      const run = await prisma.backfillRun.findUnique({ where: { id: runId } });
      if (!run || run.userId !== user.id) return c.json({ error: "Run not found" }, 404);

      await cancelBackfillRun(runId);

      return c.json({ success: true });
    } catch (error) {
      console.error("Error cancelling backfill:", error);
      return c.json({ error: "Failed to cancel" }, 500);
    }
  })

  // GET /api/emails/backfill/active - Get current active backfill run (if any)
  .get("/backfill/active", async (c) => {
    const auth = getAuth(c);
    if (!auth?.userId) return c.json({ error: "Unauthorized" }, 401);

    try {
      const user = await prisma.user.findUnique({ where: { clerkId: auth.userId } });
      if (!user) return c.json({ activeRun: null });

      const activeRun = await prisma.backfillRun.findFirst({
        where: {
          userId: user.id,
          status: { in: ["PENDING", "RUNNING"] },
        },
        orderBy: { createdAt: "desc" },
      });

      if (!activeRun) return c.json({ activeRun: null });

      return c.json({
        activeRun: {
          id: activeRun.id,
          status: activeRun.status,
          eventContext: activeRun.eventContext,
          scannedMessages: activeRun.scannedMessages,
          createdCandidates: activeRun.createdCandidates,
          enrichmentStatus: activeRun.enrichmentStatus,
          enrichedCount: activeRun.enrichedCount,
          autoImportedCount: activeRun.autoImportedCount,
          startedAt: activeRun.startedAt,
        },
      });
    } catch (error) {
      console.error("Error getting active backfill:", error);
      return c.json({ error: "Failed to get active run" }, 500);
    }
  })

  // POST /api/emails/backfill/:runId/enrich - Run AI enrichment + auto-import
  .post("/backfill/:runId/enrich", zValidator("json", enrichSchema), async (c) => {
    const auth = getAuth(c);
    if (!auth?.userId) return c.json({ error: "Unauthorized" }, 401);

    const runId = c.req.param("runId");

    try {
      const user = await prisma.user.findUnique({ where: { clerkId: auth.userId } });
      if (!user) return c.json({ error: "User not found" }, 404);

      // Verify ownership
      const run = await prisma.backfillRun.findUnique({ where: { id: runId } });
      if (!run || run.userId !== user.id) return c.json({ error: "Run not found" }, 404);

      // Check that discovery phase is complete
      if (run.status !== "COMPLETED") {
        return c.json({ error: "Discovery phase not complete" }, 400);
      }

      // Check if already enriching
      if (run.enrichmentStatus === "RUNNING") {
        return c.json({ error: "Enrichment already in progress" }, 409);
      }

      // Get event context
      const eventContext = run.eventContext || user.eventContext || "";

      // Run the enrichment pipeline
      const result = await runEnrichmentPipeline(runId, eventContext);

      return c.json({
        success: true,
        enriched: result.enriched,
        imported: result.imported,
        dismissed: result.dismissed,
        needsReview: result.needsReview,
      });
    } catch (error) {
      console.error("Error running enrichment:", error);
      return c.json({ error: "Failed to run enrichment" }, 500);
    }
  });

export default app;
