import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getProduct } from "@/lib/discovery/catalog";

const schema = z.object({
  sku: z.string(),
  quantity: z.number().int().min(1).max(10).optional(),
});

/**
 * add_to_cart - STUB (PRD non-goal: no real checkout/payments before Phase 5).
 * It validates the SKU is real and in stock, refuses out-of-stock (never a
 * dead-end intent, R2.6), and returns a cart line. The conversion event is
 * emitted by the chat route when this tool succeeds, so it is control-eligible
 * for the Phase-3 A/B.
 */
export async function POST(req: NextRequest) {
  try {
    const { sku, quantity } = schema.parse(await req.json());
    const p = getProduct(sku);
    if (!p) return NextResponse.json({ added: false, reason: "unknown_sku", message: "That SKU is not in the catalog." }, { status: 404 });
    if (p.stock <= 0) return NextResponse.json({ added: false, reason: "out_of_stock", message: `${p.name} is out of stock; offer an in-stock alternative instead of adding it.` }, { status: 200 });
    const qty = quantity ?? 1;
    return NextResponse.json({
      added: true, sku: p.sku, name: p.name, unitPrice: p.price, quantity: qty, lineTotal: Number((p.price * qty).toFixed(2)),
      message: "Added to cart (demo - no payment is taken).",
    }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: error.issues[0]?.message || "Invalid request" }, { status: 400 });
    return NextResponse.json({ error: "Add to cart failed" }, { status: 500 });
  }
}
