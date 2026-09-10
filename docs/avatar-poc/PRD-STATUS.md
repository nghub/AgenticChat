# PRD implementation status — Retail Conversational Agent Platform

Status of `PRD-retail-conversational-agent-phased.md` in this codebase, per phase.
"Built" means shipped and verified here; "infra" means the mechanism is built and
testable but the *result* needs real traffic or a signed partner.

## Phase 0 — Runtime Hardening — DONE
- **R0.2 PII redaction** (`lib/security/pii.ts`): message content is scrubbed of
  email/phone/card/SSN/address before persistence at all three chat-route writes;
  product/order ids and the business's own support contact are preserved.
  Unit-tested (`tests/pii.test.ts`).
- **R0.3 Reranker** (`lib/rag/rerank.ts`, flag `RETRIEVAL_RERANK`): over-fetch +
  re-score by vector + lexical + exact-identifier match; off = pure vector order.
  Fixed the bare-SKU price recall finding.
- **Type-as-config** (§14): agent config gains `type`, `objective {goal, successState}`,
  `kpiProfile`, `channels`. Switching type is config only.

## Phase 1 — Support Agent — DONE
- **R1.1 Formal RESOLVE objective**: SAM carries `objective.successState =
  "resolved_without_human"`, emitted as `support.resolved`.
- **R1.2 Type purity / R1.3 Part-3 Support**: SAM's registry is post-purchase only
  (`get_order`, `create_return_request`, `escalate_to_support`); Support eval probes
  pass; dashboard primary metric = resolution when `kpiProfile: "resolution"`.

## Phase 2 — Discovery Agent — DONE (the product)
A second bot, **NOVA** (`nova-discovery-poc`), on the *same runtime*. Proves
"type = configuration".
- **R2.1 CONVERT objective** + `add_to_cart` success event.
- **R2.2 Comparative corpus**: `lib/discovery/catalog.ts` (24 audio SKUs, structured
  attributes) ingested as knowledge; `compare_products` cites both SKUs (Probe #9).
- **R2.3 ⭐ Ranking engine** (`lib/discovery/ranker.ts`): elicit → constraints →
  hard-filter (stock/budget/must-haves) → soft-score → ranked, justified shortlist.
  Rubric over specs, not ML. Unit-tested; two profiles → different rankings (Probe #8).
- **R2.4 Pre-transaction tools**: `search_catalog_ranked`, `check_availability`,
  `compare_products`, `add_to_cart` (stub) — registry rows, no refund/ticket tools.
- **R2.5 Consultative policy**: asks a clarifier on vague intent (Probe #2), deepens
  toward a decision (Probe #4).
- **R2.6 Discovery guardrails**: out-of-stock never recommended (Probe #5, enforced in
  the ranker), budget is a hard ceiling, water-resistant is never "waterproof"
  (Probe #6).
- **R2.7 Conversion instrumentation**: `discovery.needs_elicited / shortlist_delivered
  / compare_run / add_to_cart` events; dashboard primary metric = conversion.
- **R2.8 Full Part-3 Discovery pass**: `evals/discovery-poc/cases.json`, **10/10**,
  including a leakage probe (NOVA never calls Support tools). Support still passes its
  own probes — no leakage either direction.
- **R2.9 Reranker on** (R0.3 promoted).

## Phase 3 — Avatar Thesis Validation — INFRA BUILT (result needs traffic)
- **R3.1 Randomized assignment**: sticky per-browser arm (`obc-arm-<key>`), logged
  `avatar.arm_assigned {arm}` (control-eligible). NOVA runs the A/B; SAM does not
  (sequencing rule: Phase 3 on Phase 2 only).
- **R3.3 Modality isolation**: arm toggles only avatar visibility; brain, tools,
  corpus, objective, prompts identical. Verified.
- **R3.4 Guardrail parity**: voice turns go through the same `/api/public/chat`, so
  the validator and grounding apply in avatar mode.
- **Needs real traffic** (not buildable here): R3.2 pre-registered MDE/sample size,
  R3.5 latency-budget arm validity, and the lift *result* itself.

## Phase 4 — Pilot Readiness — PARTIAL (infra; needs a partner)
- **R4.2 PII redaction** — done (R0.2).
- **R4.5 Kill switches**: `channels.avatar = "off"` force-hides the avatar; the
  add-to-cart / any tool is independently disabled via its `Tool.isActive` (Tools tab);
  the avatar A/B is independently toggleable. Configurable in the Agent tab.
- **Needs a partner** (not buildable here): R4.1 real-catalog feed, R4.3 security review,
  R4.4 partner dashboard, and the LOI.

## Phase 5 — Expansion — not started (correctly; gated on the Phase-3 result).

## How to run both agents
```
set -a; source .env; set +a
npx -y tsx scripts/seed-avatar-poc.ts        # SAM (Support)  -> /embed/piper-avatar-poc
npx -y tsx scripts/seed-discovery-poc.ts     # NOVA (Discovery)-> /embed/nova-discovery-poc
node scripts/run-evals.mjs                                            # Support probes
node scripts/run-evals.mjs --cases evals/discovery-poc/cases.json --key nova-discovery-poc  # Discovery probes
```
