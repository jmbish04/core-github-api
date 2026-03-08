/**
 * CloudflareDocsAgent — Specialized Cloudflare Documentation Expert
 *
 * An expert agent for Cloudflare products, features, and best practices.
 * It combines documentation search (via MCP) with structured reasoning to provide 
 * high-fidelity answers and code samples following project conventions.
 * 
 * Inference Strategy:
 * 1. Primary: Gemini (JSON mode) for precise, structured rendering info.
 * 2. Fallback: Workers AI (Llama 3.x) for resilient plain-text responses.
 * 
 * Features:
 * - Dynamic system prompt resolution from KV.
 * - Repo-context-aware responses (aware of project file trees).
 * - Automatic logging of interactions for training and evaluation.
 * 
 * A concrete implementation of HonoBaseAgent focused on answering questions
 * about Cloudflare products, features, and best practices.
 *
 * This agent sources its system prompt from KV_CONFIGS (live-editable via
 * /api/agents/cloudflare-docs/system-prompt) and falls back to the compiled
 * SYSTEM_PROMPT_BASE constant when the KV key is absent.
 *
 * @module AI/Agents/CloudflareDocs
 */

import {
  HonoBaseAgent,
  HonoBaseAgentState,
  ContentBlock,
  HonoChatResult,
} from "@/ai/agents/base/HonoBaseAgent";
import { CF_DOCS_PROMPT_KV_KEY } from "@/ai/agents/constants";
import { makeQueryStandardsTool } from "@/ai/tools/standards";

// ─── Re-exports for backward compatibility ────────────────────────────────────

export type { ContentBlock };
/** @deprecated Use HonoChatResult from HonoBaseAgent instead */
export type CloudflareDocsChatResult = HonoChatResult;

// ─── State ────────────────────────────────────────────────────────────────────

type CloudflareDocsState = HonoBaseAgentState;

// ─── System prompt ────────────────────────────────────────────────────────────

export const SYSTEM_PROMPT_BASE = `You are an expert Cloudflare Support Engineer and Systems Architect.

You have been provided with relevant Cloudflare documentation. Use it as your primary reference.
Be specific, precise, and include working TypeScript code examples targeting Cloudflare Workers (nodejs_compat mode).`;

// ─── Agent ────────────────────────────────────────────────────────────────────

/**
 * CloudflareDocsAgent — Expert Cloudflare documentation agent.
 *
 * All runtime logic (WebSocket, RPC, Gemini, Workers AI fallback, logging)
 * is provided by HonoBaseAgent. This class only supplies identity + prompt.
 */
export class CloudflareDocsAgent extends HonoBaseAgent {
  protected get agentName(): string {
    return "CloudflareDocsAgent";
  }

  initialState: CloudflareDocsState = {
    repoContext: null,
    status: "idle",
    history: [],
    mcpCache: {},
  };

  protected async getSystemPromptBase(): Promise<string> {
    let resolvedPrompt = SYSTEM_PROMPT_BASE;
    try {
      const kvRaw = await (this.env as any).KV_CONFIGS.get(CF_DOCS_PROMPT_KV_KEY);
      if (kvRaw) {
        let parsed: any = null;
        try {
          parsed = JSON.parse(kvRaw);
        } catch(e){
          console.error("[CloudflareDocsAgent] KV_CONFIGS key is a raw string, using as-is", JSON.stringify(e));
        }
        const fromKv =
          parsed && typeof parsed === "object" && "value" in parsed
            ? (parsed.value as string)
            : kvRaw;
        if (fromKv && fromKv.length > 20) resolvedPrompt = fromKv;
      }
    } catch {
      /* KV unavailable — fall through */
    }

    try {
      const tool = makeQueryStandardsTool((this.env as any));
      const dynamicStandards = await tool.handler({});
      return `${resolvedPrompt}\n\n═══════════════════════════════════════════════════════\nREPOSITORY STANDARDIZATION RULES\n═══════════════════════════════════════════════════════\n${dynamicStandards}`;
    } catch (e) {
      console.error("[CloudflareDocsAgent] Failed to inject dynamic standards", e);
      return resolvedPrompt;
    }
  }
}
