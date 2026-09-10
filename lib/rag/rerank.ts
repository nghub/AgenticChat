import type { RetrievedChunk } from "./retrieval";

/**
 * Rerank stage after pgvector retrieval (PRD R0.3, promoted to P0 for
 * Discovery in R2.9). Vector similarity alone under-ranks the chunk that
 * holds an exact identifier or attribute a query names - "how much is
 * DEN-001?" or "compare battery on A vs B" - because the token is sparse in a
 * dense catalogue row. This re-scores an over-fetched candidate set by
 * combining the vector score with lexical and exact-token signals, then keeps
 * the top K. It is a cross-encoder-lite heuristic: no model call, so it is
 * free of the provider quota and deterministic. An LLM reranker can replace
 * scoreChunk later without changing callers.
 *
 * Toggled by RETRIEVAL_RERANK: with it off, retrieval returns the pure vector
 * order unchanged (R0.3 "zero behavior change when off").
 */
export function rerankEnabled(): boolean {
  return process.env.RETRIEVAL_RERANK === "1";
}

const STOP = new Set(["the", "a", "an", "is", "are", "of", "for", "to", "and", "or", "on", "in", "how", "much", "what", "does", "do", "i", "my", "you", "your", "it", "this", "that", "with", "can", "me"]);

function terms(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9][a-z0-9-]{1,}/g) || []).filter((t) => !STOP.has(t));
}

/** Identifier-like tokens a query may pin an answer to: SKUs, codes, model numbers. */
function idTokens(text: string): string[] {
  return (text.match(/\b[A-Z]{2,5}-?\d{2,}\b/gi) || []).map((t) => t.toUpperCase().replace(/\s/g, ""));
}

export function scoreChunk(query: string, chunk: RetrievedChunk): number {
  const qTerms = terms(query);
  const cLower = chunk.content.toLowerCase();
  const overlap = qTerms.length ? qTerms.filter((t) => cLower.includes(t)).length / qTerms.length : 0;

  const qIds = idTokens(query);
  const cIds = new Set(idTokens(chunk.content));
  const idHit = qIds.length ? qIds.filter((id) => cIds.has(id)).length / qIds.length : 0;

  // Vector similarity dominates; lexical overlap breaks near-ties; an exact
  // identifier match is a strong, deliberate boost for lookup-style queries.
  return chunk.similarity + 0.15 * overlap + 0.35 * idHit;
}

export function rerankChunks(query: string, chunks: RetrievedChunk[], topK: number): RetrievedChunk[] {
  return [...chunks]
    .map((c) => ({ c, s: scoreChunk(query, c) }))
    .sort((a, b) => b.s - a.s)
    .slice(0, topK)
    .map(({ c }) => c);
}
