/**
 * @file EngineerAgent/methods/sandbox/files/listFiles.ts
 * @description Lists all files in a directory inside the sandbox.
 */
import { getSandbox } from "@cloudflare/sandbox";
import { Logger } from "@/lib/logger";

export async function sandboxListFiles(
  env: Env,
  sessionId: string,
  directory: string = "."
): Promise<{ success: boolean; files?: string[]; error?: string }> {
  const sandbox = getSandbox(env.SANDBOX, sessionId);
  const logger = new Logger(env, "SandboxSDK - listFiles:");
  const loggerPrefix = `[SandboxSDK - listFiles - ${sessionId}]`;

  try {
    logger.info(`${loggerPrefix} Listing files in ${directory}`);
    // Use find for recursive listing; -maxdepth 3 keeps output manageable
    const result = await sandbox.exec(
      `find "${directory}" -maxdepth 3 -type f 2>/dev/null | sort`
    );
    const files = result.stdout
      ?.split("\n")
      .map((f: string) => f.trim())
      .filter(Boolean) ?? [];
    return { success: true, files };
  } catch (error: any) {
    logger.error(`${loggerPrefix} Failed: ${error.message || JSON.stringify(error)}`);
    return { success: false, error: error.message };
  }
}
