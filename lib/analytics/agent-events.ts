import { createHash } from "crypto";
import { db } from "@/lib/db/client";

/**
 * Server-emitted lifecycle events for the two agent types (PRD R1.1 success
 * state, R2.7 conversion instrumentation). Written to PlatformEvent with a
 * hashed session id so they are control-eligible for the Phase-3 A/B and can
 * be joined to an experiment arm.
 *
 * Support: `support.resolved` when a turn ends without a handoff.
 * Discovery: `discovery.needs_elicited` (first ranked search),
 * `discovery.shortlist_delivered`, `discovery.compare_run`,
 * `discovery.add_to_cart` (the CONVERT success state).
 */
const TOOL_EVENT: Record<string, string> = {
  search_catalog_ranked: "discovery.shortlist_delivered",
  compare_products: "discovery.compare_run",
  add_to_cart: "discovery.add_to_cart",
};

function sessionHash(sessionId: string): string {
  return createHash("sha256")
    .update(`${process.env.AUDIT_HASH_SALT || process.env.JWT_SECRET || "obc"}:${sessionId}`)
    .digest("hex")
    .slice(0, 40);
}

export async function emitAgentEvents(input: {
  botId: string;
  workspaceId: string;
  sessionId: string;
  experimentId?: string | null;
  experimentVariant?: string | null;
  kpiProfile?: string;
  toolCalls: Array<{ name: string; status: string }>;
  isRefused: boolean;
  handoff: boolean;
  firstSearchThisConversation: boolean;
}): Promise<void> {
  const base = {
    botId: input.botId,
    workspaceId: input.workspaceId,
    sessionHash: sessionHash(input.sessionId),
  };
  const meta = { experimentId: input.experimentId ?? undefined, arm: input.experimentVariant ?? undefined };
  const types = new Set<string>();

  for (const t of input.toolCalls) {
    if (t.status !== "success") continue;
    const ev = TOOL_EVENT[t.name];
    if (ev) types.add(ev);
    if (t.name === "search_catalog_ranked" && input.firstSearchThisConversation) types.add("discovery.needs_elicited");
  }
  // Support success state: resolved without a human (no handoff, not refused).
  if (input.kpiProfile === "resolution" && !input.handoff && !input.isRefused) types.add("support.resolved");

  if (!types.size) return;
  try {
    await db.platformEvent.createMany({
      data: [...types].map((type) => ({ type, ...base, metadata: meta })),
    });
  } catch {
    // Instrumentation must never break the chat turn.
  }
}
