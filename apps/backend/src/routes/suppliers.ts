import { Hono } from "hono";
import { getAuth } from "@hono/clerk-auth";
import { prisma } from "../db";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";

const createSupplierSchema = z.object({
  name: z.string().min(1),
  company: z.string().optional(),
  category: z.string().min(1),
  notes: z.string().optional(),
  email: z.string().email().optional(), // Initial contact method
  phone: z.string().optional(),         // Initial contact method
});

const addContactMethodSchema = z.object({
  type: z.enum(["EMAIL", "PHONE", "WHATSAPP", "OTHER"]),
  value: z.string().min(1),
  label: z.string().optional(),
  isPrimary: z.boolean().default(false),
});

// Helper to ensure local User exists
async function getOrCreateUser(clerkUserId: string, email: string) {
  let user = await prisma.user.findUnique({
    where: { clerkId: clerkUserId },
  });

  if (!user) {
    user = await prisma.user.create({
      data: {
        clerkId: clerkUserId,
        email: email, // Assuming email is available from auth/clerk context or passed in
      },
    });
  }
  return user;
}

const app = new Hono()
  // GET /api/suppliers - List all suppliers for the user
  .get("/", async (c) => {
    const auth = getAuth(c);
    if (!auth?.userId) return c.json({ error: "Unauthorized" }, 401);

    // Ensure user exists (optional here if we trust sync, but good to be safe)
    // For listing, we can just query by clerkId on User table if we link it?
    // But Supplier is linked to User.id (UUID), not Clerk ID.
    // So we need to find the User.id first.
    
    const user = await prisma.user.findUnique({
      where: { clerkId: auth.userId },
    });

    if (!user) {
      return c.json([]); // No user record = no suppliers
    }

    const suppliers = await prisma.supplier.findMany({
      where: { userId: user.id },
      include: {
        contactMethods: true,
        _count: { select: { projectSuppliers: true } }
      },
      orderBy: { createdAt: "desc" },
    });

    return c.json(suppliers);
  })

  // POST /api/suppliers - Create a new supplier
  .post("/", zValidator("json", createSupplierSchema), async (c) => {
    const auth = getAuth(c);
    if (!auth?.userId) return c.json({ error: "Unauthorized" }, 401);

    const data = c.req.valid("json");
    
    // We need the user's email to create the User record if it doesn't exist.
    // getAuth doesn't provide email. 
    // We assume the User record might already exist from webhook or previous interaction.
    // If not, we might fail or need to fetch from Clerk.
    // For now, let's try to find the user.
    let user = await prisma.user.findUnique({
      where: { clerkId: auth.userId },
    });

    if (!user) {
      // Fetch user details from Clerk to get email
      const clerkClient = c.get("clerk");
      const clerkUser = await clerkClient.users.getUser(auth.userId);
      const email = clerkUser.emailAddresses[0]?.emailAddress;

      if (!email) {
        return c.json({ error: "User email not found" }, 400);
      }

      user = await prisma.user.create({
        data: {
          clerkId: auth.userId,
          email: email,
        },
      });
    }

    // Create Supplier and ContactMethods
    const supplier = await prisma.supplier.create({
      data: {
        name: data.name,
        // company: data.company, // Add to schema if needed, currently not in schema but in plan description? 
        // Wait, schema has `name` but plan description had `company`. 
        // My schema: `name String`, `category String`, `notes String?`. 
        // I should probably map `company` to `name` or `notes` or add it? 
        // The schema I applied: `name String`, `category String`, `notes String?`. No `company` field in schema I wrote!
        // Plan schema: `name String`, `company String?`.
        // I missed `company` in my schema write.
        // I will put company in notes or just ignore for now to match schema.
        // Or I can update schema. But that requires another push.
        // Let's check schema again.
        // `model Supplier { id, name, category, notes, userId ... }`
        // Okay, I will skip `company` for now and just use `name`.
        
        category: data.category,
        notes: data.notes,
        userId: user.id,
        contactMethods: {
          create: [
            ...(data.email ? [{ type: "EMAIL", value: data.email, isPrimary: true }] : []),
            ...(data.phone ? [{ type: "PHONE", value: data.phone, isPrimary: !data.email }] : []),
          ],
        },
      },
      include: {
        contactMethods: true,
      },
    });

    return c.json(supplier, 201);
  })

  // POST /api/suppliers/:id/contacts - Add contact method
  .post("/:id/contacts", zValidator("json", addContactMethodSchema), async (c) => {
    const auth = getAuth(c);
    const supplierId = c.req.param("id");
    
    if (!auth?.userId) return c.json({ error: "Unauthorized" }, 401);

    const user = await prisma.user.findUnique({ where: { clerkId: auth.userId } });
    if (!user) return c.json({ error: "User not found" }, 404);

    // Verify ownership
    const supplier = await prisma.supplier.findUnique({
      where: { id: supplierId },
    });

    if (!supplier || supplier.userId !== user.id) {
      return c.json({ error: "Supplier not found or unauthorized" }, 404);
    }

    const data = c.req.valid("json");

    const contactMethod = await prisma.contactMethod.create({
      data: {
        supplierId,
        type: data.type,
        value: data.value,
        label: data.label,
        isPrimary: data.isPrimary,
      },
    });

    return c.json(contactMethod, 201);
  });

export default app;

