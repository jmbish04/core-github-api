/**
 * @file EngineerAgent/methods/sandbox/services/startService.ts
 * @description Starts a long-running service inside the sandbox and waits for it to become ready.
 */
import { getSandbox } from "@cloudflare/sandbox";
import { Logger } from "@/lib/logger";
import type { StartServiceOptions } from "./types";

export async function startService(
  env: Env,
  sessionId: string,
  options: StartServiceOptions
): Promise<{ success: boolean; url?: string; error?: string; message?: string }> {
  const sandbox = getSandbox(env.SANDBOX, sessionId);
  const logger = new Logger(env, "SandboxSDK - startService:");
  const loggerPrefix = `[SandboxSDK - startService - ${sessionId}]`;

  const cwd = options.cwd ?? ".";
  const logFile = `/tmp/service-${sessionId}.log`;
  const readyTimeoutMs = options.readyTimeoutMs ?? 10_000;

  try {
    logger.info(`${loggerPrefix} Starting service: ${options.command}`);

    // 1. Launch in background
    await sandbox.exec(
      `cd "${cwd}" && nohup ${options.command} >> "${logFile}" 2>&1 &`
    );

    // 2. Optionally poll for port readiness
    if (options.port) {
      const startTime = Date.now();
      let ready = false;

      while (Date.now() - startTime < readyTimeoutMs) {
        const check = await sandbox.exec(
          `nc -z localhost ${options.port} 2>/dev/null && echo "open" || echo "closed"`
        );
        if (check.stdout?.trim() === "open") {
          ready = true;
          break;
        }
        await new Promise((r) => setTimeout(r, 500));
      }

      if (!ready) {
        return {
          success: false,
          error: `Service did not bind to port ${options.port} within ${readyTimeoutMs}ms`,
        };
      }

      // 3. Expose and return URL
      const expose = await sandbox.exposePort(options.port, { hostname: "localhost" });
      const url = expose?.url;
      logger.info(`${loggerPrefix} Service ready at ${url}`);
      return { success: true, url, message: `Service ready at ${url}` };
    }

    return { success: true, message: `Service started. Logs at ${logFile}` };
  } catch (error: any) {
    logger.error(`${loggerPrefix} Failed: ${error.message || JSON.stringify(error)}`);
    return { success: false, error: error.message };
  }
}
