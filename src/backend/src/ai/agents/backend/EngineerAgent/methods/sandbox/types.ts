/**
 * @file EngineerAgent/methods/sandbox/types.ts
 * @description Shared type definitions for the Sandbox SDK abstraction layer.
 *              All category modules depend on these root types.
 */

// ── Core Dependency Injection ───────────────────────────────────────────────

// ── Standard Response Shape ─────────────────────────────────────────────────

export interface SandboxResult<T = undefined> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}
