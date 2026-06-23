/**
 * @file sandbox-sdk-tools/index.ts
 * @description Barrel export for the shared Sandbox SDK tools.
 *
 * Import via the tsconfig path alias:
 *   import { SandboxClient, SandboxSessionManager, sanitizeRepoName } from "@sandbox-sdk-tools";
 */

// Client (wraps @cloudflare/sandbox getSandbox)
export { SandboxClient } from "./client";

// Session manager (repo-scoped sandboxes)
export { SandboxSessionManager } from "./session-manager";
export type { RepoSession, RepoSessionOptions } from "./session-manager";

// Types
export type {
  SandboxExecResult,
  SandboxExecOptions,
  SandboxSessionOptions,
  SandboxSessionResult,
  SandboxWriteFileOptions,
  SandboxWriteFileResult,
  SandboxReadFileOptions,
  SandboxReadFileResult,
  ProcessInfo,
  ExposePortOptions,
  ExposedPortResult,
  GitCheckoutOptions,
  GitCheckoutResult,
} from "./types";

// Utilities
export {
  sanitizeRepoName,
  shellEscape,
  truncateOutput,
  sanitizeForPath,
} from "./utils";

// Health check
export { checkHealth as checkSandboxHealth } from "./health";

// Git health (GitHub auth verification)
export { checkGitHealth } from "./git";

// MCP tool definitions (consolidated from cloudflare/sandbox)
export { loadSandboxTools, type SandboxExecutionResult } from "./tools";

// Git operations
export { runGitOperation, type GitOperation } from "./sandbox";
