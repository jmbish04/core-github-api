import type { AIProvider } from "@/ai/providers";
import type { VercelOptions } from "@/ai/providers/clients/vercel/types";
import { convertToModelMessages, generateText } from "ai";
import { createVercelOpenAIClient } from "@/ai/providers/clients/vercel";

/**
 * Multi-step tool execution (Streaming)
 */
export async function streamWithToolsImpl(
  provider: AIProvider,
  messages: any[],
  tools: Record<string, any>,
  systemPrompt?: string,
  options?: VercelOptions
) {
  const { provider: pName, model: mName } = provider.resolveInvocation('text', options?.provider, options?.model);
  const client = await createVercelOpenAIClient(provider.env as Env, pName);
  const gatewayModel = provider.formatGatewayModel(pName, mName);

  const { streamText } = await import("ai");

  const result = await streamText({
    model: client(gatewayModel),
    messages: await convertToModelMessages(messages),
    system: systemPrompt,
    tools: tools as any,
    maxSteps: options?.maxSteps || 5,
    temperature: options?.temperature,
  } as any);

  return (result as any).toDataStreamResponse?.() || (result as any).toTextStreamResponse();
}

/**
 * Multi-step tool execution (Non-streaming)
 */
export async function chatWithToolsImpl(
  provider: AIProvider,
  messages: any[],
  tools: Record<string, any>,
  systemPrompt?: string,
  options?: VercelOptions
) {
  const { provider: pName, model: mName } = provider.resolveInvocation('text', options?.provider, options?.model);
  const client = await createVercelOpenAIClient(provider.env as Env, pName);
  const gatewayModel = provider.formatGatewayModel(pName, mName);

  const result = await generateText({
    model: client(gatewayModel),
    messages: await convertToModelMessages(messages),
    system: systemPrompt,
    tools: tools as any,
    maxSteps: options?.maxSteps || 5,
    temperature: options?.temperature,
    maxTokens: options?.maxTokens,
  } as any);

  return result;
}
