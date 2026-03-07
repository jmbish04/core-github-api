/**
 * HonoBaseAgent — Abstract Base Class for Structured AI Agents
 *
 * Provides the shared runtime for all documentation/assistant agents built on
 * Cloudflare Durable Objects + the `agents` SDK. Concrete agents extend this
 * class and supply only two things:
 *   1. `agentName`       — a short identifier used in logs, MCP & User-Agent.
 *   2. `getSystemPromptBase()` — the expert persona for that agent.
 *
 * Runtime capabilities provided here:
 *   • WebSocket chat via `onMessage` (for frontend `useAgentChat` / assistant-ui)
 *   • REST/RPC chat via `@callable() chat()` (for Hono route stubs)
 *   • Gemini structured JSON output (primary, with full history)
 *   • Workers AI plain-text fallback (automatic, with follow-up generation)
 *   • MCP docs query + in-memory cache
 *   • GitHub repo tree context injection
 *   • Fire-and-forget D1 interaction logging
 *
 * @module AI/Agents/Base
 */

import { callable } from "agents";
import { BaseAgent, BaseAgentState, Tool } from "@/ai/agents/base/BaseAgent";
import type { SupportedProvider } from "@/ai/providers/config";
import { queryMCP } from "@/ai/mcp/mcp-client";
import { rewriteQuestionForMCP } from "@/ai/providers/index";
import { getDb, schema } from "@db";
import { JulesService } from "@/services/jules/jules";
import { generateUuid } from "@/utils/common";

// ─── Shared Types ─────────────────────────────────────────────────────────────

export interface HonoBaseAgentState extends BaseAgentState {
  repoContext: {
    url?: string;
    owner?: string;
    repo?: string;
  } | null;
  mcpCache: Record<string, string>;
  julesTaskQueue?: Array<{
    taskId: string;
    sessionId: string;
    taskDescription: string;
    status: string;
    createdAt: string;
  }>;
}

/** A single content block in the structured response */
export interface ContentBlock {
  /** "section_header" → h3 title | "text" → prose paragraph | "codeblock" → code panel */
  type: "section_header" | "text" | "codeblock";
  text: string;
  /** Only present when type === "codeblock" */
  language?: string;
}

/** The shape returned by both `chat()` (RPC) and the WebSocket "result" event */
export interface HonoChatResult {
  /** Typed blocks — consumed by the frontend renderer */
  blocks: ContentBlock[];
  /** Flat markdown reconstruction of blocks (used for clipboard copy + D1 logging) */
  response: string;
  followupPrompts: string[];
  modelUsed: string;
  sessionId: string;
}



// ─── Constants ─────────────────────────────────────────────────────────────────

const GEMINI_MODEL = "gemini-2.5-flash";
/** Llama 4 Scout: 131k context, structured JSON via guided_json, function calling */
const WORKERS_AI_MODEL = "@cf/meta/llama-4-scout-17b-16e-instruct";

/** Base JSON schema shape — enforced by the Gemini structured output API on every inference call.
 *  Child agents may override `responseSchema` to extend this with additional properties. */
export const BASE_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    blocks: {
      type: "array",
      description:
        "The response broken into typed content blocks, in order. Use section_header for titles/step names, text for prose paragraphs, codeblock for code. NEVER put filename paths, class names, or short identifiers inside 'codeblock' — those belong in 'text'. Only multi-line code snippets should be type 'codeblock'.",
      items: {
        type: "object",
        properties: {
          type: {
            type: "string",
            enum: ["section_header", "text", "codeblock"],
          },
          text: {
            type: "string",
            description:
              "The block content. For codeblock, the raw code only (no surrounding fences). For text/section_header, plain prose.",
          },
          language: {
            type: "string",
            description:
              "Programming language identifier (only for codeblock type, e.g. 'typescript', 'toml', 'bash')",
          },
        },
        required: ["type", "text"],
      },
      minItems: 1,
    },
    followupPrompts: {
      type: "array",
      description:
        "EXACTLY 3-5 suggested follow-up questions. Do NOT include these in the blocks array.",
      items: { type: "string" },
      minItems: 3,
      maxItems: 5,
    },
  },
  required: ["blocks", "followupPrompts"],
} as const;

// ─── Abstract Base Agent ───────────────────────────────────────────────────────

/**
 * HonoBaseAgent provides stateful, multi-turn technical assistance.
 *
 * It is optimised for both Hono API responses (via `@callable` RPC) and
 * frontend chat (via WebSockets / assistant-ui's `useAgentChat`).
 *
 * Child classes **must** implement:
 *   - `agentName` (getter) — short identifier for this agent
 *   - `getSystemPromptBase()` — async, returns the full expert system prompt
 *
 * Child classes **may** override:
 *   - `responseSchema` (getter) — extend the base Gemini response schema with
 *     additional properties (e.g. `scaffoldPlan`, `diagnosticReport`).
 *     Structured JSON output via `responseMimeType: "application/json"` is
 *     NON-NEGOTIABLE and is always enforced by the base class.
 *
 * @template E - Cloudflare Worker Env type (auto-generated by wrangler types)
 * @template S - Agent state shape, must extend HonoBaseAgentState
 */
export abstract class HonoBaseAgent<E extends Env = Env, S extends HonoBaseAgentState = HonoBaseAgentState> extends BaseAgent<E, S> {
  // ── Abstract interface ────────────────────────────────────────────────────────

  /** Short identifier used in logs, MCP scope, and the GitHub User-Agent header. */
  protected abstract get agentName(): string;

  /**
   * Returns the expert system prompt for this agent.
   * Called once per chat turn; may perform async lookups (e.g. KV reads).
   */
  protected abstract getSystemPromptBase(): Promise<string>;

  /**
   * The Gemini response schema enforced on every structured inference call.
   *
   * **Override this in child agents** to extend the response shape with
   * additional top-level properties. The base `blocks` + `followupPrompts`
   * fields are always required — do not remove them from your override.
   *
   * Structured JSON output (`responseMimeType: "application/json"`) is
   * NON-NEGOTIABLE and is always enforced by `callGeminiStructured()`.
   * This getter cannot be set to `null` or bypassed.
   *
   * @example Override in a child agent:
   * ```ts
   * protected get responseSchema() {
   *   return {
   *     ...BASE_RESPONSE_SCHEMA,
   *     properties: {
   *       ...BASE_RESPONSE_SCHEMA.properties,
   *       scaffoldPlan: { type: "object", properties: { ... } },
   *     },
   *     required: [...BASE_RESPONSE_SCHEMA.required, "scaffoldPlan"],
   *   };
   * }
   * ```
   */
  protected get responseSchema(): object {
    return BASE_RESPONSE_SCHEMA;
  }

  /**
   * The canonical RESPONSE FORMAT instructions automatically appended to every
   * agent's system prompt on each inference call.
   *
   * **Override in child agents** to specialize the format description (e.g. to
   * document extra fields added in a `responseSchema` extension). Never remove
   * the core `blocks` + `followupPrompts` contract from your override.
   *
   * Updating this single getter propagates the change to ALL agents instantly.
   */
  protected get promptFooter(): string {
    return `
═══════════════════════════════════════════════════════
RESPONSE FORMAT (CRITICAL — NON-NEGOTIABLE)
═══════════════════════════════════════════════════════
You MUST return valid JSON matching the enforced response schema. The root object requires:

1. "blocks": An ordered array of typed content blocks. Each block:
   - "type": "section_header" | "text" | "codeblock"
   - "text": the content (for codeblock: raw code only, no surrounding fences)
   - "language": (codeblock only) e.g. "typescript", "jsonc", "bash"

   CRITICAL rules:
   • Use "text" for ALL prose, including sentences referencing filenames or identifiers.
   • Only use "codeblock" for multi-line code meant for a file or terminal.
   • Single words, filenames, and inline identifiers belong in "text" — NOT in isolated "codeblock" blocks.
   • Do NOT add a Follow-up Questions section to blocks. That goes in followupPrompts only.
   • Numbered lists (1. 2. 3.) go in a single "text" block, one item per line.

2. "followupPrompts": EXACTLY 3-5 actionable follow-up questions the user would logically ask next.`;
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────────

  async onStart(): Promise<void> {
    this.logger.info(
      `${this.agentName} initialized (Gemini structured JSON / Workers AI fallback)`
    );
  }

  // ── WebSocket entry point ─────────────────────────────────────────────────────

  /**
   * Entry point for WebSocket-based interactive chat (frontend `useAgentChat`).
   * Sends a series of progress events followed by a single "result" frame:
   *   `{ type: "progress", step, text }` — displayed as step indicators
   *   `{ type: "result",   blocks, followupPrompts, modelUsed, sessionId }`
   *   `{ type: "error",    text }`
   *   `{ type: "fallback_alert", payload }` — emitted before fallback inference
   */
  async onMessage(
    connection: { send: (data: string) => void },
    rawMessage: string | ArrayBuffer
  ): Promise<void> {
    try {
      const data =
        typeof rawMessage === "string"
          ? JSON.parse(rawMessage)
          : JSON.parse(
              new TextDecoder().decode(rawMessage as ArrayBuffer)
            );
      if (data?.type !== "chat") return;

      const { message, history = [], context, source = "ws", sessionId } = data;
      if (!message) return;

      const send = (payload: object) =>
        connection.send(JSON.stringify(payload));
      const effectiveSessionId = sessionId || crypto.randomUUID();

      // 1. Resolve repo context
      let owner: string | undefined, repo: string | undefined;
      if (context?.repoUrl) {
        const match = context.repoUrl.match(/github\.com\/([^/]+)\/([^/]+)/);
        if (match) {
          owner = match[1];
          repo = match[2].replace(/\.git$/, "");
        }
      }

      // 2. MCP docs query
      send({
        type: "progress",
        step: "searching_context",
        text: `Searching ${this.agentName} knowledge base...`,
      });
      let docsContext = "";
      let mcpQuery = message;
      try {
        const rewritten = await rewriteQuestionForMCP(this.env, message);
        if (rewritten && rewritten.length > 0) mcpQuery = rewritten;
        docsContext = this.state.mcpCache[mcpQuery] || "";
        if (!docsContext) {
          const result = await queryMCP(mcpQuery, this.agentName);
          docsContext =
            typeof result === "string" ? result : JSON.stringify(result);
        }
        send({
          type: "progress",
          step: "mcp_done",
          text: `Found context (${docsContext.length} chars)`,
        });
      } catch {
        docsContext = "";
      }

      // 3. Repo tree context
      let repoContextInfo = "";
      if (owner && repo) {
        const tree = await this.fetchGithubTree(owner, repo);
        if (tree?.tree) {
          const sampled = tree.tree
            .filter(
              (t: { path: string }) =>
                t.path.includes("wrangler") || t.path.endsWith(".ts")
            )
            .slice(0, 20)
            .map((t: { path: string }) => t.path)
            .join(", ");
          repoContextInfo = `\n\nRepository Context (${owner}/${repo}):\nFiles: ${sampled}`;
        }
      }

      // 4. Query AI
      send({
        type: "progress",
        step: "querying_ai",
        text: "Generating response...",
      });

      const promptBase = await this.getSystemPromptBase();
      const systemPrompt = `${promptBase}${repoContextInfo}\n\n${this.promptFooter}`;
      const userPrompt = `Relevant Knowledge Context:\n---\n${docsContext}\n---\n\nUser Question: ${message}`;

      const geminiHistory = history
        .slice(-8)
        .map((h: { role: string; content: string }) => ({
          role: (h.role === "user" ? "user" : "model") as "user" | "model",
          content: h.content,
        }));
      const workersHistory = history
        .slice(-8)
        .map((h: { role: string; content: string }) => ({
          role: (h.role === "model" ? "assistant" : h.role) as
            | "user"
            | "assistant",
          content: h.content,
        }));

      let aiResult: { blocks: ContentBlock[]; followupPrompts: string[] };
      let modelUsed: string;

      const selectedModel = (data as { model?: string }).model || GEMINI_MODEL;

      try {
        if (selectedModel.startsWith("@cf/")) {
          aiResult = await this.callWorkersAIWithFollowups(
            systemPrompt,
            userPrompt,
            workersHistory,
            selectedModel
          );
          modelUsed = selectedModel;
          send({
            type: "progress",
            step: "ai_done",
            text: `Response generated with Workers AI ${selectedModel}`,
          });
        } else {
          aiResult = await this.callGeminiStructured(
            systemPrompt,
            userPrompt,
            geminiHistory,
            selectedModel
          );
          modelUsed = selectedModel;
          send({
            type: "progress",
            step: "ai_done",
            text: `Response generated with Gemini ${selectedModel}`,
          });
        }
      } catch (geminiErr) {
        const _geminiErr = geminiErr as Error;
        if (selectedModel.startsWith("@cf/")) {
          send({
            type: "error",
            text: `Workers AI failed: ${_geminiErr.message}`,
          });
          return;
        }
        send({
          type: "fallback_alert",
          payload: {
            fallbackUsed: true,
            originalProvider: selectedModel,
            errorMessage: _geminiErr.message,
          },
        });
        send({
          type: "progress",
          step: "fallback",
          text: "Primary model unavailable — switching to Workers AI...",
        });
        try {
          aiResult = await this.callWorkersAIWithFollowups(
            systemPrompt,
            userPrompt,
            workersHistory
          );
          modelUsed = WORKERS_AI_MODEL;
          send({
            type: "progress",
            step: "ai_done",
            text: "Response generated with Workers AI (fallback)",
          });
        } catch (workerErr) {
          const _workerErr = workerErr as Error;
          send({
            type: "error",
            text: `All AI providers failed: ${_geminiErr.message} | ${_workerErr.message}`,
          });
          return;
        }
      }

      const markdown = this.blocksToMarkdown(aiResult.blocks);

      // 5. Log + send result
      this.logInteraction({
        sessionId: effectiveSessionId,
        source,
        githubUrl: context?.repoUrl,
        userPrompt: message,
        mcpQuery,
        mcpResponse: docsContext,
        responseSent: markdown,
        followUpPrompts: aiResult.followupPrompts,
        provider: this.resolveProvider(modelUsed),
        modelUsed,
      });

      send({
        type: "result",
        blocks: aiResult.blocks,
        followupPrompts: aiResult.followupPrompts,
        modelUsed,
        sessionId: effectiveSessionId,
      });
    } catch (err) {
      const _err = err as Error;
      try {
        connection.send(
          JSON.stringify({ type: "error", text: _err.message || String(_err) })
        );
      } catch { /* ignore */ }
    }
  }

  // ── RPC / REST entry point ────────────────────────────────────────────────────

  /**
   * Entry point for REST/RPC-based programmatic queries (Hono route stubs).
   * Decorated with `@callable()` so the Agents SDK exposes it as an RPC method.
   */
  @callable()
  async chat(
    message: string,
    history: Array<{ role: string; content: string }>,
    context?: { repoUrl?: string },
    source: string = "api",
    sessionId?: string,
    model?: string
  ): Promise<HonoChatResult> {
    const effectiveSessionId = sessionId || crypto.randomUUID();
    try {
      this.logger.info(`${this.agentName}: chat request`, {
        message: message.slice(0, 80),
        source,
        sessionId: effectiveSessionId,
      });

      // ── 1. Resolve repo context ───────────────────────────────────────────────
      let owner: string | undefined, repo: string | undefined;
      if (context?.repoUrl) {
        const urlMatch = context.repoUrl.match(
          /github\.com\/([^/]+)\/([^/]+)/
        );
        if (urlMatch) {
          owner = urlMatch[1];
          repo = urlMatch[2].replace(/\.git$/, "");
          await this.setState({
            ...this.state,
            repoContext: { url: context.repoUrl, owner, repo },
          });
        }
      } else if (this.state.repoContext) {
        owner = this.state.repoContext.owner;
        repo = this.state.repoContext.repo;
      }

      // ── 2. MCP query rewrite + lookup ─────────────────────────────────────────
      let mcpQuery = message;
      try {
        const rewritten = await rewriteQuestionForMCP(this.env, message);
        if (rewritten && rewritten.length > 0) mcpQuery = rewritten;
      } catch (e) {
        this.logger.warn("rewriteQuestionForMCP fallback", e);
      }

      let docsContext = this.state.mcpCache[mcpQuery] || "";
      if (!docsContext) {
        try {
          const result = await queryMCP(mcpQuery, this.agentName);
          docsContext =
            typeof result === "string" ? result : JSON.stringify(result);
          await this.setState({
            ...this.state,
            mcpCache: { ...this.state.mcpCache, [mcpQuery]: docsContext },
          });
        } catch (e) {
          this.logger.warn(`MCP query failed: ${mcpQuery}`, e);
          docsContext = "No documentation results available.";
        }
      }

      // ── 3. Repo tree context ──────────────────────────────────────────────────
      let repoContextInfo = "";
      if (owner && repo) {
        const tree = await this.fetchGithubTree(owner, repo);
        if (tree?.tree) {
          const sampledFiles = tree.tree
            .filter(
              (t: { path: string }) =>
                t.path.includes("wrangler") ||
                t.path.includes("package.json") ||
                t.path.endsWith(".ts")
            )
            .slice(0, 20)
            .map((t: { path: string }) => t.path)
            .join(", ");
          repoContextInfo = `\n\nRepository Context (${owner}/${repo}):\nFiles: ${sampledFiles}`;
        }
      }

      // ── 4. Build prompts ──────────────────────────────────────────────────────
      const promptBase = await this.getSystemPromptBase();
      const systemPrompt = `${promptBase}${repoContextInfo}\n\n${this.promptFooter}`;
      const userPrompt = `Relevant Knowledge Context:\n---\n${docsContext}\n---\n\nUser Question: ${message}`;

      const geminiHistory = history.slice(-8).map((h) => ({
        role: (h.role === "user" ? "user" : "model") as "user" | "model",
        content: h.content,
      }));
      const workersHistory = history.slice(-8).map((h) => ({
        role: (h.role === "model" ? "assistant" : h.role) as
          | "user"
          | "assistant",
        content: h.content,
      }));

      // ── 5. Primary → fallback inference ──────────────────────────────────────
      this.setStatus("running");

      let aiResult: { blocks: ContentBlock[]; followupPrompts: string[] };
      let modelUsed: string;
      const selectedModel = model || GEMINI_MODEL;

      try {
        if (selectedModel.startsWith("@cf/")) {
          aiResult = await this.callWorkersAIWithFollowups(
            systemPrompt,
            userPrompt,
            workersHistory,
            selectedModel
          );
          modelUsed = selectedModel;
        } else {
          aiResult = await this.callGeminiStructured(
            systemPrompt,
            userPrompt,
            geminiHistory,
            selectedModel
          );
          modelUsed = selectedModel;
        }
      } catch (geminiErr) {
        const _geminiErr = geminiErr as Error;
        if (selectedModel.startsWith("@cf/")) {
          const errorMsg = `Workers AI Error: ${_geminiErr.message}`;
          this.logger.error("❌ Workers AI failed", { errorMsg });
          this.setStatus("failed");
          this.logInteraction({
            sessionId: effectiveSessionId,
            source,
            githubUrl: context?.repoUrl,
            userPrompt: message,
            mcpQuery,
            mcpResponse: docsContext,
            responseSent: "",
            followUpPrompts: [],
            provider: "workers-ai",
            modelUsed: selectedModel,
            error: errorMsg,
          });
          return {
            blocks: [
              {
                type: "text" as const,
                text: `I encountered an error: ${errorMsg}. Please try again.`,
              },
            ],
            response: `I encountered an error: ${errorMsg}. Please try again.`,
            followupPrompts: [],
            modelUsed: selectedModel,
            sessionId: effectiveSessionId,
          };
        }

        this.logger.warn(
          `⚠️ Gemini failed (${_geminiErr.message}), falling back to Workers AI`
        );
        try {
          aiResult = await this.callWorkersAIWithFollowups(
            systemPrompt,
            userPrompt,
            workersHistory,
            WORKERS_AI_MODEL
          );
          modelUsed = WORKERS_AI_MODEL;
          this.logger.info("✅ Workers AI fallback success");
        } catch (workerErr) {
          const _workerErr = workerErr as Error;
          const errorMsg = `Gemini: ${_geminiErr.message} | Workers AI: ${_workerErr.message}`;
          this.logger.error("❌ Both Gemini and Workers AI failed", {
            errorMsg,
          });
          this.setStatus("failed");
          this.logInteraction({
            sessionId: effectiveSessionId,
            source,
            githubUrl: context?.repoUrl,
            userPrompt: message,
            mcpQuery,
            mcpResponse: docsContext,
            responseSent: "",
            followUpPrompts: [],
            provider: "none",
            modelUsed: "none",
            error: errorMsg,
          });
          return {
            blocks: [
              {
                type: "text" as const,
                text: `I encountered an error: ${errorMsg}. Please try again.`,
              },
            ],
            response: `I encountered an error: ${errorMsg}. Please try again.`,
            followupPrompts: [],
            modelUsed: "none",
            sessionId: effectiveSessionId,
          };
        }
      }

      this.setStatus("idle");

      // ── 6. Log + return ───────────────────────────────────────────────────────
      const markdown = this.blocksToMarkdown(aiResult.blocks);
      this.logInteraction({
        sessionId: effectiveSessionId,
        source,
        githubUrl: context?.repoUrl,
        userPrompt: message,
        mcpQuery,
        mcpResponse: docsContext,
        responseSent: markdown,
        followUpPrompts: aiResult.followupPrompts,
        provider: this.resolveProvider(modelUsed),
        modelUsed,
      });

      return {
        blocks: aiResult.blocks,
        response: markdown,
        followupPrompts: aiResult.followupPrompts,
        modelUsed,
        sessionId: effectiveSessionId,
      };
    } catch (err) {
      const _err = err as Error;
      this.logger.error(
        `❌ Unhandled exception in ${this.agentName}.chat()`,
        { errorMsg: _err?.message, stack: _err?.stack }
      );
      this.setStatus("error");
      return {
        blocks: [
          {
            type: "text" as const,
            text: `The agent encountered an unexpected internal error: ${
              _err?.message || "Unknown error"
            }. Please try again.`,
          },
        ],
        response: `The agent encountered an unexpected internal error: ${
          _err?.message || "Unknown error"
        }. Please try again.`,
        followupPrompts: ["Retry my last message"],
        modelUsed: "none",
        sessionId: effectiveSessionId,
      };
    }
  }

  // ── Protected helpers ─────────────────────────────────────────────────────────

  protected blocksToMarkdown(b: ContentBlock[]): string {
    return b
      .map((blk) => {
        if (blk.type === "section_header") return `## ${blk.text}`;
        if (blk.type === "codeblock")
          return `\`\`\`${blk.language || ""}\n${blk.text}\n\`\`\``;
        return blk.text;
      })
      .join("\n\n");
  }

  protected async callGeminiStructured(
    systemPrompt: string,
    userPrompt: string,
    history: Array<{ role: "user" | "model"; content: string }>,
    modelStr: string
  ): Promise<{ blocks: ContentBlock[]; followupPrompts: string[] }> {
    const { createUniversalGatewayClient } = await import("../../utils/gateway-client");
    let apiKey = "cf-aig-byok-dummy-key";
    try { apiKey = await (this.env as any).GEMINI_API_KEY?.get() || apiKey; } 
    catch (e) {
      console.log(`[HonoBaseAgent] GEMINI_API_KEY not found`, JSON.stringify(e));
    }
    
    const client = await createUniversalGatewayClient(this.env as any, apiKey);
    
    const messages: any[] = [{ role: "system", content: systemPrompt }];
    history.forEach(h => {
      messages.push({ role: h.role === "model" ? "assistant" : "user", content: h.content });
    });
    messages.push({ role: "user", content: userPrompt });

    const namespacedModel = modelStr.includes('/') ? modelStr : `google-ai-studio/${modelStr}`;

    const geminiResponse = await client.chat.completions.create({
      model: namespacedModel,
      messages,
      max_tokens: 8192,
      temperature: 0.3,
      response_format: { type: "json_schema", json_schema: { name: "structured_output", schema: this.responseSchema as any, strict: true } }
    });

    const text = geminiResponse.choices[0]?.message?.content;
    if (!text) throw new Error("Gemini returned empty response");

    const parsed = JSON.parse(text);
    const blocks: ContentBlock[] = Array.isArray(parsed?.blocks)
      ? parsed.blocks.filter(
          (b: { type?: unknown; text?: unknown }) =>
            typeof b?.type === "string" && typeof b?.text === "string"
        )
      : [];

    if (blocks.length === 0)
      throw new Error("Gemini returned zero content blocks");

    const followupPrompts: string[] = Array.isArray(parsed?.followupPrompts)
      ? parsed.followupPrompts
          .filter((s: unknown) => typeof s === "string")
          .slice(0, 5)
      : [];

    if (followupPrompts.length < 3)
      throw new Error(
        `Gemini returned too few follow-up prompts (${followupPrompts.length}/3 min)`
      );

    return { blocks, followupPrompts };
  }

  protected parsePlainTextToBlocks(text: string): ContentBlock[] {
    const blocks: ContentBlock[] = [];
    const parts = text.split(/(```[\s\S]*?```)/g);
    for (const part of parts) {
      const trimmed = part.trim();
      if (!trimmed) continue;
      if (trimmed.startsWith("```")) {
        const lines = trimmed.split("\n");
        const lang = lines[0].replace("```", "").trim();
        const code = lines
          .slice(1)
          .join("\n")
          .replace(/```$/, "")
          .trim();
        if (code) blocks.push({ type: "codeblock", text: code, language: lang || "code" });
      } else {
        const paragraphs = trimmed.split(/\n\n+/);
        for (const para of paragraphs) {
          const p = para.trim();
          if (!p) continue;
          const headerMatch = p.match(/^#{1,3}\s+(.+)/);
          if (headerMatch) {
            blocks.push({ type: "section_header", text: headerMatch[1] });
          } else {
            const cleaned = p
              .replace(/^\*{0,2}Follow-up Questions?:?\*{0,2}[\s\S]*/im, "")
              .trim();
            if (cleaned) blocks.push({ type: "text", text: cleaned });
          }
        }
      }
    }
    return blocks.length > 0 ? blocks : [{ type: "text", text }];
  }

  protected async callWorkersAIWithFollowups(
    systemPrompt: string,
    userPrompt: string,
    history: Array<{ role: "user" | "assistant"; content: string }>,
    modelStr: string = WORKERS_AI_MODEL
  ): Promise<{ blocks: ContentBlock[]; followupPrompts: string[] }> {
    const messages: Array<{
      role: "system" | "user" | "assistant";
      content: string;
    }> = [
      { role: "system", content: systemPrompt },
      ...history,
      { role: "user", content: userPrompt },
    ];

    // Llama 4 Scout supports guided_json for native structured output — same
    // schema contract as the Gemini primary path so parsing is identical.
    const result = (await this.env.AI.run(modelStr as any, {
      messages,
      max_tokens: 4096,
      temperature: 0.3,
      guided_json: this.responseSchema,
    } as any)) as any;

    const responseText: string =
      result?.response ??
      result?.choices?.[0]?.message?.content ??
      result?.result?.response ??
      "";

    if (!responseText) throw new Error("Workers AI returned empty response");

    // Attempt to parse as structured JSON (guided_json enforces this shape)
    try {
      const parsed = JSON.parse(responseText);
      const blocks: ContentBlock[] = Array.isArray(parsed?.blocks)
        ? parsed.blocks
        : this.parsePlainTextToBlocks(responseText);
      const followupPrompts: string[] = Array.isArray(parsed?.followupPrompts)
        ? parsed.followupPrompts.slice(0, 5)
        : [
            "Can you show me a complete working code example?",
            "What are the common pitfalls to avoid with this approach?",
            "How does this integrate with an existing Cloudflare Workers project?",
          ];
      return { blocks, followupPrompts };
    } catch {
      // Graceful fallback: plain-text parse if JSON is malformed
      return {
        blocks: this.parsePlainTextToBlocks(responseText),
        followupPrompts: [
          "Can you show me a complete working code example?",
          "What are the common pitfalls to avoid with this approach?",
          "How does this integrate with an existing Cloudflare Workers project?",
        ],
      };
    }
  }

  protected async fetchGithubTree(
    owner: string,
    repo: string
  ): Promise<{ tree: { path: string; type: string; sha: string }[] } | null> {
    try {
      const res = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/git/trees/main?recursive=1`,
        {
          headers: {
            "User-Agent": this.agentName,
            Accept: "application/vnd.github.v3+json",
          },
        }
      );
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }

  // ── Jules AI Delegation ───────────────────────────────────────────────────────

  /**
   * Delegates a complex coding or scaffolding task to the Google Jules subsystem.
   * Leverages the calling agent's expertise to inject strict architectural constraints
   * into the Jules system prompt.
   *
   * @param taskDescription - High-level description of what Jules should build
   * @param constraints - Array of strict Cloudflare paradigms and constraints
   * @param context - Optional context object (e.g., repo scope)
   */
  @callable()
  async delegateToJules(
    taskDescription: string,
    constraints: string[],
    context?: { repoFullName?: string }
  ): Promise<{ taskId: string; sessionId: string; status: string }> {
    this.logger.info(`${this.agentName}: Delegating task to Jules`, { taskDescription });

    const julesService = JulesService.getInstance(this.env);
    const sessionId = generateUuid();
    const taskId = generateUuid();

    // 1. Compile the strict system prompt for Jules
    const basePersona = await this.getSystemPromptBase();
    const fullPrompt = `You are Jules, acting under the architecture constraints of ${this.agentName}.
    
YOUR PARENT ARCHITECT CONSTRAINTS:
${basePersona}

STRICT TASK CONSTRAINTS:
${constraints.map(c => "- " + c).join('\\n')}

YOUR MISSION:
${taskDescription}

Once you have completed the task and verified it, please respond indicating it is ready for PR.`;

    // 2. Start the Jules session
    const repoFullName = context?.repoFullName || "jmbish04/core-github-api";
    await julesService.startSession({
        sessionId,
        prompt: fullPrompt,
        repo: {
            owner: repoFullName.split('/')[0],
            repo: repoFullName.split('/')[1]
        }
    });

    // 3. Track in state
    const newTask = {
        taskId,
        sessionId,
        taskDescription,
        status: "pending",
        createdAt: new Date().toISOString()
    };

    const currentQueue = this.state.julesTaskQueue || [];
    await this.setState({
        ...this.state,
        julesTaskQueue: [...currentQueue, newTask]
    });

    return { taskId, sessionId, status: "pending" };
  }

  /**
   * Retrieves the current Jules task queue for this agent session.
   */
  @callable()
  async getJulesQueue(): Promise<unknown[]> {
    return this.state.julesTaskQueue || [];
  }

  protected logInteraction(params: {
    sessionId: string;
    source: string;
    githubUrl?: string;
    userPrompt: string;
    mcpQuery?: string;
    mcpResponse?: string;
    responseSent: string;
    followUpPrompts: string[];
    provider: string;
    modelUsed: string;
    error?: string;
  }): void {
    // Fire-and-forget — never block the chat response
    try {
      const db = getDb(this.env.DB);
      db.insert(schema.cloudflareDoscInteractions)
        .values({
          sessionId: params.sessionId,
          source: params.source,
          githubUrl: params.githubUrl ?? null,
          userPrompt: params.userPrompt,
          mcpQuery: params.mcpQuery ?? null,
          mcpResponse: params.mcpResponse
            ? params.mcpResponse.slice(0, 4000)
            : null,
          responseSent: params.responseSent,
          followUpPrompts: JSON.stringify(params.followUpPrompts),
          provider: params.provider,
          modelUsed: params.modelUsed,
          error: params.error ?? null,
          createdAt: new Date().toISOString(),
        })
        .run()
        .catch((err) =>
          this.logger.error(
            `[${this.agentName} Log] D1 insert failed`,
            err
          )
        );
    } catch (err) {
      this.logger.error(
        `[${this.agentName} Log] Failed to log interaction`,
        err
      );
    }
  }

  protected resolveProvider(modelUsed?: string | null): SupportedProvider {
    if (!modelUsed) return "workers-ai";
    const lower = modelUsed.toLowerCase();
    if (lower.startsWith("gemini")) return "google-ai-studio";
    if (lower.startsWith("claude")) return "anthropic";
    if (lower.startsWith("@cf/")) return "workers-ai";
    return "openai";
  }
}
