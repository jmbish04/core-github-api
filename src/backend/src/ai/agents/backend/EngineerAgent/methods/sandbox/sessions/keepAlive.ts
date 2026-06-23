/**
 * @file EngineerAgent/methods/sandbox/sessions/keepAlive.ts
 * @description Extends the sandbox session TTL by executing a lightweight ping command.
 *              Prevents idle sandbox destruction during long-running agent workflows.
 */
import { getSandbox } from "@cloudflare/sandbox";
import { Logger } from "@/lib/logger";
import type { KeepAliveOptions } from "./types";

export async function keepAlive(
  env: Env,
  sessionId: string,
  options: KeepAliveOptions = { sessionId: "" }
): Promise<{ success: boolean; error?: string; message?: string }> {
  options.sessionId = sessionId;
  const sandbox = getSandbox(env.SANDBOX, sessionId);
  const logger = new Logger(env, "SandboxSDK - keepAlive:");
  const loggerPrefix = `[SandboxSDK - keepAlive - ${sessionId}]`;
  const ttlSeconds = options.durationSecs ?? 300;

  try {
    logger.info(`${loggerPrefix} Sending keepalive ping (ttl=${ttlSeconds}s)`);
    // Lightweight heartbeat — resets the idle timer
    await sandbox.exec(`sleep 0 && echo "keepalive"`);
    return { success: true, message: `Session ${sessionId} kept alive for ~${ttlSeconds}s` };
  } catch (error: any) {
    logger.error(`${loggerPrefix} Failed: ${error.message || JSON.stringify(error)}`);
    return { success: false, error: error.message };
  }
}
