/**
 * @file backend/src/ai/agents/constants.ts
 * @description Shared constants for the Cloudflare Docs Agent.
 * Extracted to a standalone file to prevent circular imports between
 * CloudflareDocs.ts (which uses the KV key) and cloudflare-docs-prompt.ts
 * (which imports SYSTEM_PROMPT_BASE for the fallback response).
 */

/** KV_CONFIGS key that stores the custom Cloudflare Docs Agent system prompt. */
export const CF_DOCS_PROMPT_KV_KEY = "CF_DOCS_AGENT_SYSTEM_PROMPT";
