/**
 * @file ai/tools/codemode-tool.ts
 * @description V8 Codemode tool wrapper — gated behind CODEMODE_ENABLED.
 *
 * Creates a single `createCodeTool` instance that lets the LLM write
 * and execute JavaScript to orchestrate multiple tool calls in a
 * secure Worker sandbox.
 *
 * SECURITY GATES:
 *   1. env.CODEMODE_ENABLED must be '1' — throws otherwise (never silently fails)
 *   2. Tools are pre-filtered through registry-codemode-filter (fail-closed)
 *   3. Execution runs in DynamicWorkerExecutor with env.LOADER binding
 *
 * This wrapper is the SINGLE call site for `createCodeTool` in the codebase.
 *
 * @see docs/new_agents_sdk/codemode.md
 * @see V8-09 in TASKS.json
 */

import { createCodeTool, aiTools } from '@cloudflare/codemode/ai';
import { DynamicWorkerExecutor } from '@cloudflare/codemode';
import type { ToolSet } from 'ai';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface CodemodeToolOptions {
  /** AI SDK ToolSet — must be pre-filtered through filterToolsForCodemode */
  tools: ToolSet;
  /** Worker environment bindings */
  env: Env;
  /** Optional custom description for the code tool (supports {{types}} placeholder) */
  description?: string;
}

export interface CodemodeDisabledResult {
  status: 'disabled';
  reason: string;
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Check if codemode is enabled in the current environment.
 */
export function isCodemodeEnabled(env: Env): boolean {
  return (env as any).CODEMODE_ENABLED === '1';
}

/**
 * Create a gated codemode tool for the AI SDK.
 *
 * @throws Error if CODEMODE_ENABLED !== '1'
 * @throws Error if LOADER binding is missing
 *
 * @returns A single AI SDK tool that wraps createCodeTool
 */
export function createGatedCodemodeTool(opts: CodemodeToolOptions) {
  const { tools, env, description } = opts;

  // Gate 1: Feature flag
  if (!isCodemodeEnabled(env)) {
    throw new Error(
      '[createGatedCodemodeTool] CODEMODE_ENABLED is not set to "1". ' +
      'Codemode is disabled by default. Set CODEMODE_ENABLED=1 in wrangler.jsonc vars to enable.'
    );
  }

  // Gate 2: LOADER binding
  if (!(env as any).LOADER) {
    throw new Error(
      '[createGatedCodemodeTool] Missing LOADER binding in env. ' +
      'Add `"worker_loaders": [{ "binding": "LOADER" }]` to wrangler.jsonc.'
    );
  }

  // Create sandboxed executor
  const executor = new DynamicWorkerExecutor({
    loader: (env as any).LOADER,
  });

  // Wrap raw ToolSet into the ToolProvider format required by createCodeTool
  return createCodeTool({
    tools: [aiTools(tools)],
    executor,
    ...(description ? { description } : {}),
  });
}

