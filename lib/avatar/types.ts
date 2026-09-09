/**
 * Vendor-neutral avatar contract.
 *
 * The UI depends ONLY on this interface, never on Anam-specific symbols.
 * Swapping Anam -> Tavus -> Simli -> a self-hosted stack later means writing
 * one new class that satisfies AvatarProvider; no chat/UI code changes.
 * This mirrors how lib/ai/provider.ts abstracts LLM vendors.
 */

export type AvatarStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "speaking"
  | "listening"
  | "error"
  | "closed";

export type Unsubscribe = () => void;

export interface AvatarProvider {
  /**
   * Attach the realtime stream to a DOM <video> element (by id) and start
   * microphone capture. Resolves once media is flowing.
   */
  connect(videoElementId: string): Promise<void>;

  /** Stop streaming, release the mic, and close the vendor session. */
  disconnect(): Promise<void>;

  /** Speak a complete utterance (used on the non-streaming POC path). */
  speak(text: string): Promise<void>;

  /**
   * Speak while your agent is still generating. Feed tokens/chunks as they
   * arrive from your streaming chat endpoint. Used once agenticChat streams.
   */
  speakStream(chunks: AsyncIterable<string>): Promise<void>;

  /** Immediately stop the current utterance (barge-in). */
  interrupt(): Promise<void>;

  /**
   * Fires when the vendor finalizes the visitor's spoken turn. The string is
   * the transcript you forward into your EXISTING agent, exactly as if the
   * visitor had typed it (with source: "voice").
   */
  onTranscript(handler: (text: string) => void): Unsubscribe;

  /** Lifecycle/status changes for driving the UI state machine. */
  onStatus(handler: (status: AvatarStatus) => void): Unsubscribe;
}
