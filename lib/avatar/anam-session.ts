import "server-only";

/**
 * Server-side ONLY. Exchanges the permanent ANAM_API_KEY for a short-lived
 * session token. Never import this from a client component.
 *
 * VERIFIED against the live api.anam.ai on 2026-09-09 (POST
 * /v1/auth/session-token). Confirmed: personaConfig with name/avatarId/voiceId,
 * maxSessionLengthSeconds, and skipGreeting are all accepted, and the returned
 * token carries a 1-hour TTL.
 *
 * Token type depends on the body, and the difference matters:
 *   - personaConfig + llmId CUSTOMER_CLIENT_V1  -> "ephemeral"  (what we want)
 *   - personaConfig without llmId               -> "legacy"     (default brain!)
 *   - personaConfig: { personaId }              -> "stateful"   (saved persona's
 *     own brain answers, so only use it for a persona whose LLM is disabled)
 *   - a TOP-LEVEL personaId is silently IGNORED and returns 200 with a legacy
 *     token, so do not write it that way.
 */

const ANAM_SESSION_TOKEN_URL = "https://api.anam.ai/v1/auth/session-token";

/**
 * Anam's catalogue entry that turns OFF their built-in brain (GET /v1/llms
 * lists it as displayName "Disable LLM", llmFormat "none"). This MUST be sent
 * explicitly.
 *
 * Verified against the live API on 2026-09-09: OMITTING llmId does NOT disable
 * the brain - it mints a `type: "legacy"` token that falls back to a default
 * model, so Anam would answer alongside agenticChat() and we would ship the
 * exact "second agent" this POC exists to avoid. Sending this id mints a
 * `type: "ephemeral"` token instead, which is the shape we want.
 *
 * Not an env var on purpose: any other value silently reintroduces a second
 * brain, and that is not a per-deployment decision.
 */
const ANAM_LLM_DISABLED = "CUSTOMER_CLIENT_V1";

// Hard POC cost guard: cap every session at 2 minutes even though the free
// tier technically allows 3. Overridable by env, but never above the free cap.
const DEFAULT_MAX_SESSION_SECONDS = 120;

export interface AnamTokenResult {
  sessionToken: string;
  maxSessionSeconds: number;
  avatarId: string;
}

export async function createAnamSessionToken(opts: {
  botName: string;
  clientLabel?: string;
}): Promise<AnamTokenResult> {
  const apiKey = process.env.ANAM_API_KEY;
  const avatarId = process.env.ANAM_AVATAR_ID;
  const voiceId = process.env.ANAM_VOICE_ID;

  if (!apiKey) throw new Error("ANAM_API_KEY is not configured");
  if (!avatarId) throw new Error("ANAM_AVATAR_ID is not configured");
  if (!voiceId) throw new Error("ANAM_VOICE_ID is not configured");

  const envCap = Number(process.env.ANAM_MAX_SESSION_SECONDS || DEFAULT_MAX_SESSION_SECONDS);
  const maxSessionSeconds = Math.min(
    Number.isFinite(envCap) && envCap > 0 ? envCap : DEFAULT_MAX_SESSION_SECONDS,
    180 // free-tier ceiling; never request more
  );

  const personaConfig: Record<string, unknown> = {
    name: opts.botName || "Piper",
    avatarId,
    voiceId,
    // Explicitly disable Anam's brain so agenticChat() owns every answer.
    // See ANAM_LLM_DISABLED above - omission is NOT enough.
    llmId: ANAM_LLM_DISABLED,
    maxSessionLengthSeconds: maxSessionSeconds,
    // The greeting is spoken by YOUR agent after context is copied in, so skip
    // Anam's default greeting to avoid a duplicate "Hi, how can I help?".
    skipGreeting: true,
  };

  const res = await fetch(ANAM_SESSION_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      clientLabel: opts.clientLabel,
      personaConfig,
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Anam session-token request failed (HTTP ${res.status}): ${detail.slice(0, 300)}`);
  }

  const data = (await res.json()) as { sessionToken?: string };
  if (!data.sessionToken) throw new Error("Anam response did not include a sessionToken");

  return { sessionToken: data.sessionToken, maxSessionSeconds, avatarId };
}
