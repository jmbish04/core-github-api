/**
 * @file EngineerAgent/methods/sandbox/code/runJs.ts
 * @description Executes a JavaScript/TypeScript code snippet via sandbox.runCode().
 */
import { getSandbox } from "@cloudflare/sandbox";
import { Logger } from "@/lib/logger";
import type { CodeResult } from "./types";

export async function runJs(
  env: Env,
  sessionId: string,
  code: string
): Promise<CodeResult> {
  const sandbox = getSandbox(env.SANDBOX, sessionId);
  const logger = new Logger(env, "SandboxSDK - runJs:");
  const loggerPrefix = `[SandboxSDK - runJs - ${sessionId}]`;

  try {
    logger.info(`${loggerPrefix} Executing JS snippet (${code.length} chars)`);
    const result = await sandbox.runCode(code, { language: "javascript" });

    const stdout = result.logs?.stdout?.join("\n") ?? "";
    const stderr = result.logs?.stderr?.join("\n") ?? "";

    if (result.error) {
      const errMsg = result.error.message ?? JSON.stringify(result.error);
      logger.error(`${loggerPrefix} JS runtime error: ${errMsg}`);
      return { success: false, stdout, stderr, error: errMsg };
    }

    logger.info(`${loggerPrefix} Completed successfully`);
    return { success: true, stdout, stderr };
  } catch (error: any) {
    logger.error(`${loggerPrefix} Failed: ${error.message || JSON.stringify(error)}`);
    return { success: false, error: error.message };
  }
}
