import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { rankProducts, type Constraints } from "@/lib/discovery/ranker";

const schema = z.object({
  category: z.string().optional(),
  budgetMax: z.number().finite().optional(),
  budgetMin: z.number().finite().optional(),
  useCases: z.array(z.string()).max(10).optional(),
  roomSize: z.enum(["small", "medium", "large"]).optional(),
  mustHaves: z.array(z.string()).max(10).optional(),
  niceToHaves: z.array(z.string()).max(10).optional(),
  limit: z.number().int().min(1).max(5).optional(),
});

/**
 * search_catalog_ranked - the Discovery agent's ranking tool. Constraints in,
 * a ranked, justified shortlist out. The ranking, budget ceiling and
 * out-of-stock exclusion are decided here in code (R2.3/R2.6), not by the model.
 */
export async function POST(req: NextRequest) {
  try {
    const data = schema.parse(await req.json());
    const { limit, ...constraints } = data;
    const result = rankProducts(constraints as Constraints, limit ?? 3);
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: error.issues[0]?.message || "Invalid request" }, { status: 400 });
    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }
}
