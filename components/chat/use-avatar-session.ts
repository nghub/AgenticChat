"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createAvatarProvider, type AvatarProvider, type AvatarStatus } from "@/lib/avatar";

/**
 * Drop-in hook for embed-chat.tsx. It proves the milestone-1/2 goal:
 * the EXISTING agent (via the EXISTING /api/public/chat) drives the new face.
 *
 * Flow per spoken turn:
 *   avatar transcript  ->  POST /api/public/chat  ->  answer  ->  avatar.speak()
 *                                                       └------>  your text list
 *
 * This uses your CURRENT non-streaming endpoint, so the avatar speaks each
 * answer once the agent finishes (the "fast path" from the review). When you
 * later add an SSE variant, swap the marked block for provider.speakStream().
 */

/** Milestone-1 state machine the UI renders against: TEXT -> CONNECTING -> VIDEO -> ENDING -> TEXT. */
export type AvatarMode = "TEXT" | "CONNECTING" | "VIDEO" | "ENDING";

type StopReason = "user" | "vendor" | "unmount" | "error";

/**
 * Funnel + latency events, recorded through the existing /api/public/events
 * endpoint (rate-limited, origin-checked, session id hashed server-side).
 *   T0 CTA clicked  T1 token minted  T2 first frame  T3 first speech  T4 ended
 */
type AvatarEvent =
  | "avatar.cta_clicked"
  | "avatar.connected"
  | "avatar.first_response"
  | "avatar.interrupted"
  | "avatar.session_ended"
  | "avatar.session_failed";

interface UseAvatarSessionArgs {
  publicKey: string;
  origin?: string;
  locale?: string;
  getSessionId: () => string | undefined;        // your existing conversation id
  setSessionId: (id: string) => void;            // persist id returned by /chat
  appendUserMessage: (text: string, source: "voice") => void;
  appendAssistantMessage: (text: string) => void;
  videoElementId: string;                        // id of the <video> in AvatarPanel
  /**
   * Fallback greeting spoken as soon as the stream is up (the bot's welcome
   * message). Anam's own greeting is disabled server-side so there is never a
   * duplicate "Hi, how can I help?".
   */
  greeting?: string;
  /**
   * Context-aware greeting: called when a session starts, in parallel with
   * the connection, so a visitor who switches from text mid-conversation is
   * greeted with where they left off. Return null to use `greeting`.
   */
  getGreeting?: () => Promise<string | null>;
}

/**
 * What a person says while looking something up. Spoken only if the answer
 * has not arrived within FILLER_AFTER_MS, so quick answers stay crisp.
 */
const WAIT_FILLERS = [
  "Umm, let me check that for you.",
  "Aaa, one moment, I'm looking that up.",
  "Okay, let me have a look, one second.",
];
const FILLER_AFTER_MS = 1200;

function modeFor(status: AvatarStatus): AvatarMode {
  switch (status) {
    case "connecting":
      return "CONNECTING";
    case "connected":
    case "speaking":
    case "listening":
      return "VIDEO";
    case "closed":
      return "ENDING";
    default:
      // "idle" and "error" both leave the visitor in plain text chat.
      return "TEXT";
  }
}

/**
 * The <video> is rendered by the same state change that kicks off connect(),
 * so give React a beat to commit it before handing the id to the vendor SDK.
 */
async function waitForElement(id: string, timeoutMs = 1500): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!document.getElementById(id)) {
    if (Date.now() > deadline) throw new Error(`Video element #${id} never mounted`);
    await new Promise((r) => setTimeout(r, 25));
  }
}

export function useAvatarSession(args: UseAvatarSessionArgs) {
  const [status, setStatus] = useState<AvatarStatus>("idle");
  const statusRef = useRef<AvatarStatus>("idle");
  useEffect(() => {
    statusRef.current = status;
  }, [status]);
  const [error, setError] = useState<string | null>(null);
  const [sessionStartedAt, setSessionStartedAt] = useState<number | null>(null);
  const [maxSessionSeconds, setMaxSessionSeconds] = useState<number | null>(null);
  const [micMuted, setMicMuted] = useState(false);
  // Always read the freshest args (sessionId, locale, origin) at event time
  // rather than whatever render start() happened to be called from. This is
  // what keeps text->voice->text context on the SAME conversation.
  const argsRef = useRef(args);
  useEffect(() => {
    argsRef.current = args;
  });

  const providerRef = useRef<AvatarProvider | null>(null);
  const unsubsRef = useRef<Array<() => void>>([]);
  const stoppingRef = useRef(false);
  const micMutedRef = useRef(false);
  const connectedFallbackRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // First frame painted (or fallback elapsed). Until then the card shows
  // "Connecting" and every vendor status is held back, because the greeting
  // starts before frames arrive and would otherwise flip the card onto a black
  // rectangle. The last held status is applied once the frame lands.
  const videoReadyRef = useRef(false);
  const pendingStatusRef = useRef<AvatarStatus | null>(null);
  // Latency splits, ms since epoch. Reset per session.
  const tRef = useRef<{ t0: number; t1?: number; t2?: number; t3?: number }>({ t0: 0 });

  const track = useCallback((type: AvatarEvent, metadata?: Record<string, string | number | boolean>) => {
    const a = argsRef.current;
    void fetch("/api/public/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ publicKey: a.publicKey, type, sessionId: a.getSessionId(), origin: a.origin, metadata }),
      keepalive: true,
    }).catch(() => undefined); // analytics must never affect the session
  }, []);

  /**
   * Start a "let me check" filler that fires only if the answer takes longer
   * than a beat. Returns a cancel function; call it when the answer arrives.
   */
  const startWaitingFiller = useCallback((): (() => void) => {
    const provider = providerRef.current;
    if (!provider) return () => undefined;
    const filler = WAIT_FILLERS[Math.floor(Math.random() * WAIT_FILLERS.length)];
    const timer = setTimeout(() => {
      if (providerRef.current === provider) void provider.speak(filler).catch(() => undefined);
    }, FILLER_AFTER_MS);
    return () => clearTimeout(timer);
  }, []);

  const stop = useCallback(async (reason: StopReason = "user") => {
    if (stoppingRef.current) return;
    stoppingRef.current = true;
    if (tRef.current.t2) {
      track("avatar.session_ended", { reason, durationMs: Date.now() - tRef.current.t2 });
    }
    if (connectedFallbackRef.current) clearTimeout(connectedFallbackRef.current);
    connectedFallbackRef.current = null;
    videoReadyRef.current = false;
    pendingStatusRef.current = null;
    setStatus("closed");
    unsubsRef.current.forEach((u) => u());
    unsubsRef.current = [];
    try {
      await providerRef.current?.disconnect();
    } finally {
      providerRef.current = null;
      micMutedRef.current = false;
      setMicMuted(false);
      setSessionStartedAt(null);
      setStatus("idle"); // back to text mode - conversation state is untouched
      stoppingRef.current = false;
    }
  }, [track]);

  const start = useCallback(async () => {
    if (providerRef.current) return; // a session is already live
    setError(null);
    setStatus("connecting");
    tRef.current = { t0: Date.now() };
    track("avatar.cta_clicked");
    let stage: "token" | "connect" | "greeting" = "token";
    try {
      const a = argsRef.current;

      // 1) Server mints a short-lived token (API key stays server-side).
      const res = await fetch("/api/public/avatar-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          publicKey: a.publicKey,
          origin: a.origin,
          sessionId: a.getSessionId(),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Voice session request failed (${res.status})`);
      }
      const { sessionToken, maxSessionSeconds: cap } = await res.json();
      setMaxSessionSeconds(typeof cap === "number" ? cap : null);
      tRef.current.t1 = Date.now();
      stage = "connect";
      // Ask the agent what to say first while the media connects - no extra wait.
      const greetingPromise: Promise<string | null> = a.getGreeting
        ? a.getGreeting().catch(() => null)
        : Promise.resolve(null);

      // 2) Build the vendor-neutral provider and connect the video element.
      const provider = await createAvatarProvider("anam", sessionToken);
      providerRef.current = provider;

      unsubsRef.current.push(
        provider.onStatus((next) => {
          // The vendor ended it (server-side cap, network drop): release the
          // mic and fall back to text instead of leaving a dead panel up.
          if (next === "closed") {
            void stop("vendor");
            return;
          }
          if (next === "error") {
            setStatus(next);
            return;
          }
          if (next === "speaking" && videoReadyRef.current && !tRef.current.t3) {
            tRef.current.t3 = Date.now();
            track("avatar.first_response", { firstResponseMs: tRef.current.t3 - tRef.current.t0 });
          }
          if (!videoReadyRef.current) {
            // Vendor "connected" here means the connection, not a frame - the
            // element's own frame callback below decides when to show video.
            pendingStatusRef.current = next;
            return;
          }
          if (next === "connecting") return; // stale after the first frame
          setStatus(next);
        })
      );

      // Voice barge-in: the vendor's VAD cut the avatar off because the
      // visitor started talking. Keyboard barge-ins are tracked in interrupt()
      // because interruptPersona() does not raise this event.
      unsubsRef.current.push(provider.onInterrupted(() => track("avatar.interrupted", { by: "voice" })));

      // 3) Route every finalized transcript through the EXISTING agent.
      unsubsRef.current.push(
        provider.onTranscript(async (transcript) => {
          const live = argsRef.current;
          live.appendUserMessage(transcript, "voice");
          const cancelFiller = startWaitingFiller();
          try {
            const chatRes = await fetch("/api/public/chat", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                publicKey: live.publicKey,
                message: transcript,
                sessionId: live.getSessionId(),
                origin: live.origin,
                locale: live.locale,
                source: "VOICE", // persisted on the Message row
              }),
            });
            const data = await chatRes.json();
            cancelFiller();
            if (data.sessionId) live.setSessionId(data.sessionId);

            // ---- swap this block for speakStream() once /chat streams ----
            const answer: string = data.answer ?? "";
            if (answer) {
              live.appendAssistantMessage(answer);
              await provider.speak(answer);
            }
            // --------------------------------------------------------------
          } catch (err) {
            cancelFiller();
            console.error("voice turn failed:", err);
            // The text list already shows nothing; silence on the voice side
            // reads as a hang, so say so. Text chat is unaffected either way.
            try {
              await provider.speak("Sorry, I could not process that. Please try again in a moment.");
            } catch {
              // Nothing more to do; the session may already be gone.
            }
          }
        })
      );

      await waitForElement(a.videoElementId);
      await provider.connect(a.videoElementId);
      // Billing starts here, so the countdown does too.
      setSessionStartedAt(Date.now());

      // Show the video only once a frame has actually been painted. The
      // element is the source of truth, not the vendor's connection event:
      // frames have arrived 5-20s after connect in testing. If nothing paints
      // in 15s, show the stream anyway rather than hang on "Connecting".
      const markVideoReady = () => {
        if (videoReadyRef.current) return;
        videoReadyRef.current = true;
        if (connectedFallbackRef.current) clearTimeout(connectedFallbackRef.current);
        connectedFallbackRef.current = null;
        const held = pendingStatusRef.current;
        pendingStatusRef.current = null;
        const t = tRef.current;
        t.t2 = Date.now();
        track("avatar.connected", { tokenMs: (t.t1 ?? t.t2) - t.t0, connectMs: t.t2 - t.t0 });
        if (held === "speaking" && !t.t3) {
          t.t3 = t.t2;
          track("avatar.first_response", { firstResponseMs: t.t3 - t.t0 });
        }
        setStatus(held === "speaking" || held === "listening" ? held : "connected");
      };
      const videoEl = document.getElementById(a.videoElementId) as
        | (HTMLVideoElement & { requestVideoFrameCallback?: (cb: () => void) => number })
        | null;
      if (videoEl?.requestVideoFrameCallback) videoEl.requestVideoFrameCallback(markVideoReady);
      else videoEl?.addEventListener("loadeddata", markVideoReady, { once: true });
      connectedFallbackRef.current = setTimeout(markVideoReady, 15000);

      stage = "greeting";
      const greeting = (await greetingPromise) || a.greeting;
      if (greeting) await provider.speak(greeting);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Voice mode could not start.";
      console.error("avatar start failed:", err);
      track("avatar.session_failed", { stage, message: message.slice(0, 120) });
      await stop("error");
      setError(message);
      setStatus("error");
    }
  }, [stop, track, startWaitingFiller]);

  /**
   * Milestone 2: the answer to a TYPED message is spoken too. The text list
   * is the source of truth; this just gives it a voice while a session is up.
   * No-op in text mode, so callers do not need to check.
   */
  const speak = useCallback(async (text: string) => {
    const provider = providerRef.current;
    if (!provider || !text) return;
    try {
      await provider.speak(text);
    } catch (err) {
      console.error("avatar speak failed:", err);
    }
  }, []);

  /**
   * Barge-in from the keyboard: cut the avatar off so the typed question's
   * answer is not queued behind the rest of the previous one. Voice barge-in is
   * handled by the vendor's own VAD; both surface as onInterrupted.
   */
  const interrupt = useCallback(async () => {
    const provider = providerRef.current;
    if (!provider) return;
    try {
      await provider.interrupt();
      // Only a real cut-off counts; interrupting silence is a no-op.
      if (statusRef.current === "speaking") {
        track("avatar.interrupted", { by: "keyboard" });
        setStatus("connected"); // the vendor sends no event for this path
      }
    } catch (err) {
      console.error("avatar interrupt failed:", err);
    }
  }, [track]);

  /** Mute/unmute the visitor's mic mid-session. The session and the video stay up. */
  const toggleMic = useCallback(() => {
    const provider = providerRef.current;
    if (!provider) return;
    try {
      const actual = provider.setMicMuted(!micMutedRef.current);
      micMutedRef.current = actual;
      setMicMuted(actual);
    } catch (err) {
      console.error("avatar mic toggle failed:", err);
    }
  }, []);

  // Widget closed mid-call: release the mic and the billed session.
  useEffect(() => {
    return () => {
      void stop("unmount");
    };
  }, [stop]);

  const mode = useMemo(() => modeFor(status), [status]);

  return { status, mode, error, start, stop, speak, interrupt, startWaitingFiller, micMuted, toggleMic, sessionStartedAt, maxSessionSeconds };
}
