import { google } from "googleapis";
import { Prisma } from "@prisma/client";
import { prisma } from "../db";
import { extractMeaningfulContent, cleanSubject, type EmailContext } from "./email-utils";

// ============================================================================
// PERSONAL DOMAIN DETECTION
// ============================================================================

const PERSONAL_DOMAINS = new Set([
  // Major providers
  "gmail.com",
  "googlemail.com",
  "yahoo.com",
  "yahoo.co.uk",
  "ymail.com",
  "hotmail.com",
  "hotmail.co.uk",
  "outlook.com",
  "outlook.co.uk",
  "live.com",
  "live.co.uk",
  "msn.com",
  // Apple
  "icloud.com",
  "me.com",
  "mac.com",
  // Others
  "aol.com",
  "protonmail.com",
  "proton.me",
  "mail.com",
  "zoho.com",
  "fastmail.com",
  "tutanota.com",
  // Regional
  "gmx.com",
  "gmx.de",
  "web.de",
  "orange.fr",
  "wanadoo.fr",
  "free.fr",
  "btinternet.com",
  "sky.com",
  "virginmedia.com",
  "ntlworld.com",
]);

/**
 * Check if a domain is a personal email provider
 * Personal domains mean each email = standalone supplier (no grouping)
 * Business domains get grouped under one supplier
 */
export function isPersonalDomain(domain: string): boolean {
  return PERSONAL_DOMAINS.has(domain.toLowerCase());
}

// ============================================================================
// EMAIL PARSING UTILITIES
// ============================================================================

/**
 * Extract email address from header format: "Name <email@domain.com>" or just "email@domain.com"
 */
function extractEmail(input: string): string | null {
  if (!input) return null;
  const match = input.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return match ? match[0].toLowerCase().trim() : null;
}

/**
 * Extract display name from header format: "Name <email@domain.com>"
 */
function extractDisplayName(input: string): string | null {
  if (!input) return null;
  const match = input.match(/^([^<]+)<[^>]+>$/);
  if (match) {
    const name = match[1].trim().replace(/^["']|["']$/g, "");
    return name || null;
  }
  return null;
}

/**
 * Extract domain from email address
 */
function extractDomain(email: string): string {
  const parts = email.split("@");
  return parts.length === 2 ? parts[1].toLowerCase() : "";
}

/**
 * Decode base64url encoded content
 */
function decodeBase64Url(data: string): string {
  const base64 = data.replace(/-/g, "+").replace(/_/g, "/");
  try {
    return Buffer.from(base64, "base64").toString("utf-8");
  } catch {
    return "";
  }
}

/**
 * Extract email body from Gmail message payload
 */
function extractEmailBody(payload: {
  body?: { data?: string };
  parts?: Array<{ mimeType?: string; body?: { data?: string }; parts?: unknown[] }>;
}): string {
  // Try direct body first
  if (payload.body?.data) {
    return decodeBase64Url(payload.body.data);
  }

  // Look through parts for text/plain or text/html
  if (payload.parts) {
    // Prefer text/plain
    for (const part of payload.parts) {
      if (part.mimeType === "text/plain" && part.body?.data) {
        return decodeBase64Url(part.body.data);
      }
    }
    // Fall back to text/html
    for (const part of payload.parts) {
      if (part.mimeType === "text/html" && part.body?.data) {
        return decodeBase64Url(part.body.data);
      }
    }
    // Check nested parts (multipart/alternative inside multipart/mixed)
    for (const part of payload.parts) {
      if (part.parts) {
        const nested = extractEmailBody(part as typeof payload);
        if (nested) return nested;
      }
    }
  }

  return "";
}

// ============================================================================
// BACKFILL PROCESSING
// ============================================================================

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

// In-memory accumulator for email contexts during a backfill run
// Maps userId:email -> EmailContext[]
const emailContextAccumulator = new Map<string, EmailContext[]>();

/**
 * Process one "tick" of the backfill run
 * - Fetches one page of Gmail messages
 * - Extracts recipients as SupplierCandidates
 * - Fetches full email body and extracts meaningful content
 * - Stores email context for AI enrichment
 */
export async function processBackfillTick(
  accessToken: string,
  runId: string,
  opts?: { maxMessagesPerTick?: number }
): Promise<BackfillTickResult> {
  const maxMessages = opts?.maxMessagesPerTick || 30; // Reduced from 50 since we fetch full messages

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
        // Fetch FULL message (not just metadata) to get body
        const msgData = await gmail.users.messages.get({
          userId: "me",
          id: msgRef.id,
          format: "full",
        });

        const headers = msgData.data.payload?.headers || [];
        const toHeader = headers.find((h) => h.name === "To")?.value || "";
        const ccHeader = headers.find((h) => h.name === "Cc")?.value || "";
        const bccHeader = headers.find((h) => h.name === "Bcc")?.value || "";
        const subjectHeader = headers.find((h) => h.name === "Subject")?.value || "";
        const dateHeader = headers.find((h) => h.name === "Date")?.value;
        const sentAt = dateHeader ? new Date(dateHeader) : new Date();

        // Extract email body
        const rawBody = msgData.data.payload ? extractEmailBody(msgData.data.payload as Parameters<typeof extractEmailBody>[0]) : "";
        const cleanedContent = extractMeaningfulContent(rawBody, 400);
        const cleanedSubject = cleanSubject(subjectHeader);

        // Parse all recipients
        const allRecipients = [toHeader, ccHeader, bccHeader].join(", ");
        const recipientParts = allRecipients.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/);

        for (const part of recipientParts) {
          const trimmed = part.trim();
          if (!trimmed) continue;

          const email = extractEmail(trimmed);
          if (!email) continue;

          const domain = extractDomain(email);
          if (!domain) continue;

          // Skip if we've already seen this email in this tick
          if (seenEmails.has(email)) continue;
          seenEmails.add(email);

          discoveredThisTick++;

          const displayName = extractDisplayName(trimmed);
          const accumulatorKey = `${run.userId}:${email}`;

          // Build email context entry
          const emailContext: EmailContext = {
            subject: cleanedSubject,
            content: cleanedContent,
            date: sentAt.toISOString(),
          };

          // Accumulate email contexts (up to 5 per contact)
          const existing = emailContextAccumulator.get(accumulatorKey) || [];
          existing.push(emailContext);
          // Keep only the 5 most recent
          const sorted = existing
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
            .slice(0, 5);
          emailContextAccumulator.set(accumulatorKey, sorted);

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
                emailContextJson: sorted as unknown as Prisma.InputJsonValue,
              },
              update: {
                messageCount: { increment: 1 },
                lastSeenAt: sentAt,
                displayName: displayName || undefined,
                emailContextJson: sorted as unknown as Prisma.InputJsonValue,
              },
            });
            createdThisTick++;
          } catch (upsertErr) {
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
    const isComplete = nextPageToken === null;
    const updatedRun = await prisma.backfillRun.update({
      where: { id: runId },
      data: {
        nextPageToken: nextPageToken,
        scannedMessages: { increment: scannedThisTick },
        discoveredContacts: { increment: discoveredThisTick },
        createdCandidates: { increment: createdThisTick },
        errorsCount: { increment: errorsThisTick },
        ...(isComplete && {
          status: "COMPLETED",
          completedAt: new Date(),
        }),
      },
    });

    // Clear accumulator when done
    if (isComplete) {
      for (const key of emailContextAccumulator.keys()) {
        if (key.startsWith(`${run.userId}:`)) {
          emailContextAccumulator.delete(key);
        }
      }
    }

    return {
      done: isComplete,
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
  timeframeMonths: number = 6,
  eventContext?: string
): Promise<{ id: string; gmailQuery: string }> {
  const gmailQuery = `in:sent newer_than:${timeframeMonths}m`;

  const run = await prisma.backfillRun.create({
    data: {
      userId,
      timeframeMonths,
      gmailQuery,
      eventContext,
      status: "PENDING",
    },
  });

  // Also update user's eventContext if provided
  if (eventContext) {
    await prisma.user.update({
      where: { id: userId },
      data: { eventContext },
    });
  }

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
    eventContext: run.eventContext,
    scannedMessages: run.scannedMessages,
    discoveredContacts: run.discoveredContacts,
    createdCandidates: run.createdCandidates,
    errorsCount: run.errorsCount,
    enrichmentStatus: run.enrichmentStatus,
    enrichedCount: run.enrichedCount,
    autoImportedCount: run.autoImportedCount,
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

// Re-export for use in enrichment
export { extractDomain, isPersonalDomain as checkPersonalDomain };
