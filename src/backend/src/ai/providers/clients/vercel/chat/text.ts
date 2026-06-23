import type { AIProvider } from "@/ai/providers";
import type { VercelOptions } from "@/ai/providers/clients/vercel/types";
import { convertToModelMessages, streamText, generateText } from "ai";
import { createVercelOpenAIClient } from "@/ai/providers/clients/vercel";

/**
 * Standard chat completion (Text)
 */
export async function generateChatTextImpl(
  provider: AIProvider,
  messages: any[],
  systemPrompt?: string,
  options?: VercelOptions
): Promise<string> {
  const { provider: pName, model: mName } = provider.resolveInvocation('text', options?.provider, options?.model);
  const client = await createVercelOpenAIClient(provider.env as Env, pName);
  const gatewayModel = provider.formatGatewayModel(pName, mName);

  const result = await generateText({
    model: client(gatewayModel),
    messages: await convertToModelMessages(messages),
    system: systemPrompt,
    temperature: options?.temperature,
    maxTokens: options?.maxTokens,
  } as any);

  return result.text;
}

/**
 * Standard streaming chat completion (Text)
 */
export async function streamChatTextImpl(
  provider: AIProvider,
  messages: any[],
  systemPrompt?: string,
  options?: VercelOptions
): Promise<any> {
  const { provider: pName, model: mName } = provider.resolveInvocation('text', options?.provider, options?.model);
  const client = await createVercelOpenAIClient(provider.env as Env, pName);
  const gatewayModel = provider.formatGatewayModel(pName, mName);

  return streamText({
    model: client(gatewayModel),
    messages: await convertToModelMessages(messages),
    system: systemPrompt,
    temperature: options?.temperature,
    maxTokens: options?.maxTokens,
  } as any);
}
