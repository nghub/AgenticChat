import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createEscalation, findOpenEscalation } from "@/lib/mock/orders";

const schema = z.object({
  orderNumber: z.string().max(40).optional(),
  reason: z.enum(["RETURN_EXCEPTION", "LOW_CONFIDENCE", "PRODUCT_SAFETY", "COUNTERFEIT", "PAYMENT_DISPUTE", "ACCOUNT_SECURITY", "LEGAL_REQUEST", "UNSUPPORTED_PRODUCT", "USER_REQUESTED_HUMAN"]),
  summary: z.string().min(5).max(500),
});

/**
 * POC stand-in for opening a support case; called by the bot's
 * escalate_to_support tool. The only way SAM may say "I've sent this to
 * support" is with the ticket number this returns.
 */
export async function POST(req: NextRequest) {
  try {
    const data = schema.parse(await req.json());
    // One support case per conversation: a second request returns the
    // existing ticket, so a duplicate can never be opened by the model.
    const conversationId = req.headers.get("x-conversation-id") || undefined;
    const existing = conversationId ? findOpenEscalation(conversationId) : undefined;
    if (existing) {
      return NextResponse.json({ created: false, alreadyOpen: true, message: "A support case is already open for this conversation; give the customer this ticket number.", ...existing }, { status: 200 });
    }
    const ticket = createEscalation({ ...data, conversationId });
    return NextResponse.json({ created: true, ...ticket }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: error.issues[0]?.message || "Invalid request" }, { status: 400 });
    return NextResponse.json({ error: "Escalation failed" }, { status: 500 });
  }
}
