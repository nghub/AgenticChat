/**
 * Public surface of the avatar module - CLIENT-SAFE.
 *
 * This barrel is imported by client components, so it must never re-export
 * anything that touches ANAM_API_KEY. Server code imports the token minter
 * directly from "@/lib/avatar/anam-session" (which is guarded by
 * `import "server-only"` and will fail the build if it ever leaks into a
 * client bundle - that guard is what caught the original version of this file).
 *
 * To add a vendor later: implement AvatarProvider in providers/<vendor>.ts and
 * extend the switch in createAvatarProvider. Nothing else changes.
 */

export type { AvatarProvider, AvatarStatus, AvatarImages, Unsubscribe } from "./types";

export type AvatarVendor = "anam" /* | "tavus" | "simli" */;

export async function createAvatarProvider(
  vendor: AvatarVendor,
  sessionToken: string
): Promise<import("./types").AvatarProvider> {
  switch (vendor) {
    case "anam": {
      // Dynamic import keeps the vendor SDK out of the initial bundle.
      const { AnamProvider } = await import("./providers/anam");
      return AnamProvider.fromSessionToken(sessionToken);
    }
    default:
      throw new Error(`Unsupported avatar vendor: ${vendor}`);
  }
}
