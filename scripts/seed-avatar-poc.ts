import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

/**
 * Minimal fixture for the avatar POC: one user, one workspace, one PUBLISHED
 * bot with a stable public key, so /embed/piper-avatar-poc renders without
 * walking the whole dashboard flow. Milestone 1 (avatar renders + greeting)
 * needs no LLM key; suggestedQuestions is pre-filled so the embed page does
 * not try to lazily generate them via the provider.
 *
 *   node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --experimental-strip-types scripts/seed-avatar-poc.ts
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
  console.log(`bot ${bot.id} -> http://localhost:3000/embed/${bot.publicKey}`);
  await db.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
