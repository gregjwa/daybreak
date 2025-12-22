import { Hono } from "hono";
import { getAuth } from "@hono/clerk-auth";
import { google } from "googleapis";
import { prisma } from "../db";
import { processEmailsWithToken } from "../lib/gmail-service";

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
  });

export default app;
