/**
 * @file automations/push/operations/sandbox-sdk/health.ts
 * @description Health check for push operations sandbox subsystem.
 *
 * Validates:
 * 1. SANDBOX and SUPERVISOR bindings are present
 * 2. SandboxToolRegistry can be instantiated
 * 3. Smart execution produces valid output
 */

import { SandboxToolRegistry } from "./index";
import { HealthStepResult } from "@/health/types";

export async function checkHealth(env: Env): Promise<HealthStepResult> {
  const start = Date.now();
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

  // 1. Binding presence
  await runCheck("sandbox_binding", async () => {
    if (!(env as any).SANDBOX) throw new Error("SANDBOX binding missing");
    return { message: "SANDBOX binding present" };
  });

  await runCheck("supervisor_binding", async () => {
    if (!(env as any).SUPERVISOR) throw new Error("SUPERVISOR binding missing");
    return { message: "SUPERVISOR binding present" };
  });

  // 2. SandboxToolRegistry instantiation + smart exec
  if ((env as any).SANDBOX) {
    await runCheck("registry_exec", async () => {
      const registry = await SandboxToolRegistry.create(env, "health-push-probe");
      const result = await registry.executeSmart("echo push-probe");
      if (!result.success) {
        throw new Error(`Smart exec failed: ${result.error}`);
      }
      return { message: "SandboxToolRegistry exec succeeded", output: result.output?.trim() };
    });
  }

  const hasFailure = Object.values(subChecks).some((c: any) => c.status === "FAILURE");

  return {
    name: "Push Sandbox Operations",
    status: hasFailure ? "failure" : "success",
    message: hasFailure ? "Push sandbox operations degraded" : "Push sandbox operations healthy",
    durationMs: Date.now() - start,
    details: subChecks,
  };
}
