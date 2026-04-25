/**
 * @file EngineerAgent/methods/sandbox/ports/closePort.ts
 * @description Closes an exposed sandbox port.
 */
import { getSandbox } from "@cloudflare/sandbox";
import { Logger } from "@/lib/logger";
import type { PortOptions } from "./types";

export async function closePort(
  env: Env,
  sessionId: string,
  options: PortOptions
): Promise<{ success: boolean; error?: string; message?: string }> {
  const sandbox = getSandbox(env.SANDBOX, sessionId);
  const logger = new Logger(env, "SandboxSDK - closePort:");
  const loggerPrefix = `[SandboxSDK - closePort - ${sessionId}]`;

  try {
    logger.info(`${loggerPrefix} Closing port ${options.port}`);
    await sandbox.exec(`fuser -k ${options.port}/${options.protocol ?? "tcp"} 2>/dev/null || true`);
    return { success: true, message: `Port ${options.port} closed` };
  } catch (error: any) {
    logger.error(`${loggerPrefix} Failed: ${error.message || JSON.stringify(error)}`);
    return { success: false, error: error.message };
  }
}
