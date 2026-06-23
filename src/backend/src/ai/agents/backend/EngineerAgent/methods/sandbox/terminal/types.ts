/**
 * @file EngineerAgent/methods/sandbox/terminal/types.ts
 * @description Types for the PTY / interactive terminal category.
 */

export interface TerminalRequest {
  /** WebSocket request to upgrade into a PTY session. */
  request: Request;
  /** Shell to use. Defaults to "/bin/bash". */
  shell?: string;
  /** Initial working directory. Defaults to "/". */
  cwd?: string;
  /** Environment variables for the terminal session. */
  env?: Record<string, string>;
}
