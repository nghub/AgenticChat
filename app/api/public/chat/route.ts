import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { agenticChat } from "@/lib/agents/agent-chat";
import {
  getClientIp,
  getPublicChatRateLimitConfig,
  rateLimit,
  rateLimitHeaders,
} from "@/lib/security/rate-limit";
import { isOriginAllowed } from "@/lib/bots/origin-policy";
import { recordKnowledgeGap } from "@/lib/rag/knowledge-gaps";
import { evaluateHandoff } from "@/lib/conversations/handoff";
import { createHash } from "crypto";
import { isProductionVersionApproved } from "@/lib/bots/production-policy";
import { resolvePublicBotKey } from "@/lib/bots/public-key";
import { voiceGreeting } from "@/lib/agents/voice-greeting";
import { validateAnswer } from "@/lib/agents/output-validator";
import { normalizeAgentConfig } from "@/lib/agents/agent-config";
import { redactPii } from "@/lib/security/pii";
import { emitAgentEvents } from "@/lib/analytics/agent-events";
import { resolveResponseLanguage } from "@/lib/i18n/languages";
import { getMessages } from "@/lib/i18n/messages";

const chatSchema = z.object({
  publicKey: z.string().min(1),
  // Optional only for intent requests; a normal turn must carry a message.
  message: z.string().max(2000).optional(),
  // "voice_greeting": the visitor just switched to voice - return what the
  // assistant should say first, continuing the conversation, instead of
  // answering a message.
  intent: z.enum(["voice_greeting"]).optional(),
  sessionId: z.string().optional(),
  origin: z.string().url().max(500).optional(),
  locale: z.string().regex(/^[a-z]{2,3}(-[A-Z]{2})?$/).max(10).optional(),
  // How the visitor produced this turn. VOICE = transcript from the avatar
  // session; defaults to TEXT so existing widgets need no change.
  source: z.enum(["TEXT", "VOICE"]).optional(),
});

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);

  try {
    const body = await req.json();
    const { publicKey, message = "", sessionId, origin, locale, source = "TEXT", intent } = chatSchema.parse(body);
    if (!intent && !message.trim()) {
      return NextResponse.json({ error: "Message is required" }, { status: 400 });
    }

    const limitConfig = getPublicChatRateLimitConfig();

    const limitResult = await rateLimit({
      key: `${publicKey}:${ip}`,
      namespace: "public-chat",
      limit: limitConfig.limit,
      windowSeconds: limitConfig.windowSeconds,
    });

    const limitHeaders = rateLimitHeaders(limitResult);

    if (!limitResult.allowed) {
      return NextResponse.json(
        {
          error: "Too many requests. Please slow down.",
          retryAfterSeconds: limitResult.retryAfterSeconds,
        },
        {
          status: 429,
          headers: limitHeaders,
        }
      );
    }

    const resolved = await resolvePublicBotKey(publicKey);
    const bot = resolved?.bot;

    if (!bot || !bot.isActive) {
      return NextResponse.json(
        { error: "Chatbot not found or inactive" },
        {
          status: 404,
          headers: limitHeaders,
        }
      );
    }
    if (!resolved.environment && !(await isProductionVersionApproved(bot.id, bot.publishedVersion))) return NextResponse.json({ error: "This chatbot version is awaiting production approval." }, { status: 503, headers: limitHeaders });
    if (!isOriginAllowed(bot.allowedOrigins, origin)) {
      return NextResponse.json({ error: "This chatbot is not approved for this website." }, { status: 403, headers: limitHeaders });
    }

    const responseLocale = resolveResponseLanguage(
      message,
      locale,
      bot.supportedLocales,
      bot.defaultLocale
    );

    let conversation;
    if (sessionId) {
      conversation = await db.conversation.findFirst({
        where: { sessionId, botId: bot.id },
        include: { messages: { orderBy: { createdAt: "asc" }, take: 12 } },
      });
    }

    if (intent === "voice_greeting") {
      const history = (conversation?.messages || []).map((m) => ({
        role: m.role.toLowerCase() as "user" | "assistant",
        content: m.content,
      }));
      // No conversation yet: the plain welcome is right, and nothing to persist.
      if (!conversation || !history.some((h) => h.role === "user")) {
        return NextResponse.json({ answer: bot.welcomeMessage, sessionId: conversation?.sessionId ?? null, contextual: false }, { headers: limitHeaders });
      }
      const answer = await voiceGreeting(bot, history, conversation.locale, conversation.id);
      const saved = await db.message.create({
        data: { conversationId: conversation.id, role: "ASSISTANT", content: redactPii(answer), source: "VOICE" },
      });
      return NextResponse.json(
        { answer, sessionId: conversation.sessionId, messageId: saved.id, contextual: true, isRefused: false, locale: conversation.locale, citations: [], handoff: null },
        { headers: limitHeaders }
      );
    }

    if (!conversation) {
      conversation = await db.conversation.create({
        data: {
          botId: bot.id,
          botVersion: resolved.version || null,
          userAgent: req.headers.get("user-agent") || undefined,
          ipAddress: ip,
          locale: responseLocale,
        },
        include: { messages: true },
      });
    }

    if (!conversation.experimentId) {
      const experiment = await db.experiment.findFirst({ where: { botId: bot.id, status: "RUNNING" }, orderBy: { startedAt: "desc" } });
      if (experiment) {
        const bucket = parseInt(createHash("sha256").update(`${experiment.id}:${conversation.sessionId}`).digest("hex").slice(0, 8), 16) % 100;
        const variant = bucket < experiment.allocation ? "variant" : "control";
        conversation = await db.conversation.update({ where: { id: conversation.id }, data: { experimentId: experiment.id, experimentVariant: variant, botVersion: variant === "variant" ? experiment.variantVersion : experiment.controlVersion }, include: { messages: { orderBy: { createdAt: "asc" }, take: 12 } } });
      }
    }

    // Honor either a picker change or a clearly detected language change in
    // the customer's latest message.
    const requestedLocale = responseLocale;
    if (requestedLocale && requestedLocale !== conversation.locale) {
      conversation = await db.conversation.update({
        where: { id: conversation.id },
        data: { locale: requestedLocale },
        include: { messages: { orderBy: { createdAt: "asc" }, take: 12 } },
      });
    }

    const history = conversation.messages.map((m) => ({
      role: m.role.toLowerCase() as "user" | "assistant",
      content: m.content,
    }));

    await db.message.create({
      data: { conversationId: conversation.id, role: "USER", content: redactPii(message), source },
    });

    const startedAt = Date.now();
    const result = await agenticChat(bot.id, message, conversation.id, history, { version: conversation.botVersion || undefined, locale: conversation.locale });
    const latencyMs = Date.now() - startedAt;
    const evidenceScore = result.sources.length ? Math.max(...result.sources.map((source) => source.similarity)) : null;
    // Actions need evidence too: flag "I've sent this to support" when no tool did.
    const agentConfig = bot.agentConfig ? normalizeAgentConfig(bot.agentConfig) : null;
    const validatorMode = agentConfig?.robustness.validatorMode ?? "audit";
    const validator = validatorMode === "off"
      ? { unbackedActionClaim: false as const }
      : validateAnswer(result.answer, result.toolCalls.map((t) => ({ name: t.name, status: t.status })));
    if (validator.unbackedActionClaim) console.warn(`[validator] unbacked action claim in bot ${bot.id} (${validatorMode}): "${validator.claim}"`);
    // "block": never deliver a claimed action no tool performed; say so and offer it instead.
    const blocked = validator.unbackedActionClaim && validatorMode === "block";
    if (blocked) result.answer = agentConfig?.robustness.blockedActionReply || "I want to be accurate with you: I haven't actually completed that step yet. Would you like me to go ahead?";

    const assistantMessage = await db.message.create({
      data: {
        conversationId: conversation.id,
        role: "ASSISTANT",
        content: redactPii(result.answer),
        source, // the answer to a spoken turn was spoken back
        isGrounded: result.isGrounded,
        isRefused: result.isRefused,
        sourceChunkIds: result.sources.map((s) => s.id),
        evidenceScore,
        latencyMs,
        provider: result.usage?.provider,
        model: result.usage?.model,
        inputTokens: result.usage?.inputTokens,
        outputTokens: result.usage?.outputTokens,
        estimatedCostUsd: result.usage?.estimatedCostUsd,
        retrievalTrace: { sourceCount: result.sources.length, toolCallCount: result.toolCalls.length, priceCatalogVersion: result.usage?.priceCatalogVersion, validator: { unbackedActionClaim: validator.unbackedActionClaim, claim: validator.claim ?? null, mode: validatorMode, blocked } },
      },
    });

    if (result.isRefused) await recordKnowledgeGap(bot.id, message);
    const handoff = await evaluateHandoff({
      conversationId: conversation.id,
      userMessage: message,
      isRefused: result.isRefused,
      evidenceScore,
      toolCalls: result.toolCalls,
    }).catch((error) => {
      console.error("Handoff evaluation failed:", error);
      return null;
    });

    // Lifecycle events for the KPI dashboards and the Phase-3 A/B (R1.1/R2.7).
    const priorSearches = await db.toolExecution.count({
      where: { conversationId: conversation.id, status: "SUCCESS", tool: { name: "search_catalog_ranked" } },
    });
    await emitAgentEvents({
      botId: bot.id,
      workspaceId: bot.workspaceId,
      sessionId: conversation.sessionId,
      experimentId: conversation.experimentId,
      experimentVariant: conversation.experimentVariant,
      kpiProfile: agentConfig?.kpiProfile,
      toolCalls: result.toolCalls.map((t) => ({ name: t.name, status: t.status })),
      isRefused: result.isRefused,
      handoff: Boolean(handoff && handoff.status && handoff.status !== "AI_ACTIVE"),
      firstSearchThisConversation: priorSearches <= result.toolCalls.filter((t) => t.name === "search_catalog_ranked" && t.status === "success").length,
    });

    const citations = result.sources
      .filter((source) => source.citationVisibility === "PUBLIC")
      .slice(0, 3)
      .map((source) => ({
        title: source.sourceName || source.documentTitle || "Business knowledge",
        url: source.sourceUrl,
        excerpt: source.content.slice(0, 180),
        updatedAt: source.sourceUpdatedAt,
      }));

    return NextResponse.json(
      {
        answer: result.answer,
        sessionId: conversation.sessionId,
        messageId: assistantMessage.id,
        isRefused: result.isRefused,
        locale: conversation.locale,
        citations,
        handoff: handoff ? {
          status: handoff.status,
          reason: handoff.handoffReason,
          slaDueAt: handoff.slaDueAt,
          message: getMessages(responseLocale).passToTeam,
        } : null,
      },
      {
        headers: limitHeaders,
      }
    );
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: err.issues[0]?.message || err.message },
        { status: 400 }
      );
    }

    console.error("Public chat error:", err);
    return NextResponse.json(
      { error: "Chat service unavailable" },
      { status: 500 }
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
