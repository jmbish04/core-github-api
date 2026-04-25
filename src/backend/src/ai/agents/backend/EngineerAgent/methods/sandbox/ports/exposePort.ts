/**
 * @file EngineerAgent/methods/sandbox/ports/exposePort.ts
 * @description Exposes a port from the sandbox, returning a publicly accessible URL.
 */
import { getSandbox } from "@cloudflare/sandbox";
import { Logger } from "@/lib/logger";
import type { PortOptions } from "./types";

export async function exposePort(
  env: Env,
  sessionId: string,
  options: PortOptions
): Promise<{ success: boolean; url?: string; error?: string; message?: string }> {
  const sandbox = getSandbox(env.SANDBOX, sessionId);
  const logger = new Logger(env, "SandboxSDK - exposePort:");
  const loggerPrefix = `[SandboxSDK - exposePort - ${sessionId}]`;

  try {
    logger.info(`${loggerPrefix} Exposing port ${options.port}`);
    const result = await sandbox.exposePort(options.port, { hostname: "localhost" });
    const url = result?.url ?? undefined;
    logger.info(`${loggerPrefix} Port ${options.port} exposed at ${url}`);
    return { success: true, url, message: `Port ${options.port} → ${url}` };
  } catch (error: any) {
    logger.error(`${loggerPrefix} Failed: ${error.message || JSON.stringify(error)}`);
    return { success: false, error: error.message };
  }
}
