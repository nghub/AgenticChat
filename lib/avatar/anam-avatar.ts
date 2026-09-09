import "server-only";

import type { AvatarImages } from "./types";

/**
 * Static stills of the avatar for the idle card, so the visitor sees the face
 * before committing to a (billed) session - the Salesforce "Piper" pattern.
 *
 * Fetched server-side with the API key (GET /v1/avatars/{id}, verified
 * 2026-09-09) and cached for a day; the URLs it returns are public CDN
 * assets the browser can load directly. Never throws: a missing image
 * degrades to a placeholder, not a broken embed.
 */
export async function getAnamAvatarImages(
  avatarId: string | undefined = process.env.ANAM_AVATAR_ID
): Promise<AvatarImages | null> {
  const apiKey = process.env.ANAM_API_KEY;
  if (!apiKey || !avatarId) return null;
  try {
    const res = await fetch(`https://api.anam.ai/v1/avatars/${encodeURIComponent(avatarId)}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      next: { revalidate: 86400 },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as Partial<Record<keyof AvatarImages, string>>;
    return {
      landscapeImageUrl: data.landscapeImageUrl ?? null,
      portraitImageUrl: data.portraitImageUrl ?? null,
      imageUrl: data.imageUrl ?? null,
    };
  } catch (err) {
    console.warn("Anam avatar image lookup failed:", err);
    return null;
  }
}
