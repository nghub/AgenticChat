"use client";

/**
 * Anam implementation of the AvatarProvider contract (browser-side).
 *
 * VERIFY-ON-INSTALL — these top-level symbols are confirmed against the
 * @anam-ai/js-sdk README/docs, but the exact EVENT enum members and the
 * talk-stream controller method names have shifted across SDK majors. After
 * `npm i @anam-ai/js-sdk`, open node_modules/@anam-ai/js-sdk and confirm:
 *   - createClient(sessionToken)                     ✅ stable
 *   - client.streamToVideoElement(id)                ✅ stable (starts mic too)
 *   - client.stopStreaming()                         ✅ stable
 *   - client.createTalkMessageStream()               ✅ present (custom-LLM TTS)
 *   - the AnamEvent members used below  (⚠ confirm names/casing)
 *   - the talk controller's chunk/interrupt methods  (⚠ confirm names)
 * Anything marked ⚠ is isolated below so you only touch this one file.
 */

import { createClient, AnamEvent } from "@anam-ai/js-sdk";
import type { AvatarProvider, AvatarStatus, Unsubscribe } from "../types";

// Minimal structural type so we don't fight SDK generics in the POC.
type AnamClient = ReturnType<typeof createClient>;

export class AnamProvider implements AvatarProvider {
  private client: AnamClient;
  private currentTalk: { streamMessageChunk: (c: string, last: boolean) => void; endMessage?: () => void } | null = null;

  private constructor(client: AnamClient) {
    this.client = client;
  }

  /** Build from the short-lived token returned by /api/public/avatar-session. */
  static fromSessionToken(sessionToken: string): AnamProvider {
    return new AnamProvider(createClient(sessionToken));
  }

  async connect(videoElementId: string): Promise<void> {
    // Starts mic capture + renders the avatar's audio/video into the element.
    await this.client.streamToVideoElement(videoElementId);
  }

  async disconnect(): Promise<void> {
    try {
      this.currentTalk = null;
      await this.client.stopStreaming();
    } catch {
      // Closing is best-effort; text chat must survive regardless.
    }
  }

  async speak(text: string): Promise<void> {
    // Non-streaming POC path: send the whole answer as one chunk.
    const talk = this.client.createTalkMessageStream();
    this.currentTalk = talk as typeof this.currentTalk;
    talk.streamMessageChunk(text, /* isLastChunk */ true);
    // Some SDK versions require an explicit end; harmless if it no-ops.
    (talk as { endMessage?: () => void }).endMessage?.();
  }

  async speakStream(chunks: AsyncIterable<string>): Promise<void> {
    // Streaming path (use once agenticChat streams): pipe tokens as they land.
    const talk = this.client.createTalkMessageStream();
    this.currentTalk = talk as typeof this.currentTalk;
    let buffer: string[] = [];
    for await (const chunk of chunks) {
      buffer.push(chunk);
      talk.streamMessageChunk(chunk, false);
    }
    talk.streamMessageChunk("", true);
    (talk as { endMessage?: () => void }).endMessage?.();
    void buffer; // buffer kept only if you also want to persist the full text
  }

  async interrupt(): Promise<void> {
    // Barge-in: stop the in-flight utterance. ⚠ confirm method name in SDK.
    try {
      // Newer SDKs expose interruption on the client; older on the talk stream.
      const anyClient = this.client as unknown as { interruptPersona?: () => void };
      if (anyClient.interruptPersona) anyClient.interruptPersona();
      else this.currentTalk = null;
    } catch {
      this.currentTalk = null;
    }
  }

  onTranscript(handler: (text: string) => void): Unsubscribe {
    // Anam finalizes the visitor's spoken turn via a message-history event.
    // ⚠ Confirm the exact AnamEvent member; MESSAGE_HISTORY_UPDATED is typical.
    const listener = (payload: unknown) => {
      const text = extractLatestUserUtterance(payload);
      if (text) handler(text);
    };
    this.client.addListener(AnamEvent.MESSAGE_HISTORY_UPDATED, listener);
    return () => this.client.removeListener(AnamEvent.MESSAGE_HISTORY_UPDATED, listener);
  }

  onStatus(handler: (status: AvatarStatus) => void): Unsubscribe {
    // Map the SDK's connection lifecycle onto our status enum. ⚠ confirm names.
    const map: Array<[unknown, AvatarStatus]> = [
      [AnamEvent.CONNECTION_ESTABLISHED, "connected"],
      [AnamEvent.CONNECTION_CLOSED, "closed"],
      [AnamEvent.VIDEO_PLAY_STARTED, "connected"],
    ];
    const unsubs = map.map(([evt, status]) => {
      const l = () => handler(status);
      this.client.addListener(evt as never, l as never);
      return () => this.client.removeListener(evt as never, l as never);
    });
    return () => unsubs.forEach((u) => u());
  }
}

/**
 * The message-history payload is an array of turns; we want the newest USER
 * turn's text. Kept defensive because the payload shape varies by SDK version.
 */
function extractLatestUserUtterance(payload: unknown): string | null {
  const messages = Array.isArray(payload)
    ? payload
    : (payload as { messages?: unknown[] })?.messages;
  if (!Array.isArray(messages)) return null;
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i] as { role?: string; content?: string };
    if (m?.role === "user" && typeof m.content === "string" && m.content.trim()) {
      return m.content.trim();
    }
  }
  return null;
}
