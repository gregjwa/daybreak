/**
 * Thread Analyzer
 * 
 * Analyzes email threads to extract:
 * - Project context (event name, date, venue, etc.)
 * - Status progression (what status changes the thread suggests)
 * - Supplier information (company name, contact, category)
 */

import { prisma } from "../db";
import { processThreadAnalysis } from "./status-detector";
import { processThreadForProjectLink } from "./project-linker";
import { detectStatusFromThread } from "./signal-matcher";

// Types
export interface ThreadAnalysis {
  // Project detection
  projectSignals: {
    eventName?: string;
    eventType?: string;
    eventDate?: string;
    venue?: string;
    guestCount?: number;
    budgetMentioned?: number;
  };
  projectConfidence: number;
  
  // Status progression
  statusProgression: StatusDetection[];
  currentStatus: string | null;
  
  // Supplier info
  supplierSignals: {
    companyName?: string;
    contactName?: string;
    category?: string;
    quoteAmount?: number;
  };
}

export interface StatusDetection {
  statusSlug: string;
  messageIndex: number;
  signals: string[];
  confidence: number;
  direction: "INBOUND" | "OUTBOUND";
  timestamp: Date;
}

interface MessageForAnalysis {
  id: string;
  content: string;
  contentClean?: string | null;
  subject?: string | null;
  direction: string;
  sentAt: Date;
}

const PROMPT_VERSION = "v1-thread-analysis";

/**
 * Build the system prompt for thread analysis
 */
function buildSystemPrompt(): string {
  return `You are analyzing an email thread between an event planner and a vendor/supplier.

Your task is to extract:

1. PROJECT CONTEXT - Look for mentions of:
   - Event name or description (e.g., "Johnson Wedding", "2025 Corporate Summit")
   - Event type (wedding, corporate, party, conference, etc.)
   - Event date (any dates mentioned in context of the event)
   - Venue (location names)
   - Guest count (number of attendees)
   - Budget discussions

2. STATUS PROGRESSION - Identify what stage the vendor relationship is at:
   Possible statuses (in order of normal progression):
   - needed: Vendor needed but not contacted yet
   - shortlisted: Vendor identified as potential option
   - rfq-sent: Request for quote sent to vendor
   - quote-received: Vendor provided pricing/quote
   - negotiating: Discussing terms, pricing, details
   - confirmed: Vendor confirmed for the event
   - contracted: Contract signed
   - deposit-paid: Initial payment made
   - fulfilled: Service delivered (post-event)
   - paid-in-full: Final payment complete
   
   OFF-RAMP STATUS (can happen at any point):
   - cancelled: Vendor or planner has cancelled/withdrawn from the booking

   For each status change you detect, identify:
   - Which message triggered it (by index, 0-based)
   - What signals indicated the change
   - Confidence (0-1)

3. SUPPLIER INFO:
   - Company/business name
   - Contact person name
   - What service category they provide
   - Any quote amounts mentioned (as numbers)

RULES:
- Detect statuses when there is reasonable evidence in the messages
- Look at the DIRECTION of messages (INBOUND = from vendor, OUTBOUND = from planner)

STATUS MEANING GUIDE:
- rfq-sent: Planner is asking about availability, pricing, or services
- quote-received: Vendor has provided pricing or a proposal
- confirmed: Both parties have agreed to work together for the event
- contracted: Legal contract has been signed
- deposit-paid: Money has changed hands (deposit or retainer)
- fulfilled: Service was SUCCESSFULLY DELIVERED (post-event only)
- paid-in-full: Final payment completed
- cancelled: Either party has WITHDRAWN from the agreement

SEMANTIC UNDERSTANDING:
- "fulfilled" requires the event to have HAPPENED and services delivered successfully
- "cancelled" is when someone backs out, apologizes they can't do it, or withdraws
- Negative/apologetic language + withdrawal = cancellation, NOT fulfillment
- Pay attention to sentiment: positive confirmation vs. negative withdrawal

Focus on the LATEST message to detect the CURRENT status, while using historical messages for context.

Respond with ONLY valid JSON matching this schema:
{
  "projectSignals": {
    "eventName": "string or null",
    "eventType": "string or null",
    "eventDate": "YYYY-MM-DD or null",
    "venue": "string or null",
    "guestCount": "number or null",
    "budgetMentioned": "number or null"
  },
  "projectConfidence": 0.0-1.0,
  "statusProgression": [
    {
      "statusSlug": "quote-received",
      "messageIndex": 2,
      "signals": ["$3500", "package pricing"],
      "confidence": 0.9,
      "direction": "INBOUND"
    }
  ],
  "currentStatus": "quote-received or null",
  "supplierSignals": {
    "companyName": "string or null",
    "contactName": "string or null",
    "category": "string or null",
    "quoteAmount": "number or null"
  }
}`;
}

/**
 * Build the user message with thread content
 */
function buildUserMessage(messages: MessageForAnalysis[]): string {
  const lines: string[] = ["Analyze this email thread:\n"];
  
  // Sort by date
  const sorted = [...messages].sort(
    (a, b) => new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime()
  );
  
  // Mark the most recent message as NEW
  const newestIndex = sorted.length - 1;
  
  for (let i = 0; i < sorted.length; i++) {
    const msg = sorted[i];
    const content = msg.contentClean || msg.content;
    const isNewest = i === newestIndex;
    const preview = content.slice(0, 500) + (content.length > 500 ? "..." : "");
    
    const marker = isNewest ? " [NEW - LATEST MESSAGE]" : "";
    lines.push(`--- Message ${i}${marker} ---`);
    lines.push(`Direction: ${msg.direction}`);
    lines.push(`Date: ${msg.sentAt.toISOString()}`);
    if (msg.subject) lines.push(`Subject: ${msg.subject}`);
    lines.push(`Content: ${preview}`);
    lines.push("");
  }
  
  return lines.join("\n");
}

/**
 * Call OpenAI to analyze a thread
 */
async function callThreadAnalysisAI(
  messages: MessageForAnalysis[]
): Promise<ThreadAnalysis | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error("[thread-analyzer] OPENAI_API_KEY not configured");
    return null;
  }

  const model = process.env.THREAD_ANALYSIS_MODEL || "gpt-4o-mini";
  const systemPrompt = buildSystemPrompt();
  const userMessage = buildUserMessage(messages);

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
        max_completion_tokens: 1500,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("[thread-analyzer] OpenAI API error:", err);
      return null;
    }

    const data = await res.json() as {
      choices?: { message?: { content?: string } }[];
    };

    const content = data.choices?.[0]?.message?.content || "{}";
    
    // Verbose logging for debugging
    const debugAnalysis = process.env.DEBUG_ANALYSIS === "1" || process.env.DEBUG_ANALYSIS === "true";
    if (debugAnalysis) {
      console.log("[thread-analyzer] User message sent to AI:", userMessage.slice(0, 500));
      console.log("[thread-analyzer] Raw AI response:", content.slice(0, 1000));
    }
    
    // Parse JSON from response
    let jsonStr = content;
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1];
    }
    
    const parsed = JSON.parse(jsonStr) as ThreadAnalysis;
    
    // Always log status detection results for visibility
    if (parsed.statusProgression && parsed.statusProgression.length > 0) {
      console.log("[thread-analyzer] AI detected status changes:", 
        parsed.statusProgression.map(s => `${s.statusSlug} (${s.confidence})`).join(", ")
      );
    } else {
      console.log("[thread-analyzer] AI did not detect status changes");
    }
    
    return parsed;
  } catch (error) {
    console.error("[thread-analyzer] Error analyzing thread:", error);
    return null;
  }
}

/**
 * Analyze a thread and store results
 */
export async function analyzeThread(threadId: string): Promise<ThreadAnalysis | null> {
  const thread = await prisma.emailThread.findUnique({
    where: { id: threadId },
    include: {
      messages: {
        orderBy: { sentAt: "asc" },
        select: {
          id: true,
          content: true,
          contentClean: true,
          subject: true,
          direction: true,
          sentAt: true,
        },
      },
    },
  });

  if (!thread) {
    console.error("[thread-analyzer] Thread not found:", threadId);
    return null;
  }

  if (thread.messages.length === 0) {
    console.log("[thread-analyzer] Thread has no messages:", threadId);
    return null;
  }

  console.log(`[thread-analyzer] Analyzing thread ${threadId} with ${thread.messages.length} messages`);

  const aiAnalysis = await callThreadAnalysisAI(thread.messages);
  
  if (!aiAnalysis) {
    return null;
  }

  // Start with AI analysis
  let analysis: ThreadAnalysis = aiAnalysis;

  // FALLBACK: If AI didn't detect status, try keyword-based signal matching
  if (!analysis.currentStatus || analysis.statusProgression.length === 0) {
    console.log("[thread-analyzer] AI missed status, trying signal-based fallback...");
    
    const signalMatch = await detectStatusFromThread(
      thread.messages.map(m => ({
        content: m.content,
        contentClean: m.contentClean,
        direction: m.direction,
      }))
    );
    
    if (signalMatch) {
      console.log(`[thread-analyzer] Signal fallback detected: ${signalMatch.statusSlug} (${signalMatch.confidence})`);
      
      const lastMessage = thread.messages[thread.messages.length - 1];
      
      // Add the signal-detected status to the analysis
      analysis = {
        ...analysis,
        currentStatus: signalMatch.statusSlug,
        statusProgression: [{
          statusSlug: signalMatch.statusSlug,
          messageIndex: thread.messages.length - 1,
          signals: signalMatch.matchedSignals,
          confidence: signalMatch.confidence,
          direction: signalMatch.direction,
          timestamp: lastMessage?.sentAt || new Date(),
        }],
      };
    }
  }

  // Store analysis results on the thread
  const statusHistory = analysis.statusProgression.map((s, i) => ({
    status: s.statusSlug,
    timestamp: thread.messages[s.messageIndex]?.sentAt || new Date(),
    messageId: thread.messages[s.messageIndex]?.id,
    signals: s.signals,
    confidence: s.confidence,
  }));

  await prisma.emailThread.update({
    where: { id: threadId },
    data: {
      currentStatus: analysis.currentStatus,
      statusHistory: statusHistory,
      analysisJson: analysis as object,
      analysisVersion: PROMPT_VERSION,
      lastAnalyzedAt: new Date(),
    },
  });

  // Update individual messages with their detected status contributions
  for (const statusDetection of analysis.statusProgression) {
    const message = thread.messages[statusDetection.messageIndex];
    if (message) {
      await prisma.message.update({
        where: { id: message.id },
        data: {
          detectedStatusSlug: statusDetection.statusSlug,
          statusConfidence: statusDetection.confidence,
          statusSignals: statusDetection.signals,
        },
      });
    }
  }

  console.log(`[thread-analyzer] Analysis complete for thread ${threadId}:`, {
    currentStatus: analysis.currentStatus,
    statusCount: analysis.statusProgression.length,
    projectConfidence: analysis.projectConfidence,
    eventName: analysis.projectSignals?.eventName,
  });

  // IMPORTANT: Process project linking FIRST, so status detection can find project links
  try {
    const linkResult = await processThreadForProjectLink(threadId, thread.userId, { analysis });
    if (linkResult.projectId) {
      console.log(`[thread-analyzer] Linked thread to project:`, {
        projectId: linkResult.projectId,
        confidence: linkResult.confidence,
        method: linkResult.method,
      });
      
      // Update messages with the project link so status detector can find them
      await prisma.message.updateMany({
        where: { threadId, projectId: null },
        data: { 
          projectId: linkResult.projectId,
          projectLinkConfidence: linkResult.confidence,
          projectLinkMethod: linkResult.method,
        },
      });
    }
  } catch (linkError) {
    console.error(`[thread-analyzer] Failed to process project link for thread ${threadId}:`, linkError);
  }

  // THEN process status proposals (now messages should have project links)
  if (analysis.statusProgression.length > 0) {
    try {
      await processThreadAnalysis(threadId, analysis);
    } catch (proposalError) {
      console.error(`[thread-analyzer] Failed to process proposals for thread ${threadId}:`, proposalError);
    }
  }

  return analysis;
}

/**
 * Analyze all threads that need analysis (new or stale)
 */
export async function analyzeNewThreads(
  userId: string,
  opts?: { limit?: number }
): Promise<{ analyzed: number; errors: number }> {
  const limit = opts?.limit || 20;
  
  // Find threads that haven't been analyzed or need re-analysis
  const threads = await prisma.emailThread.findMany({
    where: {
      userId,
      OR: [
        { lastAnalyzedAt: null },
        { analysisVersion: { not: PROMPT_VERSION } },
      ],
    },
    orderBy: { updatedAt: "desc" },
    take: limit,
    select: { id: true },
  });

  let analyzed = 0;
  let errors = 0;

  for (const thread of threads) {
    const result = await analyzeThread(thread.id);
    if (result) {
      analyzed++;
    } else {
      errors++;
    }
  }

  return { analyzed, errors };
}

/**
 * Get thread analysis summary for a supplier across projects
 */
export async function getSupplierThreadSummary(
  supplierId: string
): Promise<{ threads: number; latestStatus: string | null; lastContact: Date | null }> {
  const threads = await prisma.emailThread.findMany({
    where: {
      messages: {
        some: { supplierId },
      },
    },
    orderBy: { updatedAt: "desc" },
    select: {
      currentStatus: true,
      updatedAt: true,
    },
  });

  return {
    threads: threads.length,
    latestStatus: threads[0]?.currentStatus || null,
    lastContact: threads[0]?.updatedAt || null,
  };
}

