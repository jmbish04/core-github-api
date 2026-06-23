/**
 * @file EngineerAgent/methods/sandbox/commands/types.ts
 * @description Type definitions for the commands category.
 */

export interface ExecOptions {
  /** Working directory inside the sandbox. */
  cwd?: string;
  /** Timeout in milliseconds. Defaults to 30_000. */
  timeoutMs?: number;
}

export interface SpawnOptions {
  /** Working directory inside the sandbox. */
  cwd?: string;
  /** Environment variables to inject into the spawned process. */
  env?: Record<string, string>;
  /** Label for log tracing. */
  label?: string;
}

export interface CommandResult {
  success: boolean;
  stdout?: string;
  stderr?: string;
  exitCode?: number;
  error?: string;
  message?: string;
}
