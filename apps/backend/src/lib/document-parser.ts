/**
 * Document Parser
 * 
 * Parses various document types to extract project information:
 * - Raw text
 * - CSV/Excel spreadsheets
 * - PDFs
 * - Images (via OCR)
 * 
 * Uses AI to extract structured project data.
 */

// Types
export interface SupplierSlot {
  category: string;        // Must match SupplierCategory slug
  description?: string;    // e.g., "Need florist for centerpieces + ceremony arch"
  budget?: number;         // Allocated budget for this category
  priority: "must-have" | "nice-to-have";
}

export interface ExtractedProject {
  name: string;
  eventType: string;       // "wedding", "corporate", "party", etc.
  eventDate?: string;      // ISO date string
  venue?: string;
  guestCount?: number;
  totalBudget?: number;
  supplierSlots: SupplierSlot[];
  notes?: string;
}

export interface ParseResult {
  success: boolean;
  project?: ExtractedProject;
  rawText?: string;
  error?: string;
}

/**
 * Detect document type from content
 */
export function detectDocumentType(
  filename: string | undefined,
  contentType: string | undefined
): "text" | "csv" | "xlsx" | "pdf" | "image" | "unknown" {
  const ext = filename?.split(".").pop()?.toLowerCase();
  
  if (ext === "csv" || contentType === "text/csv") return "csv";
  if (ext === "xlsx" || ext === "xls" || contentType?.includes("spreadsheet")) return "xlsx";
  if (ext === "pdf" || contentType === "application/pdf") return "pdf";
  if (["jpg", "jpeg", "png", "gif", "webp"].includes(ext || "") || contentType?.startsWith("image/")) return "image";
  if (ext === "txt" || contentType?.startsWith("text/")) return "text";
  
  return "unknown";
}

/**
 * Parse CSV content to text
 */
function parseCSVToText(content: string): string {
  // Simple CSV parsing - convert to readable text
  const lines = content.split("\n").filter(l => l.trim());
  const rows = lines.map(line => {
    // Handle quoted fields
    const fields: string[] = [];
    let current = "";
    let inQuotes = false;
    
    for (const char of line) {
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === "," && !inQuotes) {
        fields.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }
    fields.push(current.trim());
    return fields;
  });

  // Format as readable text
  if (rows.length === 0) return "";
  
  const headers = rows[0];
  const dataRows = rows.slice(1);
  
  const textLines: string[] = [`Spreadsheet with ${dataRows.length} rows:`];
  textLines.push(`Columns: ${headers.join(", ")}`);
  textLines.push("");
  
  for (let i = 0; i < Math.min(dataRows.length, 50); i++) {
    const row = dataRows[i];
    const formatted = headers.map((h, j) => `${h}: ${row[j] || ""}`).join(" | ");
    textLines.push(`Row ${i + 1}: ${formatted}`);
  }
  
  if (dataRows.length > 50) {
    textLines.push(`... and ${dataRows.length - 50} more rows`);
  }
  
  return textLines.join("\n");
}

/**
 * Build the AI prompt for project extraction
 */
function buildExtractionPrompt(): string {
  return `You are extracting project information for an event planner from a document.

Extract the following information if present:

1. PROJECT INFO:
   - name: A descriptive name for the event (e.g., "Johnson Wedding", "2025 Tech Summit")
   - eventType: Type of event (wedding, corporate, party, conference, gala, etc.)
   - eventDate: Date of the event (format as YYYY-MM-DD)
   - venue: Location/venue name
   - guestCount: Expected number of guests
   - totalBudget: Total budget if mentioned

2. SUPPLIER SLOTS - For each vendor/service mentioned, extract:
   - category: Match to one of these EXACTLY:
     venue, catering, bar-service, photography, videography, dj, live-music, officiant, planner,
     florist, decor, lighting, rentals, signage, stationery, hair-stylist, makeup-artist, 
     dress-attire, jewelry, photo-booth, entertainment, games, transportation, bakery, 
     ice-cream, coffee, food-truck, av-production, live-streaming, security, valet, 
     childcare, pet-services, favors, calligraphy, travel, insurance, speakers, 
     team-building, exhibitor, registration, swag
   - description: Specific requirements mentioned
   - budget: Allocated budget for this category if mentioned (as number)
   - priority: "must-have" or "nice-to-have"

3. NOTES: Any additional important information

RULES:
- If the document is a budget spreadsheet, extract line items as supplier slots
- Look for vendor categories, budget allocations, requirements
- Be conservative - only extract what's clearly stated
- Infer reasonable eventType from context if not explicit

Respond with ONLY valid JSON:
{
  "name": "Event Name",
  "eventType": "wedding",
  "eventDate": "2025-06-15",
  "venue": "Grand Ballroom Hotel",
  "guestCount": 150,
  "totalBudget": 50000,
  "supplierSlots": [
    {
      "category": "photography",
      "description": "Need photographer for ceremony and reception",
      "budget": 3500,
      "priority": "must-have"
    }
  ],
  "notes": "Additional notes here"
}`;
}

/**
 * Call AI to extract project from text
 */
async function extractProjectWithAI(text: string): Promise<ExtractedProject | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error("[document-parser] OPENAI_API_KEY not configured");
    return null;
  }

  const model = process.env.EXTRACTION_MODEL || "gpt-4o-mini";

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
          { role: "system", content: buildExtractionPrompt() },
          { role: "user", content: `Extract project information from this document:\n\n${text.slice(0, 10000)}` },
        ],
        max_completion_tokens: 2000,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("[document-parser] OpenAI API error:", err);
      return null;
    }

    const data = await res.json() as {
      choices?: { message?: { content?: string } }[];
    };

    const content = data.choices?.[0]?.message?.content || "{}";
    
    // Parse JSON from response
    let jsonStr = content;
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1];
    }
    
    const parsed = JSON.parse(jsonStr) as ExtractedProject;
    return parsed;
  } catch (error) {
    console.error("[document-parser] Error extracting project:", error);
    return null;
  }
}

/**
 * Parse text content
 */
export async function parseText(text: string): Promise<ParseResult> {
  if (!text.trim()) {
    return { success: false, error: "Empty text provided" };
  }

  const project = await extractProjectWithAI(text);
  
  if (!project) {
    return { success: false, rawText: text, error: "Failed to extract project data" };
  }

  return { success: true, project, rawText: text };
}

/**
 * Parse CSV content
 */
export async function parseCSV(content: string): Promise<ParseResult> {
  const text = parseCSVToText(content);
  
  if (!text) {
    return { success: false, error: "Failed to parse CSV" };
  }

  const project = await extractProjectWithAI(text);
  
  if (!project) {
    return { success: false, rawText: text, error: "Failed to extract project data" };
  }

  return { success: true, project, rawText: text };
}

/**
 * Parse PDF content (requires pdf-parse or similar)
 * For now, returns a placeholder - needs proper PDF library
 */
export async function parsePDF(buffer: Buffer): Promise<ParseResult> {
  // TODO: Implement proper PDF parsing with pdf-parse or similar
  // For now, this is a placeholder that suggests using text input
  
  try {
    // Try to extract text from PDF using a simple approach
    // In production, use pdf-parse: const pdfData = await pdfParse(buffer);
    
    // Placeholder: Check if it's a text-based PDF
    const textContent = buffer.toString("utf-8");
    const hasText = textContent.includes("stream") && textContent.includes("endstream");
    
    if (!hasText) {
      return { 
        success: false, 
        error: "PDF parsing not fully implemented. Please paste text content or upload CSV/Excel." 
      };
    }

    return { 
      success: false, 
      error: "PDF parsing requires additional libraries. Please install pdf-parse for full support." 
    };
  } catch (error) {
    return { success: false, error: "Failed to parse PDF" };
  }
}

/**
 * Parse image content using GPT-4 Vision
 */
export async function parseImage(
  buffer: Buffer, 
  mimeType: string = "image/png"
): Promise<ParseResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return { success: false, error: "OPENAI_API_KEY not configured" };
  }

  try {
    const base64 = buffer.toString("base64");
    const dataUrl = `data:${mimeType};base64,${base64}`;

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o", // Vision model
        messages: [
          { 
            role: "system", 
            content: buildExtractionPrompt() 
          },
          { 
            role: "user", 
            content: [
              { type: "text", text: "Extract project information from this image (it may be a budget spreadsheet, handwritten notes, or planning document):" },
              { type: "image_url", image_url: { url: dataUrl } },
            ]
          },
        ],
        max_tokens: 2000,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("[document-parser] Vision API error:", err);
      return { success: false, error: "Failed to process image" };
    }

    const data = await res.json() as {
      choices?: { message?: { content?: string } }[];
    };

    const content = data.choices?.[0]?.message?.content || "{}";
    
    let jsonStr = content;
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1];
    }
    
    const project = JSON.parse(jsonStr) as ExtractedProject;
    return { success: true, project };
  } catch (error) {
    console.error("[document-parser] Error parsing image:", error);
    return { success: false, error: "Failed to process image" };
  }
}

/**
 * Parse document based on type
 */
export async function parseDocument(
  content: Buffer | string,
  type: "text" | "csv" | "xlsx" | "pdf" | "image",
  mimeType?: string
): Promise<ParseResult> {
  switch (type) {
    case "text":
      return parseText(typeof content === "string" ? content : content.toString("utf-8"));
    
    case "csv":
      return parseCSV(typeof content === "string" ? content : content.toString("utf-8"));
    
    case "xlsx":
      // For Excel, we'd need xlsx library
      return { 
        success: false, 
        error: "Excel parsing requires xlsx library. Please save as CSV and re-upload." 
      };
    
    case "pdf":
      return parsePDF(typeof content === "string" ? Buffer.from(content) : content);
    
    case "image":
      return parseImage(
        typeof content === "string" ? Buffer.from(content, "base64") : content,
        mimeType
      );
    
    default:
      return { success: false, error: `Unsupported document type: ${type}` };
  }
}

