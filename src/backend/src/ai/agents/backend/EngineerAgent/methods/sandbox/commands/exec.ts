/**
 * @file EngineerAgent/methods/sandbox/commands/exec.ts
 * @description Standard one-shot command executor via sandbox.exec().
 */
import { getSandbox } from "@cloudflare/sandbox";
import { Logger } from "@/lib/logger";
import type { ExecOptions, CommandResult } from "./types";

export async function sandboxExec(
  env: Env,
  sessionId: string,
  command: string,
  options: ExecOptions = {}
): Promise<CommandResult> {
  const sandbox = getSandbox(env.SANDBOX, sessionId);
  const logger = new Logger(env, "SandboxSDK - exec:");
  const loggerPrefix = `[SandboxSDK - exec - ${sessionId}]`;

  const fullCommand = options.cwd
    ? `cd "${options.cwd}" && ${command}`
    : command;

  try {
    logger.info(`${loggerPrefix} Running: ${fullCommand}`);
    const result = await sandbox.exec(fullCommand);
    return {
      success: result.success,
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
    };
  } catch (error: any) {
    logger.error(`${loggerPrefix} Failed: ${error.message || JSON.stringify(error)}`);
    return { success: false, error: error.message };
  }
}