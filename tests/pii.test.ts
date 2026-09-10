import assert from "node:assert/strict";
import test from "node:test";
import { redactPii, containsPii } from "../lib/security/pii.ts";

test("redacts email and phone, keeps the shape", () => {
  const r = redactPii("Email me at jane.doe@gmail.com or call 415-555-2671.");
  assert.ok(r.includes("[redacted-email]"));
  assert.ok(r.includes("[redacted-phone]"));
  assert.ok(!/gmail\.com/.test(r));
  assert.ok(!containsPii(r));
});

test("redacts card-like and SSN and street address", () => {
  const r = redactPii("Card 4111 1111 1111 1111, SSN 123-45-6789, ship to 412 Alder Street.");
  assert.ok(r.includes("[redacted-card]"));
  assert.ok(r.includes("[redacted-ssn]"));
  assert.ok(r.includes("[redacted-address]"));
});

test("leaves product/order identifiers and ordinary text alone", () => {
  const same = "I want to return DEN-051 on order ORD-1002, it cost $18.95.";
  assert.equal(redactPii(same), same);
  assert.equal(containsPii(same), false);
});

test("keeps the business's own public support contact readable", () => {
  const r = redactPii("Reach support@dentalpilot-demo.com or 1-800-555-0148.");
  assert.ok(r.includes("support@dentalpilot-demo.com"));
  assert.ok(r.includes("1-800-555-0148"));
});
