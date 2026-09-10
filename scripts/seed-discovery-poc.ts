import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { ingestKnowledgeSource } from "@/lib/ingestion/pipeline";
import { catalogAsProse } from "@/lib/discovery/catalog";
import type { AgentConfig } from "@/lib/agents/agent-config";

/**
 * NOVA - the Discovery agent (PRD Phase 2), on the SAME runtime as SAM. Proves
 * "type = configuration": a second bot with a Discovery objective, consultative
 * policy, the audio catalog as knowledge, and pre-transaction tools - no
 * shared-runtime change. Run:
 *
 *   set -a; source .env; set +a; npx -y tsx scripts/seed-discovery-poc.ts
 */
const db = new PrismaClient();
const PUBLIC_KEY = "nova-discovery-poc";

const AGENT_CONFIG: AgentConfig = {
  version: 1,
  type: "discovery",
  objective: {
    goal: "Help the shopper choose the right audio product with confidence and reach a qualified add-to-cart - by understanding their needs, then recommending honestly from the catalog.",
    successState: "qualified_add_to_cart",
  },
  kpiProfile: "conversion",
  channels: { avatar: "inherit", avatarAbTest: true, avatarAbAllocation: 50 },
  persona: {
    role: "the shopping assistant for AudioHub, an audio-electronics store",
    style: "A knowledgeable, upbeat sales associate - consultative, never pushy. You help people decide; you do not pressure them.",
    alwaysFriendly: true,
    smallTalk: [
      { say: "hi / hello", reply: "Hi! Looking for headphones, earbuds, a speaker, or a soundbar today?" },
      { say: "thanks", reply: "Anytime! Want me to compare a couple of these, or shall I add one to your cart?" },
    ],
    voiceNotes: "Keep spoken answers short: name 2-3 options with a one-line reason each, then ask which to explore.",
  },
  rules: [
    "Recommend from the catalog only. Never invent a product, price, spec or availability.",
    "Lead a considered purchase: understand the need, then guide to a confident decision - do not close prematurely, and do not hard-sell.",
    "When you present options, give each a one-line reason it fits what the shopper said, and name an honest trade-off.",
  ],
  guardrails: {
    groundedFacts: { enabled: true, domains: "product specs, prices, stock, connectivity, battery, water resistance and use-case fit" },
    policyPrecedence: { enabled: false, order: "", example: "" },
    professionalAdvice: { enabled: false, label: "clinical", allowed: "", forbidden: "", fallback: "", purchasingNote: "" },
    noAuthority: { enabled: true, actions: ["invent a discount or coupon", "promise a price other than the catalog price", "promise stock for an out-of-stock item", "promise a delivery date"] },
    promotions: { enabled: true },
    privacy: { enabled: true },
    uncertainIdentifiers: { enabled: true, note: "" },
    escalation: { enabled: true, triggers: ["a product complaint or defect", "an existing order or return", "anything the catalog does not cover", "a request for a human"] },
    language: { enabled: true, note: "You can currently chat in English only here." },
  },
  actions: {
    explicitConsent: true,
    oneTicketPerConversation: false,
    fillers: true,
    flow: `SHOPPING FLOW (tools): you have search_catalog_ranked, compare_products, check_availability and add_to_cart.
1. On a vague request ("something for a small apartment", "headphones for the gym"), ASK ONE clarifying question first - budget, room size, or main use - before recommending. Do not guess.
2. Once you have a use-case and ideally a budget, call search_catalog_ranked with the constraints (category, budgetMax, useCases, roomSize, mustHaves). Present the ranked shortlist it returns: name each option with its price and the one-line reason from the tool, and mention its honest caveat. Never add an item the tool did not return, and never recommend one it excluded for stock.
3. If the shopper weighs two, call compare_products on the named attribute and give them the side-by-side.
4. Guide toward a decision: after the shortlist, ask which one they'd like, or offer to compare. When they choose, call add_to_cart. Only call add_to_cart when they clearly pick an item - a browse is not consent.
5. Be honest about limits: if a spec is "water-resistant" do not call it "waterproof"; if the best match is out of stock, say so and offer the in-stock alternative the tool gives. Never include an out-of-stock item in a \"which would you like\" choice - mention it only to say it is unavailable, then steer to what is in stock.`,
  },
  robustness: {
    validatorMode: "audit",
    blockedActionReply: "I want to be accurate: I haven't actually added that to your cart yet. Shall I add it now?",
  },
};

async function main() {
  const passwordHash = await bcrypt.hash("password123", 12);
  const user = await db.user.upsert({
    where: { email: "piper-poc@example.com" },
    update: {},
    create: { email: "piper-poc@example.com", passwordHash, name: "Avatar POC" },
  });
  const workspace = await db.workspace.upsert({
    where: { slug: "piper-poc" },
    update: {},
    create: { name: "DentalPilot POC", slug: "piper-poc", ownerId: user.id },
  });

  const botConfig = {
    name: "NOVA",
    description: "AudioHub Discovery agent (PRD Phase 2, synthetic audio catalog)",
    welcomeMessage: "Hi, I'm NOVA, AudioHub's shopping assistant. Tell me what you're shopping for - headphones, earbuds, a speaker, or a soundbar - and what matters most, and I'll find the right fit.",
    tone: "friendly",
    strictness: "balanced",
    fallbackBehavior: "contact",
    contactInfo: "AudioHub support: help@audiohub-demo.example",
    privacyNotice: "NOVA is an AI shopping assistant and may make mistakes. Voice conversations may be transcribed and stored with your chat history to provide support and improve this demonstration.",
    systemPrompt: null as string | null,
    agentConfig: JSON.parse(JSON.stringify(AGENT_CONFIG)),
    suggestedQuestions: [
      "I need quiet headphones for the office, under $200",
      "A soundbar for a small living room under $300",
      "Waterproof earbuds for the gym",
      "Compare the Aria Quiet 700 and the Aria Studio 400",
    ],
    isActive: true,
    publishedVersion: 1,
  };
  const bot = await db.bot.upsert({
    where: { publicKey: PUBLIC_KEY },
    update: botConfig,
    create: { publicKey: PUBLIC_KEY, publishedAt: new Date(), workspaceId: workspace.id, ...botConfig },
  });

  // Catalog as knowledge (RAG) for factual Q&A; the ranker tool does recommendations.
  const KN = "AudioHub audio catalog";
  let source = await db.knowledgeSource.findFirst({ where: { botId: bot.id, name: KN } });
  if (!source) {
    source = await db.knowledgeSource.create({ data: { botId: bot.id, type: "MANUAL", name: KN, metadata: { content: catalogAsProse() } } });
  }
  if (source.status !== "COMPLETED") {
    await ingestKnowledgeSource(source.id);
    source = (await db.knowledgeSource.findUnique({ where: { id: source.id } }))!;
  }
  if (source.status !== "COMPLETED") throw new Error(`${KN}: ${source.status} ${source.errorMessage}`);
  const chunks = await db.documentChunk.count({ where: { document: { knowledgeSourceId: source.id } } });
  console.log(`knowledge "${KN}" ${source.status}, ${chunks} chunks`);

  // Pre-transaction tools (R2.4) - each a registry row, no refund/ticket tools.
  const appUrl = process.env.APP_URL || "http://localhost:3000";
  const host = new URL(appUrl).hostname;
  const tools = [
    {
      name: "search_catalog_ranked",
      description: "Recommend audio products. Pass the shopper's constraints and get a ranked, in-stock, within-budget shortlist with a reason for each. category is one of over_ear_headphones, earbuds, soundbar, bluetooth_speaker, bookshelf_speaker. useCases can include small_room, medium_room, large_room, home_theater, office, commute, gym, calls, gaming, audiophile. mustHaves/niceToHaves can include noise_cancelling, wireless, water_resistant, battery, hdmi_arc, wifi, bluetooth. Only recommend items this returns.",
      method: "POST", endpoint: `${appUrl}/api/discovery/search`, riskTier: "READ_ONLY" as const,
      inputSchema: { type: "object", properties: {
        category: { type: "string" }, budgetMax: { type: "number" }, budgetMin: { type: "number" },
        useCases: { type: "array", items: { type: "string" } }, roomSize: { type: "string", enum: ["small", "medium", "large"] },
        mustHaves: { type: "array", items: { type: "string" } }, niceToHaves: { type: "array", items: { type: "string" } },
        limit: { type: "number" } }, required: [] },
    },
    {
      name: "check_availability",
      description: "Check whether a specific SKU is in stock; returns an in-stock alternative if it is not.",
      method: "GET", endpoint: `${appUrl}/api/discovery/availability`, riskTier: "READ_ONLY" as const,
      inputSchema: { type: "object", properties: { sku: { type: "string", description: "e.g. AUD-101" } }, required: ["sku"] },
    },
    {
      name: "compare_products",
      description: "Compare two or three SKUs on named attributes (price, noise_cancelling, battery, water_resistance, room_size, connectivity, use_cases). Returns each SKU's real value so you never overstate a spec.",
      method: "POST", endpoint: `${appUrl}/api/discovery/compare`, riskTier: "READ_ONLY" as const,
      inputSchema: { type: "object", properties: { skus: { type: "array", items: { type: "string" } }, attributes: { type: "array", items: { type: "string" } } }, required: ["skus"] },
    },
    {
      name: "add_to_cart",
      description: "Add a chosen product to the cart (demo - no payment). Call only when the shopper clearly picks an item. Refuses out-of-stock items.",
      method: "POST", endpoint: `${appUrl}/api/discovery/cart`, riskTier: "WRITE" as const,
      inputSchema: { type: "object", properties: { sku: { type: "string" }, quantity: { type: "number" } }, required: ["sku"] },
    },
  ];
  for (const tool of tools) {
    const existing = await db.tool.findFirst({ where: { botId: bot.id, name: tool.name } });
    const data = { ...tool, botId: bot.id, kind: "HTTP_REQUEST" as const, approvalMode: "AUTO" as const, isActive: true, allowedDomains: [host] };
    if (existing) await db.tool.update({ where: { id: existing.id }, data });
    else await db.tool.create({ data });
  }
  console.log(`tools: ${tools.map((t) => t.name).join(", ")}`);

  await db.bot.update({ where: { id: bot.id }, data: { publishedSourceIds: [source.id] } });
  console.log(`bot ${bot.id} (${bot.name}) -> http://localhost:3000/embed/${bot.publicKey}`);
  await db.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
