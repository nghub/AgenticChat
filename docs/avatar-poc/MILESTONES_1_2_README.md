# Milestones 1 & 2 — Avatar rendering, session token, and the existing brain speaking

> **STATUS: DONE (2026-09-09).** Verified live: click -> token minted ->
> avatar streams with the bot's welcome message spoken -> 120s countdown ->
> End releases everything and the text chat is untouched. Full state machine
> TEXT -> CONNECTING -> VIDEO -> ENDING -> TEXT exercised in the browser.
>
> To see it locally (Colima/plain Docker, no compose plugin needed - note the
> host port is 5433, and `.env.example`'s 5432 does not match docker-compose):
>
> ```
> docker run -d --name obc_postgres -p 5433:5432 \
>   -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=password -e POSTGRES_DB=openbusinesschat \
>   -v obc_postgres_data:/var/lib/postgresql/data pgvector/pgvector:pg16
> ```
>
> then set `DATABASE_URL` to `localhost:5433`, `npm run db:deploy`, then
> `node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --experimental-strip-types scripts/seed-avatar-poc.ts`
> and open http://localhost:3000/embed/piper-avatar-poc.
>
> **Milestone 2 is also DONE (2026-09-09):** a typed question goes through the
> unchanged `/api/public/chat`, the answer shows in the text list with its
> sources, and the avatar speaks the same text (`avatar.speak()` in
> `embed-chat.tsx`'s `sendMessage`). Verified live on a Gemini-only `.env`
> (`LLM_PROVIDER=gemini`, `GEMINI_API_KEY`, `GEMINI_MODEL=gemini-3.5-flash-lite`);
> the seed script ingests one paragraph of knowledge so there is something to
> answer from, and needs an LLM configured for that step:
> `set -a; source .env; set +a; npx -y tsx scripts/seed-avatar-poc.ts`

Give your existing agent a face. No new brain, no LiveKit, no streaming refactor yet.

## Files (drop into your repo at these paths)

```
app/api/public/avatar-session/route.ts   # server: mint short-lived Anam token
lib/avatar/types.ts                      # vendor-neutral AvatarProvider contract
lib/avatar/anam-session.ts               # server: exchange API key -> token (server-only)
lib/avatar/providers/anam.ts             # client: Anam impl of AvatarProvider
lib/avatar/index.ts                      # barrel + factory (add vendors here)
components/chat/use-avatar-session.ts    # client hook: transcript -> /api/public/chat -> speak
```

## Install

```bash
npm i @anam-ai/js-sdk
```

## Env (append to .env / .env.example)

```
# Anam realtime avatar (server-side only; never expose to the browser)
ANAM_API_KEY=""
ANAM_AVATAR_ID=""            # from the Anam Lab (a stock face is fine for POC)
ANAM_VOICE_ID=""             # from the Anam Lab
ANAM_MAX_SESSION_SECONDS="120"   # POC cost guard; free-tier hard ceiling is 180

# Optional: tighten avatar-session rate limiting (defaults 5 / 60s)
PUBLIC_AVATAR_RATE_LIMIT_REQUESTS="5"
PUBLIC_AVATAR_RATE_LIMIT_WINDOW_SECONDS="60"
```

## Wire into embed-chat.tsx

1. Add a `<video id="piper-avatar" />` inside a new `AvatarPanel` shown only in video mode. *(done: `components/chat/avatar-panel.tsx`)*
2. Add a **Speak with Piper** button (static thumbnail — do NOT connect on mount). *(done: `components/chat/speak-with-piper-button.tsx`, gated by `avatarEnabled` which the embed page derives from env)*
3. Call the hook, feeding it your existing conversation state:

```tsx
const avatar = useAvatarSession({
  publicKey,
  origin,
  locale,
  videoElementId: "piper-avatar",
  getSessionId: () => sessionId,
  setSessionId,
  appendUserMessage: (text, source) => setMessages((m) => [...m, { role: "user", content: text, source }]),
  appendAssistantMessage: (text) => setMessages((m) => [...m, { role: "assistant", content: text }]),
});

// button: onClick={avatar.start}   |   end: onClick={avatar.stop}
// render CONNECTING / VIDEO by avatar.status
```

Because both channels hit the same `/api/public/chat`, keyed by the same
`sessionId`, text->voice->text context continuity is automatic — the endpoint
already loads history by session.

## Verify-on-install (isolated to one file)

Everything vendor-specific and version-fragile is in `lib/avatar/providers/anam.ts`,
marked with ⚠. After installing, confirm against `node_modules/@anam-ai/js-sdk`:
- the `AnamEvent` member for the finalized user transcript (used in `onTranscript`);
- the talk-stream chunk/end + interrupt method names (used in `speak`/`interrupt`).
These have changed across SDK majors; the rest of the code does not depend on them.

## What this milestone does NOT include (by design)

- Streaming (`speakStream` is stubbed and ready for when `agenticChat` streams).
- `Message.source` persistence — the hook tags voice turns in the UI, but adding a
  `source` column to your Prisma `Message` model is the next small migration.
- Voice-mode system prompt (shorter, conversational answers).
```
