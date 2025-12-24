import { google, gmail_v1 } from "googleapis";
import { prisma } from "../db";

// Personal email domains to skip by default (can be expanded)
const PERSONAL_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "yahoo.com",
  "yahoo.co.uk",
  "hotmail.com",
  "outlook.com",
  "live.com",
  "msn.com",
  "icloud.com",
  "me.com",
  "aol.com",
  "protonmail.com",
  "proton.me",
  "mail.com",
  "zoho.com",
]);

// Extract email from header format: "Name <email@domain.com>" or just "email@domain.com"
function extractEmail(input: string): string | null {
  if (!input) return null;
  const match = input.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return match ? match[0].toLowerCase().trim() : null;
}

// Extract display name from header format: "Name <email@domain.com>"
function extractDisplayName(input: string): string | null {
  if (!input) return null;
  // Try: "Name <email>" format
  const match = input.match(/^([^<]+)<[^>]+>$/);
  if (match) {
    const name = match[1].trim().replace(/^["']|["']$/g, "");
    return name || null;
  }
  return null;
}

// Extract domain from email
function extractDomain(email: string): string {
  const parts = email.split("@");
  return parts.length === 2 ? parts[1].toLowerCase() : "";
}

// Check if domain is a personal email provider
function isPersonalDomain(domain: string): boolean {
  return PERSONAL_DOMAINS.has(domain);
}

interface BackfillTickResult {
  done: boolean;
  scannedThisTick: number;
  discoveredThisTick: number;
  createdThisTick: number;
  nextPageToken: string | null;
  progress: {
    scannedMessages: number;
    discoveredContacts: number;
    createdCandidates: number;
    errorsCount: number;
  };
}

/**
 * Process one "tick" of the backfill run - fetches one page of Gmail messages
 * and extracts recipients as SupplierCandidates.
 */
export async function processBackfillTick(
  accessToken: string,
  runId: string,
  opts?: { maxMessagesPerTick?: number; includePersonalDomains?: boolean }
): Promise<BackfillTickResult> {
  const maxMessages = opts?.maxMessagesPerTick || 50;
  const includePersonal = opts?.includePersonalDomains || false;

  // Get current run
  const run = await prisma.backfillRun.findUnique({ where: { id: runId } });
  if (!run) throw new Error("BackfillRun not found");
  if (run.status === "COMPLETED" || run.status === "CANCELLED" || run.status === "FAILED") {
    return {
      done: true,
      scannedThisTick: 0,
      discoveredThisTick: 0,
      createdThisTick: 0,
      nextPageToken: null,
      progress: {
        scannedMessages: run.scannedMessages,
        discoveredContacts: run.discoveredContacts,
        createdCandidates: run.createdCandidates,
        errorsCount: run.errorsCount,
      },
    };
  }

  // Mark as running if not already
  if (run.status === "PENDING") {
    await prisma.backfillRun.update({
      where: { id: runId },
      data: { status: "RUNNING", startedAt: new Date() },
    });
  }

  // Setup Gmail API
  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({ access_token: accessToken });
  const gmail = google.gmail({ version: "v1", auth: oauth2Client });

  let scannedThisTick = 0;
  let discoveredThisTick = 0;
  let createdThisTick = 0;
  let errorsThisTick = 0;
  const seenEmails = new Set<string>();

  try {
    // List messages
    const listResponse = await gmail.users.messages.list({
      userId: "me",
      q: run.gmailQuery,
      maxResults: maxMessages,
      pageToken: run.nextPageToken || undefined,
    });

    const messages = listResponse.data.messages || [];
    const nextPageToken = listResponse.data.nextPageToken || null;

    // Process each message
    for (const msgRef of messages) {
      if (!msgRef.id) continue;
      scannedThisTick++;

      try {
        // Fetch message metadata only (faster)
        const msgData = await gmail.users.messages.get({
          userId: "me",
          id: msgRef.id,
          format: "metadata",
          metadataHeaders: ["To", "Cc", "Bcc", "Subject", "Date"],
        });

        const headers = msgData.data.payload?.headers || [];
        const toHeader = headers.find((h) => h.name === "To")?.value || "";
        const ccHeader = headers.find((h) => h.name === "Cc")?.value || "";
        const bccHeader = headers.find((h) => h.name === "Bcc")?.value || "";
        const subjectHeader = headers.find((h) => h.name === "Subject")?.value || "";
        const dateHeader = headers.find((h) => h.name === "Date")?.value;
        const sentAt = dateHeader ? new Date(dateHeader) : new Date();

        // Parse all recipients
        const allRecipients = [toHeader, ccHeader, bccHeader].join(", ");
        // Split by comma, handling quoted names
        const recipientParts = allRecipients.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/);

        for (const part of recipientParts) {
          const trimmed = part.trim();
          if (!trimmed) continue;

          const email = extractEmail(trimmed);
          if (!email) continue;

          const domain = extractDomain(email);
          if (!domain) continue;

          // Skip personal domains unless opted in
          if (!includePersonal && isPersonalDomain(domain)) continue;

          // Skip if we've already seen this email in this tick
          if (seenEmails.has(email)) continue;
          seenEmails.add(email);

          discoveredThisTick++;

          const displayName = extractDisplayName(trimmed);

          // Upsert SupplierCandidate
          try {
            await prisma.supplierCandidate.upsert({
              where: {
                userId_email: {
                  userId: run.userId,
                  email: email,
                },
              },
              create: {
                userId: run.userId,
                email,
                domain,
                displayName,
                source: "GMAIL_SENT",
                status: "NEW",
                messageCount: 1,
                firstSeenAt: sentAt,
                lastSeenAt: sentAt,
              },
              update: {
                messageCount: { increment: 1 },
                lastSeenAt: sentAt,
                // Update displayName if we have one and existing doesn't
                ...(displayName && { displayName }),
              },
            });
            createdThisTick++;
          } catch (upsertErr) {
            // Ignore duplicate key errors (race condition)
            console.error("Upsert error:", upsertErr);
            errorsThisTick++;
          }
        }
      } catch (msgErr) {
        console.error(`Error processing message ${msgRef.id}:`, msgErr);
        errorsThisTick++;
      }
    }

    // Update run progress
    const updatedRun = await prisma.backfillRun.update({
      where: { id: runId },
      data: {
        nextPageToken: nextPageToken,
        scannedMessages: { increment: scannedThisTick },
        discoveredContacts: { increment: discoveredThisTick },
        createdCandidates: { increment: createdThisTick },
        errorsCount: { increment: errorsThisTick },
        // Mark completed if no more pages
        ...(nextPageToken === null && {
          status: "COMPLETED",
          completedAt: new Date(),
        }),
      },
    });

    return {
      done: nextPageToken === null,
      scannedThisTick,
      discoveredThisTick,
      createdThisTick,
      nextPageToken,
      progress: {
        scannedMessages: updatedRun.scannedMessages,
        discoveredContacts: updatedRun.discoveredContacts,
        createdCandidates: updatedRun.createdCandidates,
        errorsCount: updatedRun.errorsCount,
      },
    };
  } catch (err) {
    console.error("Backfill tick error:", err);
    await prisma.backfillRun.update({
      where: { id: runId },
      data: {
        status: "FAILED",
        errorsCount: { increment: 1 },
      },
    });
    throw err;
  }
}

/**
 * Create a new backfill run for a user
 */
export async function createBackfillRun(
  userId: string,
  timeframeMonths: number = 6
): Promise<{ id: string; gmailQuery: string }> {
  const gmailQuery = `in:sent newer_than:${timeframeMonths}m`;

  const run = await prisma.backfillRun.create({
    data: {
      userId,
      timeframeMonths,
      gmailQuery,
      status: "PENDING",
    },
  });

  return { id: run.id, gmailQuery: run.gmailQuery };
}

/**
 * Get backfill run status
 */
export async function getBackfillRunStatus(runId: string) {
  const run = await prisma.backfillRun.findUnique({ where: { id: runId } });
  if (!run) return null;

  return {
    id: run.id,
    status: run.status,
    timeframeMonths: run.timeframeMonths,
    scannedMessages: run.scannedMessages,
    discoveredContacts: run.discoveredContacts,
    createdCandidates: run.createdCandidates,
    errorsCount: run.errorsCount,
    startedAt: run.startedAt,
    completedAt: run.completedAt,
    hasMorePages: run.nextPageToken !== null,
  };
}

/**
 * Cancel a backfill run
 */
export async function cancelBackfillRun(runId: string) {
  await prisma.backfillRun.update({
    where: { id: runId },
    data: { status: "CANCELLED" },
  });
}

