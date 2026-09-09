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
   * Spoken as soon as the stream is up. Milestone 1 hard-codes this (the bot's
   * welcome message); Anam's own greeting is disabled server-side so there is
   * never a duplicate "Hi, how can I help?".
   */
  greeting?: string;
}

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
  const [error, setError] = useState<string | null>(null);
  const [sessionStartedAt, setSessionStartedAt] = useState<number | null>(null);
  const [maxSessionSeconds, setMaxSessionSeconds] = useState<number | null>(null);
  const providerRef = useRef<AvatarProvider | null>(null);
  const unsubsRef = useRef<Array<() => void>>([]);
  const stoppingRef = useRef(false);

  // Always read the freshest args (sessionId, locale, origin) at event time
  // rather than whatever render start() happened to be called from. This is
  // what keeps text->voice->text context on the SAME conversation.
  const argsRef = useRef(args);
  useEffect(() => {
    argsRef.current = args;
  });

  const stop = useCallback(async () => {
    if (stoppingRef.current) return;
    stoppingRef.current = true;
    setStatus("closed");
    unsubsRef.current.forEach((u) => u());
    unsubsRef.current = [];
    try {
      await providerRef.current?.disconnect();
    } finally {
      providerRef.current = null;
      setSessionStartedAt(null);
      setStatus("idle"); // back to text mode - conversation state is untouched
      stoppingRef.current = false;
    }
  }, []);

  const start = useCallback(async () => {
    if (providerRef.current) return; // a session is already live
    setError(null);
    setStatus("connecting");
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

      // 2) Build the vendor-neutral provider and connect the video element.
      const provider = await createAvatarProvider("anam", sessionToken);
      providerRef.current = provider;

      unsubsRef.current.push(
        provider.onStatus((next) => {
          // The vendor ended it (server-side cap, network drop): release the
          // mic and fall back to text instead of leaving a dead panel up.
          if (next === "closed") {
            void stop();
            return;
          }
          setStatus(next);
        })
      );

      // 3) Route every finalized transcript through the EXISTING agent.
      unsubsRef.current.push(
        provider.onTranscript(async (transcript) => {
          const live = argsRef.current;
          live.appendUserMessage(transcript, "voice");
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
              }),
            });
            const data = await chatRes.json();
            if (data.sessionId) live.setSessionId(data.sessionId);

            // ---- swap this block for speakStream() once /chat streams ----
            const answer: string = data.answer ?? "";
            if (answer) {
              live.appendAssistantMessage(answer);
              await provider.speak(answer);
            }
            // --------------------------------------------------------------
          } catch (err) {
            console.error("voice turn failed:", err);
            // Voice is an enhancement, never a dependency: fail quietly.
          }
        })
      );

      await waitForElement(a.videoElementId);
      await provider.connect(a.videoElementId);
      setSessionStartedAt(Date.now());
      setStatus("connected");

      if (a.greeting) await provider.speak(a.greeting);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Voice mode could not start.";
      console.error("avatar start failed:", err);
      await stop();
      setError(message);
      setStatus("error");
    }
  }, [stop]);

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

  // Widget closed mid-call: release the mic and the billed session.
  useEffect(() => {
    return () => {
      void stop();
    };
  }, [stop]);

  const mode = useMemo(() => modeFor(status), [status]);

  return { status, mode, error, start, stop, speak, sessionStartedAt, maxSessionSeconds };
}
