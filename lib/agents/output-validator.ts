/**
 * Deterministic output check before delivery (guardrails doc §2.4).
 *
 * The grounding gate protects FACTS; nothing protected ACTIONS. In testing the
 * model said "I'll go ahead and send your case to customer support" three
 * times with no tool that does that - a promise the visitor believes. This
 * flags answers that claim an action (sent, escalated, approved, refunded,
 * processed, created a return...) in a turn where no successful tool call
 * could have performed it. Audit-only for the POC: the flag lands on the
 * message row's retrievalTrace and a warning is logged, so the rate is
 * measurable before deciding on an automatic rewrite.
 */

const ACTION_CLAIM = /\b(?:I|we)(?:'ve|'ll| have| will| am going to| just| already)?\s+(?:go ahead and\s+)?(?:sent|send|forwarded|forward|escalated|escalate|submitted|submit|opened|open|created|create|approved|approve|processed|process|issued|issue|refunded|refund|cancelled|cancel|updated|update)\b[^.!?]{0,80}\b(?:case|request|ticket|return|refund|order|support|team|review|escalation|credit|address|claim)\b/i;

const ACTION_TOOLS = new Set(["create_return_request", "escalate_to_support"]);

export interface ValidatorResult {
  unbackedActionClaim: boolean;
  claim?: string;
}

export function validateAnswer(
  answer: string,
  toolCalls: Array<{ name: string; status: string }>
): ValidatorResult {
  const performedAction = toolCalls.some((t) => ACTION_TOOLS.has(t.name) && t.status === "success");
  if (performedAction) return { unbackedActionClaim: false };
  const match = answer.match(ACTION_CLAIM);
  if (!match) return { unbackedActionClaim: false };
  // Offers and questions are fine: "I can send", "would you like me to send".
  const before = answer.slice(Math.max(0, match.index! - 40), match.index!).toLowerCase();
  if (/\b(can|could|would you like|shall|happy to|able to|offer to|if you'?d like)\b/.test(before + " " + match[0].toLowerCase().slice(0, 12))) {
    return { unbackedActionClaim: false };
  }
  return { unbackedActionClaim: true, claim: match[0] };
}
