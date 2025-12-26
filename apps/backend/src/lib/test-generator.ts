/**
 * Test Generator
 * 
 * Generates test personas and test emails for status detection testing.
 * Uses GPT to create realistic, diverse email content.
 */

import { prisma } from "../db";

// --- Persona Definitions ---

interface PersonaTemplate {
  name: string;
  companyName: string;
  contactName: string;
  email: string;
  category: string;
  communicationStyle: "formal" | "casual" | "terse" | "verbose";
  reliability: "reliable" | "flaky" | "aggressive";
  pricePoint: "budget" | "mid-range" | "premium";
}

// 50 diverse vendor personas across event industry categories
const PERSONA_TEMPLATES: PersonaTemplate[] = [
  // Florists (4)
  { name: "Bloom & Petal", companyName: "Bloom & Petal Designs LLC", contactName: "Maria Rodriguez", email: "maria@bloomandpetal.com", category: "florist", communicationStyle: "formal", reliability: "reliable", pricePoint: "premium" },
  { name: "Wildflower Studio", companyName: "Wildflower Studio", contactName: "Jake Thompson", email: "jake@wildflowerstudio.co", category: "florist", communicationStyle: "casual", reliability: "reliable", pricePoint: "mid-range" },
  { name: "Budget Blooms", companyName: "Budget Blooms Market", contactName: "Lisa Chen", email: "orders@budgetblooms.com", category: "florist", communicationStyle: "terse", reliability: "flaky", pricePoint: "budget" },
  { name: "Garden Gate Florals", companyName: "Garden Gate Florals Inc", contactName: "Robert Williams", email: "robert@gardengaeflorals.com", category: "florist", communicationStyle: "verbose", reliability: "aggressive", pricePoint: "premium" },

  // Catering (5)
  { name: "Savory Affairs", companyName: "Savory Affairs Catering", contactName: "Chef Antoine Dubois", email: "antoine@savoryaffairs.com", category: "catering", communicationStyle: "formal", reliability: "reliable", pricePoint: "premium" },
  { name: "The Food Truck Collective", companyName: "Food Truck Collective LLC", contactName: "Danny Park", email: "danny@ftcollective.com", category: "catering", communicationStyle: "casual", reliability: "reliable", pricePoint: "mid-range" },
  { name: "Quick Bites Catering", companyName: "Quick Bites", contactName: "Sarah Miller", email: "info@quickbites.net", category: "catering", communicationStyle: "terse", reliability: "flaky", pricePoint: "budget" },
  { name: "Elegance Events Catering", companyName: "Elegance Events Catering Co", contactName: "Victoria Sterling", email: "victoria@eleganceevents.com", category: "catering", communicationStyle: "formal", reliability: "reliable", pricePoint: "premium" },
  { name: "Taco Fiesta", companyName: "Taco Fiesta Mobile", contactName: "Miguel Santos", email: "miguel@tacofiesta.co", category: "catering", communicationStyle: "casual", reliability: "aggressive", pricePoint: "budget" },

  // Photography (4)
  { name: "Capture Moments", companyName: "Capture Moments Photography", contactName: "Emma Watson", email: "emma@capturemoments.photo", category: "photography", communicationStyle: "formal", reliability: "reliable", pricePoint: "premium" },
  { name: "Snapshots by Sam", companyName: "Sam's Photography Services", contactName: "Sam Johnson", email: "sam@snapshotsbysam.com", category: "photography", communicationStyle: "casual", reliability: "reliable", pricePoint: "mid-range" },
  { name: "Budget Photography Co", companyName: "Budget Photo", contactName: "Kevin Lee", email: "kevin@budgetphoto.co", category: "photography", communicationStyle: "terse", reliability: "flaky", pricePoint: "budget" },
  { name: "Artistic Lens Studio", companyName: "Artistic Lens Studio LLC", contactName: "Isabella Martinez", email: "isabella@artisticlens.studio", category: "photography", communicationStyle: "verbose", reliability: "reliable", pricePoint: "premium" },

  // Videography (3)
  { name: "Cinematic Dreams", companyName: "Cinematic Dreams Productions", contactName: "Alex Turner", email: "alex@cinematicdreams.com", category: "videography", communicationStyle: "formal", reliability: "reliable", pricePoint: "premium" },
  { name: "Video Vibes", companyName: "Video Vibes Media", contactName: "Jordan Blake", email: "jordan@videovibes.co", category: "videography", communicationStyle: "casual", reliability: "reliable", pricePoint: "mid-range" },
  { name: "Affordable Films", companyName: "Affordable Films LLC", contactName: "Chris Davis", email: "chris@affordablefilms.net", category: "videography", communicationStyle: "terse", reliability: "aggressive", pricePoint: "budget" },

  // DJs (4)
  { name: "DJ Electra", companyName: "Electra Entertainment", contactName: "DJ Electra (Elena)", email: "electra@djelectra.com", category: "dj", communicationStyle: "casual", reliability: "reliable", pricePoint: "premium" },
  { name: "Party Starter DJs", companyName: "Party Starter Entertainment", contactName: "Mike 'DJ Mikey' Thompson", email: "mikey@partystarterdjs.com", category: "dj", communicationStyle: "casual", reliability: "flaky", pricePoint: "mid-range" },
  { name: "Classic Tunes DJ", companyName: "Classic Tunes Entertainment", contactName: "William Harris", email: "will@classictunesdj.com", category: "dj", communicationStyle: "formal", reliability: "reliable", pricePoint: "mid-range" },
  { name: "Budget Beats", companyName: "Budget Beats DJ Services", contactName: "Tony Rodriguez", email: "tony@budgetbeats.co", category: "dj", communicationStyle: "terse", reliability: "aggressive", pricePoint: "budget" },

  // Venues (4)
  { name: "The Grand Ballroom", companyName: "Grand Ballroom Events LLC", contactName: "Margaret Thompson", email: "margaret@grandballroom.com", category: "venue", communicationStyle: "formal", reliability: "reliable", pricePoint: "premium" },
  { name: "Rustic Barn Venue", companyName: "The Old Mill Barn", contactName: "John & Mary Cooper", email: "events@oldmillbarn.com", category: "venue", communicationStyle: "casual", reliability: "reliable", pricePoint: "mid-range" },
  { name: "City Rooftop Events", companyName: "Skyline Rooftop Venue", contactName: "Amanda Chen", email: "amanda@skylinerooftop.com", category: "venue", communicationStyle: "formal", reliability: "reliable", pricePoint: "premium" },
  { name: "Community Center Hall", companyName: "Oakville Community Center", contactName: "Patricia Moore", email: "rentals@oakvillecc.org", category: "venue", communicationStyle: "terse", reliability: "reliable", pricePoint: "budget" },

  // Live Music (3)
  { name: "The Moonlight Band", companyName: "Moonlight Entertainment", contactName: "David 'Moonlight' Jones", email: "david@moonlightband.com", category: "live-music", communicationStyle: "casual", reliability: "reliable", pricePoint: "premium" },
  { name: "Jazz Quartet Plus", companyName: "Jazz Quartet Plus", contactName: "Marcus Williams", email: "marcus@jazzquartetplus.com", category: "live-music", communicationStyle: "formal", reliability: "reliable", pricePoint: "mid-range" },
  { name: "Solo Acoustic", companyName: "Sarah's Acoustic Sessions", contactName: "Sarah Mitchell", email: "sarah@soloacoustic.co", category: "live-music", communicationStyle: "casual", reliability: "flaky", pricePoint: "budget" },

  // Lighting/AV (3)
  { name: "Lumina Productions", companyName: "Lumina Productions Inc", contactName: "Tech Director James", email: "james@luminaprod.com", category: "lighting", communicationStyle: "formal", reliability: "reliable", pricePoint: "premium" },
  { name: "Event Tech Solutions", companyName: "Event Tech Solutions LLC", contactName: "Ryan O'Connor", email: "ryan@eventtechsolutions.com", category: "av-production", communicationStyle: "casual", reliability: "reliable", pricePoint: "mid-range" },
  { name: "Basic AV Rental", companyName: "Basic AV", contactName: "Steve Wilson", email: "steve@basicav.net", category: "av-production", communicationStyle: "terse", reliability: "flaky", pricePoint: "budget" },

  // Rentals (3)
  { name: "Premier Party Rentals", companyName: "Premier Party Rentals Co", contactName: "Jennifer Adams", email: "jennifer@premierparty.com", category: "rentals", communicationStyle: "formal", reliability: "reliable", pricePoint: "premium" },
  { name: "Table & Chair Depot", companyName: "T&C Depot", contactName: "Bob Martinez", email: "bob@tcardepot.com", category: "rentals", communicationStyle: "terse", reliability: "reliable", pricePoint: "budget" },
  { name: "Elegant Event Rentals", companyName: "Elegant Event Rentals", contactName: "Christine Taylor", email: "christine@elegantrentals.com", category: "rentals", communicationStyle: "formal", reliability: "reliable", pricePoint: "mid-range" },

  // Bakery/Cake (3)
  { name: "Sweet Creations Bakery", companyName: "Sweet Creations", contactName: "Chef Pauline Baker", email: "pauline@sweetcreations.com", category: "bakery", communicationStyle: "formal", reliability: "reliable", pricePoint: "premium" },
  { name: "Cupcake Corner", companyName: "Cupcake Corner LLC", contactName: "Amy Roberts", email: "amy@cupcakecorner.co", category: "bakery", communicationStyle: "casual", reliability: "reliable", pricePoint: "mid-range" },
  { name: "Grocery Store Bakery", companyName: "FreshMart Bakery Dept", contactName: "Bakery Manager", email: "bakery@freshmart.com", category: "bakery", communicationStyle: "terse", reliability: "flaky", pricePoint: "budget" },

  // Decor (3)
  { name: "Enchanted Designs", companyName: "Enchanted Event Designs", contactName: "Nicole Foster", email: "nicole@enchanteddesigns.com", category: "decor", communicationStyle: "verbose", reliability: "reliable", pricePoint: "premium" },
  { name: "DIY Decor Depot", companyName: "DIY Decor Depot", contactName: "Karen White", email: "karen@diydecordepot.com", category: "decor", communicationStyle: "casual", reliability: "reliable", pricePoint: "budget" },
  { name: "Modern Event Styling", companyName: "Modern Event Styling Co", contactName: "Sophia Lee", email: "sophia@moderneventstyling.com", category: "decor", communicationStyle: "formal", reliability: "reliable", pricePoint: "mid-range" },

  // Transportation (3)
  { name: "Luxury Limo Service", companyName: "Prestige Limousines", contactName: "Charles Wellington", email: "charles@prestigelimo.com", category: "transportation", communicationStyle: "formal", reliability: "reliable", pricePoint: "premium" },
  { name: "Party Bus Express", companyName: "Party Bus Express LLC", contactName: "Derek Stone", email: "derek@partybusexpress.com", category: "transportation", communicationStyle: "casual", reliability: "reliable", pricePoint: "mid-range" },
  { name: "Vintage Car Rentals", companyName: "Classic Wheels Rental", contactName: "George Miller", email: "george@classicwheels.net", category: "transportation", communicationStyle: "casual", reliability: "flaky", pricePoint: "premium" },

  // Hair/Makeup (3)
  { name: "Glamour Studio", companyName: "Glamour Beauty Studio", contactName: "Tiffany Rose", email: "tiffany@glamourstudio.com", category: "hair-stylist", communicationStyle: "casual", reliability: "reliable", pricePoint: "premium" },
  { name: "Bridal Beauty Team", companyName: "Bridal Beauty Collective", contactName: "Amanda Grace", email: "amanda@bridabeautyteam.com", category: "makeup-artist", communicationStyle: "formal", reliability: "reliable", pricePoint: "mid-range" },
  { name: "Quick Glam", companyName: "Quick Glam Mobile", contactName: "Kelly James", email: "kelly@quickglam.co", category: "makeup-artist", communicationStyle: "terse", reliability: "flaky", pricePoint: "budget" },

  // Entertainment (2)
  { name: "Amazing Magic Shows", companyName: "Amazing Marcus Magic", contactName: "Marcus the Magician", email: "marcus@amazingmagic.com", category: "entertainment", communicationStyle: "verbose", reliability: "reliable", pricePoint: "mid-range" },
  { name: "Photo Booth Fun", companyName: "Photo Booth Fun LLC", contactName: "Peter Chang", email: "peter@photoboothfun.com", category: "photo-booth", communicationStyle: "casual", reliability: "reliable", pricePoint: "mid-range" },

  // Officiant (2)
  { name: "Rev. Thomas", companyName: "Sacred Ceremonies", contactName: "Rev. Thomas Anderson", email: "rev.thomas@sacredceremonies.org", category: "officiant", communicationStyle: "formal", reliability: "reliable", pricePoint: "mid-range" },
  { name: "Modern Officiant", companyName: "Modern Wedding Officiants", contactName: "Rachel Green", email: "rachel@modernofficiants.com", category: "officiant", communicationStyle: "casual", reliability: "reliable", pricePoint: "mid-range" },

  // Planner (2)
  { name: "Elite Event Planners", companyName: "Elite Events International", contactName: "Diana Sterling", email: "diana@eliteevents.com", category: "planner", communicationStyle: "formal", reliability: "reliable", pricePoint: "premium" },
  { name: "Day-Of Coordinator", companyName: "Stress-Free Day-Of", contactName: "Michelle Park", email: "michelle@stressfreeday.com", category: "planner", communicationStyle: "casual", reliability: "reliable", pricePoint: "mid-range" },

  // Security (1)
  { name: "Event Security Pro", companyName: "Pro Event Security Services", contactName: "Captain Mike Johnson", email: "captain.mike@eventsecuritypro.com", category: "security", communicationStyle: "formal", reliability: "reliable", pricePoint: "mid-range" },

  // Stationery (1)
  { name: "Elegant Invites", companyName: "Elegant Invitations Co", contactName: "Laura Adams", email: "laura@elegantinvites.com", category: "stationery", communicationStyle: "formal", reliability: "reliable", pricePoint: "premium" },
];

/**
 * Generate all 50 personas in the database
 */
export async function generatePersonas(): Promise<{ created: number; existing: number }> {
  let created = 0;
  let existing = 0;

  for (const template of PERSONA_TEMPLATES) {
    const existingPersona = await prisma.testPersona.findFirst({
      where: { email: template.email },
    });

    if (existingPersona) {
      existing++;
      continue;
    }

    await prisma.testPersona.create({
      data: {
        name: template.name,
        companyName: template.companyName,
        contactName: template.contactName,
        email: template.email,
        category: template.category,
        communicationStyle: template.communicationStyle,
        reliability: template.reliability,
        pricePoint: template.pricePoint,
      },
    });
    created++;
  }

  console.log(`[test-generator] Personas: ${created} created, ${existing} already exist`);
  return { created, existing };
}

// --- Email Generation ---

interface TestScenario {
  status: string;
  direction: "INBOUND" | "OUTBOUND";
  scenario: "normal" | "tricky" | "followup" | "edge";
  difficulty: number;
  threadContext?: { direction: string; subject: string; body: string }[];
  prompt: string;
  tags: string[];
  previousStatus?: string; // Status before this email arrived (for progression context)
}

// Scenarios for each status and direction
function getScenarios(): TestScenario[] {
  const scenarios: TestScenario[] = [];

  // --- INBOUND SCENARIOS (From Supplier) ---

  // Confirmed - Inbound (vendor explicitly agrees to booking after quote/negotiation)
  // These come AFTER quote-received or negotiating - the booking decision is made
  for (let i = 0; i < 30; i++) scenarios.push({ status: "confirmed", direction: "INBOUND", scenario: "normal", difficulty: 1, previousStatus: "negotiating", prompt: "Write an email where the vendor confirms the booking is set. The planner has already accepted the quote - this is the vendor acknowledging they're booked. Example: 'Great, you're all set for March 15th!' or 'Looking forward to your event!'", tags: ["confirmation"] });
  for (let i = 0; i < 10; i++) scenarios.push({ status: "confirmed", direction: "INBOUND", scenario: "tricky", difficulty: 2, previousStatus: "quote-received", prompt: "Write an email where the vendor agrees to proceed using casual language after the planner accepted. Example: 'Awesome, see you there!' or 'Can't wait!'", tags: ["confirmation", "indirect"] });
  for (let i = 0; i < 6; i++) scenarios.push({ status: "confirmed", direction: "INBOUND", scenario: "followup", difficulty: 3, previousStatus: "negotiating", threadContext: [{ direction: "OUTBOUND", subject: "Let's proceed!", body: "We'd like to book you for March 15th!" }], prompt: "Write a short 1-2 sentence reply accepting the booking. Example: 'Great, you're booked!' or 'Perfect, see you then!'", tags: ["confirmation", "followup"] });
  for (let i = 0; i < 5; i++) scenarios.push({ status: "confirmed", direction: "INBOUND", scenario: "edge", difficulty: 4, previousStatus: "negotiating", prompt: "Write a confirmation where the vendor says they'll send the contract soon - they're committed but paperwork is pending.", tags: ["confirmation", "edge", "contract-mention"] });

  // Quote-received - Inbound (vendor sends quote after inquiry)
  for (let i = 0; i < 25; i++) scenarios.push({ status: "quote-received", direction: "INBOUND", scenario: "normal", difficulty: 1, previousStatus: "rfq-sent", prompt: "Write an email with actual pricing. Include specific dollar amounts like '$500' or '$1,200'.", tags: ["pricing", "quote"] });
  for (let i = 0; i < 8; i++) scenarios.push({ status: "quote-received", direction: "INBOUND", scenario: "tricky", difficulty: 2, previousStatus: "rfq-sent", prompt: "Write an email with pricing information using indirect language. Use phrases like 'investment' instead of 'cost'.", tags: ["pricing", "indirect"] });
  for (let i = 0; i < 4; i++) scenarios.push({ status: "quote-received", direction: "INBOUND", scenario: "followup", difficulty: 3, previousStatus: "rfq-sent", threadContext: [{ direction: "OUTBOUND", subject: "Quote request", body: "Can you send me your pricing for a 100-person event?" }], prompt: "Write a reply with the requested pricing information.", tags: ["pricing", "followup"] });
  for (let i = 0; i < 4; i++) scenarios.push({ status: "quote-received", direction: "INBOUND", scenario: "edge", difficulty: 4, previousStatus: "rfq-sent", prompt: "Write an email with pricing buried in the middle of a long message about other topics.", tags: ["pricing", "edge"] });

  // Cancelled - Inbound (vendor cancels after being confirmed)
  for (let i = 0; i < 20; i++) scenarios.push({ status: "cancelled", direction: "INBOUND", scenario: "normal", difficulty: 1, previousStatus: "confirmed", prompt: "Write an email where the vendor cancels or backs out of the booking. Clear cancellation.", tags: ["cancellation"] });
  for (let i = 0; i < 10; i++) scenarios.push({ status: "cancelled", direction: "INBOUND", scenario: "tricky", difficulty: 2, previousStatus: "confirmed", prompt: "Write a cancellation email using apologetic, indirect language without saying 'cancel'.", tags: ["cancellation", "indirect"] });
  for (let i = 0; i < 5; i++) scenarios.push({ status: "cancelled", direction: "INBOUND", scenario: "followup", difficulty: 3, previousStatus: "confirmed", threadContext: [{ direction: "INBOUND", subject: "Confirmed for March 15th", body: "Looking forward to your event!" }], prompt: "Write a follow-up where they now have to cancel. Make it apologetic.", tags: ["cancellation", "reversal"] });
  for (let i = 0; i < 6; i++) scenarios.push({ status: "cancelled", direction: "INBOUND", scenario: "edge", difficulty: 4, previousStatus: "contracted", prompt: "Write a cancellation email that uses the word 'fulfill' in a negative way (e.g., 'cannot fulfill'). This should be clearly a cancellation.", tags: ["cancellation", "edge", "fulfill-word"] });

  // Negotiating - Inbound (vendor responds to negotiation after quote)
  for (let i = 0; i < 15; i++) scenarios.push({ status: "negotiating", direction: "INBOUND", scenario: "normal", difficulty: 1, previousStatus: "quote-received", prompt: "Write an email where the vendor responds to a negotiation request with a counter-offer.", tags: ["negotiation"] });
  for (let i = 0; i < 8; i++) scenarios.push({ status: "negotiating", direction: "INBOUND", scenario: "tricky", difficulty: 2, previousStatus: "quote-received", prompt: "Write a subtle negotiation email that doesn't explicitly mention prices but discusses terms.", tags: ["negotiation", "indirect"] });
  for (let i = 0; i < 4; i++) scenarios.push({ status: "negotiating", direction: "INBOUND", scenario: "followup", difficulty: 3, previousStatus: "quote-received", threadContext: [{ direction: "OUTBOUND", subject: "Budget discussion", body: "Is there any flexibility on the $2000 quote?" }], prompt: "Write a short reply offering a small discount or compromise.", tags: ["negotiation", "followup"] });
  for (let i = 0; i < 3; i++) scenarios.push({ status: "negotiating", direction: "INBOUND", scenario: "edge", difficulty: 4, previousStatus: "quote-received", prompt: "Write a negotiation response that could be mistaken for either acceptance or rejection.", tags: ["negotiation", "edge"] });

  // Contracted - Inbound (vendor confirms contract has been SIGNED/EXECUTED)
  for (let i = 0; i < 12; i++) scenarios.push({ status: "contracted", direction: "INBOUND", scenario: "normal", difficulty: 1, previousStatus: "confirmed", prompt: "Write an email confirming the contract has been signed and executed. Use phrases like 'contract is signed', 'agreement is finalized', or 'paperwork is complete'.", tags: ["contract"] });
  for (let i = 0; i < 5; i++) scenarios.push({ status: "contracted", direction: "INBOUND", scenario: "tricky", difficulty: 2, previousStatus: "confirmed", prompt: "Write an email confirming the contract is finalized using indirect language like 'everything is official now' or 'we're all set legally'.", tags: ["contract", "indirect"] });
  // NOTE: Contract being SENT (not signed) should remain "confirmed" - moved to confirmed scenarios
  for (let i = 0; i < 3; i++) scenarios.push({ status: "contracted", direction: "INBOUND", scenario: "followup", difficulty: 3, previousStatus: "confirmed", threadContext: [{ direction: "OUTBOUND", subject: "Signed contract", body: "Just sent back the signed contract!" }], prompt: "Write a reply confirming you've received the signed contract.", tags: ["contract", "followup"] });
  for (let i = 0; i < 2; i++) scenarios.push({ status: "contracted", direction: "INBOUND", scenario: "edge", difficulty: 4, previousStatus: "confirmed", prompt: "Write about a contract that was signed but with minor amendments noted.", tags: ["contract", "edge"] });

  // Deposit-paid - Inbound (vendor confirms deposit received after contract)
  for (let i = 0; i < 12; i++) scenarios.push({ status: "deposit-paid", direction: "INBOUND", scenario: "normal", difficulty: 1, previousStatus: "contracted", prompt: "Write an email confirming receipt of a deposit or payment.", tags: ["payment", "deposit"] });
  for (let i = 0; i < 5; i++) scenarios.push({ status: "deposit-paid", direction: "INBOUND", scenario: "tricky", difficulty: 2, previousStatus: "contracted", prompt: "Write a payment confirmation using indirect language.", tags: ["payment", "indirect"] });
  for (let i = 0; i < 2; i++) scenarios.push({ status: "deposit-paid", direction: "INBOUND", scenario: "followup", difficulty: 3, previousStatus: "contracted", threadContext: [{ direction: "OUTBOUND", subject: "Deposit sent", body: "Just transferred the deposit!" }], prompt: "Write a short acknowledgment of receiving the payment.", tags: ["payment", "followup"] });
  for (let i = 0; i < 2; i++) scenarios.push({ status: "deposit-paid", direction: "INBOUND", scenario: "edge", difficulty: 4, previousStatus: "contracted", prompt: "Write about a payment that was partially received or had issues.", tags: ["payment", "edge"] });

  // Fulfilled - Inbound (post-event after deposit paid)
  for (let i = 0; i < 15; i++) scenarios.push({ status: "fulfilled", direction: "INBOUND", scenario: "normal", difficulty: 1, previousStatus: "deposit-paid", prompt: "Write a post-event thank you email from the vendor. The event has happened.", tags: ["post-event", "thanks"] });
  for (let i = 0; i < 5; i++) scenarios.push({ status: "fulfilled", direction: "INBOUND", scenario: "tricky", difficulty: 2, previousStatus: "deposit-paid", prompt: "Write a subtle post-event message that doesn't explicitly say 'thank you'.", tags: ["post-event", "indirect"] });
  for (let i = 0; i < 3; i++) scenarios.push({ status: "fulfilled", direction: "INBOUND", scenario: "followup", difficulty: 3, previousStatus: "deposit-paid", threadContext: [{ direction: "OUTBOUND", subject: "Great event!", body: "Thank you so much for yesterday!" }], prompt: "Write a warm reply about enjoying working together.", tags: ["post-event", "followup"] });
  for (let i = 0; i < 3; i++) scenarios.push({ status: "fulfilled", direction: "INBOUND", scenario: "edge", difficulty: 4, previousStatus: "deposit-paid", prompt: "Write a post-event email that mentions both the completed service and a future opportunity.", tags: ["post-event", "edge"] });

  // Paid-in-full - Inbound (final payment after service fulfilled)
  for (let i = 0; i < 10; i++) scenarios.push({ status: "paid-in-full", direction: "INBOUND", scenario: "normal", difficulty: 1, previousStatus: "fulfilled", prompt: "Write an email confirming final payment has been received.", tags: ["final-payment"] });
  for (let i = 0; i < 4; i++) scenarios.push({ status: "paid-in-full", direction: "INBOUND", scenario: "tricky", difficulty: 2, previousStatus: "fulfilled", prompt: "Write a final payment confirmation using indirect language.", tags: ["final-payment", "indirect"] });
  for (let i = 0; i < 2; i++) scenarios.push({ status: "paid-in-full", direction: "INBOUND", scenario: "followup", difficulty: 3, previousStatus: "fulfilled", threadContext: [{ direction: "OUTBOUND", subject: "Final payment", body: "Sending the remaining balance now." }], prompt: "Write a brief acknowledgment.", tags: ["final-payment", "followup"] });
  for (let i = 0; i < 2; i++) scenarios.push({ status: "paid-in-full", direction: "INBOUND", scenario: "edge", difficulty: 4, previousStatus: "fulfilled", prompt: "Write about receiving final payment with some additional notes about future bookings.", tags: ["final-payment", "edge"] });

  // --- OUTBOUND SCENARIOS (From User/Planner) ---

  // RFQ-sent - Outbound (first contact with vendor)
  for (let i = 0; i < 40; i++) scenarios.push({ status: "rfq-sent", direction: "OUTBOUND", scenario: "normal", difficulty: 1, previousStatus: "shortlisted", prompt: "Write an inquiry email asking about availability and pricing for an event.", tags: ["inquiry", "rfq"] });
  for (let i = 0; i < 10; i++) scenarios.push({ status: "rfq-sent", direction: "OUTBOUND", scenario: "tricky", difficulty: 2, previousStatus: "shortlisted", prompt: "Write a subtle inquiry that asks about services without explicitly mentioning pricing.", tags: ["inquiry", "indirect"] });
  for (let i = 0; i < 5; i++) scenarios.push({ status: "rfq-sent", direction: "OUTBOUND", scenario: "followup", difficulty: 3, previousStatus: "shortlisted", threadContext: [{ direction: "INBOUND", subject: "Welcome!", body: "Thanks for reaching out. How can we help?" }], prompt: "Write a reply asking about their services for a specific event.", tags: ["inquiry", "followup"] });
  for (let i = 0; i < 5; i++) scenarios.push({ status: "rfq-sent", direction: "OUTBOUND", scenario: "edge", difficulty: 4, previousStatus: "shortlisted", prompt: "Write an inquiry that also mentions having looked at competitors.", tags: ["inquiry", "edge"] });

  // Confirmed - Outbound (planner accepts quote/offer)
  for (let i = 0; i < 25; i++) scenarios.push({ status: "confirmed", direction: "OUTBOUND", scenario: "normal", difficulty: 1, previousStatus: "quote-received", prompt: "Write an email confirming the booking from the planner's side. Clear 'let's proceed'.", tags: ["booking", "proceed"] });
  for (let i = 0; i < 8; i++) scenarios.push({ status: "confirmed", direction: "OUTBOUND", scenario: "tricky", difficulty: 2, previousStatus: "negotiating", prompt: "Write a confirmation using casual or indirect language.", tags: ["booking", "indirect"] });
  for (let i = 0; i < 4; i++) scenarios.push({ status: "confirmed", direction: "OUTBOUND", scenario: "followup", difficulty: 3, previousStatus: "quote-received", threadContext: [{ direction: "INBOUND", subject: "Quote", body: "Our package is $1,500 for the day." }], prompt: "Write a short reply accepting the quote.", tags: ["booking", "followup"] });
  for (let i = 0; i < 4; i++) scenarios.push({ status: "confirmed", direction: "OUTBOUND", scenario: "edge", difficulty: 4, previousStatus: "negotiating", prompt: "Write a conditional acceptance that includes caveats.", tags: ["booking", "edge"] });

  // Negotiating - Outbound (planner negotiates after receiving quote)
  for (let i = 0; i < 25; i++) scenarios.push({ status: "negotiating", direction: "OUTBOUND", scenario: "normal", difficulty: 1, previousStatus: "quote-received", prompt: "Write an email asking for a discount or negotiating terms.", tags: ["negotiation", "discount"] });
  for (let i = 0; i < 10; i++) scenarios.push({ status: "negotiating", direction: "OUTBOUND", scenario: "tricky", difficulty: 2, previousStatus: "quote-received", prompt: "Write a subtle negotiation without explicitly asking for a discount.", tags: ["negotiation", "indirect"] });
  for (let i = 0; i < 5; i++) scenarios.push({ status: "negotiating", direction: "OUTBOUND", scenario: "followup", difficulty: 3, previousStatus: "quote-received", threadContext: [{ direction: "INBOUND", subject: "Quote", body: "The total would be $2,500." }], prompt: "Write a reply pushing back on the price.", tags: ["negotiation", "followup"] });
  for (let i = 0; i < 5; i++) scenarios.push({ status: "negotiating", direction: "OUTBOUND", scenario: "edge", difficulty: 4, previousStatus: "quote-received", prompt: "Write a negotiation that could be seen as either accepting or rejecting.", tags: ["negotiation", "edge"] });

  // Contracted - Outbound (planner confirms they've SIGNED the contract)
  for (let i = 0; i < 20; i++) scenarios.push({ status: "contracted", direction: "OUTBOUND", scenario: "normal", difficulty: 1, previousStatus: "confirmed", prompt: "Write an email confirming you've signed and returned the contract. Be clear it's done, not pending.", tags: ["contract", "signed"] });
  for (let i = 0; i < 8; i++) scenarios.push({ status: "contracted", direction: "OUTBOUND", scenario: "tricky", difficulty: 2, previousStatus: "confirmed", prompt: "Write about having completed the contract using indirect terms like 'paperwork is done' or 'we're official'.", tags: ["contract", "indirect"] });
  for (let i = 0; i < 4; i++) scenarios.push({ status: "contracted", direction: "OUTBOUND", scenario: "followup", difficulty: 3, previousStatus: "confirmed", threadContext: [{ direction: "INBOUND", subject: "Contract", body: "Please sign and return." }], prompt: "Write a reply confirming you've signed and sent it back.", tags: ["contract", "followup"] });
  // NOTE: Questions about contract = still "confirmed", not "contracted"
  for (let i = 0; i < 3; i++) scenarios.push({ status: "contracted", direction: "OUTBOUND", scenario: "edge", difficulty: 4, previousStatus: "confirmed", prompt: "Write about a signed contract with a note about a minor detail that needs clarification (but contract IS signed).", tags: ["contract", "edge"] });

  // Deposit-paid - Outbound (planner sends deposit after contract)
  for (let i = 0; i < 15; i++) scenarios.push({ status: "deposit-paid", direction: "OUTBOUND", scenario: "normal", difficulty: 1, previousStatus: "contracted", prompt: "Write an email notifying that a deposit has been sent.", tags: ["payment", "sent"] });
  for (let i = 0; i < 5; i++) scenarios.push({ status: "deposit-paid", direction: "OUTBOUND", scenario: "tricky", difficulty: 2, previousStatus: "contracted", prompt: "Write about sending payment using indirect language.", tags: ["payment", "indirect"] });
  for (let i = 0; i < 3; i++) scenarios.push({ status: "deposit-paid", direction: "OUTBOUND", scenario: "followup", difficulty: 3, previousStatus: "contracted", threadContext: [{ direction: "INBOUND", subject: "Deposit needed", body: "Please send the 50% deposit to secure." }], prompt: "Write a reply confirming you've sent it.", tags: ["payment", "followup"] });
  for (let i = 0; i < 3; i++) scenarios.push({ status: "deposit-paid", direction: "OUTBOUND", scenario: "edge", difficulty: 4, previousStatus: "contracted", prompt: "Write about a payment with questions about the amount.", tags: ["payment", "edge"] });

  // Cancelled - Outbound (planner cancels after confirmation)
  for (let i = 0; i < 20; i++) scenarios.push({ status: "cancelled", direction: "OUTBOUND", scenario: "normal", difficulty: 1, previousStatus: "confirmed", prompt: "Write an email cancelling the booking from the planner's side.", tags: ["cancellation"] });
  for (let i = 0; i < 7; i++) scenarios.push({ status: "cancelled", direction: "OUTBOUND", scenario: "tricky", difficulty: 2, previousStatus: "confirmed", prompt: "Write a cancellation using polite, indirect language.", tags: ["cancellation", "indirect"] });
  for (let i = 0; i < 4; i++) scenarios.push({ status: "cancelled", direction: "OUTBOUND", scenario: "followup", difficulty: 3, previousStatus: "confirmed", threadContext: [{ direction: "INBOUND", subject: "All set!", body: "We're confirmed for March 15th!" }], prompt: "Write a reply cancelling despite the confirmation.", tags: ["cancellation", "reversal"] });
  for (let i = 0; i < 5; i++) scenarios.push({ status: "cancelled", direction: "OUTBOUND", scenario: "edge", difficulty: 4, previousStatus: "contracted", prompt: "Write a cancellation that leaves the door open for future work.", tags: ["cancellation", "edge"] });

  return scenarios;
}

/**
 * Generate test emails for a given email set
 */
export async function generateTestEmails(
  emailSetId: string,
  options?: { 
    count?: number;
    useAI?: boolean; 
  }
): Promise<{ generated: number; errors: number }> {
  const scenarios = getScenarios();
  const personas = await prisma.testPersona.findMany();
  
  if (personas.length === 0) {
    throw new Error("No personas found. Run generatePersonas() first.");
  }

  let generated = 0;
  let errors = 0;

  const apiKey = process.env.OPENAI_API_KEY;
  const useAI = options?.useAI !== false && !!apiKey;

  // Shuffle scenarios and take requested count
  const shuffled = scenarios.sort(() => Math.random() - 0.5);
  const targetCount = options?.count || 500;
  const toGenerate = shuffled.slice(0, targetCount);

  console.log(`[test-generator] Generating ${toGenerate.length} test emails (AI: ${useAI})`);

  // Process in parallel batches to speed up generation
  // Concurrency of 15 is a good balance for OpenAI rate limits
  const CONCURRENCY = 15;

  // Pre-assign personas to scenarios
  const tasks = toGenerate.map(scenario => ({
    scenario,
    persona: personas[Math.floor(Math.random() * personas.length)],
  }));

  // Process in batches
  for (let i = 0; i < tasks.length; i += CONCURRENCY) {
    const batch = tasks.slice(i, i + CONCURRENCY);

    const results = await Promise.allSettled(
      batch.map(async ({ scenario, persona }) => {
        // Generate email content
        const email = useAI
          ? await generateEmailWithAI(persona, scenario)
          : generateEmailTemplate(persona, scenario);

        await prisma.testCase.create({
          data: {
            emailSetId,
            personaId: persona.id,
            subject: email.subject,
            body: email.body,
            direction: scenario.direction,
            threadContext: scenario.threadContext || undefined,
            hasThreadContext: !!scenario.threadContext,
            expectedStatus: scenario.status,
            previousStatus: scenario.previousStatus || null,
            scenario: scenario.scenario,
            difficulty: scenario.difficulty,
            tags: scenario.tags,
            generationNotes: email.notes,
          },
        });

        return true;
      })
    );

    // Count successes and failures
    for (const result of results) {
      if (result.status === 'fulfilled') {
        generated++;
      } else {
        console.error(`[test-generator] Error generating email:`, result.reason);
        errors++;
      }
    }

    // Progress update after each batch
    console.log(`[test-generator] Progress: ${generated + errors}/${toGenerate.length} (${generated} success, ${errors} errors)`);
  }

  // Update email set totals
  const stats = await prisma.testCase.groupBy({
    by: ["direction"],
    where: { emailSetId },
    _count: true,
  });

  const inboundCount = stats.find(s => s.direction === "INBOUND")?._count || 0;
  const outboundCount = stats.find(s => s.direction === "OUTBOUND")?._count || 0;

  await prisma.testEmailSet.update({
    where: { id: emailSetId },
    data: {
      totalCases: inboundCount + outboundCount,
      inboundCount,
      outboundCount,
    },
  });

  console.log(`[test-generator] Complete: ${generated} generated, ${errors} errors`);
  return { generated, errors };
}

/**
 * Generate email using AI
 */
async function generateEmailWithAI(
  persona: { name: string; companyName: string; contactName: string; category: string; communicationStyle: string; reliability: string; pricePoint: string },
  scenario: TestScenario
): Promise<{ subject: string; body: string; notes: string }> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not set");

  const threadContext = scenario.threadContext 
    ? `\n\nTHREAD CONTEXT (previous messages):\n${scenario.threadContext.map(m => `${m.direction}: ${m.subject}\n${m.body}`).join("\n\n")}\n`
    : "";

  const systemPrompt = `You are generating test emails for a status detection AI system.

COMMUNICATION STYLE GUIDE:

"formal" = Professional but warm (NOT stuffy/bureaucratic)
- Use "Hi [Name]," not "Dear Sir/Madam"
- Get to the point quickly
- Sign off with "Best," "Thanks," or just their name
- Example: "Hi Sarah, Thanks for reaching out! We're available March 15th. Pricing starts at $2,500 for 100 guests. Let me know! - Maria"

"casual" = Friendly, conversational
- May use exclamation points
- Very brief for followups
- Example: "Hey! Yes we're free! Happy to chat pricing whenever."

"terse" = Extremely brief, just essentials
- Example: "Available. $2000. Let me know."

"verbose" = Detailed and thorough
- Includes background, experience, full explanations

AVOID (too formal for real vendor emails):
- "We are pleased to inform you..."
- "Dear [Client's Name],"
- "Should you have any further questions..."
- "Please do not hesitate to contact us..."
- "We look forward to the opportunity to serve you..."

Real vendor emails are casual and friendly, even from premium vendors.

For INBOUND: write as the vendor
For OUTBOUND: write as the event planner

Return ONLY valid JSON:
{
  "subject": "Email subject line",
  "body": "Email body content",
  "notes": "Why this email matches the expected status"
}`;

  const styleExamples: Record<string, string> = {
    formal: 'Write professionally but warmly - "Hi! We\'d love to help with your event..."',
    casual: 'Write like texting a friendly business contact - "Hey! Yeah we can do that!"',
    terse: 'Minimal words - "Available. $2000. Deposit holds date."',
    verbose: 'Include lots of detail about services, experience, options',
  };

  const userPrompt = `PERSONA: ${persona.name} (${persona.companyName})
Contact: ${persona.contactName}
Category: ${persona.category}
Style: ${persona.communicationStyle}
${styleExamples[persona.communicationStyle] || ''}
Reliability: ${persona.reliability}
Price Point: ${persona.pricePoint}

DIRECTION: ${scenario.direction}
EXPECTED STATUS: ${scenario.status}
DIFFICULTY: ${scenario.scenario} (${scenario.difficulty}/4)
${threadContext}
INSTRUCTIONS: ${scenario.prompt}

IMPORTANT: Write like a real vendor/planner would, not like a formal business letter.`;

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      max_completion_tokens: 500,
    }),
  });

  if (!res.ok) {
    throw new Error(`OpenAI API error: ${res.status}`);
  }

  const data = await res.json() as {
    choices?: { message?: { content?: string } }[];
  };
  const content = data.choices?.[0]?.message?.content;
  
  if (!content) throw new Error("Empty AI response");

  // Parse JSON from response
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("No JSON in response");

  return JSON.parse(jsonMatch[0]);
}

/**
 * Generate email using templates (fallback)
 */
function generateEmailTemplate(
  persona: { name: string; contactName: string },
  scenario: TestScenario
): { subject: string; body: string; notes: string } {
  const templates: Record<string, { subject: string; body: string }> = {
    "confirmed-INBOUND": {
      subject: "Re: Event Inquiry",
      body: `Hi,\n\nYes, we can do your event! We're available and would love to work with you.\n\nBest,\n${persona.contactName}`,
    },
    "quote-received-INBOUND": {
      subject: "Re: Quote Request",
      body: `Hi,\n\nThank you for your inquiry. Our pricing is $1,500 for the day.\n\nLet me know if you have questions.\n\nBest,\n${persona.contactName}`,
    },
    "cancelled-INBOUND": {
      subject: "Re: Booking Update",
      body: `Hi,\n\nI'm so sorry, but we can no longer accommodate your event due to a scheduling conflict.\n\nApologies for any inconvenience.\n\n${persona.contactName}`,
    },
    "rfq-sent-OUTBOUND": {
      subject: "Event Inquiry - March 15th",
      body: `Hi,\n\nI'm planning an event for March 15th and would love to know your availability and pricing.\n\nLooking forward to hearing from you!\n\nBest regards`,
    },
  };

  const key = `${scenario.status}-${scenario.direction}`;
  const template = templates[key] || {
    subject: `Re: ${scenario.status}`,
    body: `This is a test email for ${scenario.status} (${scenario.direction}).`,
  };

  return {
    ...template,
    notes: `Template-generated for ${scenario.status} (${scenario.scenario})`,
  };
}

/**
 * Create a new email set
 */
export async function createEmailSet(name: string, description?: string): Promise<string> {
  const emailSet = await prisma.testEmailSet.create({
    data: { name, description },
  });
  return emailSet.id;
}

/**
 * Get all email sets
 */
export async function getEmailSets() {
  return prisma.testEmailSet.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { cases: true, runs: true } },
    },
  });
}


