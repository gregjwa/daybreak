import "dotenv/config";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { serve } from "@hono/node-server";
import { clerkMiddleware } from "@hono/clerk-auth";
import { createClerkClient } from "@clerk/backend";
import { prisma } from "./db";
import { processEmailsWithToken } from "./lib/gmail-service";
import { processGmailHistoryWithThreads } from "./lib/thread-processor";

// Import routers
import organizationsRouter from "./routes/organizations";
import rolesRouter from "./routes/roles";
import invitesRouter from "./routes/invites";
import suppliersRouter from "./routes/suppliers";
import supplierCategoriesRouter from "./routes/supplier-categories";
import supplierCandidatesRouter from "./routes/supplier-candidates";
import projectsRouter from "./routes/projects";
import messagesRouter from "./routes/messages";
import gmailRouter from "./routes/gmail";
import { enrichmentRouter } from "./routes/enrichment";
import proposalsRouter from "./routes/proposals";
import statusesRouter from "./routes/statuses";
import importRouter from "./routes/import";
import testingRouter from "./routes/testing";

function emailDebugEnabled() {
  return (
    process.env.DEBUG_EMAILS === "1" ||
    process.env.DEBUG_EMAILS === "true" ||
    process.env.DEBUG_EMAILS === "yes"
  );
}

// Create the Hono app and chain all routes for proper type inference
const app = new Hono()
  .use("/*", cors())
  .use("*", clerkMiddleware())

  // Health check
  .get("/health", (c) => {
    return c.json({ status: "ok", timestamp: new Date().toISOString() });
  })

  // Mount sub-routers
  // Organization routes
  .route("/api/organizations", organizationsRouter)
  .route("/api/organizations", rolesRouter) // /api/organizations/:orgId/roles
  .route("/api/organizations", invitesRouter) // /api/organizations/:orgId/invites
  
  // Public/Shared routes
  .route("/api/invites", invitesRouter) // /api/invites/:token/accept

  // CRM Routes
  .route("/api/suppliers", suppliersRouter)
  .route("/api/supplier-categories", supplierCategoriesRouter)
  .route("/api/supplier-candidates", supplierCandidatesRouter)
  .route("/api/projects", projectsRouter)
  .route("/api/messages", messagesRouter)
  .route("/api/emails", gmailRouter)
  .route("/api/enrichment", enrichmentRouter)
  .route("/api/proposals", proposalsRouter)
  .route("/api/statuses", statusesRouter)
  .route("/api/import", importRouter)
  .route("/api/testing", testingRouter)

  // Gmail Webhooks (No Auth Middleware needed, but keeping simple structure)
  // Note: Hono middleware runs on all routes by default if specific path not excluded?
  // clerkMiddleware() checks for auth but doesn't block unless we check auth.userId.
  // Webhooks are public endpoints essentially (verified by logic inside or Google signature).
  // Google Pub/Sub doesn't send Bearer token.
  .post("/api/webhooks/gmail", async (c) => {
    try {
      const debug = emailDebugEnabled();
      const body = await c.req.json();
      if (debug) {
        console.log("[gmail-webhook] raw body keys:", Object.keys(body ?? {}));
        if (body?.message) {
          console.log("[gmail-webhook] pubsub messageId:", body.message.messageId);
          console.log("[gmail-webhook] pubsub publishTime:", body.message.publishTime);
        }
      }
      
      // Decode the Pub/Sub message
      if (body.message?.data) {
        const decodedData = Buffer.from(body.message.data, "base64").toString(
          "utf-8"
        );
        const notification = JSON.parse(decodedData);
        const { emailAddress, historyId } = notification;

        console.log(
          `\n🔔 New email notification for ${emailAddress}, historyId: ${historyId}`
        );
        if (debug) {
          console.log("[gmail-webhook] decoded notification:", notification);
        }
        // Find User by email address in GmailWatch
        const watch = await prisma.gmailWatch.findFirst({
            where: { emailAddress },
            include: { user: true }
        });
        if (debug) {
          console.log(
            "[gmail-webhook] watch lookup result:",
            watch
              ? {
                  id: watch.id,
                  userId: watch.userId,
                  clerkId: watch.user?.clerkId,
                  emailAddress: watch.emailAddress,
                  storedHistoryId: watch.historyId,
                }
              : null
          );
        }

        if (watch && process.env.CLERK_SECRET_KEY) {
             const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
             try {
                 const tokenResponse = await clerk.users.getUserOauthAccessToken(watch.user.clerkId, "oauth_google");
                 if (debug) {
                   console.log(
                     "[gmail-webhook] oauth tokenResponse count:",
                     tokenResponse?.data?.length ?? 0
                   );
                 }
                 if (tokenResponse.data.length > 0) {
                     const token = tokenResponse.data[0].token;
                     if (debug) {
                       console.log("[gmail-webhook] processing with startHistoryId:", watch.historyId);
                     }
                     // Use thread-aware processing
                     const result = await processGmailHistoryWithThreads(
                       token,
                       watch.historyId,
                       watch.user.id,
                       emailAddress,
                       { debug }
                     );
                     if (debug) {
                       console.log("[gmail-webhook] processing result:", result);
                     }
                     
                     // Update historyId
                     await prisma.gmailWatch.update({
                         where: { id: watch.id },
                         data: { historyId: historyId.toString() }
                     });
                     if (debug) {
                       console.log("[gmail-webhook] updated watch historyId ->", historyId.toString());
                     }
                     console.log(`Processed updates for ${emailAddress}`);
                 }
             } catch (err) {
                 console.error("Error processing webhook updates:", err);
             }
        } else if (debug) {
          console.log(
            "[gmail-webhook] skipping processing (missing watch or CLERK_SECRET_KEY)",
            { hasWatch: Boolean(watch), hasClerkSecret: Boolean(process.env.CLERK_SECRET_KEY) }
          );
        }
      }

      return c.json({ success: true });
    } catch (error) {
      console.error("Gmail webhook error:", error);
      return c.json({ success: false });
    }
  });

// Export the app type for RPC client
export type AppType = typeof app;

// Start the server
const port = 3000;
console.log(`🚀 Server is running on http://localhost:${port}`);

serve({
  fetch: app.fetch,
  port,
});

export default app;
