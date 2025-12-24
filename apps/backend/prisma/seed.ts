import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

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
  console.log("Seeding system categories...");

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

