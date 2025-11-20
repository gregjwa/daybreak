// Email analysis for booking inquiry detection

const BOOKING_KEYWORDS = [
  "wedding",
  "studio",
  "recording",
  "session",
  "book",
  "booking",
  "schedule",
  "event",
  "inquiry",
  "interested",
  "availability",
  "quote",
  "price",
  "pricing",
];

export type ConfidenceLevel = "high" | "medium" | "low";

export interface EmailAnalysis {
  isBookingInquiry: boolean;
  matchedKeywords: string[];
  confidence: ConfidenceLevel;
}

/**
 * Analyzes email content for booking inquiry indicators
 */
export function analyzeEmailForBooking(subject: string, body: string): EmailAnalysis {
  const content = `${subject} ${body}`.toLowerCase();
  
  const matchedKeywords = BOOKING_KEYWORDS.filter((keyword) =>
    content.includes(keyword)
  );

  let confidence: ConfidenceLevel = "low";
  if (matchedKeywords.length >= 3) {
    confidence = "high";
  } else if (matchedKeywords.length >= 1) {
    confidence = "medium";
  }

  return {
    isBookingInquiry: matchedKeywords.length > 0,
    matchedKeywords,
    confidence,
  };
}

/**
 * Extracts email body from Gmail message payload
 */
export function extractEmailBody(payload: any): string {
  let body = "";

  if (payload.parts) {
    const textPart = payload.parts.find(
      (part: any) => part.mimeType === "text/plain"
    );
    if (textPart?.body?.data) {
      body = Buffer.from(textPart.body.data, "base64").toString("utf-8");
    }
  } else if (payload.body?.data) {
    body = Buffer.from(payload.body.data, "base64").toString("utf-8");
  }

  return body;
}

/**
 * Fetches Gmail history since a given history ID
 */
export async function fetchGmailHistory(
  gmail: any,
  startHistoryId: string
): Promise<any[]> {
  try {
    const response = await gmail.users.history.list({
      userId: "me",
      startHistoryId,
      historyTypes: ["messageAdded"],
    });

    const history = response.data.history || [];
    const newMessages = [];

    for (const record of history) {
      if (record.messagesAdded) {
        for (const addedMessage of record.messagesAdded) {
          newMessages.push(addedMessage.message);
        }
      }
    }

    return newMessages;
  } catch (error) {
    console.error("Error fetching Gmail history:", error);
    return [];
  }
}


