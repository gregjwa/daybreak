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
  // V1 model (LEGACY - for backward compatibility with old test runs only)
  // Maps to old 11-status model. Will be removed after v2 validation.
  legacyStatus: string;
  previousStatus?: string; // Status before this email arrived (for progression context)

  // V2 model (primary/sub/action) - THE ACTUAL TEST EXPECTATIONS
  primaryStatus: "contacting" | "quoted" | "booked" | "completed" | "cancelled";
  subStatus: string | null;
  actions: string[];

  direction: "INBOUND" | "OUTBOUND";
  scenario: "normal" | "tricky" | "followup" | "edge";
  difficulty: number;
  threadContext?: { direction: string; subject: string; body: string }[];
  prompt: string;
  tags: string[];
}

// Helper to create scenario with both v1 and v2 fields
// legacyV1Status: Maps to old model for comparison runs (rfq-sent, quote-received, etc.)
function scenario(
  legacyV1Status: string,
  primaryStatus: TestScenario["primaryStatus"],
  subStatus: string | null,
  actions: string[],
  direction: "INBOUND" | "OUTBOUND",
  scenarioType: "normal" | "tricky" | "followup" | "edge",
  difficulty: number,
  prompt: string,
  tags: string[],
  opts?: { previousStatus?: string; threadContext?: { direction: string; subject: string; body: string }[] }
): TestScenario {
  return {
    legacyStatus: legacyV1Status,
    primaryStatus,
    subStatus,
    actions,
    direction,
    scenario: scenarioType,
    difficulty,
    prompt,
    tags,
    previousStatus: opts?.previousStatus,
    threadContext: opts?.threadContext,
  };
}

// Scenarios for each status using v2 model (primary/sub/actions)
// Addresses all feedback from ChatGPT review:
// 1. Fixed action flags (reply-needed only when question asked)
// 2. Added attachment-based quote scenarios
// 3. Added budget context (within-budget, over-budget)
// 4. Added messy/ambiguous booking scenarios
// 5. Added needs-review ambiguous scenarios
// 6. Rebalanced counts
function getScenarios(): TestScenario[] {
  const scenarios: TestScenario[] = [];

  // ============================================
  // CONTACTING - Initial contact phase
  // ============================================

  // Contacting + awaiting-response (Planner sent inquiry, waiting for vendor)
  for (let i = 0; i < 30; i++) scenarios.push(
    scenario("rfq-sent", "contacting", "awaiting-response", [],
      "OUTBOUND", "normal", 1,
      "Write an inquiry email asking about availability and pricing for an event. Be specific about date and guest count.",
      ["inquiry", "rfq"])
  );
  for (let i = 0; i < 8; i++) scenarios.push(
    scenario("rfq-sent", "contacting", "awaiting-response", [],
      "OUTBOUND", "tricky", 2,
      "Write a subtle inquiry that asks about services without explicitly mentioning pricing.",
      ["inquiry", "indirect"])
  );
  for (let i = 0; i < 5; i++) scenarios.push(
    scenario("rfq-sent", "contacting", "awaiting-response", [],
      "OUTBOUND", "followup", 3,
      "Write a reply asking about their services for a specific event.",
      ["inquiry", "followup"],
      { threadContext: [{ direction: "INBOUND", subject: "Welcome!", body: "Thanks for reaching out. How can we help?" }] })
  );

  // Contacting + vendor-available WITH question (reply-needed)
  for (let i = 0; i < 15; i++) scenarios.push(
    scenario("rfq-sent", "contacting", "vendor-available", ["reply-needed"],
      "INBOUND", "normal", 1,
      "Write where vendor says they're AVAILABLE and ASKS A QUESTION about the event. NO pricing. Must include a question like 'What time?' or 'How many guests?' or 'Tell me more about your vision.'",
      ["availability", "with-question"])
  );

  // Contacting + vendor-available WITHOUT question (no reply-needed)
  for (let i = 0; i < 10; i++) scenarios.push(
    scenario("rfq-sent", "contacting", "vendor-available", [],
      "INBOUND", "normal", 1,
      "Write where vendor confirms availability but does NOT ask any questions. Just 'Yes, I'm available March 15th!' or 'Count me in!' NO pricing, NO questions.",
      ["availability", "no-question"])
  );
  for (let i = 0; i < 8; i++) scenarios.push(
    scenario("rfq-sent", "contacting", "vendor-available", [],
      "INBOUND", "tricky", 2,
      "Vendor confirms availability enthusiastically without price or questions. Example: 'I'd love to help! That date works for me.' NO dollar amounts, NO questions.",
      ["availability", "enthusiastic"])
  );
  for (let i = 0; i < 8; i++) scenarios.push(
    scenario("rfq-sent", "contacting", "vendor-available", [],
      "INBOUND", "edge", 4,
      "Vendor says available and mentions 'I'll send pricing soon' or 'quote to follow' - but NO actual numbers yet. This is still contacting, not quoted. No questions.",
      ["availability", "quote-promised"])
  );

  // Contacting + vendor-unavailable
  for (let i = 0; i < 12; i++) scenarios.push(
    scenario("rfq-sent", "contacting", "vendor-unavailable", [],
      "INBOUND", "normal", 1,
      "Write an email where the vendor says they're NOT available for the requested date. Be polite but clear.",
      ["unavailable"])
  );
  for (let i = 0; i < 5; i++) scenarios.push(
    scenario("rfq-sent", "contacting", "vendor-unavailable", [],
      "INBOUND", "tricky", 2,
      "Vendor is unavailable but uses soft language like 'unfortunately booked' or 'already committed'.",
      ["unavailable", "soft"])
  );

  // Contacting + chasing-response (Follow-up sent)
  for (let i = 0; i < 8; i++) scenarios.push(
    scenario("rfq-sent", "contacting", "chasing-response", [],
      "OUTBOUND", "normal", 1,
      "Write a polite follow-up email checking if the vendor received the original inquiry.",
      ["followup", "chase"],
      { previousStatus: "rfq-sent" })
  );

  // ============================================
  // QUOTED - Vendor has provided pricing
  // ============================================

  // Quoted + budget-unknown (standard quote with $ amounts)
  for (let i = 0; i < 25; i++) scenarios.push(
    scenario("quote-received", "quoted", "budget-unknown", ["review-quote"],
      "INBOUND", "normal", 1,
      "Write an email with actual pricing. Include specific dollar amounts like '$500', '$1,200', or '$2,500 for the day'. This is a quote response.",
      ["pricing", "quote"],
      { previousStatus: "rfq-sent" })
  );
  for (let i = 0; i < 8; i++) scenarios.push(
    scenario("quote-received", "quoted", "budget-unknown", ["review-quote"],
      "INBOUND", "tricky", 2,
      "Write pricing using indirect language like 'investment of $1,500' or 'packages starting at $800'.",
      ["pricing", "indirect"],
      { previousStatus: "rfq-sent" })
  );
  for (let i = 0; i < 5; i++) scenarios.push(
    scenario("quote-received", "quoted", "budget-unknown", ["review-quote"],
      "INBOUND", "followup", 3,
      "Write a reply with the requested pricing information.",
      ["pricing", "followup"],
      { previousStatus: "rfq-sent", threadContext: [{ direction: "OUTBOUND", subject: "Quote request", body: "Can you send me your pricing for a 100-person event?" }] })
  );
  for (let i = 0; i < 5; i++) scenarios.push(
    scenario("quote-received", "quoted", "budget-unknown", ["review-quote"],
      "INBOUND", "edge", 4,
      "Write pricing buried in the middle of a long message about services and experience. Include at least one $ amount somewhere.",
      ["pricing", "edge"],
      { previousStatus: "rfq-sent" })
  );

  // *** NEW: Quoted via ATTACHMENT (no $ in body) ***
  for (let i = 0; i < 10; i++) scenarios.push(
    scenario("quote-received", "quoted", "budget-unknown", ["review-quote"],
      "INBOUND", "normal", 2,
      "Write where vendor says 'Attached is our proposal' or 'See the estimate attached' or 'I've attached our pricing package'. NO dollar amounts in the email body itself - pricing is in attachment.",
      ["pricing", "attachment"],
      { previousStatus: "rfq-sent" })
  );
  for (let i = 0; i < 5; i++) scenarios.push(
    scenario("quote-received", "quoted", "budget-unknown", ["review-quote"],
      "INBOUND", "tricky", 3,
      "Vendor says 'PDF attached with our rates' or 'See quote document' - use various terms for attachment. NO dollar amounts in body.",
      ["pricing", "attachment", "indirect"],
      { previousStatus: "rfq-sent" })
  );

  // *** NEW: Quoted + within-budget (quote <= stated budget) ***
  for (let i = 0; i < 10; i++) scenarios.push(
    scenario("quote-received", "quoted", "within-budget", ["review-quote"],
      "INBOUND", "normal", 1,
      "Write a quote email with pricing of $1,200. The previous context shows planner's budget was $1,500.",
      ["pricing", "within-budget"],
      { previousStatus: "rfq-sent", threadContext: [{ direction: "OUTBOUND", subject: "Event inquiry", body: "We're planning a corporate event March 15th for 100 guests. Our budget is around $1,500. What are your rates?" }] })
  );
  for (let i = 0; i < 5; i++) scenarios.push(
    scenario("quote-received", "quoted", "within-budget", ["review-quote"],
      "INBOUND", "tricky", 2,
      "Quote of $800 when planner mentioned $1,000 budget. Make the quote clearly under budget.",
      ["pricing", "within-budget", "clear"],
      { previousStatus: "rfq-sent", threadContext: [{ direction: "OUTBOUND", subject: "Catering quote?", body: "Looking for catering for 50 people. Budget is $1,000 max." }] })
  );

  // *** NEW: Quoted + over-budget (quote > stated budget) ***
  for (let i = 0; i < 10; i++) scenarios.push(
    scenario("quote-received", "quoted", "over-budget", ["review-quote"],
      "INBOUND", "normal", 1,
      "Write a quote email with pricing of $2,200. The previous context shows planner's budget was $1,500. Quote is over budget.",
      ["pricing", "over-budget"],
      { previousStatus: "rfq-sent", threadContext: [{ direction: "OUTBOUND", subject: "Event inquiry", body: "Planning a wedding March 15th for 100 guests. Our budget is around $1,500. What are your packages?" }] })
  );
  for (let i = 0; i < 5; i++) scenarios.push(
    scenario("quote-received", "quoted", "over-budget", ["review-quote"],
      "INBOUND", "tricky", 2,
      "Quote of $3,000 when planner mentioned budget 'around $2k'. Significantly over budget.",
      ["pricing", "over-budget", "significant"],
      { previousStatus: "rfq-sent", threadContext: [{ direction: "OUTBOUND", subject: "Photography quote", body: "Need a photographer for our event. Budget is around $2k." }] })
  );

  // *** NEW: Soft budget phrasing (should be budget-unknown) ***
  for (let i = 0; i < 5; i++) scenarios.push(
    scenario("quote-received", "quoted", "budget-unknown", ["review-quote"],
      "INBOUND", "edge", 4,
      "Quote of $1,800 when planner said vague budget like 'aiming for around $1.5k' or 'hoping to keep it under $2k maybe'. Soft budget = budget-unknown.",
      ["pricing", "soft-budget"],
      { previousStatus: "rfq-sent", threadContext: [{ direction: "OUTBOUND", subject: "DJ inquiry", body: "We're looking for a DJ. Hoping to keep it around $1.5k or so if possible." }] })
  );

  // Quoted + negotiating (Active price discussion)
  for (let i = 0; i < 15; i++) scenarios.push(
    scenario("negotiating", "quoted", "negotiating", [],
      "OUTBOUND", "normal", 1,
      "Write an email asking for a discount or negotiating terms. Push back on the quoted price.",
      ["negotiation", "discount"],
      { previousStatus: "quote-received" })
  );
  for (let i = 0; i < 8; i++) scenarios.push(
    scenario("negotiating", "quoted", "negotiating", [],
      "OUTBOUND", "tricky", 2,
      "Write subtle negotiation without explicitly asking for discount - mention budget constraints or compare to competitors.",
      ["negotiation", "indirect"],
      { previousStatus: "quote-received" })
  );
  for (let i = 0; i < 6; i++) scenarios.push(
    scenario("negotiating", "quoted", "negotiating", ["reply-needed"],
      "INBOUND", "normal", 1,
      "Vendor responds to negotiation with counter-offer AND asks a question. Include a NEW price different from original, and ask something like 'Would that work?'",
      ["negotiation", "counter-offer"],
      { previousStatus: "quote-received" })
  );
  for (let i = 0; i < 5; i++) scenarios.push(
    scenario("negotiating", "quoted", "negotiating", [],
      "INBOUND", "tricky", 2,
      "Vendor responds to negotiation discussing terms/flexibility without committing to new price. No question asked.",
      ["negotiation", "terms"],
      { previousStatus: "quote-received" })
  );

  // Quoted + date-held (with pay-deposit action - FIXED)
  for (let i = 0; i < 10; i++) scenarios.push(
    scenario("quote-received", "quoted", "date-held", ["approve-booking", "pay-deposit"],
      "INBOUND", "normal", 1,
      "Write where vendor says they're HOLDING the date but NEED A DEPOSIT by a specific deadline. Example: 'I've penciled you in but need a deposit by Friday to hold it.'",
      ["date-hold", "needs-deposit"],
      { previousStatus: "quote-received" })
  );
  for (let i = 0; i < 5; i++) scenarios.push(
    scenario("quote-received", "quoted", "date-held", ["approve-booking"],
      "INBOUND", "tricky", 2,
      "Vendor holding date but just needs a decision, not specifically deposit. 'Can hold until Monday, let me know!' No deposit mentioned.",
      ["date-hold", "decision-only"],
      { previousStatus: "quote-received" })
  );

  // ============================================
  // BOOKED - Committed to work together
  // ============================================

  // Booked + verbal-confirmed (clear booking language)
  for (let i = 0; i < 20; i++) scenarios.push(
    scenario("confirmed", "booked", "verbal-confirmed", [],
      "OUTBOUND", "normal", 1,
      "Write where planner confirms booking. Use clear phrases: 'let's proceed', 'we'd like to book you', 'go ahead and lock in the date', 'we're confirming'.",
      ["booking", "proceed"],
      { previousStatus: "quote-received" })
  );
  for (let i = 0; i < 8; i++) scenarios.push(
    scenario("confirmed", "booked", "verbal-confirmed", [],
      "OUTBOUND", "tricky", 2,
      "Casual booking confirmation: 'sounds perfect, count us in!' or 'yes, let's do it!' Clear commitment despite casual tone.",
      ["booking", "casual"],
      { previousStatus: "negotiating" })
  );
  for (let i = 0; i < 15; i++) scenarios.push(
    scenario("confirmed", "booked", "verbal-confirmed", [],
      "INBOUND", "normal", 1,
      "Vendor confirms booking is SET after planner accepted. Use: 'you're booked!', 'see you March 15th!', 'confirmed for your date!'",
      ["confirmation", "vendor-confirms"],
      { previousStatus: "negotiating" })
  );
  for (let i = 0; i < 6; i++) scenarios.push(
    scenario("confirmed", "booked", "verbal-confirmed", [],
      "INBOUND", "tricky", 2,
      "Vendor confirms booking casually: 'Awesome, see you there!' or 'Can't wait!' Clear this is after planner accepted.",
      ["confirmation", "casual"],
      { previousStatus: "quote-received" })
  );
  for (let i = 0; i < 5; i++) scenarios.push(
    scenario("confirmed", "booked", "verbal-confirmed", [],
      "INBOUND", "followup", 3,
      "Short reply accepting booking: 'Great, you're booked!' or 'Perfect, see you then!'",
      ["confirmation", "followup"],
      { previousStatus: "negotiating", threadContext: [{ direction: "OUTBOUND", subject: "Let's proceed!", body: "We'd like to book you for March 15th!" }] })
  );

  // *** NEW: Messy/ambiguous booking scenarios ***
  for (let i = 0; i < 8; i++) scenarios.push(
    scenario("confirmed", "booked", "verbal-confirmed", ["pay-deposit"],
      "INBOUND", "edge", 4,
      "Vendor says 'Confirmed pending deposit' or 'You're on the calendar once deposit clears'. This IS booked despite 'pending' language - they're committed.",
      ["booking", "pending-language"],
      { previousStatus: "quote-received" })
  );
  for (let i = 0; i < 5; i++) scenarios.push(
    scenario("confirmed", "booked", "verbal-confirmed", [],
      "OUTBOUND", "edge", 4,
      "Planner says 'Let's do it, send the invoice' or 'We're in, what's next?' - clear commitment with next-step request.",
      ["booking", "with-next-step"],
      { previousStatus: "quote-received" })
  );
  for (let i = 0; i < 5; i++) scenarios.push(
    scenario("confirmed", "booked", "verbal-confirmed", [],
      "INBOUND", "edge", 4,
      "WhatsApp-style short reply after planner booked: 'Done!' or 'Got it, locked in' or just '👍 see you then'. Very brief but clear confirmation.",
      ["booking", "short-reply"],
      { previousStatus: "negotiating", threadContext: [{ direction: "OUTBOUND", subject: "Booking", body: "Let's go ahead with March 15th!" }] })
  );

  // *** TRICKY: "Pencil in" language - this is date-held, NOT booked ***
  for (let i = 0; i < 5; i++) scenarios.push(
    scenario("quote-received", "quoted", "date-held", ["approve-booking"],
      "INBOUND", "edge", 4,
      "Vendor says 'We can pencil you in' or 'I'll tentatively hold the date'. This is NOT booked - it's date-held. No firm commitment yet.",
      ["edge", "pencil-not-booked"],
      { previousStatus: "quote-received" })
  );

  // Booked + contract-sent
  for (let i = 0; i < 10; i++) scenarios.push(
    scenario("confirmed", "booked", "contract-sent", ["sign-contract"],
      "INBOUND", "normal", 1,
      "Vendor sends contract for signature: 'attached is the contract' or 'please review and sign'. Contract NOT yet signed.",
      ["contract", "sent"],
      { previousStatus: "confirmed" })
  );
  for (let i = 0; i < 5; i++) scenarios.push(
    scenario("confirmed", "booked", "contract-sent", ["sign-contract"],
      "INBOUND", "tricky", 2,
      "Vendor mentions sending paperwork using informal terms: 'paperwork attached', 'sending the agreement'. Not signed yet.",
      ["contract", "informal"],
      { previousStatus: "confirmed" })
  );

  // Booked + contract-signed
  for (let i = 0; i < 12; i++) scenarios.push(
    scenario("contracted", "booked", "contract-signed", [],
      "OUTBOUND", "normal", 1,
      "Planner confirms they've SIGNED and returned the contract. Clear it's done, not pending.",
      ["contract", "signed"],
      { previousStatus: "confirmed" })
  );
  for (let i = 0; i < 6; i++) scenarios.push(
    scenario("contracted", "booked", "contract-signed", [],
      "OUTBOUND", "tricky", 2,
      "Contract completion in indirect terms: 'paperwork is done' or 'we're official now'.",
      ["contract", "indirect"],
      { previousStatus: "confirmed" })
  );
  for (let i = 0; i < 8; i++) scenarios.push(
    scenario("contracted", "booked", "contract-signed", [],
      "INBOUND", "normal", 1,
      "Vendor confirms contract is SIGNED: 'Contract is signed', 'agreement is finalized', 'paperwork is complete'.",
      ["contract", "executed"],
      { previousStatus: "confirmed" })
  );
  for (let i = 0; i < 4; i++) scenarios.push(
    scenario("contracted", "booked", "contract-signed", [],
      "INBOUND", "followup", 3,
      "Vendor confirms receipt of signed contract from planner.",
      ["contract", "received"],
      { previousStatus: "confirmed", threadContext: [{ direction: "OUTBOUND", subject: "Signed contract", body: "Just sent back the signed contract!" }] })
  );

  // Booked + deposit-requested
  for (let i = 0; i < 12; i++) scenarios.push(
    scenario("contracted", "booked", "deposit-requested", ["pay-deposit"],
      "INBOUND", "normal", 1,
      "Vendor requests deposit: 'Please send the 50% deposit' or 'deposit is due to secure your date'. Clear request.",
      ["deposit", "requested"],
      { previousStatus: "contracted" })
  );

  // Booked + deposit-paid
  for (let i = 0; i < 12; i++) scenarios.push(
    scenario("deposit-paid", "booked", "deposit-paid", [],
      "OUTBOUND", "normal", 1,
      "Planner notifies deposit has been sent: 'Just transferred the deposit' or 'Payment sent!'",
      ["payment", "sent"],
      { previousStatus: "contracted" })
  );
  for (let i = 0; i < 4; i++) scenarios.push(
    scenario("deposit-paid", "booked", "deposit-paid", [],
      "OUTBOUND", "tricky", 2,
      "Sending payment using indirect language: 'Check is in the mail' or 'Transferred via the link you sent'.",
      ["payment", "indirect"],
      { previousStatus: "contracted" })
  );
  for (let i = 0; i < 8; i++) scenarios.push(
    scenario("deposit-paid", "booked", "deposit-paid", [],
      "INBOUND", "normal", 1,
      "Vendor confirms receipt of deposit: 'Got the deposit, thank you!' or 'Payment received!'",
      ["payment", "received"],
      { previousStatus: "contracted" })
  );
  for (let i = 0; i < 3; i++) scenarios.push(
    scenario("deposit-paid", "booked", "deposit-paid", [],
      "INBOUND", "followup", 3,
      "Short acknowledgment of receiving payment.",
      ["payment", "followup"],
      { previousStatus: "contracted", threadContext: [{ direction: "OUTBOUND", subject: "Deposit sent", body: "Just transferred the deposit!" }] })
  );

  // Booked + awaiting-details
  for (let i = 0; i < 8; i++) scenarios.push(
    scenario("contracted", "booked", "awaiting-details", ["provide-details", "reply-needed"],
      "INBOUND", "normal", 1,
      "Vendor asks for event details: timeline, setup requirements, specific preferences. They're booked but need more info. Must include a question.",
      ["logistics", "details-needed"],
      { previousStatus: "deposit-paid" })
  );

  // ============================================
  // COMPLETED - Service delivered
  // ============================================

  // Completed + fulfilled
  for (let i = 0; i < 12; i++) scenarios.push(
    scenario("fulfilled", "completed", "fulfilled", [],
      "INBOUND", "normal", 1,
      "Post-event thank you from vendor. Event HAS HAPPENED. Reference 'yesterday', 'last weekend', 'your beautiful wedding'.",
      ["post-event", "thanks"],
      { previousStatus: "deposit-paid" })
  );
  for (let i = 0; i < 4; i++) scenarios.push(
    scenario("fulfilled", "completed", "fulfilled", [],
      "INBOUND", "tricky", 2,
      "Subtle post-event message referencing completed event without explicit 'thank you'.",
      ["post-event", "indirect"],
      { previousStatus: "deposit-paid" })
  );
  for (let i = 0; i < 8; i++) scenarios.push(
    scenario("fulfilled", "completed", "fulfilled", [],
      "OUTBOUND", "normal", 1,
      "Thank you from planner to vendor after event: 'You were amazing yesterday!' or 'Thanks for making our day special!'",
      ["post-event", "planner-thanks"],
      { previousStatus: "deposit-paid" })
  );

  // Completed + invoice-sent
  for (let i = 0; i < 10; i++) scenarios.push(
    scenario("fulfilled", "completed", "invoice-sent", ["pay-balance"],
      "INBOUND", "normal", 1,
      "Vendor sends final invoice after event. Include remaining balance amount like 'remaining $500 due'.",
      ["invoice", "final-payment"],
      { previousStatus: "fulfilled" })
  );

  // Completed + paid-in-full
  for (let i = 0; i < 8; i++) scenarios.push(
    scenario("paid-in-full", "completed", "paid-in-full", [],
      "INBOUND", "normal", 1,
      "Vendor confirms final payment received: 'Payment received', 'all paid up', 'balance cleared'.",
      ["final-payment", "complete"],
      { previousStatus: "fulfilled" })
  );
  for (let i = 0; i < 4; i++) scenarios.push(
    scenario("paid-in-full", "completed", "paid-in-full", [],
      "OUTBOUND", "normal", 1,
      "Planner notifies final payment sent.",
      ["final-payment", "sent"],
      { previousStatus: "fulfilled" })
  );

  // ============================================
  // CANCELLED - Relationship terminated
  // ============================================

  // Cancelled (from vendor)
  for (let i = 0; i < 12; i++) scenarios.push(
    scenario("cancelled", "cancelled", null, [],
      "INBOUND", "normal", 1,
      "Vendor cancels clearly: 'unfortunately we can no longer', 'have to cancel', 'won't be able to serve you'.",
      ["cancellation", "vendor"],
      { previousStatus: "confirmed" })
  );
  for (let i = 0; i < 6; i++) scenarios.push(
    scenario("cancelled", "cancelled", null, [],
      "INBOUND", "tricky", 2,
      "Vendor cancels using apologetic, indirect language without word 'cancel'.",
      ["cancellation", "indirect"],
      { previousStatus: "confirmed" })
  );
  for (let i = 0; i < 4; i++) scenarios.push(
    scenario("cancelled", "cancelled", null, [],
      "INBOUND", "edge", 4,
      "Cancellation using 'fulfill' negatively: 'cannot fulfill your booking'. Clearly a cancellation.",
      ["cancellation", "edge"],
      { previousStatus: "contracted" })
  );

  // Cancelled (from planner)
  for (let i = 0; i < 12; i++) scenarios.push(
    scenario("cancelled", "cancelled", null, [],
      "OUTBOUND", "normal", 1,
      "Planner cancels the booking.",
      ["cancellation", "planner"],
      { previousStatus: "confirmed" })
  );
  for (let i = 0; i < 4; i++) scenarios.push(
    scenario("cancelled", "cancelled", null, [],
      "OUTBOUND", "tricky", 2,
      "Polite, indirect cancellation language.",
      ["cancellation", "polite"],
      { previousStatus: "confirmed" })
  );
  for (let i = 0; i < 3; i++) scenarios.push(
    scenario("cancelled", "cancelled", null, [],
      "OUTBOUND", "followup", 3,
      "Cancelling despite recent confirmation.",
      ["cancellation", "reversal"],
      { previousStatus: "confirmed", threadContext: [{ direction: "INBOUND", subject: "All set!", body: "We're confirmed for March 15th!" }] })
  );

  // ============================================
  // EDGE CASES - Things that should NOT change status
  // ============================================

  // Empathy is NOT cancellation
  for (let i = 0; i < 6; i++) scenarios.push(
    scenario("confirmed", "booked", "verbal-confirmed", [],
      "INBOUND", "edge", 4,
      "Vendor expresses empathy: 'I understand plans can change', 'flexibility if needed'. NOT a cancellation - still booked. No question asked.",
      ["edge", "empathy-not-cancel"],
      { previousStatus: "confirmed" })
  );

  // Question about deposit is NOT deposit-paid
  for (let i = 0; i < 5; i++) scenarios.push(
    scenario("contracted", "booked", "deposit-requested", ["pay-deposit", "reply-needed"],
      "INBOUND", "edge", 4,
      "Vendor asks ABOUT deposit: 'When can you send the deposit?', 'Did you get my invoice?' - deposit NOT yet paid. Includes question.",
      ["edge", "deposit-question"],
      { previousStatus: "contracted" })
  );

  // Positive language with price is NOT booking
  for (let i = 0; i < 6; i++) scenarios.push(
    scenario("quote-received", "quoted", "budget-unknown", ["review-quote"],
      "INBOUND", "edge", 4,
      "Vendor uses positive language WITH a price but NO booking commitment: 'sounds great! Our rate is $1,500' or 'happy to help! $2,000 for the day'. This is QUOTED, not booked.",
      ["edge", "positive-not-booked"],
      { previousStatus: "rfq-sent" })
  );

  // ============================================
  // NEEDS-REVIEW - Ambiguous cases for AI escape hatch
  // ============================================

  // Ambiguous: "confirmed" but unclear what's confirmed
  for (let i = 0; i < 5; i++) scenarios.push(
    scenario("quote-received", "quoted", null, ["needs-review"],
      "INBOUND", "edge", 4,
      "Vendor uses word 'confirmed' but context is UNCLEAR - could mean availability confirmed or booking confirmed. Example: 'Confirmed, I can do March 15th' (is this availability or booking?). AI should be uncertain.",
      ["ambiguous", "confirmed-unclear"],
      { previousStatus: "rfq-sent" })
  );

  // Ambiguous: Multiple dates mentioned
  for (let i = 0; i < 4; i++) scenarios.push(
    scenario("quote-received", "quoted", null, ["needs-review"],
      "INBOUND", "edge", 4,
      "Vendor mentions MULTIPLE dates making it unclear which is relevant: 'I'm free March 15th and also the 22nd, either works. Price is $1,500.' Hard to know which date is being quoted.",
      ["ambiguous", "multiple-dates"],
      { previousStatus: "rfq-sent" })
  );

  // Ambiguous: Contract mentioned but unclear if sent or signed
  for (let i = 0; i < 4; i++) scenarios.push(
    scenario("confirmed", "booked", null, ["needs-review"],
      "INBOUND", "edge", 4,
      "Vendor mentions 'contract' but UNCLEAR if it's being sent or already signed: 'Got the contract sorted' or 'Contract is good'. Is it sent or signed? AI should flag for review.",
      ["ambiguous", "contract-unclear"],
      { previousStatus: "confirmed" })
  );

  // Ambiguous: Forwarded email with unclear speaker
  for (let i = 0; i < 4; i++) scenarios.push(
    scenario("quote-received", "quoted", null, ["needs-review"],
      "INBOUND", "edge", 4,
      "Write a FORWARDED email where it's unclear who is speaking - contains quoted text from both planner and vendor. Include 'FW:' or '------Forwarded message------'. Hard to determine current state.",
      ["ambiguous", "forwarded"],
      { previousStatus: "rfq-sent" })
  );

  // Ambiguous: Sarcasm or unclear tone
  for (let i = 0; i < 3; i++) scenarios.push(
    scenario("quote-received", "quoted", null, ["needs-review"],
      "INBOUND", "edge", 4,
      "Response where tone is unclear - could be acceptance or rejection: 'Sure, $3,000, why not' or 'Great, another client who wants a discount'. Sarcastic? Genuine? AI should be uncertain.",
      ["ambiguous", "unclear-tone"],
      { previousStatus: "rfq-sent" })
  );

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
            // V1 model (LEGACY - for backward compat only)
            expectedStatus: scenario.legacyStatus,
            previousStatus: scenario.previousStatus || null,
            // V2 model (primary/sub/actions) - THE ACTUAL TEST EXPECTATIONS
            expectedPrimaryStatus: scenario.primaryStatus,
            expectedSubStatus: scenario.subStatus,
            expectedActions: scenario.actions,
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
EXPECTED STATUS: ${scenario.primaryStatus}/${scenario.subStatus} (actions: ${scenario.actions.join(", ") || "none"})
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

  const key = `${scenario.legacyStatus}-${scenario.direction}`;
  const template = templates[key] || {
    subject: `Re: ${scenario.legacyStatus}`,
    body: `This is a test email for ${scenario.primaryStatus} (${scenario.direction}).`,
  };

  return {
    ...template,
    notes: `Template-generated for ${scenario.primaryStatus}/${scenario.subStatus} (${scenario.scenario})`,
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


