"use client";

import { useEffect, useState } from "react";
import { Bot, Loader2, Maximize2, Mic, MicOff, Minimize2, PhoneOff, Volume2 } from "lucide-react";
import type { AvatarImages, AvatarStatus } from "@/lib/avatar";
import type { AvatarMode } from "./use-avatar-session";

interface Props {
  videoElementId: string;
  mode: AvatarMode;
  status: AvatarStatus;
  botName: string;
  images: AvatarImages | null;
  /** Conversation has started and no session is live: collapse to the pill. */
  compact: boolean;
  disabled?: boolean;
  onStart: () => void;
  onEnd: () => void;
  micMuted: boolean;
  onToggleMic: () => void;
  sessionStartedAt: number | null;
  maxSessionSeconds: number | null;
  /**
   * Picture-in-picture: the card fills its container as a small floating
   * video (the host widget shrinks the panel) so the visitor can use the page
   * while talking. Same <video> element, only restyled - the stream survives.
   */
  mini?: boolean;
  /** Present only when a host page can shrink the panel (embedded via widget.js). */
  onMinimize?: () => void;
  onRestore?: () => void;
}

/**
 * The avatar's card at the top of the chat - the "Piper" pattern:
 *
 *   TEXT, expanded   static portrait with "Speak with X" overlaid (face first)
 *   TEXT, compact    round thumb + "Speak with X" pill, messages get the room
 *   CONNECTING       black card, spinner, "Connecting you to X"
 *   VIDEO            live stream, countdown, who-is-talking mic pill, End
 *   ENDING           dim "Ending..." overlay
 *
 * The <video> only exists from CONNECTING onward, so nothing can stream (or
 * bill) before the visitor clicks. Clicking the card or the mic in the input
 * are the only two ways a session starts.
 */
export default function AvatarPanel({
  videoElementId,
  mode,
  status,
  botName,
  images,
  compact,
  disabled,
  onStart,
  onEnd,
  micMuted,
  onToggleMic,
  sessionStartedAt,
  maxSessionSeconds,
  mini = false,
  onMinimize,
  onRestore,
}: Props) {
  const still = images?.landscapeImageUrl ?? images?.imageUrl ?? null;
  const thumb = images?.portraitImageUrl ?? images?.imageUrl ?? null;

  if (mode === "TEXT" && compact) {
    return (
      <div className="flex justify-center bg-gray-50 px-3 pt-3">
        <button
          type="button"
          onClick={onStart}
          disabled={disabled}
          className="flex min-h-11 items-center gap-2 rounded-full border border-gray-300 bg-white py-1.5 pe-4 ps-1.5 text-sm font-medium text-gray-900 shadow-sm hover:border-gray-500 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
        >
          <span className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-sky-100">
            {thumb ? (
              // eslint-disable-next-line @next/next/no-img-element -- external CDN still, not optimizable
              <img src={thumb} alt="" className="h-full w-full object-cover" />
            ) : (
              <Bot className="h-4 w-4 text-sky-700" aria-hidden />
            )}
          </span>
          <Mic className="h-4 w-4" aria-hidden />
          Speak with {botName}
        </button>
      </div>
    );
  }

  if (mode === "TEXT") {
    return (
      <div className="bg-gray-50 px-3 pt-3">
        <div className="relative aspect-video max-h-56 w-full overflow-hidden rounded-xl bg-gradient-to-b from-sky-100 to-sky-200">
          {still ? (
            // eslint-disable-next-line @next/next/no-img-element -- external CDN still, not optimizable
            <img src={still} alt={`${botName} avatar`} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <Bot className="h-10 w-10 text-sky-700" aria-hidden />
            </div>
          )}
          <button
            type="button"
            onClick={onStart}
            disabled={disabled}
            className="absolute bottom-3 left-1/2 flex min-h-9 -translate-x-1/2 items-center gap-1.5 whitespace-nowrap rounded-full bg-blue-600 px-3.5 text-xs font-medium text-white shadow-md hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60 transition-colors"
          >
            <Mic className="h-3.5 w-3.5" aria-hidden />
            Speak with {botName}
          </button>
        </div>
      </div>
    );
  }

  // CONNECTING / VIDEO / ENDING share the video surface.
  const micPill =
    micMuted
      ? { icon: <MicOff className="h-3 w-3" aria-hidden />, label: "Muted", cls: "bg-gray-700/80" }
      : status === "listening"
        ? { icon: <Mic className="h-3 w-3 animate-pulse" aria-hidden />, label: "Listening...", cls: "bg-emerald-600/90" }
        : status === "speaking"
          ? { icon: <Volume2 className="h-3 w-3" aria-hidden />, label: `${botName} is speaking`, cls: "bg-blue-600/90" }
          : { icon: <Mic className="h-3 w-3" aria-hidden />, label: "Mic on", cls: "bg-black/60" };

  return (
    <div className={mini ? "h-full w-full bg-gray-950" : "bg-gray-50 px-3 pt-3"}>
      <div className={mini ? "relative h-full w-full overflow-hidden bg-gray-950" : "relative aspect-video max-h-56 w-full overflow-hidden rounded-xl bg-gray-950"}>
        <video
          id={videoElementId}
          autoPlay
          playsInline
          className="h-full w-full object-cover"
          aria-label={`${botName} video`}
        />

        {mode === "CONNECTING" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-gray-950 text-white" role="status">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white/10">
              <Loader2 className="h-6 w-6 animate-spin" aria-hidden />
            </span>
            <p className="text-sm font-semibold">Connecting you to {botName}</p>
            <p className="-mt-2 text-xs text-white/70">Ask a question by voice, or keep typing</p>
          </div>
        )}

        {mode === "ENDING" && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-950/80 text-sm text-white" role="status">
            Ending...
          </div>
        )}

        {mode === "VIDEO" && !mini && (
          <>
            <div className="absolute start-2 top-2 flex items-center gap-1.5 rounded-full bg-black/60 px-2.5 py-1 text-[11px] text-white backdrop-blur">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" aria-hidden />
              <span>Live</span>
              {sessionStartedAt && maxSessionSeconds && (
                // Keyed on the session start so the clock initialises fresh
                // each session instead of carrying a stale timestamp.
                <Countdown key={sessionStartedAt} startedAt={sessionStartedAt} maxSeconds={maxSessionSeconds} />
              )}
            </div>

            <button
              type="button"
              onClick={onToggleMic}
              aria-pressed={micMuted}
              aria-label={micMuted ? "Unmute microphone" : "Mute microphone"}
              className={`absolute bottom-2 start-2 flex min-h-9 items-center gap-1.5 rounded-full px-3 text-[11px] font-medium text-white backdrop-blur transition-colors ${micPill.cls}`}
            >
              {micPill.icon}
              <span>{micPill.label}</span>
            </button>

            <div className="absolute bottom-2 end-2 flex items-center gap-1.5">
              {onMinimize && (
                <button
                  type="button"
                  onClick={onMinimize}
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur hover:bg-black/80 transition-colors"
                  aria-label="Minimize to a small window"
                  title="Keep talking while you browse"
                >
                  <Minimize2 className="h-4 w-4" aria-hidden />
                </button>
              )}
              <button
                type="button"
                onClick={onEnd}
                className="flex min-h-9 items-center gap-1.5 rounded-full bg-red-600 px-3.5 text-xs font-medium text-white shadow hover:bg-red-500 transition-colors"
                aria-label="End voice session"
              >
                <PhoneOff className="h-3.5 w-3.5" aria-hidden />
                End
              </button>
            </div>
          </>
        )}

        {mode === "VIDEO" && mini && (
          // Picture-in-picture control bar, the reference's mic / expand / End.
          <div className="absolute bottom-2 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full bg-white/95 p-1 shadow-lg backdrop-blur">
            <button
              type="button"
              onClick={onToggleMic}
              aria-pressed={micMuted}
              aria-label={micMuted ? "Unmute microphone" : "Mute microphone"}
              className={`flex h-9 w-9 items-center justify-center rounded-full transition-colors ${micMuted ? "bg-gray-200 text-gray-700" : status === "listening" ? "bg-emerald-100 text-emerald-700" : "text-gray-800 hover:bg-gray-100"}`}
            >
              {micMuted ? <MicOff className="h-4 w-4" aria-hidden /> : <Mic className={`h-4 w-4 ${status === "listening" ? "animate-pulse" : ""}`} aria-hidden />}
            </button>
            <button
              type="button"
              onClick={onRestore}
              className="flex h-9 w-9 items-center justify-center rounded-full text-gray-800 hover:bg-gray-100 transition-colors"
              aria-label="Expand the chat"
            >
              <Maximize2 className="h-4 w-4" aria-hidden />
            </button>
            {sessionStartedAt && maxSessionSeconds && (
              <span className="px-1 text-[11px] tabular-nums text-gray-500">
                <Countdown key={sessionStartedAt} startedAt={sessionStartedAt} maxSeconds={maxSessionSeconds} />
              </span>
            )}
            <button
              type="button"
              onClick={onEnd}
              className="flex min-h-9 items-center rounded-full px-3 text-xs font-semibold text-red-600 hover:bg-red-50 transition-colors"
              aria-label="End voice session"
            >
              End
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/** m:ss remaining on the server-side session cap. */
function Countdown({ startedAt, maxSeconds }: { startedAt: number; maxSeconds: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const remaining = Math.max(0, maxSeconds - Math.max(0, Math.floor((now - startedAt) / 1000)));
  return (
    <span className="tabular-nums opacity-80" aria-label="Time remaining">
      {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, "0")}
    </span>
  );
}
