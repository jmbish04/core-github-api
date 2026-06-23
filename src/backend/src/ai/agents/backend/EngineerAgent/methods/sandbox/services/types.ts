/**
 * @file EngineerAgent/methods/sandbox/services/types.ts
 * @description Types for the services category.
 */

export interface StartServiceOptions {
  /** Command to start the service (e.g., "node server.js"). */
  command: string;
  /** Working directory inside the sandbox. */
  cwd?: string;
  /** Port the service binds to — used for health-check polling. */
  port?: number;
  /** Max milliseconds to wait for the service to become ready. Defaults to 10_000. */
  readyTimeoutMs?: number;
}
