import type { Bot } from "@prisma/client";
import { getAIConfigForBot, getLLMProvider } from "@/lib/ai/provider";
import { liveBotConfig } from "@/lib/bots/versioning";
import { detectRefusalSentinel } from "@/lib/rag/refusal";
import { getLanguage } from "@/lib/i18n/languages";
import { toneRules } from "./agent-chat";
import { buildConversationMemory } from "./conversation-memory";
import { agentGuidanceText } from "./agent-config";

/**
 * The first thing the avatar says when a visitor switches from text to voice
 * mid-conversation: introduce itself, acknowledge what they were asking
 * about, and continue with the next step - instead of the canned welcome.
 *
 * Deliberately NOT agenticChat: no retrieval, no grounding gate. This line
 * carries no business facts (it is told not to state any that are not
 * already in the conversation), so the gate that protects facts would only
 * refuse it. With no visitor turn yet, the plain welcome message is right.
 */
export async function voiceGreeting(
  botRecord: Bot,
  history: Array<{ role: "user" | "assistant"; content: string }>,
  locale: string,
  conversationId: string | null = null
): Promise<string> {
  const bot = liveBotConfig(botRecord);
  if (!history.some((h) => h.role === "user")) return bot.welcomeMessage;
  const memory = await buildConversationMemory(conversationId);

  const language = getLanguage(locale)?.englishName || locale;
  const system = `You are ${bot.name}, a customer-facing AI assistant.
${toneRules(bot.tone)}
${agentGuidanceText(bot.agentConfig, bot.systemPrompt, bot.name) ? `- Business-authored style guidance: ${agentGuidanceText(bot.agentConfig, bot.systemPrompt, bot.name)}` : ""}

The visitor has been chatting with you by text and has just switched to a live voice conversation with you. Say the first thing you would say out loud, in ${language}:
- one short sentence introducing yourself by name as an AI assistant,
- a few words acknowledging what they were asking about,
- then continue with the single next step of that conversation: ask for what you still need (for example the order number) ONLY if you do not already have it, or answer the pending question if the answer is already in the conversation. If the memory below shows an order was already looked up, refer to it - do not ask for the order number again.
${memory ? `\n${memory}\n` : ""}
Two or three short sentences, plain text, no Markdown, no lists. Do not state any product, price, policy or order fact that is not already in the conversation. Never output a refusal token.`;

  try {
    const provider = getLLMProvider(await getAIConfigForBot(botRecord.id));
    const text = await provider.chat([
      { role: "system", content: system },
      ...history.slice(-8).map((h) => ({ role: h.role, content: h.content })),
      { role: "user", content: "(The visitor has just switched to voice. Greet them and continue.)" },
    ]);
    const { cleanedText } = detectRefusalSentinel(text);
    return cleanedText.trim() || bot.welcomeMessage;
  } catch (err) {
    console.warn("voice greeting failed, using welcome message:", err instanceof Error ? err.message : err);
    return bot.welcomeMessage;
  }
}
