import { db } from "@/lib/db/client";

/**
 * A compact memo of what tools already established in this conversation -
 * orders looked up, returns opened, tickets raised - injected into the agent
 * prompt so context survives across turns regardless of the model.
 *
 * Tool results are not persisted as chat messages, so without this the model
 * only has its own prior prose; a small model then re-asks for an order number
 * it resolved a turn ago. This reads the ToolExecution rows for the
 * conversation and turns the successful ones into a few plain lines.
 */
export async function buildConversationMemory(conversationId: string | null): Promise<string | null> {
  if (!conversationId) return null;
  const execs = await db.toolExecution.findMany({
    where: { conversationId, status: "SUCCESS" },
    orderBy: { createdAt: "asc" },
    take: 20,
    include: { tool: { select: { name: true } } },
  });
  if (!execs.length) return null;

  const lines: string[] = [];
  const seenOrders = new Set<string>();
  for (const e of execs) {
    const out = (e.output && typeof e.output === "object" && !Array.isArray(e.output) ? e.output : {}) as Record<string, unknown>;
    const name = e.tool.name;
    if (name === "get_order" && out.found) {
      const num = String(out.orderNumber ?? "");
      if (seenOrders.has(num)) continue;
      seenOrders.add(num);
      const items = Array.isArray(out.items) ? (out.items as Array<Record<string, unknown>>) : [];
      const item = items[0] || {};
      lines.push(`Order ${num}: ${item.name ?? "item"} (${item.sku ?? "?"}), delivered ${out.daysSinceDelivery} days ago, ${item.withinReturnWindow ? `within its ${item.returnWindowDays}-day return window` : `PAST its ${item.returnWindowDays}-day return window`}.`);
    } else if (name === "create_return_request") {
      lines.push(out.accepted
        ? `Return for ${out.orderNumber ?? "the order"} is ACCEPTED (RMA ${out.rmaNumber}).`
        : `Return for ${out.orderNumber ?? "the order"} was DECLINED (${out.declineReason ?? "outside window"}).`);
    } else if (name === "escalate_to_support") {
      lines.push(`Support ticket ${out.ticketNumber} is already open for this conversation.`);
    }
  }
  if (!lines.length) return null;
  return `CONVERSATION MEMORY (already established with tools this chat - use it, do not ask the customer to repeat an order number you already looked up, and do not re-open a ticket that is already open):\n${lines.map((l) => `- ${l}`).join("\n")}`;
}
