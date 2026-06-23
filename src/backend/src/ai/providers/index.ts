/**
 * AI Provider Registry & Unified Interface
 *
 * The thin entrypoint for all AI inference. Encapsulates state and lazily delegates
 * execution to modularized methods for optimal cold-start performance.
 *
 * @module AI/Providers
 */
import {
  resolveDefaultAiProvider,
  resolveDefaultAiModel,
  normalizeProvider,
  type ModelUseCase,
} from "./ai-gateway/config";
import { Logger } from "@/lib/logger";
import { z } from "zod";
import type { HealthStepResult } from "@/health/types";

export async function checkHealth(env: any): Promise<HealthStepResult> {
  return {
    name: "AI Agents",
    status: "success",
    message: "Agents layer operational",
    durationMs: 0
  };
}
import type {
  AIOptions, TextWithToolsResponse, StructuredWithToolsResponse,
  FileInput, UnifiedModel, ModelFilter,
} from "./types";

import { AgentStateStore } from './agent-support/state-store';
import { buildToolInstructions } from './agent-support/utils';
import { SkillManager } from './agent-support/skills';

// Re-export public types for consumers
export { getJulesClient } from './vendors/jules';
export type { OpenAIAgentOptions } from './clients';
export { REASONING_MODEL, STRUCTURING_MODEL } from './vendors/worker-ai';
export { tool } from 'ai';
export type {
  AIOptions, FallbackAlert, ToolCall, TextWithToolsResponse,
  StructuredWithToolsResponse, FileInput, ModelCapability,
  UnifiedModel, ModelFilter,
} from './types';

/**
 * AIProvider — the single entrypoint for all AI inference and client orchestration.
 *
 * Usage:
 *   const ai = new AIProvider(env);
 *   ai.provider = 'gemini';          // optional instance-level override
 *   await ai.generateText(prompt);
 */
export class AIProvider {
  public provider?: string;
  public model?: string;
  public env: Env;
  public logger: Logger;

  public readonly AgentStateStore = AgentStateStore;
  public readonly buildToolInstructions = buildToolInstructions;
  public readonly skills: SkillManager;

  constructor(env: Env) {
    this.env = env;
    this.logger = new Logger(env, 'AIProvider');
    this.skills = new SkillManager(env);
  }

  /**
   * Pre-loads skills into the cache. Ideal for `base-chat-agent` to await.
   */
  public async warmSkillCache(skills: string[]): Promise<void> {
    await this.skills.prefetch(skills);
  }

  // ---------------------------------------------------------------------------
  // Logging (Threads & Messages) — delegates to shared/chat-persistence.ts
  // ---------------------------------------------------------------------------

  public async logThreadMessage(deps: { ctx: DurableObjectState; env: Env; roomId: string }, msg: import('@/ai/agents/backend/CollaborationAgent/types').ChatMessage, userId?: string): Promise<void> {
    const { getDb } = await import('@db');
    const { upsertThread, insertMessage, addParticipant } = await import('@/shared/chat-persistence');
    const db = getDb(deps.env.DB);
    const threadId = await upsertThread(db, deps.roomId);
    const role: 'user' | 'assistant' | 'agent' =
      userId ? 'user' : msg.user === 'assistant' ? 'assistant' : 'agent';
    const contentParts = [
      { type: 'text', text: msg.text ?? '' },
      ...(msg.metadata ? [{ type: 'data', data: msg.metadata }] : []),
    ];
    await insertMessage(db, threadId, role, msg.user, contentParts);
    const participantRole = userId ? 'user' as const : 'participant' as const;
    await addParticipant(db, threadId, userId ? `user:${msg.user}` : msg.user, participantRole);
  }

  public async logAuditMessage(deps: { ctx: DurableObjectState; env: Env; roomId: string }, msg: import('@/ai/agents/backend/CollaborationAgent/types').ChatMessage, userId?: string): Promise<void> {
    // Flat audit log — not part of unified chat schema, stays in CollaborationAgent
    const { mirrorToD1 } = await import('@/ai/agents/backend/CollaborationAgent/methods/messaging');
    return mirrorToD1(deps as any, msg, userId);
  }

  // ---------------------------------------------------------------------------
  // Resolution
  // ---------------------------------------------------------------------------

  public resolveInvocation(
    useCase: ModelUseCase,
    optProvider?: string,
    optModel?: string,
  ): { provider: string; model: string } {
    const rawProvider = optProvider || this.provider || resolveDefaultAiProvider(this.env);
    const resolvedProvider = rawProvider === 'jules' ? 'jules' : normalizeProvider(rawProvider);

    let resolvedModel = optModel || this.model;
    if (!resolvedModel) {
      resolvedModel = resolvedProvider === 'jules' ? 'jules' : resolveDefaultAiModel(this.env, resolvedProvider as any, useCase);
    }

    return { provider: resolvedProvider, model: resolvedModel };
  }

  // ---------------------------------------------------------------------------
  // Agent Config — centralized D1-backed per-function overrides
  // ---------------------------------------------------------------------------

  /**
   * Fetch the active AI config for a specific agent method from D1.
   * Returns null if no active config row exists — agents should fall back
   * to their hardcoded defaults in that case.
   *
   * @example
   * ```ts
   * const cfg = await this.ai.getAgentFunctionConfig('OrchestratorAgent', 'submitRequest');
   * const provider = cfg?.primaryProvider ?? 'gemini';
   * const model    = cfg?.primaryModel    ?? 'gemini-2.0-flash';
   * ```
   */
  async getAgentFunctionConfig(agentName: string, functionName: string) {
    try {
      const { AgentConfigService } = await import('@/db/services/agent-config');
      const svc = new AgentConfigService(this.env);
      return await svc.getConfig(agentName, functionName);
    } catch {
      // D1 unavailable or schema not yet migrated — degrade gracefully
      return null;
    }
  }

  /**
   * Convenience: resolve config + create an OpenAI Agents SDK agent in one call.
   * Uses primary provider/model from DB config, falls back to provided defaults.
   *
   * @example
   * ```ts
   * const agent = await this.ai.createOpenAIAgentForFunction(
   *   'OrchestratorAgent', 'submitRequest',
   *   { name: 'Orchestrator', instructions: DEFAULT_INSTRUCTIONS }
   * );
   * const result = await run(agent, prompt);
   * ```
   */
  async createOpenAIAgentForFunction(
    agentName: string,
    functionName: string,
    defaults: import('./clients/openai/agent-sdk-helpers').OpenAIAgentOptions,
  ) {
    const { createOpenAIAgent } = await import('./clients/openai/agent');
    const cfg = await this.getAgentFunctionConfig(agentName, functionName);
    const provider = (cfg?.primaryProvider ?? 'gemini') as any;
    return createOpenAIAgent(this.env, provider, {
      name: defaults.name,
      instructions: cfg?.systemInstructions ?? defaults.instructions,
      model: cfg?.primaryModel ?? defaults.model,
      tools: defaults.tools,
    });
  }

  public formatGatewayModel(provider: string, model: string): string {
    if (provider === 'worker-ai' || provider === 'jules' || model.includes('/')) {
      return model;
    }
    const prefix = provider === 'gemini' ? 'google-ai-studio' : provider;
    return `${prefix}/${model}`;
  }

  // ---------------------------------------------------------------------------
  // Core Generation (Lazy Loaded)
  // ---------------------------------------------------------------------------

  public async generateText(prompt: string, systemPrompt?: string, options?: AIOptions): Promise<string> {
    const { generateTextImpl } = await import('./methods/generation');
    return generateTextImpl(this, prompt, systemPrompt, options);
  }

  public async generateStructuredResponse<T>(prompt: string, schema: z.ZodType<T>, systemPrompt?: string, options?: AIOptions): Promise<T> {
    const { generateStructuredResponseImpl } = await import('./methods/generation');
    return generateStructuredResponseImpl<T>(this, prompt, schema, systemPrompt, options);
  }

  public async generateTextWithTools(prompt: string, tools: any[], systemPrompt?: string, options?: AIOptions): Promise<TextWithToolsResponse> {
    const { generateTextWithToolsImpl } = await import('./methods/generation');
    return generateTextWithToolsImpl(this, prompt, tools, systemPrompt, options);
  }

  public async generateStructuredWithTools<T>(prompt: string, schema: z.ZodType<T>, tools: any[], systemPrompt?: string, options?: AIOptions): Promise<StructuredWithToolsResponse<T>> {
    const { generateStructuredWithToolsImpl } = await import('./methods/generation');
    return generateStructuredWithToolsImpl<T>(this, prompt, schema, tools, systemPrompt, options);
  }

  public async generateTextFromFiles(prompt: string, files: FileInput[], systemPrompt?: string, options?: AIOptions, providerOverride?: string): Promise<string> {
    const { generateTextFromFilesImpl } = await import('./methods/generation');
    return generateTextFromFilesImpl(this, prompt, files, systemPrompt, options, providerOverride);
  }

  public async generateStructuredResponseFromFiles<T>(prompt: string, files: FileInput[], schema: z.ZodType<T>, systemPrompt?: string, options?: AIOptions): Promise<T> {
    const { generateStructuredResponseFromFilesImpl } = await import('./methods/generation');
    return generateStructuredResponseFromFilesImpl<T>(this, prompt, files, schema, systemPrompt, options);
  }

  public async generateEmbedding(text: string): Promise<number[]> {
    const { generateEmbeddingImpl } = await import('./methods/generation');
    return generateEmbeddingImpl(this, text);
  }

  public async generateEmbeddings(text: string | string[]): Promise<number[][]> {
    const { generateEmbeddingsImpl } = await import('./methods/generation');
    return generateEmbeddingsImpl(this, text);
  }

  // ---------------------------------------------------------------------------
  // Orchestration & Clients (Lazy Loaded)
  // ---------------------------------------------------------------------------

  public async verifyApiKey(providerOverride?: string): Promise<boolean> {
    const { verifyApiKeyImpl } = await import('./methods/orchestration');
    return verifyApiKeyImpl(this, providerOverride);
  }

  public async setupOpenAIAgentClient(providerOverride?: string) {
    const { setupOpenAIAgentClientImpl } = await import('./methods/orchestration');
    return setupOpenAIAgentClientImpl(this, providerOverride);
  }

  public async rewriteQuestionForMCP(question: string, context?: any, options?: AIOptions): Promise<string> {
    const { rewriteQuestionForMCPImpl } = await import('./methods/orchestration');
    return rewriteQuestionForMCPImpl(this, question, context, options);
  }

  public async analyzeResponseAndGenerateFollowUps(originalQuestion: string, mcpResponse: any, options?: AIOptions): Promise<{ analysis: string; followUpQuestions: string[] }> {
    const { analyzeResponseAndGenerateFollowUpsImpl } = await import('./methods/orchestration');
    return analyzeResponseAndGenerateFollowUpsImpl(this, originalQuestion, mcpResponse, options);
  }

  public async getModels(provider?: string, filter?: ModelFilter): Promise<UnifiedModel[]> {
    const { getModelsImpl } = await import('./methods/orchestration');
    return getModelsImpl(this, provider, filter);
  }

  public async analyzeRepo(repoUrl: string, prompt: string): Promise<string> {
    const { analyzeRepoImpl } = await import('./methods/orchestration');
    return analyzeRepoImpl(this, repoUrl, prompt);
  }

  public async completeTask(repoUrl: string, issueId: string): Promise<string> {
    const { completeTaskImpl } = await import('./methods/orchestration');
    return completeTaskImpl(this, repoUrl, issueId);
  }

  public async createPlan(prompt: string, githubRepoUrl?: string): Promise<string> {
    const { createPlanImpl } = await import('./methods/orchestration');
    return createPlanImpl(this, prompt, githubRepoUrl);
  }

  public async runWithOpenAIChat(prompt: string, instructions: string, options?: AIOptions): Promise<string> {
    const { runWithOpenAIChatImpl } = await import('./methods/orchestration');
    return runWithOpenAIChatImpl(this, prompt, instructions, options);
  }

  public async runWithOpenAIAgent(prompt: string, agentOptions: any, options?: AIOptions): Promise<any> {
    const { runWithOpenAIAgentImpl } = await import('./methods/orchestration');
    return runWithOpenAIAgentImpl(this, prompt, agentOptions, options);
  }

  // ---------------------------------------------------------------------------
  // Agents SDK / Chat Orchestrator (Lazy Loaded)
  // ---------------------------------------------------------------------------

  public get chat() {
    return {
      generateText: async (messages: any[], systemPrompt?: string, options?: AIOptions) => {
        const { generateChatTextImpl } = await import('./clients/vercel/chat');
        return generateChatTextImpl(this, messages, systemPrompt, options);
      },
      streamUIMessage: async (messages: any[], systemPrompt?: string, options?: AIOptions) => {
        const { streamUIChatMessageImpl } = await import('./clients/vercel/chat');
        return streamUIChatMessageImpl(this, messages, systemPrompt, options);
      },
      chatWithTools: async (messages: any[], tools: Record<string, any>, systemPrompt?: string, options?: AIOptions) => {
        const { chatWithToolsImpl } = await import('./clients/vercel/chat');
        return chatWithToolsImpl(this, messages, tools, systemPrompt, options);
      },
      streamWithTools: async (messages: any[], tools: Record<string, any>, systemPrompt?: string, options?: AIOptions) => {
        const { streamWithToolsImpl } = await import('./clients/vercel/chat');
        return streamWithToolsImpl(this, messages, tools, systemPrompt, options);
      },
      delegateToSubagent: async (subagentName: string, prompt: string, context?: any) => {
        const { delegateToSubagentImpl } = await import('./clients/vercel/chat');
        return delegateToSubagentImpl(this, subagentName, prompt, context);
      },
      generateObject: async <T>(messages: any[], schema: z.ZodType<T>, systemPrompt?: string, options?: AIOptions) => {
        const { generateChatStructuredImpl } = await import('./clients/vercel/chat');
        return generateChatStructuredImpl<T>(this, messages, schema, systemPrompt, options);
      },
      streamObject: async <T>(messages: any[], schema: z.ZodType<T>, systemPrompt?: string, options?: AIOptions) => {
        const { streamChatStructuredImpl } = await import('./clients/vercel/chat');
        return streamChatStructuredImpl<T>(this, messages, schema, systemPrompt, options);
      }
    };
  }
}

// ─── Agent Support Primitives ────────────────────────────────────────────────
// Single canonical import for all agents: '@/ai/providers'.
export type {
  PersistentAgentState,
  StructuredChatState,
  AgentTool,
  ContentBlock,
  StructuredChatResult,
} from './agent-support/types';
export { BASE_RESPONSE_SCHEMA } from './agent-support/types';
export { AgentStateStore } from './agent-support/state-store';
export { BaseAgent } from './agent-support/base-agent';
export { BaseChatAgent } from './agent-support/base-chat-agent';
export { SkillManager } from './agent-support/skills';
export { HitlQueue } from './agent-support/hitl-queue';
export { CollaborationService } from './agent-support/collaboration-service';

export {
  runStructuredChat,
  buildChatPrompt,
} from './agent-support/structured-chat';
export {
  getMessageContent,
  buildToolInstructions,
  isZodSchema,
  normalizeBlocks,
  normalizeFollowupPrompts,
} from './agent-support/utils';
export type {
  EpisodicMemoryEntry,
  SemanticMemoryEntry,
  GraphNode,
  GraphEdge,
  GraphContext,
} from './agent-support/edigraph-memory';
export { EdigraphService } from './agent-support/edigraph-memory';
export { CF_DOCS_PROMPT_KV_KEY } from './agent-support/constants';
