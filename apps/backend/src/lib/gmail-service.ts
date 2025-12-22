import { google } from "googleapis";
import { prisma } from "../db";

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

export async function processEmailsWithToken(
  accessToken: string,
  startHistoryId: string,
  userId: string
) {
  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({ access_token: accessToken });
  const gmail = google.gmail({ version: "v1", auth: oauth2Client });

  const newMessages = await fetchGmailHistory(gmail, startHistoryId);
  let processedCount = 0;

  for (const msg of newMessages) {
    if (!msg.id) continue;

    // Check if already processed
    const existing = await prisma.message.findFirst({
      where: { externalId: msg.id },
    });
    if (existing) continue;

    try {
      const emailData = await gmail.users.messages.get({
        userId: "me",
        id: msg.id,
        format: "full",
      });

      const headers = emailData.data.payload?.headers || [];
      const fromRaw = headers.find((h: any) => h.name === "From")?.value || "";
      const fromEmail = fromRaw.match(/<(.+)>/)?.[1] || fromRaw;
      const body = extractEmailBody(emailData.data.payload);
      const dateStr = headers.find((h: any) => h.name === "Date")?.value;
      const sentAt = dateStr ? new Date(dateStr) : new Date();

      // Match Supplier
      const contactMethod = await prisma.contactMethod.findFirst({
        where: {
          type: "EMAIL",
          value: fromEmail,
          supplier: { userId: userId }, // Must belong to this user
        },
        include: { supplier: true },
      });

      if (contactMethod) {
        // Create Message linked to Supplier
        await prisma.message.create({
          data: {
            content: body,
            direction: "INBOUND",
            externalId: msg.id,
            sentAt,
            contactMethodId: contactMethod.id,
            supplierId: contactMethod.supplierId,
          },
        });
        processedCount++;
      }
    } catch (err) {
      console.error(`Failed to process message ${msg.id}`, err);
    }
  }

  return { processed: processedCount, total: newMessages.length };
}
