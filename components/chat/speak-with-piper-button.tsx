"use client";

import { Video } from "lucide-react";

interface Props {
  botName: string;
  onClick: () => void;
  disabled?: boolean;
}

/**
 * The only way a voice session starts. A plain button, no preloading, no
 * connection on hover or mount - Anam bills from session start whether or not
 * anyone speaks, so the click IS the consent and the cost event.
 */
export default function SpeakWithPiperButton({ botName, onClick, disabled }: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="mb-2 flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-gray-900 bg-white px-3 text-sm font-medium text-gray-900 hover:bg-gray-900 hover:text-white disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
    >
      <Video className="h-4 w-4" aria-hidden />
      Speak with {botName}
    </button>
  );
}
