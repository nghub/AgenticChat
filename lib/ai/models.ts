/**
 * Curated catalog of supported models per provider.
 * "auto" picks the recommended default at runtime.
 */
export type ModelOption = { id: string; label: string; description?: string };

export const PROVIDER_MODELS: Record<
  "openai" | "anthropic" | "groq" | "ollama" | "gemini",
  {
    chat: ModelOption[];
    embedding?: ModelOption[];
    chatAuto: string;
    embeddingAuto?: string;
  }
> = {
  openai: {
    chat: [
      { id: "auto", label: "Auto (recommended)", description: "Use gpt-4o-mini — fast and inexpensive" },
      { id: "gpt-4o-mini", label: "GPT-4o mini", description: "Fast, cheap, great default" },
      { id: "gpt-4o", label: "GPT-4o", description: "Higher quality, slower, more expensive" },
      { id: "gpt-4.1-mini", label: "GPT-4.1 mini" },
      { id: "gpt-4.1", label: "GPT-4.1" },
      { id: "gpt-3.5-turbo", label: "GPT-3.5 Turbo", description: "Legacy, cheapest" },
    ],
    embedding: [
      { id: "auto", label: "Auto (recommended)", description: "text-embedding-3-small" },
      { id: "text-embedding-3-small", label: "text-embedding-3-small", description: "Default — 1536 dims" },
      { id: "text-embedding-3-large", label: "text-embedding-3-large", description: "Higher quality" },
      { id: "text-embedding-ada-002", label: "text-embedding-ada-002", description: "Legacy" },
    ],
    chatAuto: "gpt-4o-mini",
    embeddingAuto: "text-embedding-3-small",
  },
  anthropic: {
    chat: [
      { id: "auto", label: "Auto (recommended)", description: "Claude 3.5 Sonnet" },
      { id: "claude-3-5-sonnet-20241022", label: "Claude 3.5 Sonnet", description: "Best balance" },
      { id: "claude-3-5-haiku-20241022", label: "Claude 3.5 Haiku", description: "Faster, cheaper" },
      { id: "claude-3-opus-20240229", label: "Claude 3 Opus", description: "Highest quality" },
    ],
    chatAuto: "claude-3-5-sonnet-20241022",
  },
  groq: {
    chat: [
      { id: "auto", label: "Auto (recommended)", description: "Llama 3.1 8B Instant" },
      { id: "llama-3.1-8b-instant", label: "Llama 3.1 8B Instant", description: "Fast, free tier friendly" },
      { id: "llama-3.3-70b-versatile", label: "Llama 3.3 70B Versatile", description: "Higher quality" },
      { id: "mixtral-8x7b-32768", label: "Mixtral 8x7B" },
      { id: "gemma2-9b-it", label: "Gemma 2 9B" },
    ],
    chatAuto: "llama-3.1-8b-instant",
  },
  gemini: {
    // Verified against GET /v1beta/models on 2026-09-09: the 1.5 and 2.0
    // generations are retired (404 "no longer available"). Auto is Flash Lite
    // because it is the only one with predictable latency: measured 0.6-0.7s
    // per grounded answer, versus 2.6s-24.5s for 3.6 Flash on identical input
    // (it thinks ~300 tokens and rejects thinkingBudget: 0). Chat widgets and
    // the voice avatar both need the predictable one.
    chat: [
      { id: "auto", label: "Auto (recommended)", description: "Gemini 3.5 Flash Lite" },
      { id: "gemini-3.5-flash-lite", label: "Gemini 3.5 Flash Lite", description: "Fastest, cheapest, no thinking" },
      { id: "gemini-3.8-flash", label: "Gemini 3.8 Flash", description: "Newest Flash (2-4s)" },
      { id: "gemini-3.6-flash", label: "Gemini 3.6 Flash", description: "Thinking model, latency varies widely" },
      { id: "gemini-3.1-pro-preview", label: "Gemini 3.1 Pro (preview)", description: "Higher quality" },
    ],
    chatAuto: "gemini-3.5-flash-lite",
    embeddingAuto: "gemini-embedding-001",
  },
  ollama: {
    chat: [
      { id: "auto", label: "Auto (recommended)", description: "llama3.2" },
      { id: "llama3.2", label: "Llama 3.2" },
      { id: "llama3.1", label: "Llama 3.1" },
      { id: "mistral", label: "Mistral" },
      { id: "qwen2.5", label: "Qwen 2.5" },
      { id: "phi3", label: "Phi 3" },
    ],
    chatAuto: "llama3.2",
  },
};

/**
 * Resolve "auto" or empty to the actual model id.
 */
export function resolveModel(
  provider: keyof typeof PROVIDER_MODELS,
  selected: string | null | undefined,
  kind: "chat" | "embedding" = "chat"
): string {
  const cfg = PROVIDER_MODELS[provider];
  if (!selected || selected === "auto" || selected === "") {
    return kind === "embedding" ? cfg.embeddingAuto ?? cfg.chatAuto : cfg.chatAuto;
  }
  return selected;
}
