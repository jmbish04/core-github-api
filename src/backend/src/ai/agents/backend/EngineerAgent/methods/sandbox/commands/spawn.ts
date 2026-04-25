/**
 * @file EngineerAgent/methods/sandbox/commands/spawn.ts
 * @description Launches a long-running background process inside the sandbox.
 *              Returns immediately after starting — use streamLogs or watchFiles to observe.
 */
import { getSandbox } from "@cloudflare/sandbox";
import { Logger } from "@/lib/logger";
import type { SpawnOptions, CommandResult } from "./types";

/**
 * Spawns a background process inside the sandbox using `nohup ... &`.
 * Stdout and stderr are redirected to a predictable log file for later retrieval.
 *
 * @param logFile - Path inside sandbox where stdout/stderr will be written. Defaults to `/tmp/spawn-<sessionId>.log`.
 */
export async function sandboxSpawn(
  env: Env,
  sessionId: string,
  command: string,
  options: SpawnOptions & { logFile?: string } = {}
): Promise<CommandResult & { logFile?: string }> {
  const sandbox = getSandbox(env.SANDBOX, sessionId);
  const logger = new Logger(env, "SandboxSDK - spawn:");
  const loggerPrefix = `[SandboxSDK - spawn - ${sessionId}]`;

  const cwd = options.cwd ?? ".";
  const logFile = options.logFile ?? `/tmp/spawn-${sessionId}.log`;
  const label = options.label ?? command.split(" ")[0];

  // Inject any extra env vars as shell exports
  const envPrefix = options.env
    ? Object.entries(options.env)
        .map(([k, v]) => `export ${k}="${v}"`)
        .join(" && ") + " && "
    : "";

  const spawnCmd = `cd "${cwd}" && ${envPrefix}nohup ${command} >> "${logFile}" 2>&1 &`;

  try {
    logger.info(`${loggerPrefix} Spawning [${label}]: ${command} | logs → ${logFile}`);
    await sandbox.exec(spawnCmd);
    return {
      success: true,
      message: `[${label}] spawned. Logs at ${logFile}`,
      logFile,
    };
  } catch (error: any) {
    logger.error(`${loggerPrefix} Failed: ${error.message || JSON.stringify(error)}`);
    return { success: false, error: error.message };
  }
}
