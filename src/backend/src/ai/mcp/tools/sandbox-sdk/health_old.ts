/**
 * @file sandbox-sdk/health.ts
 * @description Comprehensive health check for the Sandbox SDK subsystem.
 *
 * Consolidated from:
 * - `health/checks/sandbox-sdk.ts` (new CRUD lifecycle check)
 * - `ai/mcp/tools/github/git-sandbox-health.ts` (ping/FS/git/exec with retries)
 * - `ai/mcp/tools/cloudflare/sandbox/health.ts` (binding presence)
 *
 * Validates:
 * 1. SANDBOX binding presence
 * 2. Command execution (echo)
 * 3. File I/O (write + read)
 * 4. Git clone capability
 * 5. Cleanup (destroy sandbox)
 *
 * The entire check is guarded by HEALTH_SANDBOX_TIMEOUT_MS (default 60s).
 */

import { SandboxClient } from "./client";
import { HealthStepResult } from "@/health/types";

const SANDBOX_ID = "health-probe-sandbox";

export async function checkHealth(env: Env): Promise<HealthStepResult> {
  const start = Date.now();
  const timeoutMs = Number(env.HEALTH_SANDBOX_TIMEOUT_MS) || 60_000;
  const subChecks: Record<string, any> = {};

  const runCheck = async (name: string, fn: () => Promise<Record<string, unknown>>) => {
    const checkStart = Date.now();
    try {
      const result = await fn();
      subChecks[name] = { status: "OK", latency: Date.now() - checkStart, ...result };
    } catch (error) {
      subChecks[name] = {
        status: "FAILURE",
        latency: Date.now() - checkStart,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  };

  // --- 0. Binding Presence ---
  if (!(env as any).SANDBOX) {
    return {
      name: "Sandbox SDK",
      status: "failure",
      message: "SANDBOX binding missing from environment",
      durationMs: Date.now() - start,
      details: { binding: { status: "FAILURE", error: "SANDBOX binding missing" } },
    };
  }

  let client: SandboxClient | null = null;

  // Wrap all sandbox operations in a timeout race
  const sandboxWork = async () => {
    // --- 1. Create / Connect ---
    await runCheck("create", async () => {
      client = await SandboxClient.create(env, SANDBOX_ID, {
        keepAlive: false,
      });
      return { message: "Sandbox instance created" };
    });

    if (!client) return;

    // --- 2. Exec ---
    await runCheck("exec", async () => {
      const result = await client!.exec({ command: "echo health-probe" });
      if (!result.success) {
        throw new Error(`Exec failed: exit ${result.exitCode} — ${result.stderr}`);
      }
      if (!result.stdout.includes("health-probe")) {
        throw new Error(`Unexpected stdout: ${result.stdout}`);
      }
      return { message: "echo health-probe succeeded", stdout: result.stdout.trim() };
    });

    // --- 3. File I/O ---
    await runCheck("file_io", async () => {
      const testPath = "/tmp/health-probe.txt";
      const testContent = `health-check-${Date.now()}`;

      await client!.writeFile({ path: testPath, content: testContent });
      const readResult = await client!.readFile({ path: testPath });

      if (!readResult.success) {
        throw new Error(`Read file failed for ${testPath}`);
      }
      if (readResult.content?.trim() !== testContent) {
        throw new Error(`Content mismatch: expected "${testContent}", got "${readResult.content?.trim()}"`);
      }
      return { message: "Write + read file roundtrip succeeded" };
    });

    // --- 4. Git Clone ---
    await runCheck("git_clone", async () => {
      const repoName = env.HEALTH_TEST_REPO_NAME || "testing-oktokit-commands";
      const owner = env.GITHUB_OWNER || "jmbish04";
      const repoUrl = `https://github.com/${owner}/${repoName}`;

      const cloneResult = await client!.gitClone({
        repoUrl,
        targetDir: `/workspace/${repoName}`,
      });

      if (!cloneResult.success) {
        throw new Error(`Git clone failed for ${repoUrl}`);
      }

      // Verify the directory exists
      const lsResult = await client!.exec({ command: `ls /workspace/${repoName}` });
      if (!lsResult.success) {
        throw new Error("Cloned directory not accessible");
      }

      return {
        message: `Cloned ${owner}/${repoName}`,
        files: lsResult.stdout.trim().split("\n").slice(0, 10),
      };
    });

    // --- 5. Cleanup ---
    await runCheck("cleanup", async () => {
      await client!.destroy();
      client = null;
      return { message: "Sandbox destroyed" };
    });
  };

  // Race the sandbox work against a timeout
  try {
    await Promise.race([
      sandboxWork(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`Sandbox health check timed out after ${timeoutMs}ms`)), timeoutMs),
      ),
    ]);
  } catch (error) {
    subChecks.timeout = {
      status: "FAILURE",
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    // Best-effort cleanup if sandbox is still alive
    if (client) {
      try {
        await (client as SandboxClient).destroy();
      } catch {
        // Ignore cleanup errors
      }
    }
  }

  const hasFailure = Object.values(subChecks).some((c: any) => c.status === "FAILURE");

  return {
    name: "Sandbox SDK",
    status: hasFailure ? "failure" : "success",
    message: hasFailure
      ? "One or more sandbox checks failed"
      : "Sandbox SDK fully operational",
    durationMs: Date.now() - start,
    details: subChecks,
  };
}
