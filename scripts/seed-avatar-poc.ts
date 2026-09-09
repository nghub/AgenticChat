import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { ingestKnowledgeSource } from "@/lib/ingestion/pipeline";

/**
 * Minimal fixture for the avatar POC: one user, one workspace, one PUBLISHED
 * bot with a stable public key and one paragraph of knowledge, so
 * /embed/piper-avatar-poc renders and can answer without walking the whole
 * dashboard flow. suggestedQuestions is pre-filled so the embed page does not
 * try to lazily generate them via the provider.
 *
 * Ingesting the knowledge embeds it, so an LLM provider must be configured in
 * .env (LLM_PROVIDER + its key). Uses "@/" imports, hence tsx:
 *
 *   set -a; source .env; set +a; npx -y tsx scripts/seed-avatar-poc.ts
 */
const db = new PrismaClient();
const PUBLIC_KEY = "piper-avatar-poc";

async function main() {
  const passwordHash = await bcrypt.hash("password123", 12);
  const user = await db.user.upsert({
    where: { email: "piper-poc@example.com" },
    update: {},
    create: { email: "piper-poc@example.com", passwordHash, name: "Piper POC" },
  });
  const workspace = await db.workspace.upsert({
    where: { slug: "piper-poc" },
    update: {},
    create: { name: "Piper POC", slug: "piper-poc", ownerId: user.id },
  });
  const bot = await db.bot.upsert({
    where: { publicKey: PUBLIC_KEY },
    update: { isActive: true, publishedVersion: 1 },
    create: {
      publicKey: PUBLIC_KEY,
      name: "Piper",
      description: "Avatar POC bot",
      welcomeMessage: "Hi, I'm Piper. Ask me anything about our products, or just say hello.",
      tone: "friendly",
      strictness: "balanced",
      isActive: true,
      publishedVersion: 1,
      publishedAt: new Date(),
      suggestedQuestions: ["What can you help me with?", "How do I get started?"],
      workspaceId: workspace.id,
    },
  });
  // One paragraph the agent can actually answer from. Grounding is enforced
  // in code, so with zero sources every question is refused before any model
  // runs - fine for milestone 1, useless for hearing a real answer.
  const KNOWLEDGE_NAME = "About Piper Coffee";
  const content = [
    "Piper Coffee Roasters is a small specialty coffee company based in Portland, Oregon, founded in 2019 by Maya Chen.",
    "We roast single-origin beans from Ethiopia, Colombia and Guatemala in small batches every Tuesday and Thursday.",
    "Our cafe at 412 Alder Street is open Monday to Friday from 7am to 6pm and on weekends from 8am to 4pm.",
    "We ship whole-bean coffee anywhere in the United States; orders over 40 dollars ship free and usually arrive within three business days.",
    "Unopened bags can be returned within 30 days for a full refund. Opened bags cannot be returned, but if you are unhappy with a roast, email hello@pipercoffee.example and we will send a replacement.",
    "We offer a monthly subscription: choose one, two or three bags a month, pause or cancel any time, and subscribers get 10 percent off everything in the cafe.",
    "Wholesale accounts for cafes and offices start at 5 kilograms a week; contact wholesale@pipercoffee.example for pricing.",
  ].join(" ");

  let source = await db.knowledgeSource.findFirst({ where: { botId: bot.id, name: KNOWLEDGE_NAME } });
  if (!source) {
    source = await db.knowledgeSource.create({
      data: { botId: bot.id, type: "MANUAL", name: KNOWLEDGE_NAME, metadata: { content } },
    });
  }
  if (source.status !== "COMPLETED") {
    await ingestKnowledgeSource(source.id);
    source = (await db.knowledgeSource.findUnique({ where: { id: source.id } }))!;
  }
  if (source.status !== "COMPLETED") throw new Error(`ingestion ended in ${source.status}: ${source.errorMessage}`);

  // The published bot only sees sources listed here; a seeded bot has no
  // BotVersion row, so agenticChat falls back to this column.
  await db.bot.update({ where: { id: bot.id }, data: { publishedSourceIds: [source.id] } });
  const chunks = await db.documentChunk.count({ where: { document: { knowledgeSourceId: source.id } } });

  console.log(`bot ${bot.id} -> http://localhost:3000/embed/${bot.publicKey}`);
  console.log(`knowledge ${source.id} ${source.status}, ${chunks} chunk(s) embedded`);
  await db.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
