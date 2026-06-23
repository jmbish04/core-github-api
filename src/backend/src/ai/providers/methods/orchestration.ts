import type { AIProvider } from '../index';
import type { AIOptions, UnifiedModel, ModelFilter } from '../types';
import * as openai from '../vendors/openai';
import * as gemini from '../vendors/gemini';
import * as anthropic from '../vendors/anthropic';
import * as workerAi from '../vendors/worker-ai';
import * as jules from '../vendors/jules';
import { z } from 'zod';

export async function verifyApiKeyImpl(ai: AIProvider, providerOverride?: string): Promise<boolean> {
  const { provider } = ai.resolveInvocation('text', providerOverride);
  ai.logger.info(`verifyApiKey`, { provider });
  await ai.logger.flush();

  switch (provider) {
    case 'openai': return openai.verifyApiKey(ai.env);
    case 'gemini': return gemini.verifyApiKey(ai.env);
    case 'anthropic': return anthropic.verifyApiKey(ai.env);
    case 'jules': return jules.verifyApiKey(ai.env);
    default: return workerAi.verifyApiKey(ai.env);
  }
}

export async function rewriteQuestionForMCPImpl(ai: AIProvider, question: string, context?: any, options?: AIOptions): Promise<string> {
  const systemPrompt = "You are a technical documentation assistant. Rewrite the user question to be clear, comprehensive, and optimized for querying Cloudflare documentation.";
  let prompt = `Original Question: ${question}\n\n`;

  if (context) {
    if (context.bindings?.length) prompt += `Bindings: ${context.bindings.join(", ")}\n`;
    if (context.libraries?.length) prompt += `Libraries: ${context.libraries.join(", ")}\n`;
    if (context.tags?.length) prompt += `Tags: ${context.tags.join(", ")}\n`;
    if (context.codeSnippets?.length) {
      prompt += `\nCode Context:\n${context.codeSnippets.map((s: any) => `File: ${s.file_path} (${s.relation})\n${s.code}`).join("\n\n")}`;
    }
  }

  const schema = z.object({
    rewritten_question: z.string().describe("The technical, search-optimized question.")
  });

  const result = await jules.generateStructuredResponse<{ rewritten_question: string }>(ai.env, prompt, schema, systemPrompt, options);
  return result.rewritten_question;
}

export async function analyzeResponseAndGenerateFollowUpsImpl(ai: AIProvider, originalQuestion: string, mcpResponse: any, options?: AIOptions): Promise<{ analysis: string; followUpQuestions: string[] }> {
  const systemPrompt = "You are a technical documentation analyst. Analyze responses from documentation and identify gaps.";
  const prompt = `Original Question: ${originalQuestion}\n\nDocumentation Response: ${JSON.stringify(mcpResponse, null, 2)}`;

  const schema = z.object({
    analysis: z.string().describe("Analysis of whether the response answers the question."),
    followUpQuestions: z.array(z.string()).describe("2-3 specific follow-up questions.")
  });

  return await ai.generateStructuredResponse<{ analysis: string; followUpQuestions: string[] }>(prompt, schema, systemPrompt, options);
}

export async function getModelsImpl(ai: AIProvider, provider?: string, filter?: ModelFilter): Promise<UnifiedModel[]> {
  const allModels: UnifiedModel[] = [];
  const fetchProviders = provider ? [provider] : ["gemini", "openai", "anthropic", "worker-ai"];

  const promises = fetchProviders.map(async (p) => {
    try {
      switch (p) {
        case 'google':
        case 'gemini': return await gemini.getGoogleModels(ai.env, filter);
        case 'openai': return await openai.getOpenAIModels(ai.env, filter);
        case 'anthropic': return await anthropic.getAnthropicModels(ai.env, filter);
        case 'cloudflare':
        case 'worker-ai': return await workerAi.getCloudflareModels(ai.env, filter);
        default: return [];
      }
    } catch (e) {
      console.warn(`[getModels] failed to fetch from ${p}:`, e);
      return [];
    }
  });

  const results = await Promise.all(promises);
  results.forEach(res => allModels.push(...res));

  return allModels;
}

export async function analyzeRepoImpl(ai: AIProvider, repoUrl: string, prompt: string): Promise<string> {
  return await jules.analyzeRepo(ai.env, repoUrl, prompt);
}

export async function completeTaskImpl(ai: AIProvider, repoUrl: string, issueId: string): Promise<string> {
  return await jules.completeTask(ai.env, repoUrl, issueId);
}

export async function createPlanImpl(ai: AIProvider, prompt: string, githubRepoUrl?: string): Promise<string> {
  return await jules.createPlan(ai.env, prompt, githubRepoUrl);
}

export async function setupOpenAIAgentClientImpl(ai: AIProvider, providerOverride?: string) {
  const { provider } = ai.resolveInvocation('text', providerOverride);
  const { setupOpenAIAgentClient } = await import('../clients/openai/agent');
  return setupOpenAIAgentClient(ai.env, provider as any);
}

export async function runWithOpenAIChatImpl(ai: AIProvider, prompt: string, instructions: string, options?: AIOptions): Promise<string> {
  const { provider, model } = ai.resolveInvocation('text', options?.provider, options?.model);
  const gatewayModel = ai.formatGatewayModel(provider, model);

  const { createOpenAIChatClient } = await import('../clients/openai/chat');
  const client = await createOpenAIChatClient(ai.env, provider as any);

  const response = await client.chat.completions.create({
    model: gatewayModel,
    messages: [
      { role: 'system', content: instructions },
      { role: 'user', content: prompt },
    ],
  });

  return response.choices?.[0]?.message?.content || '';
}

export async function runWithOpenAIAgentImpl(ai: AIProvider, prompt: string, agentOptions: any, options?: AIOptions): Promise<any> {
  const { provider, model } = ai.resolveInvocation('functions', options?.provider, options?.model);
  const gatewayModel = ai.formatGatewayModel(provider, model);

  const { createOpenAIAgent } = await import('../clients/openai/agent');
  const agent = await createOpenAIAgent(ai.env, provider as any, { ...agentOptions, model: gatewayModel });

  const { run } = await import('@openai/agents');
  return (await run(agent, prompt)).finalOutput;
}
