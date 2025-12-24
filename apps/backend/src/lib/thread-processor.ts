/**
 * Thread Processor
 * 
 * Handles fetching full Gmail threads, creating EmailThread records,
 * and storing all messages with proper thread linking.
 */

import { google } from "googleapis";
import { prisma } from "../db";
import { extractMeaningfulContent } from "./email-utils";
import { analyzeThread } from "./thread-analyzer";

// Extract email address from various formats
function extractEmail(input: string): string | null {
  if (!input) return null;
  const match = input.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return match ? match[0].toLowerCase() : null;
}

// Extract display name from email header
function extractDisplayName(input: string): string | null {
  if (!input) return null;
  // Handle "Name <email>" format
  const match = input.match(/^([^<]+)\s*</);
  if (match) return match[1].trim().replace(/^"|"$/g, '');
  return null;
}

// Extract plain text body from Gmail payload
function extractEmailBody(payload: any): string {
  let body = "";
  
  // Check for multipart message
  if (payload.parts) {
    // Prefer plain text
    const textPart = payload.parts.find(
      (part: any) => part.mimeType === "text/plain"
    );
    if (textPart?.body?.data) {
      body = Buffer.from(textPart.body.data, "base64").toString("utf-8");
    } else {
      // Fall back to HTML
      const htmlPart = payload.parts.find(
        (part: any) => part.mimeType === "text/html"
      );
      if (htmlPart?.body?.data) {
        body = Buffer.from(htmlPart.body.data, "base64").toString("utf-8");
      }
    }
  } else if (payload.body?.data) {
    body = Buffer.from(payload.body.data, "base64").toString("utf-8");
  }
  
  return body;
}

// Detect if message has quoted content
function hasQuotedContent(body: string): boolean {
  const quotePatterns = [
    /^>/m,                           // Traditional > quoting
    /On .+ wrote:/,                  // "On <date>, <person> wrote:"
    /----+ ?Original Message ?----+/i,
    /From: .+\nSent: .+\nTo:/,       // Outlook format
    /<blockquote/i,                  // HTML blockquote
  ];
  return quotePatterns.some(p => p.test(body));
}

interface ProcessedMessage {
  gmailMessageId: string;
  gmailThreadId: string;
  subject: string | null;
  content: string;
  contentClean: string;
  direction: "INBOUND" | "OUTBOUND";
  sentAt: Date;
  fromEmail: string;
  toEmails: string[];
  hasQuotedContent: boolean;
}

interface ThreadProcessResult {
  thread: {
    id: string;
    gmailThreadId: string;
    messageCount: number;
    subject: string | null;
  };
  newMessages: number;
  existingMessages: number;
}

/**
 * Fetch and process a complete Gmail thread
 */
export async function processGmailThread(
  accessToken: string,
  gmailThreadId: string,
  userId: string,
  userEmail: string,
  opts?: { debug?: boolean }
): Promise<ThreadProcessResult | null> {
  const debug = opts?.debug ?? false;
  
  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({ access_token: accessToken });
  const gmail = google.gmail({ version: "v1", auth: oauth2Client });

  try {
    // Fetch the full thread from Gmail
    const threadResponse = await gmail.users.threads.get({
      userId: "me",
      id: gmailThreadId,
      format: "full",
    });

    const gmailThread = threadResponse.data;
    const gmailMessages = gmailThread.messages || [];
    
    if (gmailMessages.length === 0) {
      if (debug) console.log("[thread-processor] Thread has no messages:", gmailThreadId);
      return null;
    }

    if (debug) {
      console.log(`[thread-processor] Processing thread ${gmailThreadId} with ${gmailMessages.length} messages`);
    }

    // Extract thread subject from first message
    const firstHeaders = gmailMessages[0].payload?.headers || [];
    const threadSubject = firstHeaders.find((h: any) => h.name === "Subject")?.value || null;

    // Collect all participant emails
    const participantEmails = new Set<string>();
    const processedMessages: ProcessedMessage[] = [];

    for (const msg of gmailMessages) {
      const headers = msg.payload?.headers || [];
      const fromRaw = headers.find((h: any) => h.name === "From")?.value || "";
      const toRaw = headers.find((h: any) => h.name === "To")?.value || "";
      const ccRaw = headers.find((h: any) => h.name === "Cc")?.value || "";
      const subject = headers.find((h: any) => h.name === "Subject")?.value || null;
      const dateStr = headers.find((h: any) => h.name === "Date")?.value;
      
      const fromEmail = extractEmail(fromRaw);
      const toEmails = [toRaw, ccRaw]
        .flatMap(s => s.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/))
        .map(s => extractEmail(s.trim()))
        .filter((e): e is string => e !== null);

      if (!fromEmail) continue;

      // Add to participants
      participantEmails.add(fromEmail);
      toEmails.forEach(e => participantEmails.add(e));

      const rawBody = extractEmailBody(msg.payload);
      const cleanBody = extractMeaningfulContent(rawBody);
      
      // Determine direction based on user's email
      const isFromUser = fromEmail.toLowerCase() === userEmail.toLowerCase();
      
      processedMessages.push({
        gmailMessageId: msg.id!,
        gmailThreadId: gmailThreadId,
        subject,
        content: rawBody,
        contentClean: cleanBody,
        direction: isFromUser ? "OUTBOUND" : "INBOUND",
        sentAt: dateStr ? new Date(dateStr) : new Date(),
        fromEmail,
        toEmails,
        hasQuotedContent: hasQuotedContent(rawBody),
      });
    }

    // Find or create the EmailThread record
    let emailThread = await prisma.emailThread.findUnique({
      where: { gmailThreadId },
    });

    if (!emailThread) {
      emailThread = await prisma.emailThread.create({
        data: {
          gmailThreadId,
          userId,
          subject: threadSubject,
          participantEmails: Array.from(participantEmails),
          messageCount: processedMessages.length,
        },
      });
      if (debug) console.log("[thread-processor] Created new EmailThread:", emailThread.id);
    } else {
      // Update participant list and message count
      emailThread = await prisma.emailThread.update({
        where: { id: emailThread.id },
        data: {
          participantEmails: Array.from(participantEmails),
          messageCount: processedMessages.length,
        },
      });
      if (debug) console.log("[thread-processor] Updated EmailThread:", emailThread.id);
    }

    // Store messages, linking to thread
    let newMessages = 0;
    let existingMessages = 0;

    for (const msg of processedMessages) {
      // Check if message already exists
      const existing = await prisma.message.findUnique({
        where: { gmailMessageId: msg.gmailMessageId },
      });

      if (existing) {
        existingMessages++;
        // Update thread link if not set
        if (!existing.threadId) {
          await prisma.message.update({
            where: { id: existing.id },
            data: { threadId: emailThread.id },
          });
        }
        continue;
      }

      // Find matching supplier for this message
      let supplierId: string | undefined;
      let contactMethodId: string | undefined;

      // For inbound messages, match the sender
      // For outbound messages, match the recipient
      const emailToMatch = msg.direction === "INBOUND" ? msg.fromEmail : msg.toEmails[0];
      
      if (emailToMatch) {
        const contactMethod = await prisma.contactMethod.findFirst({
          where: {
            type: "EMAIL",
            value: { equals: emailToMatch, mode: "insensitive" },
            contact: {
              supplier: { userId },
            },
          },
          include: {
            contact: {
              include: { supplier: true },
            },
          },
        });

        if (contactMethod?.contact?.supplier) {
          supplierId = contactMethod.contact.supplier.id;
          contactMethodId = contactMethod.id;
          
          if (debug) {
            console.log(`[thread-processor] Matched ${msg.direction} message to supplier:`, {
              email: emailToMatch,
              supplierId,
              supplierName: contactMethod.contact.supplier.name,
            });
          }
        }
      }

      // Create the message
      await prisma.message.create({
        data: {
          gmailMessageId: msg.gmailMessageId,
          gmailThreadId: msg.gmailThreadId,
          threadId: emailThread.id,
          userId,
          subject: msg.subject,
          content: msg.content,
          contentClean: msg.contentClean,
          direction: msg.direction,
          channel: "EMAIL",
          sentAt: msg.sentAt,
          hasQuotedContent: msg.hasQuotedContent,
          supplierId,
          contactMethodId,
        },
      });
      newMessages++;
    }

    if (debug) {
      console.log(`[thread-processor] Thread ${gmailThreadId}: ${newMessages} new, ${existingMessages} existing`);
    }

    // If there are new messages, trigger thread analysis
    if (newMessages > 0) {
      try {
        if (debug) console.log(`[thread-processor] Triggering analysis for thread ${emailThread.id}`);
        await analyzeThread(emailThread.id);
      } catch (analysisError) {
        console.error(`[thread-processor] Analysis failed for thread ${emailThread.id}:`, analysisError);
        // Don't fail the whole process if analysis fails
      }
    }

    return {
      thread: {
        id: emailThread.id,
        gmailThreadId: emailThread.gmailThreadId,
        messageCount: emailThread.messageCount,
        subject: emailThread.subject,
      },
      newMessages,
      existingMessages,
    };
  } catch (error) {
    console.error(`[thread-processor] Error processing thread ${gmailThreadId}:`, error);
    return null;
  }
}

/**
 * Process new messages from Gmail history, fetching full threads
 */
export async function processGmailHistoryWithThreads(
  accessToken: string,
  startHistoryId: string,
  userId: string,
  userEmail: string,
  opts?: { debug?: boolean }
): Promise<{ processedThreads: number; newMessages: number }> {
  const debug = opts?.debug ?? false;
  
  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({ access_token: accessToken });
  const gmail = google.gmail({ version: "v1", auth: oauth2Client });

  try {
    const response = await gmail.users.history.list({
      userId: "me",
      startHistoryId,
      historyTypes: ["messageAdded"],
    });

    const history = response.data.history || [];
    const threadIds = new Set<string>();

    // Collect unique thread IDs from new messages
    for (const record of history) {
      if (record.messagesAdded) {
        for (const addedMessage of record.messagesAdded) {
          if (addedMessage.message?.threadId) {
            threadIds.add(addedMessage.message.threadId);
          }
        }
      }
    }

    if (debug) {
      console.log(`[thread-processor] Found ${threadIds.size} threads to process from history`);
    }

    let processedThreads = 0;
    let totalNewMessages = 0;

    // Process each thread
    for (const threadId of threadIds) {
      const result = await processGmailThread(accessToken, threadId, userId, userEmail, opts);
      if (result) {
        processedThreads++;
        totalNewMessages += result.newMessages;
      }
    }

    return { processedThreads, newMessages: totalNewMessages };
  } catch (error) {
    console.error("[thread-processor] Error processing history:", error);
    return { processedThreads: 0, newMessages: 0 };
  }
}

