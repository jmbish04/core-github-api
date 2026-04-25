/**
 * @file EngineerAgent/methods/sandbox/sessions/destroySession.ts
 * @description Tears down a Sandbox session immediately, freeing compute resources.
 */
import { getSandbox } from "@cloudflare/sandbox";
import { Logger } from "@/lib/logger";

export async function destroySession(
  env: Env,
  sessionId: string
): Promise<{ success: boolean; error?: string; message?: string }> {
  const sandbox = getSandbox(env.SANDBOX, sessionId);
  const logger = new Logger(env, "SandboxSDK - destroySession:");
  const loggerPrefix = `[SandboxSDK - destroySession - ${sessionId}]`;

  try {
    logger.info(`${loggerPrefix} Destroying sandbox`);
    await sandbox.destroy();
    return { success: true, message: `Session ${sessionId} destroyed` };
  } catch (error: any) {
    logger.error(`${loggerPrefix} Failed: ${error.message || JSON.stringify(error)}`);
    return { success: false, error: error.message };
  }
}
