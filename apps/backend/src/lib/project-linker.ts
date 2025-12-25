/**
 * Project Linker
 * 
 * Detects which project an email thread is related to based on:
 * - Thread/email content (event names, dates, venues)
 * - Supplier relationships (which projects is this supplier linked to?)
 * - Recency (more recent active projects score higher)
 */

import { prisma } from "../db";
import type { ThreadAnalysis } from "./thread-analyzer";

const AUTO_LINK_THRESHOLD = 0.8;

interface ProjectCandidate {
  id: string;
  name: string;
  date: Date | null;
  venue: string | null;
  type: string;
  score: number;
  matchReasons: string[];
}

interface LinkDecision {
  projectId: string | null;
  confidence: number;
  method: "AUTO" | "AMBIGUOUS" | "NO_MATCH";
  candidates: ProjectCandidate[];
}

/**
 * Check if project name appears in text (fuzzy matching)
 */
function projectNameInText(projectName: string, text: string): boolean {
  const projectWords = projectName.toLowerCase().split(/\s+/).filter(w => w.length > 2);
  const textLower = text.toLowerCase();
  
  // Check if all significant words from project name appear in text
  const matchingWords = projectWords.filter(word => textLower.includes(word));
  
  // At least 2 words match, or all words if there are only 1-2 words
  const threshold = Math.min(2, projectWords.length);
  return matchingWords.length >= threshold;
}

/**
 * Score a project against thread analysis signals
 */
function scoreProject(
  project: {
    id: string;
    name: string;
    date: Date | null;
    venue: string | null;
    type: string;
  },
  analysis: ThreadAnalysis | null,
  supplierProjectIds: string[],
  threadContent?: string // Raw thread content for direct matching
): ProjectCandidate {
  let score = 0;
  const matchReasons: string[] = [];

  // Check if supplier is already linked to this project
  if (supplierProjectIds.includes(project.id)) {
    score += 0.4;
    matchReasons.push("Supplier already linked to project");
  }

  // Direct text matching: check if project name appears in thread content
  if (threadContent && projectNameInText(project.name, threadContent)) {
    score += 0.35;
    matchReasons.push(`Project name found in email: "${project.name}"`);
  }

  if (analysis?.projectSignals) {
    const signals = analysis.projectSignals;

    // Event name matching (from AI extraction)
    if (signals.eventName) {
      const nameLower = signals.eventName.toLowerCase();
      const projectNameLower = project.name.toLowerCase();
      
      if (projectNameLower.includes(nameLower) || nameLower.includes(projectNameLower)) {
        score += 0.3;
        matchReasons.push(`Event name match: "${signals.eventName}"`);
      }
    }

    // Date matching
    if (signals.eventDate && project.date) {
      const signalDate = new Date(signals.eventDate);
      const projectDate = new Date(project.date);
      
      // Check if same day
      if (signalDate.toDateString() === projectDate.toDateString()) {
        score += 0.25;
        matchReasons.push(`Date match: ${signals.eventDate}`);
      } else {
        // Check if within 7 days
        const daysDiff = Math.abs(signalDate.getTime() - projectDate.getTime()) / (1000 * 60 * 60 * 24);
        if (daysDiff <= 7) {
          score += 0.1;
          matchReasons.push(`Date close: ${signals.eventDate} (within 7 days)`);
        }
      }
    }

    // Venue matching
    if (signals.venue && project.venue) {
      const venueLower = signals.venue.toLowerCase();
      const projectVenueLower = project.venue.toLowerCase();
      
      if (projectVenueLower.includes(venueLower) || venueLower.includes(projectVenueLower)) {
        score += 0.2;
        matchReasons.push(`Venue match: "${signals.venue}"`);
      }
    }

    // Event type matching
    if (signals.eventType) {
      const typeLower = signals.eventType.toLowerCase();
      const projectTypeLower = project.type.toLowerCase();
      
      if (projectTypeLower.includes(typeLower) || typeLower.includes(projectTypeLower)) {
        score += 0.1;
        matchReasons.push(`Event type match: ${signals.eventType}`);
      }
    }
  }

  // Recency bonus for future events
  if (project.date) {
    const now = new Date();
    const projectDate = new Date(project.date);
    
    if (projectDate > now) {
      // Upcoming event gets a bonus
      const daysUntil = (projectDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
      if (daysUntil <= 30) {
        score += 0.15;
        matchReasons.push("Upcoming event (within 30 days)");
      } else if (daysUntil <= 90) {
        score += 0.1;
        matchReasons.push("Upcoming event (within 90 days)");
      }
    }
  }

  return {
    id: project.id,
    name: project.name,
    date: project.date,
    venue: project.venue,
    type: project.type,
    score: Math.min(score, 1), // Cap at 1
    matchReasons,
  };
}

/**
 * Detect which project a thread is related to
 */
export async function detectProjectForThread(
  threadId: string,
  userId: string,
  opts?: { analysis?: ThreadAnalysis }
): Promise<LinkDecision> {
  // Get the thread with message content for direct matching
  const thread = await prisma.emailThread.findUnique({
    where: { id: threadId },
    include: {
      messages: {
        select: { 
          supplierId: true,
          subject: true,
          contentClean: true,
          content: true,
        },
      },
    },
  });

  if (!thread) {
    return {
      projectId: null,
      confidence: 0,
      method: "NO_MATCH",
      candidates: [],
    };
  }

  // Get analysis from opts or from thread
  const analysis = opts?.analysis || (thread.analysisJson as ThreadAnalysis | null);

  // Build combined thread content for direct matching
  const threadContent = [
    thread.subject || "",
    ...thread.messages.map(m => m.subject || ""),
    ...thread.messages.map(m => m.contentClean || m.content || ""),
  ].join(" ").toLowerCase();

  // Get suppliers from the thread
  const supplierIds = thread.messages
    .map(m => m.supplierId)
    .filter((id): id is string => id !== null);
  const uniqueSupplierIds = [...new Set(supplierIds)];

  // Find projects that have any of these suppliers
  const supplierProjects = await prisma.projectSupplier.findMany({
    where: {
      supplierId: { in: uniqueSupplierIds },
      project: { userId },
    },
    select: { projectId: true },
  });
  const supplierProjectIds = [...new Set(supplierProjects.map(sp => sp.projectId))];

  // Get all active projects for the user
  const projects = await prisma.project.findMany({
    where: {
      userId,
      // Only consider projects that are not in the past
      OR: [
        { date: null },
        { date: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } }, // Up to 30 days in past
      ],
    },
    select: {
      id: true,
      name: true,
      date: true,
      venue: true,
      type: true,
    },
    orderBy: { date: "asc" },
  });

  if (projects.length === 0) {
    return {
      projectId: null,
      confidence: 0,
      method: "NO_MATCH",
      candidates: [],
    };
  }

  // Score each project
  const candidates = projects
    .map(p => scoreProject(p, analysis, supplierProjectIds, threadContent))
    .sort((a, b) => b.score - a.score);

  // Decision logic
  const topCandidate = candidates[0];
  const secondCandidate = candidates[1];

  // If top score is high enough and significantly better than second
  if (topCandidate.score >= AUTO_LINK_THRESHOLD) {
    const scoreDiff = secondCandidate ? topCandidate.score - secondCandidate.score : topCandidate.score;
    
    if (scoreDiff >= 0.2 || !secondCandidate) {
      return {
        projectId: topCandidate.id,
        confidence: topCandidate.score,
        method: "AUTO",
        candidates,
      };
    }
  }

  // If there are candidates but not confident enough
  if (candidates.some(c => c.score > 0)) {
    return {
      projectId: null,
      confidence: topCandidate.score,
      method: "AMBIGUOUS",
      candidates: candidates.filter(c => c.score > 0),
    };
  }

  return {
    projectId: null,
    confidence: 0,
    method: "NO_MATCH",
    candidates,
  };
}

/**
 * Link a thread to a project
 */
export async function linkThreadToProject(
  threadId: string,
  projectId: string,
  opts?: { confidence?: number; method?: string }
): Promise<void> {
  await prisma.emailThread.update({
    where: { id: threadId },
    data: {
      detectedProjectId: projectId,
      detectedProjectConf: opts?.confidence,
    },
  });

  // Also update all messages in the thread
  await prisma.message.updateMany({
    where: {
      threadId,
      projectId: null, // Only update messages not already linked
    },
    data: {
      projectId,
      projectLinkConfidence: opts?.confidence,
      projectLinkMethod: opts?.method || "THREAD_CONTEXT",
    },
  });

  console.log(`[project-linker] Linked thread ${threadId} to project ${projectId}`);
}

/**
 * Process a thread for project linking
 */
export async function processThreadForProjectLink(
  threadId: string,
  userId: string,
  opts?: { analysis?: ThreadAnalysis }
): Promise<LinkDecision> {
  const decision = await detectProjectForThread(threadId, userId, opts);

  if (decision.method === "AUTO" && decision.projectId) {
    await linkThreadToProject(threadId, decision.projectId, {
      confidence: decision.confidence,
      method: "AUTO",
    });
  }

  return decision;
}

/**
 * Get threads that need project linking (ambiguous or no match)
 */
export async function getThreadsNeedingProjectLink(
  userId: string,
  limit: number = 20
): Promise<{
  threadId: string;
  subject: string | null;
  candidates: ProjectCandidate[];
}[]> {
  // Find threads without project link
  const threads = await prisma.emailThread.findMany({
    where: {
      userId,
      detectedProjectId: null,
      messages: {
        some: { supplierId: { not: null } },
      },
    },
    select: {
      id: true,
      subject: true,
      analysisJson: true,
      messages: {
        where: { supplierId: { not: null } },
        select: { supplierId: true },
        distinct: ["supplierId"],
      },
    },
    orderBy: { updatedAt: "desc" },
    take: limit,
  });

  const results = [];

  for (const thread of threads) {
    const decision = await detectProjectForThread(thread.id, userId, {
      analysis: (thread.analysisJson as ThreadAnalysis | null) ?? undefined,
    });

    if (decision.candidates.length > 0) {
      results.push({
        threadId: thread.id,
        subject: thread.subject,
        candidates: decision.candidates,
      });
    }
  }

  return results;
}

