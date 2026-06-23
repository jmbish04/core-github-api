/**
 * @file EngineerAgent/methods/sandbox/streaming/types.ts
 * @description Types for the streaming / frontend observability category.
 */

export interface StreamLogsOptions {
  /** File path inside the sandbox containing output to stream. */
  logFile: string;
  /** Polling interval in milliseconds. Defaults to 500. */
  intervalMs?: number;
  /** Maximum number of idle polls (no new content) before stopping. Defaults to 20. */
  maxIdlePolls?: number;
}
