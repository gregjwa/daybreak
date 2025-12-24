import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Supplier status pipeline
const SUPPLIER_STATUSES = [
  {
    slug: "needed",
    name: "Needed",
    description: "Vendor is needed for this category but not yet contacted",
    order: 1,
    color: "#6B7280", // gray-500
    inboundSignals: [],
    outboundSignals: [],
    threadPatterns: [],
  },
  {
    slug: "shortlisted",
    name: "Shortlisted",
    description: "Vendor has been identified as a potential option",
    order: 2,
    color: "#8B5CF6", // violet-500
    inboundSignals: [],
    outboundSignals: [],
    threadPatterns: [],
  },
  {
    slug: "rfq-sent",
    name: "RFQ Sent",
    description: "Request for quote has been sent to the vendor",
    order: 3,
    color: "#3B82F6", // blue-500
    inboundSignals: [],
    outboundSignals: ["quote", "pricing", "proposal", "rates", "availability", "packages", "services", "what do you charge"],
    threadPatterns: ["first outbound asking about services or pricing"],
  },
  {
    slug: "quote-received",
    name: "Quote Received",
    description: "Vendor has provided a quote or pricing information",
    order: 4,
    color: "#06B6D4", // cyan-500
    inboundSignals: ["quote", "pricing", "$", "per hour", "package", "rate", "cost", "price", "total", "estimate", "proposal attached", "here's what we charge"],
    outboundSignals: [],
    threadPatterns: ["first inbound with pricing after outbound inquiry"],
  },
  {
    slug: "negotiating",
    name: "Negotiating",
    description: "Actively negotiating terms, pricing, or details",
    order: 5,
    color: "#F59E0B", // amber-500
    inboundSignals: ["counter", "discount", "best price", "we can do", "final offer", "adjusted"],
    outboundSignals: ["budget is", "can you do", "lower", "negotiate", "flexibility", "discount", "better rate"],
    threadPatterns: ["back-and-forth about pricing or terms"],
  },
  {
    slug: "confirmed",
    name: "Confirmed",
    description: "Vendor is confirmed for the event",
    order: 6,
    color: "#10B981", // emerald-500
    inboundSignals: ["confirm", "booked", "reserved", "looking forward", "see you on", "you're all set"],
    outboundSignals: ["confirm", "proceed", "go ahead", "let's do it", "book", "reserve", "we'd like to move forward"],
    threadPatterns: ["agreement reached on terms"],
  },
  {
    slug: "contracted",
    name: "Contracted",
    description: "Contract has been signed",
    order: 7,
    color: "#059669", // emerald-600
    inboundSignals: ["contract", "agreement attached", "please sign", "docusign", "signed copy", "countersigned"],
    outboundSignals: ["signed", "contract attached", "returning the signed", "executed"],
    threadPatterns: ["contract document exchanged"],
  },
  {
    slug: "deposit-paid",
    name: "Deposit Paid",
    description: "Initial deposit or retainer has been paid",
    order: 8,
    color: "#7C3AED", // violet-600
    inboundSignals: ["deposit received", "payment received", "thank you for your payment", "retainer received"],
    outboundSignals: ["deposit sent", "paid deposit", "payment sent", "transferred", "wired"],
    threadPatterns: ["payment confirmation"],
  },
  {
    slug: "fulfilled",
    name: "Fulfilled",
    description: "Vendor has delivered their services",
    order: 9,
    color: "#14B8A6", // teal-500
    inboundSignals: ["delivered", "completed", "thank you for having us", "hope you enjoyed", "great event"],
    outboundSignals: ["thank you", "great job", "wonderful service", "appreciate"],
    threadPatterns: ["post-event communication"],
  },
  {
    slug: "paid-in-full",
    name: "Paid in Full",
    description: "Final payment has been made",
    order: 10,
    color: "#22C55E", // green-500
    inboundSignals: ["final payment received", "paid in full", "balance cleared", "all settled"],
    outboundSignals: ["final payment", "remaining balance", "full payment sent"],
    threadPatterns: ["final payment confirmation"],
  },
];

// Supplier category taxonomy
const SYSTEM_CATEGORIES = [
  // Core Event Services
  { name: "Venue", slug: "venue", description: "Hotels, ballrooms, estates, restaurants, rooftops, barns" },
  { name: "Catering", slug: "catering", description: "Food service, meal preparation, buffets, plated dinners" },
  { name: "Bar Service", slug: "bar-service", description: "Bartending, mobile bars, beverage service" },
  { name: "Photography", slug: "photography", description: "Event photographers, portrait, candid" },
  { name: "Videography", slug: "videography", description: "Video production, cinematography, live streaming" },
  { name: "DJ", slug: "dj", description: "Disc jockeys, music mixing, MC services" },
  { name: "Live Music", slug: "live-music", description: "Bands, solo musicians, orchestras, ensembles" },
  { name: "Officiant", slug: "officiant", description: "Wedding officiants, ceremony leaders" },
  { name: "Planner", slug: "planner", description: "Event planners, coordinators, day-of coordinators" },

  // Decor and Design
  { name: "Florist", slug: "florist", description: "Floral design, bouquets, arrangements, installations" },
  { name: "Decor", slug: "decor", description: "Event styling, props, furniture, draping" },
  { name: "Lighting", slug: "lighting", description: "Event lighting, uplighting, string lights, production" },
  { name: "Rentals", slug: "rentals", description: "Tables, chairs, linens, tableware, tents" },
  { name: "Signage", slug: "signage", description: "Welcome signs, seating charts, custom graphics" },
  { name: "Stationery", slug: "stationery", description: "Invitations, save-the-dates, menus, programs" },

  // Beauty and Fashion
  { name: "Hair Stylist", slug: "hair-stylist", description: "Bridal hair, event styling, on-site services" },
  { name: "Makeup Artist", slug: "makeup-artist", description: "Bridal makeup, special effects, on-site services" },
  { name: "Dress/Attire", slug: "dress-attire", description: "Bridal shops, tuxedo rentals, alterations" },
  { name: "Jewelry", slug: "jewelry", description: "Engagement rings, wedding bands, accessories" },

  // Entertainment and Experiences
  { name: "Photo Booth", slug: "photo-booth", description: "Photo booths, 360 booths, selfie stations" },
  { name: "Entertainment", slug: "entertainment", description: "Performers, dancers, magicians, fireworks" },
  { name: "Games", slug: "games", description: "Lawn games, casino tables, interactive experiences" },
  { name: "Transportation", slug: "transportation", description: "Limos, shuttles, vintage cars, party buses" },

  // Food and Beverage Specialty
  { name: "Bakery", slug: "bakery", description: "Wedding cakes, desserts, pastries" },
  { name: "Ice Cream", slug: "ice-cream", description: "Ice cream trucks, gelato, frozen desserts" },
  { name: "Coffee", slug: "coffee", description: "Mobile coffee bars, espresso service" },
  { name: "Food Truck", slug: "food-truck", description: "Mobile food vendors, specialty cuisines" },

  // Technical and Production
  { name: "AV Production", slug: "av-production", description: "Sound systems, screens, projectors, staging" },
  { name: "Live Streaming", slug: "live-streaming", description: "Virtual event production, hybrid events" },
  { name: "Security", slug: "security", description: "Event security, crowd management" },
  { name: "Valet", slug: "valet", description: "Parking services, valet attendants" },

  // Specialty Services
  { name: "Childcare", slug: "childcare", description: "On-site babysitting, kids entertainment" },
  { name: "Pet Services", slug: "pet-services", description: "Pet sitting, pet-friendly coordinators" },
  { name: "Favors", slug: "favors", description: "Guest gifts, welcome bags, custom items" },
  { name: "Calligraphy", slug: "calligraphy", description: "Hand lettering, envelope addressing" },
  { name: "Travel", slug: "travel", description: "Honeymoon planning, group travel, hotels" },
  { name: "Insurance", slug: "insurance", description: "Event insurance, liability coverage" },

  // Corporate and Conference
  { name: "Speakers", slug: "speakers", description: "Keynote speakers, panelists, MCs" },
  { name: "Team Building", slug: "team-building", description: "Activities, workshops, experiences" },
  { name: "Exhibitor", slug: "exhibitor", description: "Trade show booths, displays" },
  { name: "Registration", slug: "registration", description: "Check-in systems, badge printing" },
  { name: "Swag", slug: "swag", description: "Branded merchandise, promotional items" },
];

async function main() {
  // Seed supplier statuses
  console.log("Seeding supplier statuses...");
  
  for (const status of SUPPLIER_STATUSES) {
    await prisma.supplierStatus.upsert({
      where: { slug: status.slug },
      update: {
        name: status.name,
        description: status.description,
        order: status.order,
        color: status.color,
        inboundSignals: status.inboundSignals,
        outboundSignals: status.outboundSignals,
        threadPatterns: status.threadPatterns,
        isSystem: true,
      },
      create: {
        slug: status.slug,
        name: status.name,
        description: status.description,
        order: status.order,
        color: status.color,
        inboundSignals: status.inboundSignals,
        outboundSignals: status.outboundSignals,
        threadPatterns: status.threadPatterns,
        isSystem: true,
      },
    });
    console.log(`  ✓ ${status.name} (order: ${status.order})`);
  }
  
  console.log(`\nSeeded ${SUPPLIER_STATUSES.length} supplier statuses.`);

  // Seed supplier categories
  console.log("\nSeeding system categories...");

  for (const category of SYSTEM_CATEGORIES) {
    await prisma.supplierCategory.upsert({
      where: { slug: category.slug },
      update: {
        name: category.name,
        description: category.description,
        isSystem: true,
      },
      create: {
        name: category.name,
        slug: category.slug,
        description: category.description,
        isSystem: true,
        userId: null,
      },
    });
    console.log(`  ✓ ${category.name}`);
  }

  console.log(`\nSeeded ${SYSTEM_CATEGORIES.length} system categories.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

