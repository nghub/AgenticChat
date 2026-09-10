import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_AGENT_CONFIG, composeAgentPrompt, normalizeAgentConfig, agentGuidanceText } from "../lib/agents/agent-config.ts";

test("normalize fills every field from defaults and clamps bad values", () => {
  const c = normalizeAgentConfig({ persona: { role: "the helper" }, robustness: { validatorMode: "nonsense" }, rules: ["a", 7, "", "b"] });
  assert.equal(c.persona.role, "the helper");
  assert.equal(c.persona.style, DEFAULT_AGENT_CONFIG.persona.style);
  assert.equal(c.robustness.validatorMode, "audit");
  assert.deepEqual(c.rules, ["a", "b"]);
  assert.equal(c.guardrails.noAuthority.enabled, true);
});

test("compose includes only the enabled guardrails, in a stable order", () => {
  const on = normalizeAgentConfig({ guardrails: { professionalAdvice: { enabled: true, label: "clinical", fallback: "Not clinical advice." } } });
  const text = composeAgentPrompt(on, "SAM");
  assert.ok(text.startsWith("You are SAM, "));
  assert.ok(text.includes("NO CLINICAL ADVICE"));
  assert.ok(text.includes("Not clinical advice."));
  const off = normalizeAgentConfig({ guardrails: { professionalAdvice: { enabled: false }, promotions: { enabled: false } } });
  const text2 = composeAgentPrompt(off, "SAM");
  assert.ok(!text2.includes("CLINICAL ADVICE"));
  assert.ok(!text2.includes("PROMOTIONS:"));
  assert.ok(text2.indexOf("PERSONA:") < text2.indexOf("WHAT YOU MAY STATE AS FACT"));
});

test("rules are numbered and small talk is mirrored", () => {
  const c = normalizeAgentConfig({ rules: ["First rule", "Second rule"], persona: { smallTalk: [{ say: "hi", reply: "Hi there!" }] } });
  const text = composeAgentPrompt(c, "SAM");
  assert.ok(text.includes("RULES:\n1. First rule\n2. Second rule"));
  assert.ok(text.includes('"hi" -> "Hi there!"'));
});

test("legacy free-text prompt is kept as additional notes", () => {
  const withBoth = agentGuidanceText(DEFAULT_AGENT_CONFIG, "Always mention the loyalty program.", "SAM");
  assert.ok(withBoth!.includes("ADDITIONAL NOTES:\nAlways mention the loyalty program."));
  assert.equal(agentGuidanceText(null, "Only legacy", "SAM"), "Only legacy");
  assert.equal(agentGuidanceText(null, null, "SAM"), null);
});
