/**
 * @file EngineerAgent/methods/sandbox/terminal/createTerminal.ts
 * @description Upgrades a WebSocket request into an interactive PTY inside the sandbox.
 *              Designed for xterm.js-compatible browser terminals via the assistant-ui frontend.
 *
 * @usage Route handler calls `createTerminal(deps, sessionId, { request })` and returns the response.
 * @compatibility Compatible with xterm.js attach addon (binary/text WebSocket framing).
 */
import { getSandbox } from "@cloudflare/sandbox";
import { Logger } from "@/lib/logger";
import type { TerminalRequest } from "./types";

export async function createTerminal(
  env: Env,
  sessionId: string,
  options: TerminalRequest
): Promise<Response> {
  const sandbox = getSandbox(env.SANDBOX, sessionId);
  const logger = new Logger(env, "SandboxSDK - createTerminal:");
  const loggerPrefix = `[SandboxSDK - createTerminal - ${sessionId}]`;

  try {
    logger.info(`${loggerPrefix} Upgrading WebSocket to PTY (shell=${options.shell ?? "/bin/bash"})`);

    const response = await (sandbox as any).terminal(options.request, {
      shell: options.shell ?? "/bin/bash",
      cwd: options.cwd ?? "/",
      env: options.env,
    });

    logger.info(`${loggerPrefix} PTY session established`);
    return response;
  } catch (error: any) {
    logger.error(`${loggerPrefix} Failed: ${error.message || JSON.stringify(error)}`);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
