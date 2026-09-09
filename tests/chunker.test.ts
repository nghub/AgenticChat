import assert from "node:assert/strict";
import test from "node:test";
import { chunkText } from "../lib/ingestion/chunker.ts";

const policy = [
  "DENTALPILOT MARKETPLACE",
  "Policies",
  "MP-012 - Sales Tax",
  "Applicable sales tax is calculated based on product type, seller location, customer shipping address, and applicable tax rules. Tax-exempt organizations may upload a valid exemption certificate. Tax exemption is applied only after the certificate is reviewed and approved. Orders placed before approval may include tax.",
  "MP-013 - Shipping Coverage",
  "For the POC, DentalPilot ships within the United States. Standard shipping is available to the 48 contiguous states. Shipping to Alaska and Hawaii may require additional charges and longer delivery times. International shipping is not supported during the POC.",
  "MP-014 - Standard Shipping",
  "Standard shipping generally arrives within 3-7 business days after seller processing. Seller processing normally takes 1-2 business days for in-stock items. Estimated delivery dates are estimates and are not guaranteed. Business days exclude weekends and major U.S. holidays.",
].join("\n");

test("headed documents are chunked one section per chunk, with the title prefixed", () => {
  const chunks = chunkText(policy, { title: "Marketplace Policies" });
  const shipping = chunks.find((c) => c.content.includes("MP-013"));
  assert.ok(shipping, "MP-013 has its own chunk");
  assert.ok(shipping!.content.startsWith("Marketplace Policies\nMP-013 - Shipping Coverage"));
  assert.ok(shipping!.content.includes("International shipping is not supported"));
  assert.ok(!shipping!.content.includes("MP-014"), "neighbouring section is not blended in");
  assert.deepEqual(chunks.map((c) => c.index), chunks.map((_, i) => i));
});

test("tiny sections such as catalogue rows are merged, never one row per chunk", () => {
  const rows = Array.from({ length: 12 }, (_, i) => `DEN-0${String(i + 1).padStart(2, "0")} Product ${i + 1} Category Box of 100 $${(i + 1) * 3}.95 ${40 + i} 30 days unopened.`);
  const chunks = chunkText(["Inventory", ...rows].join("\n"));
  assert.ok(chunks.length >= 2 && chunks.length < rows.length, `expected merged groups, got ${chunks.length}`);
  assert.ok(chunks.every((c) => c.content.length <= 800));
  const withRow7 = chunks.find((c) => c.content.includes("DEN-007"));
  assert.ok(withRow7 && withRow7.content.includes("DEN-007 Product 7"));
});

test("an oversized section is windowed and keeps its heading on every piece", () => {
  const long = "MP-099 - Long Section\n" + Array.from({ length: 40 }, (_, i) => `Sentence number ${i + 1} explains a detail of the policy in some depth. `).join("");
  const chunks = chunkText(["MP-001 - A", "Short.", "MP-002 - B", "Short.", long].join("\n"));
  const pieces = chunks.filter((c) => c.content.startsWith("MP-099 - Long Section"));
  assert.ok(pieces.length >= 2, "long section split into several pieces");
  assert.ok(pieces.every((c) => c.content.length <= 800 + "MP-099 - Long Section\n".length));
});

test("prose without headings keeps the sliding window with overlap", () => {
  const prose = Array.from({ length: 60 }, (_, i) => `This is sentence ${i + 1} of a plain paragraph about coffee. `).join("");
  const chunks = chunkText(prose);
  assert.ok(chunks.length >= 3);
  assert.ok(chunks.every((c) => c.content.length <= 800));
  // Overlap: the tail of one chunk reappears at the head of the next.
  const tail = chunks[0].content.slice(-40);
  assert.ok(chunks[1].content.includes(tail.trim().split(" ").slice(-3).join(" ")));
});
