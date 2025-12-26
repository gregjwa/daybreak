/**
 * Shared prompt builder for status detection (used by production ingestion + test suite).
 */

export interface StatusDefinitionForPrompt {
  slug: string;
  name: string;
  description: string | null;
  excludePatterns: string[];
}

export function buildStatusDetectionSystemPrompt(params: {
  statuses: StatusDefinitionForPrompt[];
}): string {
  const { statuses } = params;

  const statusDefs = statuses
    .map((s, index) => {
      let def = `- ${s.slug} (stage ${index + 1}): ${s.description || s.name}`;
      if (s.excludePatterns && s.excludePatterns.length > 0) {
        def += `\n    NOT this status if: ${s.excludePatterns.join(", ")}`;
      }
      return def;
    })
    .join("\n");

  return `You are analyzing an email thread between an event planner and a vendor/supplier.

Your task is to extract:

1. PROJECT CONTEXT - Look for mentions of:
   - Event name or description
   - Event type (wedding, corporate, party, conference, etc.)
   - Event date
   - Venue
   - Guest count
   - Budget discussions

2. STATUS PROGRESSION - Identify what stage the vendor relationship is at.

AVAILABLE STATUSES (from database):
${statusDefs}

CURRENT STATUS CONTEXT:
When a "CURRENT SUPPLIER STATUS" is provided in the message, use it to understand progression:
- Statuses generally progress forward through stages, rarely backwards
- An email should either MAINTAIN the current status or ADVANCE to a later stage
- Only "cancelled" can occur from any stage (vendor withdraws or planner cancels)
- If no status context is provided, determine the appropriate status from message content alone

PROGRESSION RULES:
- From "shortlisted" or earlier: Any email exchange → at least "rfq-sent"
- From "rfq-sent": Vendor provides $ amounts → "quote-received"
- From "quote-received": Discussion of terms/negotiation → "negotiating"
- From any stage: Vendor says YES/AGREE/AVAILABLE/CONFIRMED → "confirmed"
- From "confirmed": Signed contract mentioned → "contracted"
- From "contracted": Deposit/payment made → "deposit-paid"
- After event: Service delivered → "fulfilled", final payment → "paid-in-full"

For each status change you detect:
   - Which message triggered it (by index, 0-based)
   - What signals indicated the change
   - Confidence (0-1)
   - Your reasoning

3. SUPPLIER INFO:
   - Company/business name
   - Contact person name
   - Service category
   - Quote amounts

DETECTION RULES:
1. INBOUND = message FROM vendor. OUTBOUND = message FROM planner.
2. Match the MEANING of the message to the status definition.
3. Check the "NOT this status if" exclusions - if any match, skip that status.
4. Focus on what is HAPPENING in the message, not promises for the future.
5. If vendor says YES/AGREE/AVAILABLE = "confirmed" (even if quote promised later)
6. If vendor provides ACTUAL $ amounts = "quote-received"
7. Always include "reasoning" explaining your logic.

Respond with ONLY valid JSON:
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
      "statusSlug": "status-slug",
      "messageIndex": 0,
      "signals": ["matched signal 1", "matched signal 2"],
      "confidence": 0.9,
      "direction": "INBOUND or OUTBOUND",
      "reasoning": "Why this status was detected"
    }
  ],
  "currentStatus": "status-slug or null",
  "reasoning": "Overall explanation of status detection",
  "supplierSignals": {
    "companyName": "string or null",
    "contactName": "string or null",
    "category": "string or null",
    "quoteAmount": "number or null"
  }
}`;
}


