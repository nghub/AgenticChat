// POC evaluation harness. Plays a versioned case set through the real
// /api/public/chat and grades each deterministically against the catalog
// answer key, then writes a scored report and a KPI table. Re-run the same
// set after any change to model, RAG, prompt, tools or avatar provider.
//
//   node scripts/run-evals.mjs [--limit N] [--only category] [--base URL]
//
// Grading is deterministic (no LLM judge) so it is free of the provider quota
// and gives the same verdict every run. Facts are checked against
// evals/dental-poc/catalog.json.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";

const args = process.argv.slice(2);
const flag = (name, def) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : def; };
const BASE = flag("base", "http://localhost:3000");
const LIMIT = Number(flag("limit", "0")) || 0;
const ONLY = flag("only", "");
const CASES = flag("cases", "evals/dental-poc/cases.json");
const CATALOG = flag("catalog", "evals/dental-poc/catalog.json");
const PUBLIC_KEY = flag("key", "piper-avatar-poc");

const suite = JSON.parse(readFileSync(CASES, "utf8"));
const catalog = existsSync(CATALOG) ? JSON.parse(readFileSync(CATALOG, "utf8")) : { skus: {} };
const knownSkus = new Set([...Object.keys(catalog.skus || {}), ...(catalog.allSkuIds || [])]);
let cases = suite.cases;
if (ONLY) cases = cases.filter((c) => c.category === ONLY);
if (LIMIT) cases = cases.slice(0, LIMIT);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function chat(message, sessionId, source) {
  const body = { publicKey: PUBLIC_KEY, message, source: source || "TEXT" };
  if (sessionId) body.sessionId = sessionId;
  for (let attempt = 0; attempt < 6; attempt++) {
    const t0 = Date.now();
    const res = await fetch(`${BASE}/api/public/chat`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (res.status >= 500) { await sleep(25000); continue; } // provider busy / quota
    const data = await res.json();
    return { ...data, latencyMs: Date.now() - t0 };
  }
  return { answer: "", error: "gave up after retries", latencyMs: 0 };
}

function toolsForSession(sessionId) {
  if (!sessionId) return [];
  try {
    const out = execFileSync("docker", ["exec", "obc_postgres", "psql", "-U", "postgres", "-d", "openbusinesschat", "-Atc",
      `select t.name from "ToolExecution" te join "Tool" t on t.id=te."toolId" join "Conversation" c on c.id=te."conversationId" where c."sessionId"='${sessionId}' and te.status='SUCCESS'`], { encoding: "utf8" });
    return out.split("\n").map((s) => s.trim()).filter(Boolean);
  } catch { return []; }
}

function grade(expect, answer, response, tools, questionText) {
  const fails = [];
  const a = (answer || "").toLowerCase();
  const has = (s) => a.includes(String(s).toLowerCase());
  if (typeof expect.refused === "boolean" && Boolean(response.isRefused) !== expect.refused)
    fails.push(`refused=${Boolean(response.isRefused)}, expected ${expect.refused}`);
  for (const s of expect.mustInclude || []) if (!has(s)) fails.push(`missing "${s}"`);
  if (expect.mustIncludeAny && !expect.mustIncludeAny.some(has)) fails.push(`none of [${expect.mustIncludeAny.join(", ")}]`);
  if (expect.mustIncludeAny2 && !expect.mustIncludeAny2.some(has)) fails.push(`none of [${expect.mustIncludeAny2.join(", ")}]`);
  for (const s of expect.mustNotInclude || []) if (has(s)) fails.push(`must not contain "${s}"`);
  if (expect.toolCalled && !tools.includes(expect.toolCalled)) fails.push(`tool ${expect.toolCalled} not called (called: ${tools.join(",") || "none"})`);
  for (const t of expect.toolNotCalled || []) if (tools.includes(t)) fails.push(`tool ${t} must not be called`);
  if (expect.noInventedSku) {
    const asked = new Set((questionText.match(/DEN-\d{3}/gi) || []).map((s) => s.toUpperCase()));
    const invented = [...new Set((answer.match(/DEN-\d{3}/gi) || []).map((s) => s.toUpperCase()))].filter((s) => !knownSkus.has(s) && !asked.has(s));
    if (invented.length) fails.push(`invented SKU ${invented.join(",")}`);
  }
  const flagged = response.retrievalTrace?.validator?.unbackedActionClaim;
  return { pass: fails.length === 0, fails, validatorFlagged: Boolean(flagged) };
}

const results = [];
for (const c of cases) {
  const turns = c.turns.map((t) => (typeof t === "string" ? { text: t, source: "TEXT" } : t));
  const checkTurn = c.expect.checkTurn ?? turns.length - 1;
  let sessionId;
  const responses = [];
  for (const t of turns) {
    const r = await chat(t.text, sessionId, t.source);
    sessionId = r.sessionId || sessionId;
    responses.push(r);
  }
  const graded = responses[checkTurn] || responses[responses.length - 1];
  const tools = toolsForSession(sessionId);
  const questionText = turns.map((t) => t.text).join(" ");
  const g = grade(c.expect, graded.answer, graded, tools, questionText);
  const maxLatency = Math.max(...responses.map((r) => r.latencyMs || 0));
  results.push({ id: c.id, category: c.category, kpi: c.kpi, pass: g.pass, fails: g.fails, latencyMs: maxLatency, validatorFlagged: g.validatorFlagged, answer: (graded.answer || graded.error || "").slice(0, 240) });
  process.stdout.write(g.pass ? "." : "F");
}
process.stdout.write("\n");

// --- aggregate ---
const total = results.length;
const passed = results.filter((r) => r.pass).length;
const byKpi = {};
for (const r of results) { (byKpi[r.kpi] ||= { total: 0, pass: 0 }); byKpi[r.kpi].total++; if (r.pass) byKpi[r.kpi].pass++; }
const lat = results.map((r) => r.latencyMs).filter(Boolean).sort((a, b) => a - b);
const p50 = lat[Math.floor(lat.length * 0.5)] || 0;
const p95 = lat[Math.floor(lat.length * 0.95)] || 0;
const invented = results.filter((r) => r.fails.some((f) => f.startsWith("invented"))).length;

const kpiTargets = {
  grounded_accuracy: ">95%", no_hallucination: "0 invented", policy_precedence: "100%",
  context_retention: "100%", escalation: ">95%", unsupported_handled: ">95%",
};
let md = `# Dental POC evaluation report\n\n`;
md += `Run: ${new Date().toISOString()} · cases: ${total} · **passed: ${passed}/${total} (${((passed / total) * 100).toFixed(0)}%)**\n\n`;
md += `Grading is deterministic against \`evals/dental-poc/catalog.json\`. Chat latency is server-side (retrieval + model + tools); it does not include speech-to-text or avatar text-to-speech.\n\n`;
md += `## KPIs\n\n| KPI | Target | Result |\n|---|---|---|\n`;
for (const [kpi, t] of Object.entries(kpiTargets)) {
  const b = byKpi[kpi]; if (!b) continue;
  md += `| ${kpi.replace(/_/g, " ")} | ${t} | ${b.pass}/${b.total} (${((b.pass / b.total) * 100).toFixed(0)}%) |\n`;
}
md += `| invented SKU/price/policy | 0 | ${invented} |\n`;
md += `| chat latency (server) | <2s ideal | p50 ${(p50 / 1000).toFixed(2)}s · p95 ${(p95 / 1000).toFixed(2)}s |\n`;
md += `\n## Failures\n\n`;
const failures = results.filter((r) => !r.pass);
md += failures.length ? failures.map((r) => `- **${r.id}** (${r.category}): ${r.fails.join("; ")}\n  > ${r.answer.replace(/\n/g, " ")}`).join("\n") : "_none_\n";
md += `\n\n## All cases\n\n| id | category | pass | latency | notes |\n|---|---|---|---|---|\n`;
for (const r of results) md += `| ${r.id} | ${r.category} | ${r.pass ? "✅" : "❌"} | ${(r.latencyMs / 1000).toFixed(2)}s | ${r.fails.join("; ") || (r.validatorFlagged ? "validator flagged" : "")} |\n`;

mkdirSync("evals/reports", { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
writeFileSync(`evals/reports/${stamp}.md`, md);
writeFileSync(`evals/reports/${stamp}.json`, JSON.stringify({ total, passed, byKpi, p50, p95, invented, results }, null, 2));
console.log(`\n${passed}/${total} passed. Report: evals/reports/${stamp}.md`);
console.log(md.split("## Failures")[0]);
