import assert from "node:assert/strict";
import test from "node:test";
import { validateAnswer } from "../lib/agents/output-validator.ts";

test("flags a claimed escalation when no tool performed it", () => {
  const r = validateAnswer("I'm sorry about that. I'll go ahead and send your case to our customer support team for human review.", []);
  assert.equal(r.unbackedActionClaim, true);
});

test("accepts the same claim when the escalation tool succeeded", () => {
  const r = validateAnswer("I've sent your case to customer support, ticket SUP-10001.", [{ name: "escalate_to_support", status: "success" }]);
  assert.equal(r.unbackedActionClaim, false);
});

test("an offer is not a claim", () => {
  const r = validateAnswer("Would you like me to send this to customer support for human review?", []);
  assert.equal(r.unbackedActionClaim, false);
  const r2 = validateAnswer("I can send your case over to customer support if you'd like.", []);
  assert.equal(r2.unbackedActionClaim, false);
});

test("a failed tool call does not back a claim", () => {
  const r = validateAnswer("I've created your return request.", [{ name: "create_return_request", status: "error" }]);
  assert.equal(r.unbackedActionClaim, true);
});

test("plain answers are untouched", () => {
  const r = validateAnswer("Our cafe is open on weekends from 8am to 4pm.", []);
  assert.equal(r.unbackedActionClaim, false);
});
