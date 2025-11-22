import "dotenv/config";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { serve } from "@hono/node-server";
import { clerkMiddleware, getAuth } from "@hono/clerk-auth";
import { google } from "googleapis";

// Import new routers
import organizationsRouter from "./routes/organizations";
import rolesRouter from "./routes/roles";
import invitesRouter from "./routes/invites";

// Helper function to extract email body from Gmail message
function extractEmailBody(payload: any): string {
  let body = "";

  if (payload.parts) {
    const textPart = payload.parts.find(
      (part: any) => part.mimeType === "text/plain"
    );
    if (textPart?.body?.data) {
      body = Buffer.from(textPart.body.data, "base64").toString("utf-8");
    }
  } else if (payload.body?.data) {
    body = Buffer.from(payload.body.data, "base64").toString("utf-8");
  }

  return body;
}

// Helper function to fetch Gmail history
async function fetchGmailHistory(
  gmail: any,
  startHistoryId: string
): Promise<any[]> {
  try {
    const response = await gmail.users.history.list({
      userId: "me",
      startHistoryId,
      historyTypes: ["messageAdded"],
    });

    const history = response.data.history || [];
    const newMessages = [];

    for (const record of history) {
      if (record.messagesAdded) {
        for (const addedMessage of record.messagesAdded) {
          newMessages.push(addedMessage.message);
        }
      }
    }

    return newMessages;
  } catch (error) {
    console.error("Error fetching Gmail history:", error);
    return [];
  }
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
  .route("/api/organizations", organizationsRouter) // /api/organizations, /api/organizations/:id
  .route("/api/organizations", rolesRouter) // /api/organizations/:orgId/roles
  .route("/api/organizations", invitesRouter) // /api/organizations/:orgId/invites
  .route("/api/invites", invitesRouter) // /api/invites/:token/accept, /api/invites/public/:token

  // Gmail Webhooks
  .post("/api/webhooks/gmail", async (c) => {
    try {
      const body = await c.req.json();
      console.log("📬 Gmail webhook received:", body);

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
      }

      return c.json({ success: true });
    } catch (error) {
      console.error("Gmail webhook error:", error);
      return c.json({ success: false });
    }
  })

  // Gmail Watch Setup
  .post("/api/emails/watch", async (c) => {
    const auth = getAuth(c);

    if (!auth?.userId) {
      return c.json({ error: "Unauthorized" }, 401);
    }

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

      const topicName =
        process.env.GMAIL_PUBSUB_TOPIC ||
        "projects/YOUR_PROJECT/topics/gmail-notifications";

      const watchResponse = await gmail.users.watch({
        userId: "me",
        requestBody: {
          topicName,
          labelIds: ["INBOX"],
        },
      });

      return c.json({
        success: true,
        historyId: watchResponse.data.historyId,
        expiration: watchResponse.data.expiration,
        message: "Gmail watch set up successfully.",
      });
    } catch (error) {
      console.error("Error setting up Gmail watch:", error);
      return c.json(
        {
          error: "Failed to set up Gmail watch",
          message: error instanceof Error ? error.message : "Unknown error",
        },
        500
      );
    }
  })

  // Stop Gmail Watch
  .post("/api/emails/stop-watch", async (c) => {
    const auth = getAuth(c);

    if (!auth?.userId) {
      return c.json({ error: "Unauthorized" }, 401);
    }

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

      await gmail.users.stop({
        userId: "me",
      });

      return c.json({
        success: true,
        message: "Gmail watch stopped successfully.",
      });
    } catch (error) {
      console.error("Error stopping Gmail watch:", error);
      return c.json(
        {
          error: "Failed to stop Gmail watch",
          message: error instanceof Error ? error.message : "Unknown error",
        },
        500
      );
    }
  })

  // Process New Emails
  .get("/api/emails/process-new", async (c) => {
    const auth = getAuth(c);

    if (!auth?.userId) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    try {
      const historyId = c.req.query("historyId");

      if (!historyId) {
        return c.json({ error: "historyId query parameter required" }, 400);
      }

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

      const newMessages = await fetchGmailHistory(gmail, historyId);

      console.log(
        `\n📨 Processing ${newMessages.length} new messages since historyId: ${historyId}`
      );

      for (const msg of newMessages) {
        const emailData = await gmail.users.messages.get({
          userId: "me",
          id: msg.id!,
          format: "full",
        });
        // Log logic here...
      }

      return c.json({
        newMessagesCount: newMessages.length,
      });
    } catch (error) {
      console.error("Error processing new emails:", error);
      return c.json(
        {
          error: "Failed to process new emails",
          message: error instanceof Error ? error.message : "Unknown error",
        },
        500
      );
    }
  })

  // Analyze Emails
  .get("/api/emails/analyze", async (c) => {
    const auth = getAuth(c);

    if (!auth?.userId) {
      return c.json({ error: "Unauthorized" }, 401);
    }

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

      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const query = `after:${Math.floor(sevenDaysAgo.getTime() / 1000)}`;

      const response = await gmail.users.messages.list({
        userId: "me",
        q: query,
        maxResults: 20,
      });

      const messages = response.data.messages || [];

      return c.json({
        total: messages.length,
      });
    } catch (error) {
      console.error("Error analyzing emails:", error);
      return c.json(
        {
          error: "Failed to analyze emails",
          message: error instanceof Error ? error.message : "Unknown error",
        },
        500
      );
    }
  })

  // Get Calendar Events
  .get("/api/events", async (c) => {
    const auth = getAuth(c);

    if (!auth?.userId) {
      return c.json(
        {
          error: "Unauthorized",
          message: "You must be logged in to view events.",
        },
        401
      );
    }

    try {
      const clerkClient = c.get("clerk");
      const user = await clerkClient.users.getUser(auth.userId);
      const googleAccount = user.externalAccounts.find(
        (account) => account.provider === "oauth_google"
      );

      if (!googleAccount) {
        return c.json(
          {
            error: "Not Connected",
            message:
              "Please connect your Google account to view calendar events.",
          },
          403
        );
      }

      const tokenResponse = await clerkClient.users.getUserOauthAccessToken(
        auth.userId,
        "oauth_google"
      );

      if (!tokenResponse.data || tokenResponse.data.length === 0) {
        return c.json(
          {
            error: "No Token",
            message:
              "Unable to get Google access token. Please reconnect your Google account.",
          },
          403
        );
      }

      const accessToken = tokenResponse.data[0].token;
      const oauth2Client = new google.auth.OAuth2();
      oauth2Client.setCredentials({ access_token: accessToken });
      const calendar = google.calendar({ version: "v3", auth: oauth2Client });

      const now = new Date();
      const oneMonthAgo = new Date();
      oneMonthAgo.setMonth(now.getMonth() - 1);

      const response = await calendar.events.list({
        calendarId: "primary",
        timeMin: oneMonthAgo.toISOString(),
        timeMax: now.toISOString(),
        maxResults: 50,
        singleEvents: true,
        orderBy: "startTime",
      });

      const events =
        response.data.items?.map((event) => ({
          id: event.id || "",
          name: event.summary || "Untitled Event",
          date: event.start?.dateTime || event.start?.date || "",
          description: event.description || "",
          location: event.location || "",
        })) || [];

      return c.json(events);
    } catch (error) {
      console.error("Error fetching calendar events:", error);
      return c.json(
        {
          error: "Failed to fetch calendar events",
          message: error instanceof Error ? error.message : "Unknown error",
        },
        500
      );
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
