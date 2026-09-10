import { AUDIO_CATALOG, type AudioProduct } from "./catalog.ts";

/**
 * The Discovery brain (PRD R2.3): a rubric ranker over structured specs - not
 * ML. Given a shopper's constraints it filters on HARD constraints (in stock,
 * budget, must-haves) then scores the survivors on SOFT fit (use-case, room
 * size, connectivity, nice-to-haves), and returns a ranked shortlist where
 * each item carries a plain-language justification of why it fits.
 *
 * Guardrails live here, in code, so they cannot be prompted away (R2.6):
 * out-of-stock is never recommended (Probe #5) and a stated budget is a hard
 * ceiling. Weights are a single object so merchandising can tune them later
 * (R2.14) without touching the algorithm.
 */
export interface Constraints {
  category?: AudioProduct["category"] | "any";
  budgetMax?: number;
  budgetMin?: number;
  useCases?: string[];        // e.g. ["small_room", "home_theater"]
  roomSize?: "small" | "medium" | "large";
  mustHaves?: string[];       // hard: "noise_cancelling", "wireless", "water_resistant", "hdmi_arc", "wifi", "battery"
  niceToHaves?: string[];     // soft: same vocabulary as mustHaves
}

export interface RankedItem {
  sku: string;
  name: string;
  brand: string;
  price: number;
  score: number;              // 0..1 fit
  reasons: string[];          // why it fits the stated constraints
  caveats: string[];          // honest downsides given the constraints
}

export interface RankingResult {
  items: RankedItem[];        // <= limit, ranked, in stock, within budget
  considered: number;         // candidates after category filter
  excludedOutOfStock: string[];
  excludedOverBudget: string[];
  excludedMissingMustHave: string[];
  note?: string;
}

const WEIGHTS = {
  useCase: 0.45,
  roomSize: 0.25,
  niceToHave: 0.2,
  valueUnderBudget: 0.1,
};

function hasFeature(p: AudioProduct, feature: string): boolean {
  switch (feature) {
    case "noise_cancelling": return p.noiseCancelling;
    case "wireless": return p.wireless;
    case "water_resistant": return Boolean(p.waterResistance);
    case "battery": return p.batteryHours !== null;
    case "hdmi_arc": return p.connectivity.includes("hdmi_arc");
    case "wifi": return p.connectivity.includes("wifi");
    case "bluetooth": return p.connectivity.includes("bluetooth");
    case "optical": return p.connectivity.includes("optical");
    case "aux": return p.connectivity.includes("aux_3.5mm");
    default: return p.useCases.includes(feature);
  }
}

function featureLabel(f: string): string {
  const map: Record<string, string> = {
    noise_cancelling: "active noise cancelling", wireless: "wireless", water_resistant: "water resistance",
    battery: "a built-in battery", hdmi_arc: "HDMI ARC", wifi: "wifi", bluetooth: "Bluetooth", optical: "optical in", aux: "a 3.5mm input",
  };
  return map[f] || f.replace(/_/g, " ");
}

export function rankProducts(c: Constraints, limit = 3): RankingResult {
  const category = c.category && c.category !== "any" ? c.category : null;
  const pool = category ? AUDIO_CATALOG.filter((p) => p.category === category) : AUDIO_CATALOG;
  const considered = pool.length;

  const excludedOutOfStock: string[] = [];
  const excludedOverBudget: string[] = [];
  const excludedMissingMustHave: string[] = [];
  const mustHaves = c.mustHaves || [];

  const survivors = pool.filter((p) => {
    if (p.stock <= 0) { excludedOutOfStock.push(p.sku); return false; }
    if (typeof c.budgetMax === "number" && p.price > c.budgetMax) { excludedOverBudget.push(p.sku); return false; }
    if (typeof c.budgetMin === "number" && p.price < c.budgetMin) return false;
    const missing = mustHaves.filter((m) => !hasFeature(p, m));
    if (missing.length) { excludedMissingMustHave.push(p.sku); return false; }
    return true;
  });

  const scored = survivors.map((p) => {
    const reasons: string[] = [];
    const caveats: string[] = [];
    let score = 0;

    // Use-case fit.
    const wanted = c.useCases || [];
    const hits = wanted.filter((u) => p.useCases.includes(u));
    if (wanted.length) {
      score += WEIGHTS.useCase * (hits.length / wanted.length);
      if (hits.length) reasons.push(`fits ${hits.map((h) => h.replace(/_/g, " ")).join(" and ")}`);
      const missedUse = wanted.filter((u) => !p.useCases.includes(u));
      if (missedUse.length) caveats.push(`not ideal for ${missedUse.map((u) => u.replace(/_/g, " ")).join(", ")}`);
    } else {
      score += WEIGHTS.useCase * 0.5;
    }

    // Room size fit.
    if (c.roomSize) {
      if (p.roomSize === c.roomSize) { score += WEIGHTS.roomSize; reasons.push(`sized for a ${c.roomSize} room`); }
      else if (p.roomSize === "n/a") { score += WEIGHTS.roomSize * 0.6; }
      else { caveats.push(`built for a ${p.roomSize} room, not ${c.roomSize}`); }
    } else {
      score += WEIGHTS.roomSize * 0.5;
    }

    // Nice-to-haves (soft).
    const nice = c.niceToHaves || [];
    if (nice.length) {
      const got = nice.filter((f) => hasFeature(p, f));
      score += WEIGHTS.niceToHave * (got.length / nice.length);
      if (got.length) reasons.push(`has ${got.map(featureLabel).join(", ")}`);
    } else {
      score += WEIGHTS.niceToHave * 0.5;
    }

    // Value: reward headroom under the budget, gently.
    if (typeof c.budgetMax === "number" && c.budgetMax > 0) {
      score += WEIGHTS.valueUnderBudget * Math.max(0, (c.budgetMax - p.price) / c.budgetMax);
      reasons.push(`$${p.price} is within your $${c.budgetMax} budget`);
    }

    // Honest caveat: water resistance is never "waterproof".
    if ((mustHaves.includes("water_resistant") || nice.includes("water_resistant")) && p.waterResistance) {
      caveats.push(`${p.waterResistance} is water-resistant, not waterproof`);
    }

    return { sku: p.sku, name: p.name, brand: p.brand, price: p.price, score: Math.min(1, score), reasons, caveats };
  });

  scored.sort((a, b) => b.score - a.score || a.price - b.price);
  const items = scored.slice(0, limit);

  let note: string | undefined;
  if (!items.length) {
    if (excludedOverBudget.length && !survivors.length) note = "Nothing in the catalog meets all of those constraints within that budget.";
    else if (excludedOutOfStock.length) note = "The closest matches are out of stock right now.";
    else note = "No product matches all of those constraints.";
  }
  return { items, considered, excludedOutOfStock, excludedOverBudget, excludedMissingMustHave, note };
}
