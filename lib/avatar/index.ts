/**
 * Public surface of the avatar module.
 *
 * - Server code imports createAnamSessionToken (holds the API key).
 * - Client code imports createAvatarProvider + the AvatarProvider type.
 *
 * To add a vendor later: implement AvatarProvider in providers/<vendor>.ts and
 * extend the switch in createAvatarProvider. Nothing else changes.
 */

export type { AvatarProvider, AvatarStatus, Unsubscribe } from "./types";
export { createAnamSessionToken } from "./anam-session";

export type AvatarVendor = "anam" /* | "tavus" | "simli" */;

export async function createAvatarProvider(
  vendor: AvatarVendor,
  sessionToken: string
): Promise<import("./types").AvatarProvider> {
  switch (vendor) {
    case "anam": {
      // Dynamic import keeps the vendor SDK out of the server bundle.
      const { AnamProvider } = await import("./providers/anam");
      return AnamProvider.fromSessionToken(sessionToken);
    }
    default:
      throw new Error(`Unsupported avatar vendor: ${vendor}`);
  }
}
