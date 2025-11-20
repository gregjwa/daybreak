import "dotenv/config";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { serve } from "@hono/node-server";
import { clerkMiddleware, getAuth } from "@hono/clerk-auth";
import { google } from "googleapis";
import { prisma } from "./lib/prisma.js";
import {
  analyzeEmailForBooking,
  extractEmailBody,
  fetchGmailHistory,
} from "./lib/email-analysis.js";
import {
  generateInviteCode,
  isInviteExpired,
  createExpiryDate,
} from "./lib/invite.js";

// Create the Hono app
const app = new Hono()
  .use("/*", cors())
  .use("*", clerkMiddleware())

  // Health check
  .get("/health", (c) => {
    return c.json({ status: "ok", timestamp: new Date().toISOString() });
  })

  // ============================================================================
  // INVITE ENDPOINTS
  // ============================================================================

  // POST /api/invites/create - Create an invite (Business users only)
  .post("/api/invites/create", async (c) => {
    const auth = getAuth(c);

    if (!auth?.userId) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    try {
      const body = await c.req.json();
      const { inviteType, email, expiresInDays } = body;

      // Validate invite type
      if (!["PERSON", "BUSINESS"].includes(inviteType)) {
        return c.json(
          { error: "Invalid invite type. Must be PERSON or BUSINESS" },
          400
        );
      }

      // Check if user exists and is a Business
      const user = await prisma.user.findUnique({
        where: { clerkId: auth.userId },
        include: { business: true },
      });

      if (!user) {
        return c.json(
          { error: "User not found. Please complete your profile first." },
          404
        );
      }

      if (user.accountType !== "BUSINESS") {
        return c.json(
          { error: "Only Business accounts can send invites" },
          403
        );
      }

      // Generate invite code
      const code = generateInviteCode();
      const expiresAt = createExpiryDate(expiresInDays || 7);

      const invite = await prisma.invite.create({
        data: {
          code,
          senderUserId: user.id,
          inviteType,
          email: email || null,
          expiresAt,
        },
      });

      return c.json({
        success: true,
        invite: {
          code: invite.code,
          inviteType: invite.inviteType,
          email: invite.email,
          expiresAt: invite.expiresAt,
          inviteUrl: `${process.env.FRONTEND_URL}/invite/${invite.code}`,
        },
      });
    } catch (error) {
      console.error("Error creating invite:", error);
      return c.json(
        {
          error: "Failed to create invite",
          message: error instanceof Error ? error.message : "Unknown error",
        },
        500
      );
    }
  })

  // GET /api/invites/validate/:code - Validate an invite code
  .get("/api/invites/validate/:code", async (c) => {
    try {
      const code = c.req.param("code");

      const invite = await prisma.invite.findUnique({
        where: { code },
        include: {
          sender: {
            include: {
              business: true,
            },
          },
        },
      });

      if (!invite) {
        return c.json({ valid: false, error: "Invite not found" }, 404);
      }

      if (invite.usedAt) {
        return c.json(
          { valid: false, error: "Invite has already been used" },
          400
        );
      }

      if (isInviteExpired(invite.expiresAt)) {
        return c.json({ valid: false, error: "Invite has expired" }, 400);
      }

      return c.json({
        valid: true,
        invite: {
          inviteType: invite.inviteType,
          email: invite.email,
          expiresAt: invite.expiresAt,
          senderBusiness: invite.sender.business?.name,
        },
      });
    } catch (error) {
      console.error("Error validating invite:", error);
      return c.json(
        {
          error: "Failed to validate invite",
          message: error instanceof Error ? error.message : "Unknown error",
        },
        500
      );
    }
  })

  // POST /api/invites/accept - Accept an invite and create account
  .post("/api/invites/accept", async (c) => {
    const auth = getAuth(c);

    if (!auth?.userId) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    try {
      const body = await c.req.json();
      const { inviteCode, name, roles } = body;

      const clerkClient = c.get("clerk");
      const clerkUser = await clerkClient.users.getUser(auth.userId);
      const userEmail = clerkUser.emailAddresses.find(
        (email) => email.id === clerkUser.primaryEmailAddressId
      )?.emailAddress;

      if (!userEmail) {
        return c.json({ error: "No email found for user" }, 400);
      }

      // Validate invite
      const invite = await prisma.invite.findUnique({
        where: { code: inviteCode },
        include: {
          sender: {
            include: {
              business: true,
            },
          },
        },
      });

      if (!invite) {
        return c.json({ error: "Invite not found" }, 404);
      }

      if (invite.usedAt) {
        return c.json({ error: "Invite has already been used" }, 400);
      }

      if (isInviteExpired(invite.expiresAt)) {
        return c.json({ error: "Invite has expired" }, 400);
      }

      // If invite is email-specific, verify it matches
      if (invite.email && invite.email !== userEmail) {
        return c.json(
          { error: "This invite was sent to a different email address" },
          403
        );
      }

      // Create user based on invite type
      if (invite.inviteType === "PERSON") {
        // Validate roles for Person accounts
        if (!roles || !Array.isArray(roles) || roles.length === 0) {
          return c.json(
            { error: "Please select at least one role (ENGINEER, ASSISTANT)" },
            400
          );
        }

        const validRoles = ["ENGINEER", "ASSISTANT"];
        const invalidRoles = roles.filter((r) => !validRoles.includes(r));
        if (invalidRoles.length > 0) {
          return c.json(
            { error: `Invalid roles: ${invalidRoles.join(", ")}` },
            400
          );
        }

        // Create User and Person in a transaction
        const result = await prisma.$transaction(async (tx: any) => {
          const user = await tx.user.create({
            data: {
              clerkId: auth.userId,
              email: userEmail,
              accountType: "PERSON",
              person: {
                create: {
                  name,
                  roles,
                },
              },
            },
            include: {
              person: true,
            },
          });

          // Link Person to inviting Business
          if (invite.sender.business) {
            await tx.personBusinessLink.create({
              data: {
                personId: user.person!.id,
                businessId: invite.sender.business.id,
              },
            });
          }

          // Mark invite as used
          await tx.invite.update({
            where: { id: invite.id },
            data: {
              usedAt: new Date(),
              usedByEmail: userEmail,
            },
          });

          return user;
        });

        return c.json({
          success: true,
          user: {
            accountType: result.accountType,
            person: result.person,
          },
          message: "Person account created successfully",
        });
      } else if (invite.inviteType === "BUSINESS") {
        // Validate name for Business accounts
        if (!name) {
          return c.json({ error: "Business name is required" }, 400);
        }

        // Create User and Business in a transaction
        const result = await prisma.$transaction(async (tx: any) => {
          const user = await tx.user.create({
            data: {
              clerkId: auth.userId,
              email: userEmail,
              accountType: "BUSINESS",
              business: {
                create: {
                  name,
                },
              },
            },
            include: {
              business: true,
            },
          });

          // Create partnership with inviting Business
          if (invite.sender.business) {
            await tx.businessPartnership.create({
              data: {
                mainBusinessId: invite.sender.business.id,
                partnerBusinessId: user.business!.id,
              },
            });
          }

          // Mark invite as used
          await tx.invite.update({
            where: { id: invite.id },
            data: {
              usedAt: new Date(),
              usedByEmail: userEmail,
            },
          });

          return user;
        });

        return c.json({
          success: true,
          user: {
            accountType: result.accountType,
            business: result.business,
          },
          message: "Business account created and partnership established",
        });
      }

      return c.json({ error: "Invalid invite type" }, 400);
    } catch (error) {
      console.error("Error accepting invite:", error);
      return c.json(
        {
          error: "Failed to accept invite",
          message: error instanceof Error ? error.message : "Unknown error",
        },
        500
      );
    }
  })

  // ============================================================================
  // PROFILE ENDPOINTS
  // ============================================================================

  // POST /api/profile/setup-business - Convert existing User to Business
  .post("/api/profile/setup-business", async (c) => {
    const auth = getAuth(c);

    if (!auth?.userId) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    try {
      const body = await c.req.json();
      const { businessName } = body;

      if (!businessName) {
        return c.json({ error: "Business name is required" }, 400);
      }

      const clerkClient = c.get("clerk");
      const clerkUser = await clerkClient.users.getUser(auth.userId);
      const userEmail = clerkUser.emailAddresses.find(
        (email) => email.id === clerkUser.primaryEmailAddressId
      )?.emailAddress;

      if (!userEmail) {
        return c.json({ error: "No email found for user" }, 400);
      }

      // Check if user already exists
      let user = await prisma.user.findUnique({
        where: { clerkId: auth.userId },
        include: { business: true, person: true },
      });

      // If user doesn't exist, create them
      if (!user) {
        user = await prisma.user.create({
          data: {
            clerkId: auth.userId,
            email: userEmail,
            accountType: "BUSINESS",
          },
          include: { business: true, person: true },
        });
      }

      // Check if already a Business
      if (user.business) {
        return c.json(
          {
            error: "Already a Business",
            business: user.business,
          },
          400
        );
      }

      // Check if already a Person
      if (user.person) {
        return c.json(
          {
            error:
              "This account is a Person account. Cannot convert to Business.",
          },
          400
        );
      }

      // Update user to Business and create Business record
      const result = await prisma.$transaction(async (tx: any) => {
        await tx.user.update({
          where: { id: user!.id },
          data: { accountType: "BUSINESS" },
        });

        const business = await tx.business.create({
          data: {
            userId: user!.id,
            name: businessName,
          },
        });

        return business;
      });

      return c.json({
        success: true,
        business: result,
        message: "Business profile created successfully",
      });
    } catch (error) {
      console.error("Error setting up business:", error);
      return c.json(
        {
          error: "Failed to setup business",
          message: error instanceof Error ? error.message : "Unknown error",
        },
        500
      );
    }
  })

  // GET /api/profile/me - Get current user profile
  .get("/api/profile/me", async (c) => {
    const auth = getAuth(c);

    if (!auth?.userId) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    try {
      const user = await prisma.user.findUnique({
        where: { clerkId: auth.userId },
        include: {
          business: true,
          person: {
            include: {
              businesses: {
                include: {
                  business: true,
                },
              },
            },
          },
        },
      });

      if (!user) {
        return c.json({ error: "User not found" }, 404);
      }

      return c.json({
        user: {
          id: user.id,
          email: user.email,
          accountType: user.accountType,
          business: user.business,
          person: user.person,
        },
      });
    } catch (error) {
      console.error("Error fetching profile:", error);
      return c.json(
        {
          error: "Failed to fetch profile",
          message: error instanceof Error ? error.message : "Unknown error",
        },
        500
      );
    }
  })

  // ============================================================================
  // GMAIL WEBHOOK
  // ============================================================================

  // POST /api/webhooks/gmail - Receive Gmail push notifications
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

        console.log("📨 Gmail notification:", notification);

        // notification contains: { emailAddress, historyId }
        const { emailAddress, historyId } = notification;

        console.log(
          `\n🔔 New email notification for ${emailAddress}, historyId: ${historyId}`
        );

        // Look up GmailWatch in database
        const gmailWatch = await prisma.gmailWatch.findUnique({
          where: { gmailAddress: emailAddress },
          include: {
            user: {
              include: {
                business: true,
              },
            },
          },
        });

        if (!gmailWatch) {
          console.log(
            `⚠️  No watch found for ${emailAddress}. Skipping processing.`
          );
          return c.json({ success: true });
        }

        if (!gmailWatch.user.business) {
          console.log(
            `⚠️  User ${emailAddress} is not a Business account. Skipping processing.`
          );
          return c.json({ success: true });
        }

        // Get user's OAuth token from Clerk
        const clerkClient = c.get("clerk");
        const tokenResponse = await clerkClient.users.getUserOauthAccessToken(
          gmailWatch.user.clerkId,
          "oauth_google"
        );

        if (!tokenResponse.data || tokenResponse.data.length === 0) {
          console.log(`⚠️  No OAuth token found for ${emailAddress}`);
          return c.json({ success: true });
        }

        const accessToken = tokenResponse.data[0].token;

        // Set up Gmail client
        const oauth2Client = new google.auth.OAuth2();
        oauth2Client.setCredentials({ access_token: accessToken });
        const gmail = google.gmail({ version: "v1", auth: oauth2Client });

        // Fetch new messages using history API
        const newMessages = await fetchGmailHistory(
          gmail,
          gmailWatch.historyId
        );

        console.log(
          `📨 Found ${newMessages.length} new messages for ${emailAddress}`
        );

        // Process each new message
        for (const msg of newMessages) {
          try {
            const emailData = await gmail.users.messages.get({
              userId: "me",
              id: msg.id!,
              format: "full",
            });

            const headers = emailData.data.payload?.headers || [];
            const subject =
              headers.find((h) => h.name === "Subject")?.value || "";
            const from = headers.find((h) => h.name === "From")?.value || "";
            const date = headers.find((h) => h.name === "Date")?.value || "";
            const body = extractEmailBody(emailData.data.payload);
            const snippet = emailData.data.snippet || "";

            // Analyze email for booking inquiry
            const analysis = analyzeEmailForBooking(subject, body);

            console.log("\n📧 New Email:", {
              from,
              subject,
              date,
              isBookingInquiry: analysis.isBookingInquiry,
              confidence: analysis.confidence,
            });

            // Save to database if it's a potential booking inquiry
            if (analysis.isBookingInquiry) {
              await prisma.enquiry.create({
                data: {
                  businessId: gmailWatch.user.business.id,
                  emailId: msg.id!,
                  fromEmail: from,
                  subject,
                  body,
                  snippet,
                  confidence: analysis.confidence.toUpperCase() as
                    | "HIGH"
                    | "MEDIUM"
                    | "LOW",
                  matchedKeywords: analysis.matchedKeywords,
                  receivedAt: date ? new Date(date) : new Date(),
                },
              });

              console.log(
                `✅ Saved booking inquiry from ${from} with ${analysis.confidence} confidence`
              );
            }
          } catch (error) {
            console.error(`Error processing message ${msg.id}:`, error);
            // Continue processing other messages
          }
        }

        // Update historyId in database
        await prisma.gmailWatch.update({
          where: { id: gmailWatch.id },
          data: { historyId },
        });

        console.log(`✅ Updated historyId to ${historyId} for ${emailAddress}`);
      }

      // Always return 200 to acknowledge receipt
      return c.json({ success: true });
    } catch (error) {
      console.error("Gmail webhook error:", error);
      // Still return 200 to avoid retries
      return c.json({ success: false, error: "Internal error" });
    }
  })

  // ============================================================================
  // GMAIL WATCH ENDPOINTS
  // ============================================================================

  // POST /api/emails/watch - Set up Gmail push notifications
  .post("/api/emails/watch", async (c) => {
    const auth = getAuth(c);

    if (!auth?.userId) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    try {
      const clerkClient = c.get("clerk");

      // Get user info
      const clerkUser = await clerkClient.users.getUser(auth.userId);
      const userEmail = clerkUser.emailAddresses.find(
        (email) => email.id === clerkUser.primaryEmailAddressId
      )?.emailAddress;

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

      // Get the Gmail profile to get the actual Gmail address
      const profile = await gmail.users.getProfile({ userId: "me" });
      const gmailAddress = profile.data.emailAddress!;

      // Set up watch on user's mailbox
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

      // Find or create user in database
      const user = await prisma.user.upsert({
        where: { clerkId: auth.userId },
        update: {},
        create: {
          clerkId: auth.userId,
          email: userEmail!,
          accountType: "BUSINESS", // Default to BUSINESS for Gmail watch setup
        },
      });

      // Upsert GmailWatch
      await prisma.gmailWatch.upsert({
        where: { gmailAddress },
        update: {
          historyId: watchResponse.data.historyId!,
          expiresAt: BigInt(watchResponse.data.expiration!),
        },
        create: {
          userId: user.id,
          gmailAddress,
          historyId: watchResponse.data.historyId!,
          expiresAt: BigInt(watchResponse.data.expiration!),
        },
      });

      console.log("Gmail watch setup:", {
        clerkUserId: auth.userId,
        userEmail,
        gmailAddress,
        historyId: watchResponse.data.historyId,
      });

      return c.json({
        success: true,
        historyId: watchResponse.data.historyId,
        expiration: watchResponse.data.expiration,
        gmailAddress,
        message: "Gmail watch set up successfully. Expires in 7 days.",
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

  // POST /api/emails/stop-watch - Stop Gmail push notifications
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

      // Optionally delete GmailWatch from database
      const user = await prisma.user.findUnique({
        where: { clerkId: auth.userId },
      });

      if (user) {
        await prisma.gmailWatch.deleteMany({
          where: { userId: user.id },
        });
      }

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

  // GET /api/emails/process-new - Process new emails since last history ID
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

      // Fetch new messages using history API
      const newMessages = await fetchGmailHistory(gmail, historyId);

      console.log(
        `\n📨 Processing ${newMessages.length} new messages since historyId: ${historyId}`
      );

      const bookingInquiries = [];

      for (const msg of newMessages) {
        const emailData = await gmail.users.messages.get({
          userId: "me",
          id: msg.id!,
          format: "full",
        });

        const headers = emailData.data.payload?.headers || [];
        const subject = headers.find((h) => h.name === "Subject")?.value || "";
        const from = headers.find((h) => h.name === "From")?.value || "";
        const date = headers.find((h) => h.name === "Date")?.value || "";
        const body = extractEmailBody(emailData.data.payload);
        const snippet = emailData.data.snippet || "";

        const analysis = analyzeEmailForBooking(subject, body);

        console.log("\n📧 New Email:", {
          from,
          subject,
          date,
          isBookingInquiry: analysis.isBookingInquiry,
          confidence: analysis.confidence,
        });

        if (analysis.isBookingInquiry) {
          bookingInquiries.push({
            id: msg.id,
            from,
            subject,
            date,
            snippet,
            body: body.substring(0, 500),
            analysis,
          });
        }
      }

      return c.json({
        newMessagesCount: newMessages.length,
        bookingInquiriesFound: bookingInquiries.length,
        inquiries: bookingInquiries,
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

  // ============================================================================
  // EMAIL ANALYSIS ENDPOINT
  // ============================================================================

  // GET /api/emails/analyze - Analyze Gmail inbox for booking inquiries
  .get("/api/emails/analyze", async (c) => {
    const auth = getAuth(c);

    if (!auth?.userId) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    try {
      const clerkClient = c.get("clerk");
      const user = await clerkClient.users.getUser(auth.userId);

      // Find Google OAuth account
      const googleAccount = user.externalAccounts.find(
        (account) => account.provider === "oauth_google"
      );

      if (!googleAccount) {
        return c.json(
          { error: "Not Connected", message: "Connect Google account first." },
          403
        );
      }

      // Get OAuth access token
      const tokenResponse = await clerkClient.users.getUserOauthAccessToken(
        auth.userId,
        "oauth_google"
      );

      if (!tokenResponse.data || tokenResponse.data.length === 0) {
        return c.json({ error: "No Token" }, 403);
      }

      const accessToken = tokenResponse.data[0].token;

      // Set up Gmail API client
      const oauth2Client = new google.auth.OAuth2();
      oauth2Client.setCredentials({ access_token: accessToken });
      const gmail = google.gmail({ version: "v1", auth: oauth2Client });

      // Fetch recent emails (last 7 days)
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const query = `after:${Math.floor(sevenDaysAgo.getTime() / 1000)}`;

      const response = await gmail.users.messages.list({
        userId: "me",
        q: query,
        maxResults: 20,
      });

      const messages = response.data.messages || [];

      const bookingInquiries = [];

      // Fetch and analyze each email
      for (const message of messages.slice(0, 10)) {
        const emailData = await gmail.users.messages.get({
          userId: "me",
          id: message.id!,
          format: "full",
        });

        const headers = emailData.data.payload?.headers || [];
        const subject = headers.find((h) => h.name === "Subject")?.value || "";
        const from = headers.find((h) => h.name === "From")?.value || "";
        const date = headers.find((h) => h.name === "Date")?.value || "";
        const body = extractEmailBody(emailData.data.payload);
        const snippet = emailData.data.snippet || "";

        const analysis = analyzeEmailForBooking(subject, body);

        console.log("\n📧 Email:", {
          from,
          subject,
          date,
          isBookingInquiry: analysis.isBookingInquiry,
          confidence: analysis.confidence,
        });

        if (analysis.isBookingInquiry) {
          bookingInquiries.push({
            id: message.id,
            from,
            subject,
            date,
            snippet,
            body: body.substring(0, 500),
            analysis,
          });
        }
      }

      return c.json({
        total: messages.length,
        analyzed: Math.min(messages.length, 10),
        bookingInquiriesFound: bookingInquiries.length,
        inquiries: bookingInquiries,
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

  // ============================================================================
  // CALENDAR ENDPOINT
  // ============================================================================

  // GET /api/events - Get Google Calendar events from past month
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
      // Get the Clerk client
      const clerkClient = c.get("clerk");

      // Get user to find Google account ID
      const user = await clerkClient.users.getUser(auth.userId);

      // Find the Google OAuth account
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

      // Get the OAuth access token for Google
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

      // Set up Google Calendar API client
      const oauth2Client = new google.auth.OAuth2();
      oauth2Client.setCredentials({ access_token: accessToken });

      const calendar = google.calendar({ version: "v3", auth: oauth2Client });

      // Calculate date range (past month)
      const now = new Date();
      const oneMonthAgo = new Date();
      oneMonthAgo.setMonth(now.getMonth() - 1);

      // Fetch calendar events
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

      // Log more details for debugging
      if (error && typeof error === "object" && "response" in error) {
        const apiError = error as any;
        console.error("API Error details:", {
          status: apiError.response?.status,
          statusText: apiError.response?.statusText,
          data: apiError.response?.data,
        });
      }

      return c.json(
        {
          error: "Failed to fetch calendar events",
          message: error instanceof Error ? error.message : "Unknown error",
          details:
            process.env.NODE_ENV === "development"
              ? error && typeof error === "object" && "response" in error
                ? (error as any).response?.data
                : undefined
              : undefined,
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
