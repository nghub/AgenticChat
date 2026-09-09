"use client";

/**
 * Anam implementation of the AvatarProvider contract (browser-side).
 *
 * VERIFIED against @anam-ai/js-sdk v4.27.0 (node_modules inspection):
 *   - createClient(sessionToken, options?)                         confirmed
 *   - client.streamToVideoElement(id, userProvidedAudioStream?)    confirmed (starts mic too)
 *   - client.stopStreaming(): Promise<void>                        confirmed
 *   - client.createTalkMessageStream(correlationId?)               confirmed, returns TalkMessageStream
 *   - client.interruptPersona(): void                              confirmed (on the client, not the stream)
 *   - TalkMessageStream.streamMessageChunk(text, endOfSpeech, utteranceId?): Promise<void>  confirmed
 *   - TalkMessageStream.endMessage(): Promise<void>                confirmed (use it OR endOfSpeech=true, not both)
 *   - AnamEvent.MESSAGE_HISTORY_UPDATED -> (messages: Message[])   confirmed
 *   - AnamEvent.CONNECTION_ESTABLISHED  -> ()                      confirmed
 *   - AnamEvent.CONNECTION_CLOSED       -> (reason, details?)      confirmed
 *   - AnamEvent.VIDEO_PLAY_STARTED      -> ()                      confirmed
 *   - MessageRole.USER === "user", MessageRole.PERSONA === "persona"
 *
 * All vendor-specific code stays in this file; the UI only sees AvatarProvider.
 */

import { createClient, AnamEvent, MessageRole } from "@anam-ai/js-sdk";
import type { AnamClient, Message } from "@anam-ai/js-sdk";
import type { AvatarProvider, AvatarStatus, Unsubscribe } from "../types";

export class AnamProvider implements AvatarProvider {
  private client: AnamClient;
  private currentTalk: ReturnType<AnamClient["createTalkMessageStream"]> | null = null;
  /**
   * MESSAGE_HISTORY_UPDATED re-emits the WHOLE history on every update, so the
   * same user turn arrives many times. Track the last id we forwarded to the
   * agent, otherwise every visitor sentence is answered repeatedly.
   */
  private lastForwardedUserMessageId: string | null = null;

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
      this.lastForwardedUserMessageId = null;
      await this.client.stopStreaming();
    } catch {
      // Closing is best-effort; text chat must survive regardless.
    }
  }

  async speak(text: string): Promise<void> {
    // Non-streaming POC path: send the whole answer as one chunk.
    const talk = this.client.createTalkMessageStream();
    this.currentTalk = talk;
    // endOfSpeech=true terminates the stream by itself; calling endMessage()
    // afterwards only earns an SDK warning (confirmed in a live session).
    await talk.streamMessageChunk(text, /* endOfSpeech */ true);
  }

  async speakStream(chunks: AsyncIterable<string>): Promise<void> {
    // Streaming path (use once agenticChat streams): pipe tokens as they land.
    const talk = this.client.createTalkMessageStream();
    this.currentTalk = talk;
    for await (const chunk of chunks) {
      await talk.streamMessageChunk(chunk, false);
    }
    // No final empty chunk needed: endMessage() sends the terminator.
    await talk.endMessage();
  }

  async interrupt(): Promise<void> {
    // Barge-in: stop the in-flight utterance. Interruption correlates against
    // the talk stream's correlationId, which the client tracks internally.
    try {
      this.client.interruptPersona();
    } finally {
      this.currentTalk = null;
    }
  }

  onTranscript(handler: (text: string) => void): Unsubscribe {
    // Anam finalizes the visitor's spoken turn via the message-history event,
    // which delivers the full history array on each update.
    const listener = (messages: Message[]) => {
      const latest = latestUserMessage(messages);
      if (!latest) return;
      if (latest.id === this.lastForwardedUserMessageId) return; // already handled
      this.lastForwardedUserMessageId = latest.id;
      handler(latest.content.trim());
    };
    this.client.addListener(AnamEvent.MESSAGE_HISTORY_UPDATED, listener);
    return () => this.client.removeListener(AnamEvent.MESSAGE_HISTORY_UPDATED, listener);
  }

  onStatus(handler: (status: AvatarStatus) => void): Unsubscribe {
    // Map the SDK's connection lifecycle onto our status enum.
    const onEstablished = () => handler("connected");
    const onVideoPlaying = () => handler("connected");
    const onClosed = () => handler("closed");

    this.client.addListener(AnamEvent.CONNECTION_ESTABLISHED, onEstablished);
    this.client.addListener(AnamEvent.VIDEO_PLAY_STARTED, onVideoPlaying);
    this.client.addListener(AnamEvent.CONNECTION_CLOSED, onClosed);

    return () => {
      this.client.removeListener(AnamEvent.CONNECTION_ESTABLISHED, onEstablished);
      this.client.removeListener(AnamEvent.VIDEO_PLAY_STARTED, onVideoPlaying);
      this.client.removeListener(AnamEvent.CONNECTION_CLOSED, onClosed);
    };
  }
}

/**
 * Newest USER turn in the history array. Anam sends the whole history on every
 * MESSAGE_HISTORY_UPDATED, so the caller de-dupes on Message.id.
 */
function latestUserMessage(messages: Message[]): Message | null {
  if (!Array.isArray(messages)) return null;
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m?.role === MessageRole.USER && typeof m.content === "string" && m.content.trim()) {
      return m;
    }
  }
  return null;
}
