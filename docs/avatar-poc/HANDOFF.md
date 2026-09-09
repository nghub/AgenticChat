# HANDOFF — Piper-style Avatar POC on AgenticChat

> Read this fully before touching any files. Then confirm you understand the plan
> and list the files you intend to create/modify before writing code.

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
- Data model: `Conversation.sessionId @unique` (this is the shared conversation id across text↔voice). `Message` has `role`/`content`/`conversationId` but **no `source` field**.
- Reusable helpers (import paths):
  - `@/lib/db/client` → `db`
  - `@/lib/security/rate-limit` → `getClientIp`, `rateLimit`, `rateLimitHeaders`, `getPublicChatRateLimitConfig`
  - `@/lib/bots/origin-policy` → `isOriginAllowed`
  - `@/lib/bots/public-key` → `resolvePublicBotKey(publicKey)` returns `{ bot, environment, version }`
  - `@/lib/ai/provider.ts` → the LLM provider interface pattern to mirror
- UI: `components/chat/embed-chat.tsx` (~492 lines) does `fetch("/api/public/chat").then(r=>r.json())`.

## Vendor facts verified (Anam)

- Session token: `POST https://api.anam.ai/v1/auth/session-token`, header `Authorization: Bearer ${ANAM_API_KEY}`, body `{ clientLabel?, personaConfig: { name, avatarId, voiceId, llmId?, systemPrompt?, maxSessionLengthSeconds, skipGreeting } }` → `{ sessionToken }`. Tokens ~1h, single-use.
- Omit `llmId` so Anam's built-in brain is disabled; our agent answers. Feed answers via `createTalkMessageStream()`; transcripts arrive via a message-history event.
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
| `MILESTONE_1_README.md` | `docs/avatar-poc/MILESTONE_1_README.md` |

## Env to add (`.env` + `.env.example`)

```
ANAM_API_KEY=""
ANAM_AVATAR_ID=""
ANAM_VOICE_ID=""
ANAM_MAX_SESSION_SECONDS="120"
PUBLIC_AVATAR_RATE_LIMIT_REQUESTS="5"
PUBLIC_AVATAR_RATE_LIMIT_WINDOW_SECONDS="60"
```

## VERIFY-ON-INSTALL (do this first, before any UI work)

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
| 1 | Avatar renders | files above + `AvatarPanel`, `SpeakWithPiperButton`, state machine TEXT→CONNECTING→VIDEO→ENDING→TEXT; hard-coded greeting; End cleans up mic/session | 1 day |
| 2 | Existing brain speaks | typed message → `/api/public/chat` → `provider.speak(answer)` | 1 day |
| 3 | Speech in | transcript → `/api/public/chat` → speak. Add Prisma migration `Message.source` enum `TEXT/VOICE`; extend chat route zod with `source?` and persist it | 1 day |
| 4 | Shared context test | "500 employees" test (text→video); revisit `take: 12` history cap if needed | 0.5 day |
| 5 | Interruption + cleanup | barge-in stops talk stream; End releases everything | 1 day |
| 6 | Video→text continuity, errors, analytics | events: avatar_cta_clicked, avatar_connected, avatar_first_response, avatar_interrupted, avatar_session_ended, avatar_session_failed; latency splits T0–T4 | 1–1.5 days |
| — | **Streaming refactor (optional, "good path")** | SSE `/api/public/chat/stream`; stream only the final generation after tools resolve; swap `provider.speak` → `speakStream` | +2–4 days |

Fast path total ≈ 5–7 days. Good path ≈ 7–10 days.

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
