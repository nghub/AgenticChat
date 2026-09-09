import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  getClientIp,
  rateLimit,
  rateLimitHeaders,
} from "@/lib/security/rate-limit";
import { isOriginAllowed } from "@/lib/bots/origin-policy";
import { resolvePublicBotKey } from "@/lib/bots/public-key";
import { createAnamSessionToken } from "@/lib/avatar/anam-session";

/**
 * POST /api/public/avatar-session
 *
 * Mints a short-lived Anam session token so the browser NEVER sees the
 * permanent ANAM_API_KEY. Mirrors the security posture of /api/public/chat:
 * same public-key resolution, origin allow-list, and rate limiting.
 *
 * IMPORTANT (cost guard): avatar minutes are billed from session start until
 * end regardless of whether anyone is speaking, so this endpoint is the ONLY
 * place an avatar session may be created — never on page load. It also caps
 * session length server-side (see ANAM_MAX_SESSION_SECONDS) so a stuck client
 * can't burn the free-tier allowance.
 */

const bodySchema = z.object({
  publicKey: z.string().min(1),
  // Same conversation the text chat already uses. Optional: the client may
  // request a token before it has a sessionId (first message not sent yet).
  sessionId: z.string().optional(),
  origin: z.string().url().max(500).optional(),
});

// Avatar sessions cost money — keep this tighter than the chat limit.
const AVATAR_SESSION_LIMIT = Number(process.env.PUBLIC_AVATAR_RATE_LIMIT_REQUESTS || 5);
const AVATAR_SESSION_WINDOW = Number(process.env.PUBLIC_AVATAR_RATE_LIMIT_WINDOW_SECONDS || 60);

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);

  try {
    const body = await req.json();
    const { publicKey, sessionId, origin } = bodySchema.parse(body);

    const limitResult = await rateLimit({
      key: `${publicKey}:${ip}`,
      namespace: "public-avatar-session",
      limit: AVATAR_SESSION_LIMIT,
      windowSeconds: AVATAR_SESSION_WINDOW,
    });
    const limitHeaders = rateLimitHeaders(limitResult);

    if (!limitResult.allowed) {
      return NextResponse.json(
        {
          error: "Too many voice sessions started. Please wait a moment.",
          retryAfterSeconds: limitResult.retryAfterSeconds,
        },
        { status: 429, headers: limitHeaders }
      );
    }

    const resolved = await resolvePublicBotKey(publicKey);
    const bot = resolved?.bot;

    if (!bot || !bot.isActive) {
      return NextResponse.json(
        { error: "Chatbot not found or inactive" },
        { status: 404, headers: limitHeaders }
      );
    }

    if (!isOriginAllowed(bot.allowedOrigins, origin)) {
      return NextResponse.json(
        { error: "This chatbot is not approved for this website." },
        { status: 403, headers: limitHeaders }
      );
    }

    // Ask Anam for a token. The persona here is only the FACE + VOICE —
    // no llmId is sent, so Anam's built-in brain stays disabled and your
    // existing agent remains the source of every answer. See lib/avatar.
    const { sessionToken, maxSessionSeconds, avatarId } =
      await createAnamSessionToken({
        botName: bot.name,
        // Passed through only as a client label for Anam's dashboard/analytics.
        clientLabel: sessionId ? `conv:${sessionId}` : `bot:${bot.id}`,
      });

    return NextResponse.json(
      { sessionToken, maxSessionSeconds, avatarId },
      { headers: limitHeaders }
    );
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: err.issues[0]?.message || err.message },
        { status: 400 }
      );
    }
    // Never leak the vendor key or raw upstream error to the browser.
    console.error("Avatar session error:", err);
    return NextResponse.json(
      { error: "Voice mode is unavailable right now. You can keep chatting by text." },
      { status: 502 }
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
