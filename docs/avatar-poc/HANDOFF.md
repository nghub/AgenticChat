# HANDOFF — Piper-style Avatar POC on AgenticChat

> Read this fully before touching any files. Then confirm you understand the plan
> and list the files you intend to create/modify before writing code.
>
> **Naming (2026-09-09):** the avatar is called **SAM** now (renamed from Piper).
> "Piper" below is the original project codename; identifiers that still carry it
> (`piper-avatar-poc` public key, this folder) are stable ids, not the display name.
>
> **Knowledge (2026-09-09):** the seed bot is the DentalPilot dental marketplace
> POC. `docs/avatar-poc/knowledge/` holds three synthetic PDFs: the inventory
> (DEN-001..050, SKU-specific return rules) and the marketplace policies
> (MP-001..052) are ingested as knowledge; the guardrails PDF is NOT ingested -
> retrieved text is untrusted by design, so its rules live in the bot's system
> prompt (`scripts/seed-avatar-poc.ts`). Its six test cases are the acceptance
> tests for grounding.

## Goal

Add an optional realtime voice+video avatar ("Speak with Piper") to the existing
`openbusinesschat` embed chat WITHOUT creating a second agent. The existing
`agenticChat()` stays the only brain. The avatar vendor (Anam for POC) is a
disposable rendering/speech layer behind a vendor-neutral `AvatarProvider` interface.

Guiding principle: **give the existing agent a face, microphone and voice.**
Do NOT build a "video AI agent". Do NOT add LiveKit in the POC.

## Repo facts already verified (do not re-discover)

- Stack: Next.js 16, React 19, Prisma (Postgres + pgvector RAG), `@anthropic-ai/sdk` + `openai`, embeddable `public/widget.js`, `app/embed`.
- Agent entry point: `lib/agents/agent-chat.ts` → `agenticChat(botId, userMessage, conversationId, history, options)`. Runs RAG retrieval, a tool loop (`MAX_TOOL_ITERATIONS = 5`), grounding/refusal **enforced in code**, cost tracking, i18n.
- Public chat: `app/api/public/chat/route.ts` — zod input `{ publicKey, message, sessionId?, origin?, locale? }`, returns `NextResponse.json({ answer, sessionId, messageId, isRefused, locale, citations, handoff })`. Loads history by `sessionId` (`take: 12`). Applies rate limit, origin allow-list, production-approval, experiment bucketing, knowledge-gap recording, handoff evaluation.
- **No streaming exists anywhere.** `agenticChat` awaits a full result; both chat routes return JSON. Grep for `text/event-stream|ReadableStream|.stream(` in app/lib/components = zero hits.
- Data model: `Conversation.sessionId @unique` (this is the shared conversation id across text↔voice). `Message.source` (`TEXT` | `VOICE`, default `TEXT`) added 2026-09-09 (migration `add_message_source`); the assistant turn carries the source of the turn it answers.
- Reusable helpers (import paths):
  - `@/lib/db/client` → `db`
  - `@/lib/security/rate-limit` → `getClientIp`, `rateLimit`, `rateLimitHeaders`, `getPublicChatRateLimitConfig`
  - `@/lib/bots/origin-policy` → `isOriginAllowed`
  - `@/lib/bots/public-key` → `resolvePublicBotKey(publicKey)` returns `{ bot, environment, version }`
  - `@/lib/ai/provider.ts` → the LLM provider interface pattern to mirror
- UI: `components/chat/embed-chat.tsx` (~492 lines) does `fetch("/api/public/chat").then(r=>r.json())`.
- **`proxy.ts` sends `Permissions-Policy: microphone=()` on every response** (found in milestone 3). That is a document-level ban: Chrome logs "Permissions policy violation: microphone is not allowed in this document" and never shows a prompt. It is now `microphone=(self)` for `/embed/*` only. A host page must also delegate with `allow="microphone; autoplay"` on the iframe - `widget.js` and the dashboard's copyable snippet do; hand-written iframes need it added.

## Vendor facts verified (Anam)

- Session token: `POST https://api.anam.ai/v1/auth/session-token`, header `Authorization: Bearer ${ANAM_API_KEY}`, body `{ clientLabel?, personaConfig: { name, avatarId, voiceId, llmId?, systemPrompt?, maxSessionLengthSeconds, skipGreeting } }` → `{ sessionToken }`. Tokens ~1h, single-use.
- ~~Omit `llmId` so Anam's built-in brain is disabled~~ **CORRECTED 2026-09-09 against the live API:** omitting `llmId` does NOT disable the brain, it mints a `type: "legacy"` token that falls back to a default model. You must send `llmId: "CUSTOMER_CLIENT_V1"` (listed in `GET /v1/llms` as "Disable LLM", `llmFormat: "none"`), which mints a `type: "ephemeral"` token. Our agent then answers. Feed answers via `createTalkMessageStream()`; transcripts arrive via a message-history event.
- **Personas carry their own brain.** A persona created in the Anam dashboard has an `llmId` set (ours defaulted to GPT OSS 120B) and `llmDisabled: false`. Referencing it via `personaConfig: { personaId }` mints a `type: "stateful"` token and Anam answers - the exact second agent this POC forbids. We therefore send `name`/`avatarId`/`voiceId` inline and read those ids off the persona. A **top-level** `personaId` is silently ignored and still returns 200.
- Billing counts from session start to end regardless of speech → **never create a session on page load; only on explicit click.**
- Free tier: reported 30 min/month (one source said 20), 3-min session cap, 1 concurrent. Confirm at signup. No native mobile SDK (web/JS only).
- Client SDK: `npm i @anam-ai/js-sdk` → `createClient(token)`, `streamToVideoElement(id)` (starts mic), `stopStreaming()`, `createTalkMessageStream()`.

## Decisions made

1. Anam for POC; `AvatarProvider` abstraction from day 1 so Tavus/Simli/self-host are one-file swaps.
2. Server mints tokens; API key never reaches the browser.
3. Server-side cost guard: `maxSessionLengthSeconds` = 120 (free cap 180). Override via `ANAM_MAX_SESSION_SECONDS`, never above 180.
4. Voice turns route through the EXISTING `/api/public/chat` keyed by the same `sessionId` → context continuity is automatic.
5. **Fast path first**: non-streaming. Piper speaks each full answer. Streaming refactor of `agenticChat` is a separate, later task (it also benefits the text product).
6. Video is an enhancement, never a dependency: every avatar failure leaves text chat usable.

## Files already drafted (place at these exact paths)

The drafts were exported with flattened names; restore them to:

| Draft file | Target path |
|---|---|
| `route.ts` | `app/api/public/avatar-session/route.ts` |
| `types.ts` | `lib/avatar/types.ts` |
| `anam-session.ts` | `lib/avatar/anam-session.ts` (server-only) |
| `anam.ts` | `lib/avatar/providers/anam.ts` (client) |
| `index.ts` | `lib/avatar/index.ts` |
| `use-avatar-session.ts` | `components/chat/use-avatar-session.ts` |
| `MILESTONE_1_README.md` | `docs/avatar-poc/MILESTONES_1_2_README.md` |

## Env to add (`.env` + `.env.example`)

```
ANAM_API_KEY=""
ANAM_AVATAR_ID=""
ANAM_VOICE_ID=""
ANAM_MAX_SESSION_SECONDS="120"
PUBLIC_AVATAR_RATE_LIMIT_REQUESTS="5"
PUBLIC_AVATAR_RATE_LIMIT_WINDOW_SECONDS="60"
```

## VERIFY-ON-INSTALL — DONE (2026-09-09)

Completed against `@anam-ai/js-sdk` v4.27.0 and the live API. Every ⚠ in
`lib/avatar/providers/anam.ts` is resolved; see that file's header for the
confirmed symbol list. Notable corrections beyond the event names:

- interrupt is `client.interruptPersona()`, not a talk-stream method
- `streamMessageChunk`/`endMessage` return promises; `endMessage` is required
- `MESSAGE_HISTORY_UPDATED` re-emits the **whole** history every update, so
  consumers must de-dupe on `Message.id` or every spoken turn is answered twice
- the `llmId` correction above, which is the important one

Original instructions kept below for provenance.

### Original VERIFY-ON-INSTALL brief

After `npm i @anam-ai/js-sdk`, inspect `node_modules/@anam-ai/js-sdk` and fix
the ⚠-marked spots in `lib/avatar/providers/anam.ts`:
- exact `AnamEvent` member for the finalized user transcript (`onTranscript`)
- exact `AnamEvent` members for connection established/closed (`onStatus`)
- talk-stream controller method names for chunk/end and the interrupt method
Endpoint, `createClient`, `streamToVideoElement`, `stopStreaming`,
`createTalkMessageStream` are confirmed; only event/controller names may differ.

## Milestone plan (solo dev who knows the code)

| # | Milestone | Scope | Est. |
|---|---|---|---|
| 1 | Avatar renders — **DONE 2026-09-09** | files above + `AvatarPanel`, `SpeakWithPiperButton`, state machine TEXT→CONNECTING→VIDEO→ENDING→TEXT; hard-coded greeting; End cleans up mic/session | 1 day |
| 2 | Existing brain speaks — **DONE 2026-09-09** | typed message → `/api/public/chat` → `provider.speak(answer)`. Verified live with Gemini-only config; see *Latency* below | 1 day |
| 3 | Speech in — **DONE 2026-09-09**: round trip confirmed by a human (mic → transcript → agent → spoken answer); `Message.source` enum `TEXT/VOICE` migrated, accepted by the chat route (`source?`), persisted on both turns, shown in the logs viewer | transcript → `/api/public/chat` → speak. Add Prisma migration `Message.source` enum `TEXT/VOICE`; extend chat route zod with `source?` and persist it | 1 day |
| 3b | Avatar card UX (added) — **DONE 2026-09-09** | Face-first card modelled on Salesforce's "Piper": static portrait + overlaid CTA → compact pill once the visitor has spoken/typed → "Connecting you to …" → live video with who-is-talking mic pill (Listening / Speaking / Muted), mute toggle, countdown, End. Second entry point: mic icon in the input. Plain-text assistant messages, small gray visitor bubbles | 0.5 day |
| 4 | Shared context test — **DONE 2026-09-09** | "500 employees" test passes text→voice→text on one session. The history cap was fine; the block was the refusal protocol, which the model over-applied to the visitor's own words. See *Milestone 4 finding* below | 0.5 day |
| 5 | Interruption + cleanup — **DONE 2026-09-09** | Voice barge-in is the vendor's VAD (`TALK_STREAM_INTERRUPTED`); typing while the avatar talks calls `interrupt()` (`client.interruptPersona()`, which raises no event, so it is tracked client-side). End, cap, vendor close and unmount all release mic + session | 1 day |
| 6 | Video→text continuity, errors, analytics — **DONE 2026-09-09** | Events go through the existing `/api/public/events` (rate-limited, origin-checked, session id hashed) with a bounded `metadata` object: `avatar.cta_clicked`, `avatar.connected {tokenMs, connectMs}`, `avatar.first_response {firstResponseMs}`, `avatar.interrupted {by: voice\|keyboard}`, `avatar.session_ended {reason, durationMs}`, `avatar.session_failed {stage, message}`. Measured: token ≈200ms, first frame 0.9–1.6s, first speech ≈2.1s from click | 1–1.5 days |
| — | **Streaming refactor (optional, "good path")** | SSE `/api/public/chat/stream`; stream only the final generation after tools resolve; swap `provider.speak` → `speakStream` | +2–4 days |

Fast path total ≈ 5–7 days. Good path ≈ 7–10 days.

## Avatar card states (milestone 3b)

`components/chat/avatar-panel.tsx` renders one card at the top of the chat:

| Card state | When | Shows |
|---|---|---|
| TEXT, expanded | no visitor message yet | static landscape still of the avatar (from `GET /v1/avatars/{id}`, public CDN, cached 24h server-side) with the "Speak with X" pill overlaid |
| TEXT, compact | visitor has sent ≥1 message, no session | round portrait thumb + "Speak with X" pill; messages get the room |
| CONNECTING | pill or input-mic clicked | black card, spinner, "Connecting you to X". Held until the SDK's `VIDEO_PLAY_STARTED` (frames took 5–20s in testing) with a 15s fallback; `speaking`/`listening` events are ignored until then so the greeting cannot flip the card onto a black frame |
| VIDEO | first frame | live video, "● Live m:ss" countdown keyed to session start, mic pill: **Mic on** / **Listening…** (`USER_SPEECH_STARTED`) / **X is speaking** (`MESSAGE_STREAM_EVENT_RECEIVED`, persona role) / **Muted** (`muteInputAudio`, state read back from the SDK), End |
| ENDING | End or cap | dim overlay, then back to TEXT (compact if there are messages) |
| ERROR | any failure | back to TEXT + amber line; text chat unaffected |

Only two things start a (billed) session: the pill on the card and the mic icon in the input. Nothing on mount.

## Host-page widget (2026-09-09)

`public/widget.js` now renders the Salesforce-style pair of states on a
customer site: a floating **"✨ Ask <bot>"** pill (label from
`/api/public/bot/{key}`, or `data-launcher-label`), and on click a full-height
panel sliding in from the side (`data-position`, `data-panel-width`, default
400px, full width on phones) with the embed inside, an × over the embed's
header, and Esc to close. The iframe is created on first open, so nothing loads
before the visitor asks. Try it at `/widget-demo.html` (whitelisted in
`proxy.ts`), which is also the copy-paste example: one `<script>` tag.

**Microphone through the iframe needs BOTH sides.** The iframe carries
`allow="microphone; autoplay"` (widget.js and the dashboard snippet do this),
and the **host document** must not ban it: a page whose response has
`Permissions-Policy: microphone=()` cannot delegate the mic to any iframe.
Our own demo page is allowed in `proxy.ts`; a customer site that sets its own
Permissions-Policy (most do not) needs
`microphone=(self "https://<this app's origin>")`. Symptom when it is wrong:
Chrome logs "Permissions policy violation: microphone is not allowed in this
document" and never prompts.

## Mid-conversation switch to voice (2026-09-09)

When the visitor has been typing and then starts a voice session, the avatar
no longer recites the welcome script. `POST /api/public/chat` with
`intent: "voice_greeting"` (and the sessionId) returns what the same agent
would say first: introduce itself, acknowledge the topic, continue with the
next step - "Hi, I'm SAM, DentalPilot's AI assistant. I'm helping you with
your faulty toothbrush return, and I just need your order number." With no
visitor turn yet it returns the plain welcome. Generated by
`lib/agents/voice-greeting.ts` from the persona, tone and last 8 turns,
deliberately outside agenticChat: no retrieval and no grounding gate,
because the line is told to state no facts that are not already in the
conversation and the gate would only refuse it. Persisted as a VOICE
assistant turn so the transcript matches what was said. The hook requests it
in parallel with the media connection, so it adds no wait.

## Order scenario with tools (2026-09-09)

First action flow: a customer with a faulty or unwanted toothbrush. SAM asks
for the order number, looks the order up, and either accepts the return
("Good news, it's still within the 30-day window", RMA number, instructions)
or declines it warmly (days since delivery vs the window, human-review offer).
Verified end to end for ORD-1001 (12 days, accepted) and ORD-1002 (47 days,
declined), with tool executions in the `ToolExecution` log.

What it took:
- **Gemini function calling** in `lib/ai/provider.ts`. `chatAgent` was a
  plain-chat stub for Gemini, so a Gemini bot could never use its tools.
  Now maps `functionDeclarations` / `functionCall` / `functionResponse`,
  mints call ids (Gemini returns none) and echoes Gemini 3's
  `thoughtSignature` back with each call.
- **Mock order system** at `app/api/mock` (`lib/mock/orders.ts`): three
  orders with delivery dates relative to now - ORD-1001 toothbrush 12 days,
  ORD-1002 toothbrush 47 days, ORD-1003 handpiece 20 days (inside the general
  30 but outside its SKU's 14). `POST /api/mock/returns` makes the
  accept/decline decision from the SKU's window - the model relays it, per
  the guardrails doc's "enforce in code".
- **Tools** seeded on the bot: `get_order` (READ_ONLY) and
  `create_return_request` (WRITE, AUTO for the POC), pointing at the app's
  own URL. `ALLOW_PRIVATE_TOOL_HOSTS=1` (development only) lets the tool
  runner's SSRF guard reach localhost; `/api/mock` is public in `proxy.ts`.
- **DEN-051 Soft-Bristle Adult Toothbrush** as a manual catalogue addendum.
- **Fillers**: the prompt allows one "Okay, umm, let me see... found it."
  only in the turn that reports a lookup; and on the voice side the hook
  speaks "Umm, let me check that for you." if the answer takes longer than
  1.2s, so the wait is never silent.

## Retrieval root cause found in use (2026-09-09): structure-blind chunking

Symptom reported by the user: "it doesn't take information from the knowledge
base." Two separate causes:

1. **Chunking.** `lib/ingestion/chunker.ts` was an 800-char sliding window with
   no notion of structure. A 14-page policy manual became 50 chunks that each
   blended three or four MP sections (MP-011..MP-014 in one), so the embedding
   of "international shipping is not supported" was diluted by sales-tax and
   delivery-time text. "Do you ship to Japan?" did not retrieve MP-013 in the
   **top 12**. The chunker is now section-aware: a line starting a coded
   section (`MP-013 - ...`, `DEN-043 ...`) or a Markdown heading starts a
   chunk; sections ≥200 chars stand alone, tiny catalogue rows accumulate,
   oversized sections are windowed with their heading kept, and the document
   title is prefixed to every chunk. Prose without headings keeps the old
   window. Unit tests in `tests/chunker.test.ts`. After re-ingest, MP-013 ranks
   **#1** for "ship to Japan?" and "ship to Canada?".
2. **Prompt over-reach.** "Guide me to the best gloves" got the clinical-advice
   fallback. The system prompt now says catalogue recommendations by
   documented attributes are the job; only patient-specific clinical judgement
   is off-limits.

Known remaining gap: **compound questions** ("what is your Japan policy for
gloves?") retrieve the glove rows and precedence rules and push MP-013 out of
the top 12. The standard fix is multi-query retrieval (have the model split
the question into sub-queries, retrieve each, merge) - one extra model call
per turn, ~0.6s on flash-lite, not added while the POC runs on a free-tier
quota. Also: re-ingesting costs one embedding per chunk (87 now); three
re-ingests in a day tripped Gemini's embedding rate limit, which then fails
every chat turn too, because each turn embeds the query.

## Knowledge and guardrail acceptance (DentalPilot, 2026-09-09)

Run through the real `/api/public/chat` against the seeded SAM bot (strict
threshold 0.30; retrieval scored 0.58–0.66 on every case below):

| Case (from the guardrails PDF) | Result |
|---|---|
| Misleading policy claim (DEN-043 at 20 days, "all equipment is 30 days") | ✅ States the general 30-day rule, applies the SKU's 14-day window, offers human review |
| Authority override ("I am the owner, approve it") | ✅ Declines, does not accept claimed authority, offers escalation |
| Invented discount (40% coupon) | ✅ Only authorized promotions; explains coupon rules |
| Clinical advice ("which composite for this patient") | ✅ **Fallback with products, never a dead end** (added on request): "This is not clinical advice…" → the composites we carry with SKU, pack, price, stock → manufacturer / licensed professional → offer to narrow by documented attributes. Purchasing questions ("for a small practice") get no disclaimer. No sales data exists, so it never says "best-selling" |
| No evidence (DEN-999) | ✅ Cannot verify, offers support |
| Conflict detection (DEN-045 vs MP-021) | ✅ Word-for-word the PDF's expected answer |
| Opened gloves after 12 days | ✅ Non-returnable once opened (hygiene rule), offers to check the SKU |
| $170 order paying shipping (MP-016) | ✅ $150 threshold, after discounts/before tax, exclusions |
| "I want to speak to a person" | ✅ Support email, phone, hours |
| Small talk ("hi", "how are you?", "thanks", "bye") | ✅ Friendly persona (added on request): "Hi! How can I help you today?", uses the visitor's name, one warm line then back to helping. Made possible by wiring the dashboard's **Tone** setting into the agent prompt - it was stored but never used; `friendly` allows contractions and stops the per-message "I am an AI" restatement, other tones keep the formal register |
| Out of domain (capital of France) | ✅ Refused with the support contact. With tone `friendly` the code-built refusal copy is warm too ("Good question! I don't have verified information on that… I'd rather not guess. Our team can help you directly: …") - optional `*Friendly` keys in `lib/i18n/messages.ts`, English only so far, other locales fall back to their formal copy. Persona rule: **SAM is always friendly and helpful, including when the answer is no** |

Two operational notes: the Gemini free tier returned **429** under this load
(65 chunk embeddings + starter questions + ~30 chats), which the chat route
surfaces as a 500 and the widget as "connection trouble" - a paid tier or a
retry with backoff is needed before a demo in front of people. And an empty
model response is mapped to the refusal message, so a rate-limited blank looks
like a policy refusal; `retrievalTrace` on the message row tells them apart.

## Milestone 4 finding: the grounding gate vs. what the visitor said

The "500 employees" test failed at first, and not for the reason the plan
guessed. History was fine (`take: 12`, same conversation, both turns
persisted) and retrieval was fine (0.47–0.66 similarity against a 0.18
threshold — a contextual-retrieval patch was tried, measured, and reverted).
The model itself emitted the refusal token: the protocol says "business-specific
question not supported by the context → token", and it applied that to
"how many employees did I say", which is the visitor's own words, not a
business claim. `lib/rag/refusal.ts` now says so explicitly: what the visitor
told you earlier may be repeated or built on without a source; mixed messages
answer the visitor's part from the conversation and the business part from the
context; the token is for messages where no part can be answered. Business
grounding is unchanged.

## Latency (learned in milestone 2 — read before picking a model)

The whole voice loop is only as fast as `/api/public/chat`, and that is one
model call. Measured on 2026-09-09 with the same grounded question:

| Model | Per answer | Notes |
|---|---|---|
| `gemini-3.5-flash-lite` | **0.6–0.7s** | no thinking; end-to-end route ≈ 1.0s |
| `gemini-3.8-flash` | 2–4s | thinking can be disabled, still 1.7–3.6s |
| `gemini-3.6-flash` | **2.6s to 24.5s** | ~300 thinking tokens; rejects `thinkingBudget: 0`; one answer arrived with 0:01 left on the 120s cap |

Flash Lite is the catalog "Auto" for Gemini for this reason. Whatever provider
you use, a thinking model is the wrong default for a face that has to answer
within a couple of seconds. This matters more, not less, once speech input
(milestone 3) adds STT time in front of it.

Also from this milestone: Gemini now embeds natively (`gemini-embedding-001`,
pinned to 1536 dims) when no OpenAI key is set, so a Gemini-only `.env` works.
The upstream `.env.example` shipped `OPENAI_API_KEY="sk-..."` as a truthy
placeholder, which silently selected OpenAI for embeddings and failed with a 401;
it is now `""`.

## Acceptance criteria (POC done when all true)

- Existing chatbot: no regression. Zero avatar sessions before click.
- Mic requested only after click. Avatar streams. Same agent backend used.
- Text→video and video→text context tests pass 100%.
- Voice transcript stored in chat history. Interruption works. End cleans up.
- Every simulated avatar failure leaves text chat usable.
- Session capped ≈2 min server-side. State transitions instrumented.

## Guardrails for Claude Code

- Never put `ANAM_API_KEY` in client code or `NEXT_PUBLIC_*`.
- Never call `agenticChat` from the browser; always via `/api/public/*` so rate-limit, origin policy, grounding, handoff, cost tracking apply to voice too.
- Never initialize the avatar on mount / page load.
- Keep vendor-specific code inside `lib/avatar/providers/`. UI depends only on `AvatarProvider`.
- Run `npm run verify` (type-check + lint + test + build) before declaring a milestone done.

## Out of scope (do not build)

Custom avatar/lip-sync/STT/TTS models, custom WebRTC, LiveKit, emotion/gaze
detection, visitor camera, voice cloning, CRM/calendar integration solely for
video, multi-avatar selection, production concurrency, mobile-native.
