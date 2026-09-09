"use client";

import { useEffect, useState } from "react";
import { Loader2, Mic, PhoneOff } from "lucide-react";
import type { AvatarMode } from "./use-avatar-session";

interface Props {
  videoElementId: string;
  mode: AvatarMode;
  botName: string;
  onEnd: () => void;
  sessionStartedAt: number | null;
  maxSessionSeconds: number | null;
}

/**
 * The avatar's video surface. Rendered only while a voice session is in
 * flight - it must NOT exist in text mode, so nothing can start a (billed)
 * stream before the visitor clicks. The <video> is mounted as soon as we enter
 * CONNECTING because the vendor SDK needs the element id to attach to.
 */
export default function AvatarPanel({
  videoElementId,
  mode,
  botName,
  onEnd,
  sessionStartedAt,
  maxSessionSeconds,
}: Props) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!sessionStartedAt) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [sessionStartedAt]);

  const remaining =
    sessionStartedAt && maxSessionSeconds
      ? Math.max(0, maxSessionSeconds - Math.floor((now - sessionStartedAt) / 1000))
      : null;
  const mm = remaining !== null ? String(Math.floor(remaining / 60)).padStart(1, "0") : null;
  const ss = remaining !== null ? String(remaining % 60).padStart(2, "0") : null;

  return (
    <div className="relative w-full shrink-0 overflow-hidden bg-gray-950 aspect-video max-h-64">
      <video
        id={videoElementId}
        autoPlay
        playsInline
        className="h-full w-full object-cover"
        aria-label={`${botName} video`}
      />

      {mode === "CONNECTING" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-gray-950/80 text-white" role="status">
          <Loader2 className="h-6 w-6 animate-spin" aria-hidden />
          <p className="text-sm">Connecting to {botName}...</p>
          <p className="text-[11px] text-white/60">Your browser will ask for microphone access.</p>
        </div>
      )}

      {mode === "ENDING" && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-950/80 text-sm text-white" role="status">
          Ending...
        </div>
      )}

      {mode === "VIDEO" && (
        <div className="absolute start-2 top-2 flex items-center gap-1.5 rounded-full bg-black/60 px-2.5 py-1 text-[11px] text-white backdrop-blur">
          <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" aria-hidden />
          <Mic className="h-3 w-3" aria-hidden />
          <span>Live</span>
          {remaining !== null && (
            <span className="tabular-nums text-white/70" aria-label="Time remaining">
              {mm}:{ss}
            </span>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={onEnd}
        disabled={mode === "ENDING"}
        className="absolute bottom-2 end-2 flex min-h-11 items-center gap-1.5 rounded-full bg-red-600 px-3.5 text-xs font-medium text-white shadow hover:bg-red-500 disabled:opacity-50 transition-colors"
        aria-label="End voice session"
      >
        <PhoneOff className="h-3.5 w-3.5" aria-hidden />
        End
      </button>
    </div>
  );
}
