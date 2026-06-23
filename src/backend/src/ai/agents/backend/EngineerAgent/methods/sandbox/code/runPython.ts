/**
 * @file EngineerAgent/methods/sandbox/code/runPython.ts
 * @description Executes a Python code snippet via sandbox.runCode() and parses traceback.
 */
import { getSandbox } from "@cloudflare/sandbox";
import { Logger } from "@/lib/logger";
import type { CodeResult } from "./types";

export async function runPython(
  env: Env,
  sessionId: string,
  code: string
): Promise<CodeResult> {
  const sandbox = getSandbox(env.SANDBOX, sessionId);
  const logger = new Logger(env, "SandboxSDK - runPython:");
  const loggerPrefix = `[SandboxSDK - runPython - ${sessionId}]`;

  try {
    logger.info(`${loggerPrefix} Executing Python snippet (${code.length} chars)`);
    const result = await sandbox.runCode(code, { language: "python" });

    const stdout = result.logs?.stdout?.join("\n") ?? "";
    const stderr = result.logs?.stderr?.join("\n") ?? "";
    const traceback = result.error?.traceback ?? undefined;

    if (traceback && traceback.length > 0) {
      logger.error(`${loggerPrefix} Python traceback:\n${traceback.join("\n")}`);
      return { success: false, stdout, stderr, traceback: traceback.join("\n"), error: traceback[traceback.length - 1] };
    }

    logger.info(`${loggerPrefix} Completed successfully`);
    return { success: true, stdout, stderr };
  } catch (error: any) {
    logger.error(`${loggerPrefix} Failed: ${error.message || JSON.stringify(error)}`);
    return { success: false, error: error.message };
  }
}
