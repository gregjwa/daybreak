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
  userId: string,
  opts?: { debug?: boolean }
) {
  const debug = Boolean(opts?.debug);
  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({ access_token: accessToken });
  const gmail = google.gmail({ version: "v1", auth: oauth2Client });

  if (debug) {
    console.log("[gmail-service] startHistoryId:", startHistoryId);
  }
  const newMessages = await fetchGmailHistory(gmail, startHistoryId);
  let processedCount = 0;

  if (debug) {
    console.log("[gmail-service] history returned message count:", newMessages.length);
  }

  const extractEmail = (input: string): string | null => {
    if (!input) return null;
    // Handles: Name <email@x.com>, just email@x.com, quoted forms, etc.
    const match = input.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
    return match ? match[0] : null;
  };

  for (const msg of newMessages) {
    if (!msg.id) continue;

    // Check if already processed
    const existing = await prisma.message.findFirst({
      where: { externalId: msg.id },
    });
    if (existing) {
      if (debug) console.log("[gmail-service] skipping existing message:", msg.id);
      continue;
    }

    try {
      const emailData = await gmail.users.messages.get({
        userId: "me",
        id: msg.id,
        format: "full",
      });

      const headers = emailData.data.payload?.headers || [];
      const fromRaw = headers.find((h: any) => h.name === "From")?.value || "";
      const subject = headers.find((h: any) => h.name === "Subject")?.value || "";
      const fromEmail = extractEmail(fromRaw) ?? fromRaw;
      const normalizedFromEmail = fromEmail.trim().toLowerCase();
      const body = extractEmailBody(emailData.data.payload);
      const dateStr = headers.find((h: any) => h.name === "Date")?.value;
      const sentAt = dateStr ? new Date(dateStr) : new Date();

      if (debug) {
        console.log("[gmail-service] msg:", {
          id: msg.id,
          fromRaw,
          fromEmail: normalizedFromEmail,
          subject,
          sentAt: sentAt.toISOString(),
          bodyPreview: body.slice(0, 120),
        });
      }

      // Match Supplier via ContactMethod -> SupplierContact -> Supplier
      const contactMethod = await prisma.contactMethod.findFirst({
        where: {
          type: "EMAIL",
          value: { equals: normalizedFromEmail, mode: "insensitive" },
          contact: { 
            supplier: { userId: userId } // Must belong to this user
          },
        },
        include: { 
          contact: {
            include: { supplier: true }
          }
        },
      });

      if (contactMethod?.contact?.supplier) {
        const supplier = contactMethod.contact.supplier;
        if (debug) {
          console.log("[gmail-service] matched supplier:", {
            supplierId: supplier.id,
            supplierName: supplier.name,
            contactMethodId: contactMethod.id,
          });
        }
        // Create Message linked to Supplier
        await prisma.message.create({
          data: {
            content: body,
            direction: "INBOUND",
            externalId: msg.id,
            sentAt,
            contactMethodId: contactMethod.id,
            supplierId: supplier.id,
          },
        });
        processedCount++;
      } else if (debug) {
        console.log(
          "[gmail-service] no ContactMethod match for fromEmail:",
          normalizedFromEmail
        );
      }
    } catch (err) {
      console.error(`Failed to process message ${msg.id}`, err);
    }
  }

  return { processed: processedCount, total: newMessages.length };
}
