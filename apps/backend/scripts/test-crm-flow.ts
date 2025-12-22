import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🚀 Starting CRM Flow Test...");

  // 1. Create (or find) a User
  const clerkId = "test_user_" + Date.now();
  const email = `test+${Date.now()}@example.com`;
  
  console.log(`\n1. Creating User (${email})...`);
  const user = await prisma.user.create({
    data: {
      clerkId,
      email,
      name: "Test Planner",
    },
  });
  console.log("✅ User created:", user.id);

  // 2. Create a Project
  console.log("\n2. Creating Project 'Summer Wedding'...");
  const project = await prisma.project.create({
    data: {
      userId: user.id,
      name: "Summer Wedding 2024",
      type: "Wedding",
      budget: 50000,
    },
  });
  console.log("✅ Project created:", project.id);

  // 3. Create a Supplier (Florist) with Contact Method
  console.log("\n3. Creating Supplier 'Fancy Flowers'...");
  const supplier = await prisma.supplier.create({
    data: {
      userId: user.id,
      name: "Fancy Flowers Inc.",
      category: "Florist",
      contactMethods: {
        create: [
          { type: "EMAIL", value: "flowers@example.com", isPrimary: true },
          { type: "PHONE", value: "555-0199", isPrimary: false },
        ],
      },
    },
    include: { contactMethods: true },
  });
  console.log("✅ Supplier created with contacts:", supplier.contactMethods.map(c => `${c.type}: ${c.value}`).join(", "));

  // 4. Link Supplier to Project
  console.log("\n4. Linking Supplier to Project...");
  const projectSupplier = await prisma.projectSupplier.create({
    data: {
      projectId: project.id,
      supplierId: supplier.id,
      role: "Main Florist",
      status: "CONTACTED",
      quoteAmount: 1500.00,
    },
  });
  console.log("✅ Supplier linked to Project. Status:", projectSupplier.status);

  // 5. Simulate Incoming Email (Message Creation)
  console.log("\n5. Simulating Incoming Email from 'flowers@example.com'...");
  // Logic: Find contact method -> Create message
  const incomingEmail = "flowers@example.com";
  
  const contactMethod = await prisma.contactMethod.findFirst({
    where: { 
        value: incomingEmail,
        supplier: { userId: user.id }
    },
    include: { supplier: true }
  });

  if (contactMethod) {
      const message = await prisma.message.create({
          data: {
              content: "Yes, we are available for your date! Attached is the quote.",
              direction: "INBOUND",
              contactMethodId: contactMethod.id,
              supplierId: contactMethod.supplierId,
              // We can manually link project if we knew it
              projectId: project.id 
          }
      });
      console.log("✅ Message logged successfully!");
      console.log("   From:", contactMethod.supplier.name);
      console.log("   Content:", message.content);
  } else {
      console.error("❌ Could not match email to supplier!");
  }

  // 6. List Messages for Project
  console.log("\n6. Listing Project Messages...");
  const messages = await prisma.message.findMany({
      where: { projectId: project.id },
      include: { supplier: true }
  });
  
  console.table(messages.map(m => ({
      id: m.id,
      from: m.supplier?.name,
      content: m.content,
      direction: m.direction
  })));

  // Cleanup (Optional)
  console.log("\n🧹 Cleaning up test data...");
  await prisma.user.delete({ where: { id: user.id } }); // Cascades delete to projects, suppliers, messages
  console.log("✅ Test data deleted.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

