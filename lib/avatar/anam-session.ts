import "server-only";

/**
 * Server-side ONLY. Exchanges the permanent ANAM_API_KEY for a short-lived
 * session token. Never import this from a client component.
 *
 * Docs verified against api.anam.ai/v1/auth/session-token (POST). The request
 * shape shown here (personaConfig + maxSessionLengthSeconds) is current as of
 * the Anam JS SDK v4-era API; confirm field names against the version you
 * install, since Anam has changed this endpoint before (it used to be GET).
 */

const ANAM_SESSION_TOKEN_URL = "https://api.anam.ai/v1/auth/session-token";

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
    // NO llmId on purpose: omitting it disables Anam's built-in brain so your
    // existing agent owns every answer. If your SDK version needs an explicit
    // flag instead of omission, set it here (verify in the Anam changelog).
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
