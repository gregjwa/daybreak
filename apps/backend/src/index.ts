import "dotenv/config";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { serve } from "@hono/node-server";
import { clerkMiddleware } from "@hono/clerk-auth";
import { createClerkClient } from "@clerk/backend";
import { prisma } from "./db";
import { processEmailsWithToken } from "./lib/gmail-service";

// Import routers
import organizationsRouter from "./routes/organizations";
import rolesRouter from "./routes/roles";
import invitesRouter from "./routes/invites";
import suppliersRouter from "./routes/suppliers";
import projectsRouter from "./routes/projects";
import messagesRouter from "./routes/messages";
import gmailRouter from "./routes/gmail";

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
  .route("/api/projects", projectsRouter)
  .route("/api/messages", messagesRouter)
  .route("/api/emails", gmailRouter)

  // Gmail Webhooks (No Auth Middleware needed, but keeping simple structure)
  // Note: Hono middleware runs on all routes by default if specific path not excluded?
  // clerkMiddleware() checks for auth but doesn't block unless we check auth.userId.
  // Webhooks are public endpoints essentially (verified by logic inside or Google signature).
  // Google Pub/Sub doesn't send Bearer token.
  .post("/api/webhooks/gmail", async (c) => {
    try {
      const body = await c.req.json();
      
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

        // Find User by email address in GmailWatch
        const watch = await prisma.gmailWatch.findFirst({
            where: { emailAddress },
            include: { user: true }
        });

        if (watch && process.env.CLERK_SECRET_KEY) {
             const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
             try {
                 const tokenResponse = await clerk.users.getUserOauthAccessToken(watch.user.clerkId, "oauth_google");
                 if (tokenResponse.data.length > 0) {
                     const token = tokenResponse.data[0].token;
                     await processEmailsWithToken(token, watch.historyId, watch.user.id);
                     
                     // Update historyId
                     await prisma.gmailWatch.update({
                         where: { id: watch.id },
                         data: { historyId: historyId.toString() }
                     });
                     console.log(`Processed updates for ${emailAddress}`);
                 }
             } catch (err) {
                 console.error("Error processing webhook updates:", err);
             }
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
