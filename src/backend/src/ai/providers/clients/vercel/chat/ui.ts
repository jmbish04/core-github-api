import type { AIProvider } from "@/ai/providers";
import type { VercelOptions } from "@/ai/providers/clients/vercel/types";
import { streamChatTextImpl } from "./text";

/**
 * Legacy support for assistant-ui streams
 */
export async function streamUIChatMessageImpl(
  provider: AIProvider,
  messages: any[],
  systemPrompt?: string,
  options?: VercelOptions
) {
  const result = await streamChatTextImpl(provider, messages, systemPrompt, options);
  return (result as any).toDataStreamResponse?.() || (result as any).toTextStreamResponse();
}
