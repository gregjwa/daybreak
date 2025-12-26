/**
 * Status Detector
 * 
 * Creates and manages status proposals based on thread analysis.
 * Handles the logic for:
 * - Creating proposals when status changes are detected
 * - Auto-applying high-confidence proposals
 * - Updating ProjectSupplier status when proposals are accepted
 */

import { prisma } from "../db";
import type { ThreadAnalysis, StatusDetection } from "./thread-analyzer";

// Thresholds for auto-apply vs proposal
const AUTO_APPLY_THRESHOLD = 0.85;
const PROPOSAL_THRESHOLD = 0.5;
const PROPOSAL_EXPIRY_DAYS = 7;

interface StatusProposalInput {
  projectSupplierId: string;
  projectId: string;
  messageId?: string;
  threadId?: string;
  fromStatus: string | null;
  toStatus: string;
  confidence: number;
  matchedSignals: string[];
  reasoning?: string;
}

/**
 * Create a status proposal for review
 */
export async function createStatusProposal(
  input: StatusProposalInput
): Promise<string> {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + PROPOSAL_EXPIRY_DAYS);

  const proposal = await prisma.statusProposal.create({
    data: {
      projectSupplierId: input.projectSupplierId,
      projectId: input.projectId,
      messageId: input.messageId,
      threadId: input.threadId,
      fromStatus: input.fromStatus,
      toStatus: input.toStatus,
      confidence: input.confidence,
      matchedSignals: input.matchedSignals,
      reasoning: input.reasoning,
      status: "PENDING",
      expiresAt,
    },
  });

  console.log(`[status-detector] Created proposal ${proposal.id}: ${input.fromStatus} -> ${input.toStatus}`);
  return proposal.id;
}

/**
 * Apply a status change to a ProjectSupplier
 */
export async function applyStatusChange(
  projectSupplierId: string,
  newStatus: string,
  opts?: { changedBy?: string; reason?: string; proposalId?: string }
): Promise<void> {
  const projectSupplier = await prisma.projectSupplier.findUnique({
    where: { id: projectSupplierId },
  });

  if (!projectSupplier) {
    throw new Error(`ProjectSupplier not found: ${projectSupplierId}`);
  }

  const currentStatus = projectSupplier.statusSlug;
  
  // Build status history entry
  const historyEntry = {
    fromStatus: currentStatus,
    toStatus: newStatus,
    changedAt: new Date().toISOString(),
    changedBy: opts?.changedBy || "SYSTEM",
    reason: opts?.reason,
    proposalId: opts?.proposalId,
  };

  // Get existing history or create new array
  const existingHistory = (projectSupplier.statusHistory as object[] | null) || [];
  const updatedHistory = [...existingHistory, historyEntry];

  // Update the project supplier
  await prisma.projectSupplier.update({
    where: { id: projectSupplierId },
    data: {
      statusSlug: newStatus,
      statusHistory: updatedHistory,
    },
  });

  console.log(`[status-detector] Applied status change: ${currentStatus} -> ${newStatus} for ${projectSupplierId}`);
}

/**
 * Accept a status proposal
 */
export async function acceptProposal(
  proposalId: string,
  userId: string
): Promise<void> {
  const proposal = await prisma.statusProposal.findUnique({
    where: { id: proposalId },
  });

  if (!proposal) {
    throw new Error(`Proposal not found: ${proposalId}`);
  }

  if (proposal.status !== "PENDING") {
    throw new Error(`Proposal is not pending: ${proposal.status}`);
  }

  // Apply the status change
  await applyStatusChange(proposal.projectSupplierId, proposal.toStatus, {
    changedBy: userId,
    reason: "User accepted proposal",
    proposalId,
  });

  // Mark proposal as accepted
  await prisma.statusProposal.update({
    where: { id: proposalId },
    data: {
      status: "ACCEPTED",
      resolvedAt: new Date(),
      resolvedBy: userId,
    },
  });
}

/**
 * Reject a status proposal
 */
export async function rejectProposal(
  proposalId: string,
  userId: string
): Promise<void> {
  const proposal = await prisma.statusProposal.findUnique({
    where: { id: proposalId },
  });

  if (!proposal) {
    throw new Error(`Proposal not found: ${proposalId}`);
  }

  if (proposal.status !== "PENDING") {
    throw new Error(`Proposal is not pending: ${proposal.status}`);
  }

  await prisma.statusProposal.update({
    where: { id: proposalId },
    data: {
      status: "REJECTED",
      resolvedAt: new Date(),
      resolvedBy: userId,
    },
  });

  console.log(`[status-detector] Rejected proposal ${proposalId}`);
}

/**
 * Process thread analysis and create/apply proposals for linked project suppliers
 */
export async function processThreadAnalysis(
  threadId: string,
  analysis: ThreadAnalysis
): Promise<{ created: number; autoApplied: number }> {
  // Get the thread with linked messages and suppliers
  const thread = await prisma.emailThread.findUnique({
    where: { id: threadId },
    include: {
      messages: {
        where: { supplierId: { not: null } },
        select: { supplierId: true, projectId: true, id: true },
      },
    },
  });

  if (!thread) {
    console.error(`[status-detector] Thread not found: ${threadId}`);
    return { created: 0, autoApplied: 0 };
  }

  // Get unique supplier-project combinations from thread
  const supplierProjectPairs = new Map<string, { supplierId: string; projectId: string; messageId: string }>();
  
  for (const msg of thread.messages) {
    if (msg.supplierId && msg.projectId) {
      const key = `${msg.supplierId}:${msg.projectId}`;
      if (!supplierProjectPairs.has(key)) {
        supplierProjectPairs.set(key, {
          supplierId: msg.supplierId,
          projectId: msg.projectId,
          messageId: msg.id,
        });
      }
    }
  }

  if (supplierProjectPairs.size === 0) {
    console.log(`[status-detector] No project-supplier links found in thread ${threadId}`);
    return { created: 0, autoApplied: 0 };
  }

  let created = 0;
  let autoApplied = 0;

  // Get the latest detected status from analysis
  const latestStatus = analysis.currentStatus;
  if (!latestStatus) {
    return { created: 0, autoApplied: 0 };
  }

  // Find the detection that led to the current status
  const latestDetection = analysis.statusProgression
    .filter(s => s.statusSlug === latestStatus)
    .sort((a, b) => b.confidence - a.confidence)[0];

  if (!latestDetection) {
    return { created: 0, autoApplied: 0 };
  }

  // Process each supplier-project pair
  for (const [_, pair] of supplierProjectPairs) {
    // Get the ProjectSupplier record
    const projectSupplier = await prisma.projectSupplier.findUnique({
      where: {
        projectId_supplierId: {
          projectId: pair.projectId,
          supplierId: pair.supplierId,
        },
      },
    });

    if (!projectSupplier) {
      continue;
    }

    // Check if status would actually change
    if (projectSupplier.statusSlug === latestStatus) {
      continue;
    }

    // Check if there's already a pending proposal for this status change
    const existingProposal = await prisma.statusProposal.findFirst({
      where: {
        projectSupplierId: projectSupplier.id,
        toStatus: latestStatus,
        status: "PENDING",
      },
    });

    if (existingProposal) {
      continue;
    }

    // Decide whether to auto-apply or create proposal
    if (latestDetection.confidence >= AUTO_APPLY_THRESHOLD) {
      // Auto-apply high confidence changes
      await applyStatusChange(projectSupplier.id, latestStatus, {
        changedBy: "SYSTEM_AUTO",
        reason: `Auto-applied from thread analysis (confidence: ${latestDetection.confidence.toFixed(2)})`,
      });
      autoApplied++;
    } else if (latestDetection.confidence >= PROPOSAL_THRESHOLD) {
      // Create proposal for review
      await createStatusProposal({
        projectSupplierId: projectSupplier.id,
        projectId: pair.projectId,
        messageId: pair.messageId,
        threadId,
        fromStatus: projectSupplier.statusSlug,
        toStatus: latestStatus,
        confidence: latestDetection.confidence,
        matchedSignals: latestDetection.signals,
        reasoning: `Detected in email thread with signals: ${latestDetection.signals.join(", ")}`,
      });
      created++;
    }
  }

  console.log(`[status-detector] Thread ${threadId}: ${created} proposals created, ${autoApplied} auto-applied`);
  return { created, autoApplied };
}

/**
 * Expire old proposals
 */
export async function expireOldProposals(): Promise<number> {
  const result = await prisma.statusProposal.updateMany({
    where: {
      status: "PENDING",
      expiresAt: { lt: new Date() },
    },
    data: {
      status: "EXPIRED",
      resolvedAt: new Date(),
    },
  });

  if (result.count > 0) {
    console.log(`[status-detector] Expired ${result.count} old proposals`);
  }

  return result.count;
}

/**
 * Get pending proposals for a user
 */
export async function getPendingProposals(userId: string): Promise<{
  proposals: {
    id: string;
    projectName: string;
    supplierName: string;
    fromStatus: string | null;
    toStatus: string;
    confidence: number;
    matchedSignals: string[];
    reasoning: string | null;
    createdAt: Date;
    expiresAt: Date;
  }[];
}> {
  const proposals = await prisma.statusProposal.findMany({
    where: {
      status: "PENDING",
      project: { userId },
    },
    include: {
      projectSupplier: {
        include: {
          project: { select: { name: true } },
          supplier: { select: { name: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return {
    proposals: proposals.map(p => ({
      id: p.id,
      projectName: p.projectSupplier.project.name,
      supplierName: p.projectSupplier.supplier.name,
      fromStatus: p.fromStatus,
      toStatus: p.toStatus,
      confidence: p.confidence,
      matchedSignals: p.matchedSignals,
      reasoning: p.reasoning,
      createdAt: p.createdAt,
      expiresAt: p.expiresAt,
    })),
  };
}


