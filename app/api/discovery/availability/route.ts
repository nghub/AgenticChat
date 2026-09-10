import { NextRequest, NextResponse } from "next/server";
import { getProduct, AUDIO_CATALOG } from "@/lib/discovery/catalog";

/** check_availability - stock for a SKU, with an in-stock alternative if out. */
export async function GET(req: NextRequest) {
  const sku = req.nextUrl.searchParams.get("sku") || "";
  const p = getProduct(sku);
  if (!p) return NextResponse.json({ found: false, sku, message: "No product with that SKU." }, { status: 404 });
  const inStock = p.stock > 0;
  const alternative = inStock ? null : AUDIO_CATALOG
    .filter((a) => a.category === p.category && a.stock > 0)
    .sort((a, b) => Math.abs(a.price - p.price) - Math.abs(b.price - p.price))[0] || null;
  return NextResponse.json({
    found: true, sku: p.sku, name: p.name, price: p.price, inStock, stock: p.stock,
    alternative: alternative ? { sku: alternative.sku, name: alternative.name, price: alternative.price } : null,
  });
}
