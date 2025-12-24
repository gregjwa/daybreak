import { Hono } from "hono";
import { getAuth } from "@hono/clerk-auth";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { prisma } from "../db";
import { 
  parseDocument, 
  parseText, 
  detectDocumentType,
  type ExtractedProject 
} from "../lib/document-parser";

const analyzeTextSchema = z.object({
  text: z.string().min(10),
});

const createProjectSchema = z.object({
  name: z.string().min(1),
  eventType: z.string().min(1),
  eventDate: z.string().optional(),
  venue: z.string().optional(),
  guestCount: z.number().optional(),
  totalBudget: z.number().optional(),
  supplierSlots: z.array(z.object({
    category: z.string(),
    description: z.string().optional(),
    budget: z.number().optional(),
    priority: z.enum(["must-have", "nice-to-have"]),
  })).optional(),
  notes: z.string().optional(),
});

const app = new Hono()
  // POST /api/import/analyze/text - Analyze raw text
  .post("/analyze/text", zValidator("json", analyzeTextSchema), async (c) => {
    const auth = getAuth(c);
    if (!auth?.userId) return c.json({ error: "Unauthorized" }, 401);

    const { text } = c.req.valid("json");

    try {
      const result = await parseText(text);
      
      if (!result.success) {
        return c.json({ 
          success: false, 
          error: result.error,
          rawText: result.rawText,
        }, 400);
      }

      return c.json({
        success: true,
        project: result.project,
        rawText: result.rawText,
      });
    } catch (error) {
      console.error("Error analyzing text:", error);
      return c.json({ error: "Failed to analyze text" }, 500);
    }
  })

  // POST /api/import/analyze/file - Analyze uploaded file
  .post("/analyze/file", async (c) => {
    const auth = getAuth(c);
    if (!auth?.userId) return c.json({ error: "Unauthorized" }, 401);

    try {
      const formData = await c.req.formData();
      const file = formData.get("file") as File | null;
      
      if (!file) {
        return c.json({ error: "No file provided" }, 400);
      }

      const docType = detectDocumentType(file.name, file.type);
      
      if (docType === "unknown") {
        return c.json({ 
          error: `Unsupported file type: ${file.type}. Supported: txt, csv, pdf, images` 
        }, 400);
      }

      const buffer = Buffer.from(await file.arrayBuffer());
      const result = await parseDocument(buffer, docType, file.type);

      if (!result.success) {
        return c.json({ 
          success: false, 
          error: result.error,
          rawText: result.rawText,
        }, 400);
      }

      return c.json({
        success: true,
        project: result.project,
        rawText: result.rawText,
        fileInfo: {
          name: file.name,
          type: file.type,
          size: file.size,
          detectedType: docType,
        },
      });
    } catch (error) {
      console.error("Error analyzing file:", error);
      return c.json({ error: "Failed to analyze file" }, 500);
    }
  })

  // POST /api/import/create - Create project from extracted data
  .post("/create", zValidator("json", createProjectSchema), async (c) => {
    const auth = getAuth(c);
    if (!auth?.userId) return c.json({ error: "Unauthorized" }, 401);

    const data = c.req.valid("json");

    try {
      const user = await prisma.user.findUnique({ where: { clerkId: auth.userId } });
      if (!user) return c.json({ error: "User not found" }, 404);

      // Create the project
      const project = await prisma.project.create({
        data: {
          userId: user.id,
          name: data.name,
          type: data.eventType,
          date: data.eventDate ? new Date(data.eventDate) : null,
          venue: data.venue,
          guestCount: data.guestCount,
          budget: data.totalBudget,
          description: data.notes,
        },
      });

      // Create empty ProjectSupplier slots for each supplier slot
      const createdSlots: { category: string; budget: number | null }[] = [];

      if (data.supplierSlots && data.supplierSlots.length > 0) {
        for (const slot of data.supplierSlots) {
          // Find existing supplier of this category, or we'll leave it as empty slot
          // For now, we don't create suppliers - just track what's needed
          
          // Look up the category
          const category = await prisma.supplierCategory.findUnique({
            where: { slug: slot.category },
          });

          if (category) {
            createdSlots.push({
              category: slot.category,
              budget: slot.budget || null,
            });
          }
        }
      }

      return c.json({
        success: true,
        project: {
          id: project.id,
          name: project.name,
          type: project.type,
          date: project.date,
          venue: project.venue,
          guestCount: project.guestCount,
          budget: project.budget,
        },
        slots: createdSlots,
        message: `Project "${project.name}" created with ${createdSlots.length} supplier categories identified.`,
      }, 201);
    } catch (error) {
      console.error("Error creating project from import:", error);
      return c.json({ error: "Failed to create project" }, 500);
    }
  })

  // GET /api/import/categories - Get available categories for mapping
  .get("/categories", async (c) => {
    const auth = getAuth(c);
    if (!auth?.userId) return c.json({ error: "Unauthorized" }, 401);

    try {
      const categories = await prisma.supplierCategory.findMany({
        where: { isSystem: true },
        select: {
          slug: true,
          name: true,
          description: true,
        },
        orderBy: { name: "asc" },
      });

      return c.json({ categories });
    } catch (error) {
      console.error("Error fetching categories:", error);
      return c.json({ error: "Failed to fetch categories" }, 500);
    }
  });

export default app;

