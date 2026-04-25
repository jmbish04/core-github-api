import type { AIProvider } from "@/ai/providers";
import type { VercelOptions } from "@/ai/providers/clients/vercel/types";
import { convertToModelMessages, generateText } from "ai";
import { createVercelOpenAIClient } from "@/ai/providers/clients/vercel";
import { z } from "zod";

/**
 * Structured chat completion (Object)
 */
export async function generateChatStructuredImpl<T>(
  provider: AIProvider,
  messages: any[],
  schema: z.ZodType<T>,
  systemPrompt?: string,
  options?: VercelOptions
): Promise<T> {
  const { provider: pName, model: mName } = provider.resolveInvocation('text', options?.provider, options?.model);
  const client = await createVercelOpenAIClient(provider.env as Env, pName);
  const gatewayModel = provider.formatGatewayModel(pName, mName);

  // Note: we're using dynamic import here since older AI SDKs might not have generateObject.
  // Actually, let's just use generateText with JSON output instructions if generateObject fails or is missing.
  try {
    const { generateObject } = await import("ai");
    const result = await generateObject({
      model: client(gatewayModel),
      messages: await convertToModelMessages(messages),
      schema,
      system: systemPrompt,
      temperature: options?.temperature,
      maxTokens: options?.maxTokens,
    } as any);
    return result.object as T;
  } catch (e) {
      provider.logger.warn("Failed to generate structure using generateObject", e);
      // Fallback for AI SDK versions without generateObject
      const result = await generateText({
          model: client(gatewayModel),
          messages: await convertToModelMessages(messages),
          system: `${systemPrompt || ''}\n\nYou MUST return raw JSON adhering to this schema. ONLY output JSON, without markdown formatting.`,
          temperature: options?.temperature || 0.1,
          maxTokens: options?.maxTokens,
      } as any);
      return JSON.parse(result.text.replace(/```json|```/g, "").trim()) as T;
  }
}

/**
 * Streaming structured chat completion (Object)
 */
export async function streamChatStructuredImpl<T>(
  provider: AIProvider,
  messages: any[],
  schema: z.ZodType<T>,
  systemPrompt?: string,
  options?: VercelOptions
) {
  const { provider: pName, model: mName } = provider.resolveInvocation('text', options?.provider, options?.model);
  const client = await createVercelOpenAIClient(provider.env as Env, pName);
  const gatewayModel = provider.formatGatewayModel(pName, mName);

  const { streamObject } = await import("ai");
  return streamObject({
    model: client(gatewayModel),
    messages: await convertToModelMessages(messages),
    schema,
    system: systemPrompt,
    temperature: options?.temperature,
    maxTokens: options?.maxTokens,
  } as any);
}
