/**
 * @file EngineerAgent/methods/sandbox/files/watchFiles.ts
 * @description Polls a sandbox directory for new or changed files matching a pattern.
 *              Designed for agent flows that wait for code generation artifacts to appear.
 */
import { getSandbox } from "@cloudflare/sandbox";
import { Logger } from "@/lib/logger";
import type { WatchFilesOptions } from "./types";

export interface WatchFilesResult {
  success: boolean;
  found: boolean;
  /** File paths that matched the pattern (if any). */
  matchedFiles?: string[];
  error?: string;
  message?: string;
}

/**
 * Polls a sandbox directory for files matching a pattern until found or timeout.
 * Uses a simple polling loop — appropriate for CF Workers (no native FS events).
 */
export async function watchFiles(
  env: Env,
  sessionId: string,
  options: WatchFilesOptions = {}
): Promise<WatchFilesResult> {
  const sandbox = getSandbox(env.SANDBOX, sessionId);
  const logger = new Logger(env, "SandboxSDK - watchFiles:");
  const loggerPrefix = `[SandboxSDK - watchFiles - ${sessionId}]`;

  const dir = options.directory ?? ".";
  const pattern = options.pattern ?? "*";
  const intervalMs = options.intervalMs ?? 1000;
  const maxAttempts = options.maxAttempts ?? 30;

  try {
    logger.info(`${loggerPrefix} Watching ${dir} for pattern "${pattern}" (max ${maxAttempts} polls)`);

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const result = await sandbox.exec(
        `find "${dir}" -name "${pattern}" -type f 2>/dev/null`
      );
      const matches = result.stdout
        ?.split("\n")
        .map((f: string) => f.trim())
        .filter(Boolean) ?? [];

      if (matches.length > 0) {
        logger.info(`${loggerPrefix} Found ${matches.length} match(es) on attempt ${attempt + 1}`);
        return { success: true, found: true, matchedFiles: matches };
      }

      // Yield between polls — Workers support await-based delays
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }

    logger.info(`${loggerPrefix} Timeout: pattern "${pattern}" not found after ${maxAttempts} attempts`);
    return {
      success: true,
      found: false,
      message: `Pattern "${pattern}" not found within ${maxAttempts} polls.`,
    };
  } catch (error: any) {
    logger.error(`${loggerPrefix} Failed: ${error.message || JSON.stringify(error)}`);
    return { success: false, found: false, error: error.message };
  }
}
