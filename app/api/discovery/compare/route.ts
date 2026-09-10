import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getProduct, type AudioProduct } from "@/lib/discovery/catalog";

const schema = z.object({
  skus: z.array(z.string()).min(2).max(3),
  attributes: z.array(z.string()).max(8).optional(),
});

const ATTR: Record<string, (p: AudioProduct) => string | number | boolean> = {
  price: (p) => p.price,
  stock: (p) => p.stock,
  in_stock: (p) => p.stock > 0,
  noise_cancelling: (p) => p.noiseCancelling,
  battery: (p) => (p.batteryHours ? `${p.batteryHours}h` : "mains-powered"),
  water_resistance: (p) => (p.waterResistance ? `${p.waterResistance} (water-resistant, not waterproof)` : "none"),
  wireless: (p) => p.wireless,
  room_size: (p) => p.roomSize,
  connectivity: (p) => p.connectivity.join(", "),
  use_cases: (p) => p.useCases.join(", "),
};

/**
 * compare_products - side-by-side values for two or three SKUs on named
 * attributes (Probe #9). Reads from the structured catalog so a claim can
 * never be upgraded (Probe #6): water resistance is reported verbatim.
 */
export async function POST(req: NextRequest) {
  try {
    const { skus, attributes } = schema.parse(await req.json());
    const products = skus.map((s) => getProduct(s)).filter((p): p is AudioProduct => Boolean(p));
    if (products.length < 2) return NextResponse.json({ error: "Need at least two known SKUs to compare." }, { status: 404 });
    const keys = (attributes && attributes.length ? attributes : ["price", "noise_cancelling", "battery", "water_resistance", "room_size", "connectivity"]).filter((k) => k in ATTR);
    const rows = keys.map((k) => ({ attribute: k, values: Object.fromEntries(products.map((p) => [p.sku, ATTR[k](p)])) }));
    return NextResponse.json({
      products: products.map((p) => ({ sku: p.sku, name: p.name, price: p.price, inStock: p.stock > 0 })),
      comparison: rows,
    });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: error.issues[0]?.message || "Invalid request" }, { status: 400 });
    return NextResponse.json({ error: "Compare failed" }, { status: 500 });
  }
}
