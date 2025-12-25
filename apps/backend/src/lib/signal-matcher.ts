/**
 * Signal Matcher
 * 
 * Simple keyword-based status detection as a fallback when AI doesn't detect status.
 * Uses the signals defined in SupplierStatus from the database.
 */

import { prisma } from "../db";

interface SignalMatch {
  statusSlug: string;
  matchedSignals: string[];
  confidence: number;
  direction: "INBOUND" | "OUTBOUND";
}

// Cache statuses to avoid repeated DB calls
let statusCache: {
  slug: string;
  inboundSignals: string[];
  outboundSignals: string[];
  order: number;
}[] | null = null;

async function getStatuses() {
  if (!statusCache) {
    statusCache = await prisma.supplierStatus.findMany({
      where: { isSystem: true },
      select: {
        slug: true,
        inboundSignals: true,
        outboundSignals: true,
        order: true,
      },
      orderBy: { order: "desc" }, // Check higher statuses first
    });
  }
  return statusCache;
}

/**
 * Check if any signals match in the text
 */
function findMatchingSignals(text: string, signals: string[]): string[] {
  const textLower = text.toLowerCase();
  return signals.filter(signal => {
    const signalLower = signal.toLowerCase();
    // Match whole word or phrase
    const regex = new RegExp(`\\b${signalLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i');
    return regex.test(textLower);
  });
}

/**
 * Detect status from message content using keyword matching
 * Returns the BEST match (most signals matched, ties go to higher order status)
 */
export async function detectStatusFromSignals(
  content: string,
  direction: "INBOUND" | "OUTBOUND"
): Promise<SignalMatch | null> {
  const statuses = await getStatuses();
  
  // Collect ALL matches, then pick the best one
  const allMatches: (SignalMatch & { order: number })[] = [];
  
  for (const status of statuses) {
    // Check signals based on direction
    const signals = direction === "INBOUND" 
      ? status.inboundSignals 
      : status.outboundSignals;
    
    if (signals.length === 0) continue;
    
    const matchedSignals = findMatchingSignals(content, signals);
    
    if (matchedSignals.length > 0) {
      // Calculate confidence based on number of matches and signal specificity
      const avgSignalLength = matchedSignals.reduce((a, s) => a + s.length, 0) / matchedSignals.length;
      const specificityBonus = Math.min(avgSignalLength / 20, 0.15); // Longer signals = more specific
      const confidence = Math.min(0.6 + (matchedSignals.length * 0.1) + specificityBonus, 0.85);
      
      allMatches.push({
        statusSlug: status.slug,
        matchedSignals,
        confidence,
        direction,
        order: status.order,
      });
    }
  }
  
  if (allMatches.length === 0) {
    return null;
  }
  
  // Sort by: 1) number of matched signals (more = better), 2) status order (higher = further in flow)
  allMatches.sort((a, b) => {
    if (b.matchedSignals.length !== a.matchedSignals.length) {
      return b.matchedSignals.length - a.matchedSignals.length;
    }
    return b.order - a.order;
  });
  
  const best = allMatches[0];
  console.log(`[signal-matcher] Matched status "${best.statusSlug}" with signals:`, best.matchedSignals);
  
  if (allMatches.length > 1) {
    console.log(`[signal-matcher] Also considered:`, allMatches.slice(1).map(m => `${m.statusSlug} (${m.matchedSignals.join(', ')})`));
  }
  
  return {
    statusSlug: best.statusSlug,
    matchedSignals: best.matchedSignals,
    confidence: best.confidence,
    direction: best.direction,
  };
}

/**
 * Analyze a thread's messages for status using signal matching
 */
export async function detectStatusFromThread(
  messages: { content: string; contentClean?: string | null; direction: string }[]
): Promise<SignalMatch | null> {
  // Check messages in reverse order (most recent first)
  const reversed = [...messages].reverse();
  
  for (const msg of reversed) {
    const content = msg.contentClean || msg.content;
    const direction = msg.direction as "INBOUND" | "OUTBOUND";
    
    const match = await detectStatusFromSignals(content, direction);
    if (match) {
      return match;
    }
  }
  
  return null;
}

/**
 * Clear the status cache (call after status updates)
 */
export function clearStatusCache() {
  statusCache = null;
}

