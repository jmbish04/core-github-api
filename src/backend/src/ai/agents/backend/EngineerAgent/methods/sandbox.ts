/**
 * @file EngineerAgent/methods/sandbox.ts
 * @description Absorbed from SandboxAgent.ts — Cloudflare Sandbox SDK operations.
 *              All methods are pure functions receiving dependencies via DI.
 */
import { getSandbox } from "@cloudflare/sandbox";
import { Logger } from "@/lib/logger";

// ── Types ──────────────────────────────────────────────────────────────
type CommandResult = {
  success: boolean;
  stdout?: string;
  stderr?: string;
  error?: string;
};

// ── Methods ────────────────────────────────────────────────────────────

export async function execCommand(
  env: Env,
  command: string,
  sessionId: string,
): Promise<CommandResult> {
  const sandbox = getSandbox(env.SANDBOX, sessionId);
  try {
    const result = await sandbox.exec(command);
    return { success: result.success, stdout: result.stdout, stderr: result.stderr };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function readFile(
  env: Env,
  path: string,
  sessionId: string,
): Promise<{ content?: string; error?: string }> {
  const logger = new Logger(env, "SandboxSDK - readFile");
  const logPrefix = `[Sandbox SDK - readFile - sessionId: ${sessionId}] `;
  logger.info(`${logPrefix} Reading file: ${path}`);
  const sandbox = getSandbox(env.SANDBOX, sessionId);
  try {
    const result = await sandbox.readFile(path);
    logger.info(`${logPrefix} File read successfully; content: ${result.content}`);
    return { content: result.content };
  } catch (error: any) {
    logger.error(`${logPrefix} Failed to read file: ${String(error)}`);
    return { error: error.message };
  }
}

export async function writeFile(
  env: Env,
  path: string,
  content: string,
  sessionId: string,
): Promise<{ success: boolean; error?: string }> {
  const sandbox = getSandbox(env.SANDBOX, sessionId);
  const logger = new Logger(env, "SandboxSDK - writeFile");
  const logPrefix = `[Sandbox SDK - writeFile - sessionId: ${sessionId}] `;  
  try {
    await sandbox.writeFile(path, content);
    logger.info(`${logPrefix} File written successfully`);
    return { success: true };
  } catch (error: any) {
    logger.error(`${logPrefix} Failed to write file: ${String(error)}`);
    return { success: false, error: error.message };
  }
}


export async function destroySandbox(
  env: Env,
  sessionId: string,
): Promise<{ success: boolean; message?: string; error?: string }> {
  const sandbox = getSandbox(env.SANDBOX, sessionId);
  const logger = new Logger(env, "SandboxSDK - destroySandbox");
  const logPrefix = `[Sandbox SDK - destroySandbox - sessionId: ${sessionId}] `;
  try {
    await sandbox.destroy();
    logger.info(`${logPrefix} Sandbox destroyed successfully`);
    return { success: true, message: "Sandbox destroyed" };
  } catch (error: any) {
    logger.error(`${logPrefix} Failed to destroy sandbox: ${String(error)}`);
    return { success: false, error: error.message };
  }
}
