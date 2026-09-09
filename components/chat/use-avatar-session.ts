"use client";

import { useCallback, useRef, useState } from "react";
import { createAvatarProvider, type AvatarProvider, type AvatarStatus } from "@/lib/avatar";

/**
 * Drop-in hook for embed-chat.tsx. It proves the milestone-1/2 goal:
 * the EXISTING agent (via the EXISTING /api/public/chat) drives the new face.
 *
 * Flow per spoken turn:
 *   avatar transcript  ->  POST /api/public/chat  ->  answer  ->  avatar.speak()
 *                                                       └------>  your text list
 *
 * This uses your CURRENT non-streaming endpoint, so Piper speaks each answer
 * once the agent finishes (the "fast path" from the review). When you later
 * add an SSE variant, swap the marked block for provider.speakStream(stream).
 */

interface UseAvatarSessionArgs {
  publicKey: string;
  origin?: string;
  locale?: string;
  getSessionId: () => string | undefined;        // your existing conversation id
  setSessionId: (id: string) => void;            // persist id returned by /chat
  appendUserMessage: (text: string, source: "voice") => void;
  appendAssistantMessage: (text: string) => void;
  videoElementId: string;                        // id of the <video> in AvatarPanel
}

export function useAvatarSession(args: UseAvatarSessionArgs) {
  const [status, setStatus] = useState<AvatarStatus>("idle");
  const providerRef = useRef<AvatarProvider | null>(null);
  const unsubsRef = useRef<Array<() => void>>([]);

  const stop = useCallback(async () => {
    setStatus("closed");
    unsubsRef.current.forEach((u) => u());
    unsubsRef.current = [];
    await providerRef.current?.disconnect();
    providerRef.current = null;
    setStatus("idle"); // back to text mode — conversation state is untouched
  }, []);

  const start = useCallback(async () => {
    setStatus("connecting");
    try {
      // 1) Server mints a short-lived token (API key stays server-side).
      const res = await fetch("/api/public/avatar-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          publicKey: args.publicKey,
          origin: args.origin,
          sessionId: args.getSessionId(),
        }),
      });
      if (!res.ok) throw new Error(`session token ${res.status}`);
      const { sessionToken } = await res.json();

      // 2) Build the vendor-neutral provider and connect the video element.
      const provider = await createAvatarProvider("anam", sessionToken);
      providerRef.current = provider;

      unsubsRef.current.push(provider.onStatus(setStatus));

      // 3) Route every finalized transcript through the EXISTING agent.
      unsubsRef.current.push(
        provider.onTranscript(async (transcript) => {
          args.appendUserMessage(transcript, "voice");
          try {
            const chatRes = await fetch("/api/public/chat", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                publicKey: args.publicKey,
                message: transcript,
                sessionId: args.getSessionId(),
                origin: args.origin,
                locale: args.locale,
              }),
            });
            const data = await chatRes.json();
            if (data.sessionId) args.setSessionId(data.sessionId);

            // ---- swap this block for speakStream() once /chat streams ----
            const answer: string = data.answer ?? "";
            args.appendAssistantMessage(answer);
            await provider.speak(answer);
            // --------------------------------------------------------------
          } catch (err) {
            console.error("voice turn failed:", err);
            // Voice is an enhancement, never a dependency: fail quietly.
          }
        })
      );

      await provider.connect(args.videoElementId);
      setStatus("connected");
    } catch (err) {
      console.error("avatar start failed:", err);
      await stop();
      setStatus("error");
    }
  }, [args, stop]);

  return { status, start, stop };
}
