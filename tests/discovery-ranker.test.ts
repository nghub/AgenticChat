import assert from "node:assert/strict";
import test from "node:test";
import { rankProducts } from "../lib/discovery/ranker.ts";

test("ranks in-stock, within-budget items with justifications (R2.3)", () => {
  const r = rankProducts({ category: "soundbar", budgetMax: 300, useCases: ["small_room", "home_theater"], roomSize: "small" }, 3);
  assert.ok(r.items.length >= 1 && r.items.length <= 3);
  assert.ok(r.items.every((i) => i.price <= 300), "budget is a hard ceiling");
  assert.ok(r.items.every((i) => i.reasons.length > 0), "every item is justified");
  // AUD-301 (compact small-room soundbar, $299) should rank at or near the top.
  assert.ok(r.items[0].sku === "AUD-301" || r.items.some((i) => i.sku === "AUD-301"));
});

test("never recommends an out-of-stock item (Probe #5)", () => {
  const r = rankProducts({ category: "soundbar", budgetMax: 250 }, 5);
  assert.ok(r.items.every((i) => i.sku !== "AUD-304"), "AUD-304 is out of stock");
  assert.ok(r.excludedOutOfStock.includes("AUD-304"));
});

test("respects a hard budget ceiling", () => {
  const r = rankProducts({ category: "over_ear_headphones", budgetMax: 150 }, 5);
  assert.ok(r.items.every((i) => i.price <= 150));
  assert.ok(r.excludedOverBudget.includes("AUD-101"), "the $279 flagship is over a $150 budget");
});

test("must-have filters out items lacking the feature", () => {
  const r = rankProducts({ category: "over_ear_headphones", mustHaves: ["noise_cancelling"] }, 5);
  assert.ok(r.items.every((i) => i.sku !== "AUD-104"), "AUD-104 has no ANC");
  assert.ok(r.items.every((i) => i.sku !== "AUD-105"));
});

test("two different profiles get different rankings for the same category (Probe #8)", () => {
  const budget = rankProducts({ category: "earbuds", budgetMax: 100, useCases: ["gym"] }, 3);
  const premium = rankProducts({ category: "earbuds", budgetMax: 300, useCases: ["office", "calls"], mustHaves: ["noise_cancelling"] }, 3);
  assert.notEqual(budget.items[0].sku, premium.items[0].sku, "different constraints -> different top pick");
});

test("water resistance is flagged as not waterproof (Probe #6 support)", () => {
  const r = rankProducts({ category: "earbuds", niceToHaves: ["water_resistant"], useCases: ["gym"] }, 3);
  const withWater = r.items.find((i) => i.caveats.some((c) => /not waterproof/.test(c)));
  assert.ok(withWater, "an item with water resistance carries the 'not waterproof' caveat");
});
