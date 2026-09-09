import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { decideReturn } from "@/lib/mock/orders";

const schema = z.object({
  orderNumber: z.string().min(3).max(40),
  sku: z.string().min(3).max(40),
  reason: z.enum(["defective", "changed_mind", "wrong_item", "damaged_in_transit"]),
  notes: z.string().max(500).optional(),
});

/**
 * POC stand-in for creating a return request; called by the bot's
 * create_return_request tool. The accept/decline decision is made here from
 * the SKU's return window, never by the model.
 */
export async function POST(req: NextRequest) {
  try {
    const data = schema.parse(await req.json());
    const decision = decideReturn(data.orderNumber, data.sku, data.reason);
    return NextResponse.json(decision, { status: decision.accepted ? 201 : 200 });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: error.issues[0]?.message || "Invalid request" }, { status: 400 });
    return NextResponse.json({ error: "Return request failed" }, { status: 500 });
  }
}
