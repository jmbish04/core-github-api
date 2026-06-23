/**
 * @file sandbox-sdk/health.ts
 * @description Comprehensive health checks for the Sandbox SDK subsystem.
 *
 * Merged from:
 * - `health_old.ts` — full sandbox lifecycle test (create / exec / file I/O / git clone / cleanup)
 * - `health.ts` (new) — granular capability checks (process, port, web server, code interpreter)
 *
 * Exports:
 * - `checkSandboxLifecycle(env)` — original full lifecycle probe (renamed from checkHealth)
 * - `checkGitCapabilities(env)` — GitHub auth + git clone + checkout
 * - `checkProcessManagement(env)` — start / list / kill / stream processes
 * - `checkPortExposure(env, hostname?)` — expose / list / unexpose ports
 * - `checkWebServer(env, hostname?)` — start HTTP server + verify response
 * - `checkCodeInterpreter(env)` — Python + Node.js exec
 * - `checkSandboxDevCapabilities(env, hostname?)` — aggregates all capability checks
 */

import { SandboxClient } from "./client";
import { HealthStepResult } from "@/health/health-check";
import { verifyGitHubToken } from "@/ai/mcp/tools/github/github";
import { getSandbox, parseSSEStream } from "@cloudflare/sandbox";
import { getSandboxOptions } from "@/ai/utils/sandbox";

// ── Shared Utilities ─────────────────────────────────────────────────────────

const SANDBOX_ID = "health-probe-sandbox";

const withTimeout = <T>(promise: Promise<T>, ms: number, stepName: string): Promise<T> => {
    let timeoutId: ReturnType<typeof setTimeout>;
    const timeout = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(
            () => reject(new Error(`Timeout exceeded for ${stepName} (${ms}ms)`)),
            ms
        );
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timeoutId));
};

// ── 1. Full Lifecycle Probe (migrated from health_old.ts) ────────────────────

/**
 * Full sandbox lifecycle check: create → exec → file I/O → git clone → cleanup.
 * This is the authoritative "is the sandbox fundamentally operational?" check.
 * Guarded by HEALTH_SANDBOX_TIMEOUT_MS (default 60 s).
 */
export async function checkSandboxLifecycle(env: Env): Promise<HealthStepResult> {
    const start = Date.now();
    const timeoutMs = Number((env as any).HEALTH_SANDBOX_TIMEOUT_MS) || 60_000;
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

    const sandboxWork = async () => {
        // --- 1. Create / Connect ---
        await runCheck("create", async () => {
            client = await SandboxClient.create(env, SANDBOX_ID, { keepAlive: false });
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

            if (!readResult.success) throw new Error(`Read file failed for ${testPath}`);
            if (readResult.content?.trim() !== testContent) {
                throw new Error(
                    `Content mismatch: expected "${testContent}", got "${readResult.content?.trim()}"`
                );
            }
            return { message: "Write + read file roundtrip succeeded" };
        });

        // --- 4. Git Clone ---
        await runCheck("git_clone", async () => {
            const repoName = (env as any).HEALTH_TEST_REPO_NAME || "testing-oktokit-commands";
            const owner = (env as any).GITHUB_OWNER || "jmbish04";
            const repoUrl = `https://github.com/${owner}/${repoName}`;

            const cloneResult = await client!.gitClone({
                repoUrl,
                targetDir: `/workspace/${repoName}`,
            });

            if (!cloneResult.success) {
                throw new Error(`Git clone failed for ${repoUrl}`);
            }

            const lsResult = await client!.exec({ command: `ls /workspace/${repoName}` });
            if (!lsResult.success) throw new Error("Cloned directory not accessible");

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

    try {
        await Promise.race([
            sandboxWork(),
            new Promise<never>((_, reject) =>
                setTimeout(
                    () => reject(new Error(`Sandbox health check timed out after ${timeoutMs}ms`)),
                    timeoutMs
                )
            ),
        ]);
    } catch (error) {
        subChecks.timeout = {
            status: "FAILURE",
            error: error instanceof Error ? error.message : String(error),
        };
    } finally {
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

// ── 2. Granular Capability Checks ────────────────────────────────────────────

/**
 * Checks Git Integration capabilities:
 * 1. GitHub API Authentication
 * 2. Git clone (shallow)
 * 3. Git checkout
 */
export async function checkGitCapabilities(env: Env): Promise<HealthStepResult> {
    const start = Date.now();
    const subChecks: Record<string, any> = {};
    const sandboxOptions = await getSandboxOptions(env);

    try {
        // Test 1: GitHub Auth
        const authStart = Date.now();
        const authResult = await withTimeout(verifyGitHubToken(env), 5000, "GitHub Auth");
        subChecks.githubAuth = {
            status: authResult.valid ? "OK" : "FAIL",
            latency: Date.now() - authStart,
            ...(authResult.valid ? { user: authResult.user } : { error: authResult.error }),
        };

        if (!(env as any).SANDBOX) {
            subChecks.gitClone = { status: "SKIPPED", reason: "No sandbox binding" };
            subChecks.gitCheckout = { status: "SKIPPED", reason: "No sandbox binding" };
            return {
                name: "Git Integration",
                status: subChecks.githubAuth?.status !== "FAIL" ? "success" : "failure",
                message:
                    subChecks.githubAuth?.status !== "FAIL"
                        ? "Git Auth OK, sandbox skipped"
                        : "Git Auth failed",
                durationMs: Date.now() - start,
                details: subChecks,
            };
        }

        const sandbox = getSandbox(
            (env as any).SANDBOX,
            "git-health-probe",
            sandboxOptions
        );

        // Test 2: Git Clone
        const cloneStart = Date.now();
        const resolvedOwner = env.GITHUB_OWNER;
        const resolvedRepo =
            env.CLOUDFLARE_WORKER_NAME ||
            env.STANDARDIZATION_REPO_NAME ||
            env.HEALTH_TEST_REPO_NAME;
        const [owner, repoName] =
            resolvedOwner && resolvedRepo
                ? [resolvedOwner, resolvedRepo]
                : ["octocat", "Hello-World"];
        const cloneUrl = `https://github.com/${owner}/${repoName}.git`;
        try {
            await withTimeout(
                sandbox.exec(
                    `git clone --depth=1 ${cloneUrl} /tmp/git-test-clone`
                ),
                30000,
                "Git Clone"
            );
            subChecks.gitClone = { status: "OK", latency: Date.now() - cloneStart, repo: `${owner}/${repoName}` };
        } catch (cloneErr) {
            subChecks.gitClone = {
                status: "FAIL",
                error: cloneErr instanceof Error ? cloneErr.message : String(cloneErr),
                latency: Date.now() - cloneStart,
                repo: `${owner}/${repoName}`,
            };
        }

        // Test 3: Git Checkout
        const checkoutStart = Date.now();
        const checkoutRepoUrl = `https://github.com/${owner}/${repoName}`;
        try {
            await withTimeout(
                sandbox.gitCheckout(checkoutRepoUrl, {
                    branch: "main",
                    targetDir: "/tmp/git-test-checkout",
                }),
                30000,
                "Git Checkout"
            );
            subChecks.gitCheckout = { status: "OK", latency: Date.now() - checkoutStart, repo: `${owner}/${repoName}` };
        } catch (checkoutErr) {
            subChecks.gitCheckout = {
                status: "FAIL",
                error: checkoutErr instanceof Error ? checkoutErr.message : String(checkoutErr),
                latency: Date.now() - checkoutStart,
                repo: `${owner}/${repoName}`,
            };
        }

        const isOverallSuccess =
            subChecks.gitClone?.status !== "FAIL" && subChecks.gitCheckout?.status !== "FAIL";

        return {
            name: "Git Integration",
            status: isOverallSuccess ? "success" : "failure",
            message: isOverallSuccess ? "Git clone and checkout operational" : "Git operations degraded",
            durationMs: Date.now() - start,
            details: subChecks,
        };
    } catch (error) {
        return {
            name: "Git Integration",
            status: "failure",
            message: error instanceof Error ? error.message : String(error),
            durationMs: Date.now() - start,
            details: subChecks,
        };
    }
}

/**
 * Checks Process Management capabilities:
 * start / list / get status / kill / stream logs
 */
export async function checkProcessManagement(env: Env): Promise<HealthStepResult> {
    const start = Date.now();
    const subChecks: Record<string, any> = {};
    const sandboxOptions = await getSandboxOptions(env as any);
    // const exposedPort = env.SANDBOX_EXPOSED_HTTP_PORT || 8080;

    if (!(env as any).SANDBOX) {
        return {
            name: "Process Management",
            status: "success",
            message: "Process management skipped (no sandbox binding)",
            durationMs: Date.now() - start,
            details: {
                processStart: { status: "SKIPPED", reason: "No sandbox binding" },
                processList: { status: "SKIPPED", reason: "No sandbox binding" },
                processKill: { status: "SKIPPED", reason: "No sandbox binding" },
                processStream: { status: "SKIPPED", reason: "No sandbox binding" },
            },
        };
    }

    try {
        const sandbox = getSandbox(
            (env as any).SANDBOX,
            "process-health-probe",
            sandboxOptions
        );

        // 1. Start
        const startStart = Date.now();
        try {
            const proc = await sandbox.startProcess("sleep 5");
            subChecks.processStart = {
                status: "OK",
                latency: Date.now() - startStart,
                pid: proc.pid,
                id: proc.id,
            };
        } catch (err) {
            subChecks.processStart = {
                status: "FAIL",
                error: err instanceof Error ? err.message : String(err),
                latency: Date.now() - startStart,
            };
        }

        // 2. List
        const listStart = Date.now();
        try {
            const processes = await sandbox.listProcesses();
            subChecks.processList = {
                status: "OK",
                latency: Date.now() - listStart,
                count: processes.length,
            };
        } catch (err) {
            subChecks.processList = {
                status: "FAIL",
                error: err instanceof Error ? err.message : String(err),
                latency: Date.now() - listStart,
            };
        }

        // 3. Get status
        const getStart = Date.now();
        try {
            if (subChecks.processStart?.id) {
                const info = await sandbox.getProcess(subChecks.processStart.id);
                subChecks.processGet = {
                    status: "OK",
                    latency: Date.now() - getStart,
                    running: info ? (info as any).running ?? true : false,
                };
            } else {
                subChecks.processGet = { status: "SKIPPED", reason: "No process ID from start" };
            }
        } catch (err) {
            subChecks.processGet = {
                status: "FAIL",
                error: err instanceof Error ? err.message : String(err),
                latency: Date.now() - getStart,
            };
        }

        // 4. Kill
        const killStart = Date.now();
        try {
            if (subChecks.processStart?.id) {
                await sandbox.killProcess(subChecks.processStart.id);
                subChecks.processKill = { status: "OK", latency: Date.now() - killStart };
            } else {
                subChecks.processKill = { status: "SKIPPED", reason: "No process ID from start" };
            }
        } catch (err) {
            subChecks.processKill = {
                status: "FAIL",
                error: err instanceof Error ? err.message : String(err),
                latency: Date.now() - killStart,
            };
        }

        // 5. Stream logs
        const streamStart = Date.now();
        try {
            const testProc = await sandbox.startProcess("echo 'test log output'");
            await new Promise((r) => setTimeout(r, 2000));
            const logStream = await sandbox.streamProcessLogs(testProc.id);
            let logCount = 0;
            for await (const chunk of parseSSEStream(logStream)) { void chunk; logCount++; }
            await sandbox.killProcess(testProc.id).catch(() => {});
            subChecks.processStream = {
                status: "OK",
                latency: Date.now() - streamStart,
                logLines: logCount,
            };
        } catch (err) {
            subChecks.processStream = {
                status: "FAIL",
                error: err instanceof Error ? err.message : String(err),
                latency: Date.now() - streamStart,
            };
        }

        const isOverallSuccess =
            subChecks.processStart?.status !== "FAIL" &&
            subChecks.processList?.status !== "FAIL" &&
            subChecks.processKill?.status !== "FAIL";

        return {
            name: "Process Management",
            status: isOverallSuccess ? "success" : "failure",
            message: isOverallSuccess
                ? "Process lifecycle management operational"
                : "Process management degraded",
            durationMs: Date.now() - start,
            details: subChecks,
        };
    } catch (error) {
        return {
            name: "Process Management",
            status: "failure",
            message: error instanceof Error ? error.message : String(error),
            durationMs: Date.now() - start,
            details: subChecks,
        };
    }
}

/**
 * Checks Port Exposure capabilities:
 * expose / list / unexpose
 */
export async function checkPortExposure(
    env: Env,
    hostname?: string
): Promise<HealthStepResult> {
    const start = Date.now();
    const subChecks: Record<string, any> = {};
    const sandboxOptions = await getSandboxOptions(env as any);
    const exposedPort = env.SANDBOX_EXPOSED_HTTP_PORT || 8080;

    if (!(env as any).SANDBOX) {
        return {
            name: "Port Exposure",
            status: "success",
            message: "Port exposure skipped (no sandbox binding)",
            durationMs: Date.now() - start,
            details: {
                exposePort: { status: "SKIPPED", reason: "No sandbox binding" },
                listPorts: { status: "SKIPPED", reason: "No sandbox binding" },
                unexposePort: { status: "SKIPPED", reason: "No sandbox binding" },
            },
        };
    }

    if (!hostname) {
        return {
            name: "Port Exposure",
            status: "success",
            message: "Port exposure skipped (no hostname)",
            durationMs: Date.now() - start,
            details: { exposePort: { status: "SKIPPED", reason: "No hostname provided" } },
        };
    }

    try {
        const sandbox = getSandbox(
            (env as any).SANDBOX,
            "port-health-probe",
            sandboxOptions
        );
        let exposedUrl: string | undefined;

        // 1. Expose port 8080
        const exposeStart = Date.now();
        try {
            const exposed = await sandbox.exposePort(exposedPort, {
                hostname,
                name: "health-test-api",
                token: "health-token",
            });
            exposedUrl = exposed.url;
            subChecks.exposePort = {
                status: "OK",
                latency: Date.now() - exposeStart,
                port: exposed.port,
                url: exposedUrl,
                name: exposed.name,
            };
        } catch (err) {
            subChecks.exposePort = {
                status: "FAIL",
                error: err instanceof Error ? err.message : String(err),
                latency: Date.now() - exposeStart,
            };
        }

        // 2. List
        const listStart = Date.now();
        try {
            const ports = await sandbox.getExposedPorts(hostname);
            subChecks.listPorts = {
                status: "OK",
                latency: Date.now() - listStart,
                count: ports.length,
                ports: ports.map((p: any) => p.port),
            };
        } catch (err) {
            subChecks.listPorts = {
                status: "FAIL",
                error: err instanceof Error ? err.message : String(err),
                latency: Date.now() - listStart,
            };
        }

        // 3. Unexpose
        const unexposeStart = Date.now();
        try {
            await sandbox.unexposePort(exposedPort);
            subChecks.unexposePort = { status: "OK", latency: Date.now() - unexposeStart };
        } catch (err) {
            subChecks.unexposePort = {
                status: "FAIL",
                error: err instanceof Error ? err.message : String(err),
                latency: Date.now() - unexposeStart,
            };
        }

        return {
            name: "Port Exposure",
            status: subChecks.exposePort?.status !== "FAIL" ? "success" : "failure",
            message:
                subChecks.exposePort?.status !== "FAIL"
                    ? "Port exposure operational"
                    : "Port exposure degraded",
            durationMs: Date.now() - start,
            details: subChecks,
        };
    } catch (error) {
        return {
            name: "Port Exposure",
            status: "failure",
            message: error instanceof Error ? error.message : String(error),
            durationMs: Date.now() - start,
            details: subChecks,
        };
    }
}

/**
 * Checks Web Server capability:
 * start HTTP server → expose port → verify response
 */
export async function checkWebServer(env: Env, hostname?: string): Promise<HealthStepResult> {
    const start = Date.now();
    const subChecks: Record<string, any> = {};
    const sandboxOptions = await getSandboxOptions(env as any);
    const exposedPort = env.SANDBOX_EXPOSED_HTTP_PORT || 8080;

    if (!(env as any).SANDBOX || !hostname) {
        const reason = !(env as any).SANDBOX ? "No sandbox binding" : "No hostname provided";
        return {
            name: "Web Server",
            status: "success",
            message: `Web server test skipped (${reason})`,
            durationMs: Date.now() - start,
            details: {
                serverStart: { status: "SKIPPED", reason },
                serverExpose: { status: "SKIPPED", reason },
                serverResponse: { status: "SKIPPED", reason },
            },
        };
    }

    try {
        const sandbox = getSandbox(
            (env as any).SANDBOX,
            "webserver-health-probe",
            sandboxOptions
        );
        let serverProcId: string | undefined;
        let exposedUrl: string | undefined;

        // 1. Start HTTP server
        const serverStart = Date.now();
        try {
            const server = await sandbox.startProcess(`python3 -m http.server ${exposedPort}`);
            serverProcId = server.id;
            subChecks.serverStart = {
                status: "OK",
                latency: Date.now() - serverStart,
                pid: server.pid,
                id: server.id,
            };
        } catch (err) {
            subChecks.serverStart = {
                status: "FAIL",
                error: err instanceof Error ? err.message : String(err),
                latency: Date.now() - serverStart,
            };
        }

        // 2. Expose port
        const exposeStart = Date.now();
        try {
            const exposed = await sandbox.exposePort(exposedPort, {
                hostname,
                name: "health-test-server",
                token: "health-token",
            });
            exposedUrl = exposed.url;
            subChecks.serverExpose = {
                status: "OK",
                latency: Date.now() - exposeStart,
                url: exposed.url,
            };
        } catch (err) {
            subChecks.serverExpose = {
                status: "FAIL",
                error: err instanceof Error ? err.message : String(err),
                latency: Date.now() - exposeStart,
            };
        }

        // 3. Verify response (only if port was exposed successfully)
        const responseStart = Date.now();
        if (exposedUrl) {
            try {
                const response = await fetch(exposedUrl);
                const body = await response.text();
                subChecks.serverResponse = {
                    status: response.ok ? "OK" : "FAIL",
                    latency: Date.now() - responseStart,
                    statusCode: response.status,
                    bodyLength: body.length,
                    bodyPreview: body.substring(0, 100),
                };
            } catch (err) {
                subChecks.serverResponse = {
                    status: "FAIL",
                    error: err instanceof Error ? err.message : String(err),
                    latency: Date.now() - responseStart,
                };
            }
        } else {
            subChecks.serverResponse = { status: "SKIPPED", reason: "Port not exposed" };
        }

        // Cleanup
        try {
            if (serverProcId) await sandbox.killProcess(serverProcId);
            await sandbox.unexposePort(exposedPort);
        } catch {
            // Ignore cleanup errors
        }

        const isOverallSuccess =
            subChecks.serverStart?.status !== "FAIL" &&
            subChecks.serverExpose?.status !== "FAIL" &&
            subChecks.serverResponse?.status === "OK";

        return {
            name: "Web Server",
            status: isOverallSuccess ? "success" : "failure",
            message: isOverallSuccess ? "Web server operational" : "Web server degraded",
            durationMs: Date.now() - start,
            details: subChecks,
        };
    } catch (error) {
        return {
            name: "Web Server",
            status: "failure",
            message: error instanceof Error ? error.message : String(error),
            durationMs: Date.now() - start,
            details: subChecks,
        };
    }
}

/**
 * Checks Code Interpreter capabilities:
 * Python execution + Node.js execution
 */
export async function checkCodeInterpreter(env: Env): Promise<HealthStepResult> {
    const start = Date.now();
    const subChecks: Record<string, any> = {};
    const sandboxOptions = await getSandboxOptions(env as any);

    if (!(env as any).SANDBOX) {
        return {
            name: "Code Interpreter",
            status: "success",
            message: "Code interpreter test skipped (no sandbox binding)",
            durationMs: Date.now() - start,
            details: {
                pythonExec: { status: "SKIPPED", reason: "No sandbox binding" },
                jsExec: { status: "SKIPPED", reason: "No sandbox binding" },
            },
        };
    }

    try {
        const sandbox = getSandbox(
            (env as any).SANDBOX,
            "code-health-probe",
            sandboxOptions
        );

        // 1. Python
        const pythonStart = Date.now();
        try {
            const result = await withTimeout(
                sandbox.exec("python3 -c \"print('Hello from Python!')\""),
                10000,
                "Python exec"
            ) as { exitCode: number; stdout: string };
            subChecks.pythonExec = {
                status: result.exitCode === 0 ? "OK" : "FAIL",
                latency: Date.now() - pythonStart,
                exitCode: result.exitCode,
                output: result.stdout,
            };
        } catch (err) {
            subChecks.pythonExec = {
                status: "FAIL",
                error: err instanceof Error ? err.message : String(err),
                latency: Date.now() - pythonStart,
            };
        }

        // 2. Node.js
        const jsStart = Date.now();
        try {
            const result = await withTimeout(
                sandbox.exec("node -e \"console.log('Hello from Node.js!')\""),
                10000,
                "JS exec"
            ) as { exitCode: number; stdout: string };
            subChecks.jsExec = {
                status: result.exitCode === 0 ? "OK" : "FAIL",
                latency: Date.now() - jsStart,
                exitCode: result.exitCode,
                output: result.stdout,
            };
        } catch (err) {
            subChecks.jsExec = {
                status: "FAIL",
                error: err instanceof Error ? err.message : String(err),
                latency: Date.now() - jsStart,
            };
        }

        const isOverallSuccess =
            subChecks.pythonExec?.status !== "FAIL" && subChecks.jsExec?.status !== "FAIL";

        return {
            name: "Code Interpreter",
            status: isOverallSuccess ? "success" : "failure",
            message: isOverallSuccess ? "Code interpreter operational" : "Code interpreter degraded",
            durationMs: Date.now() - start,
            details: subChecks,
        };
    } catch (error) {
        return {
            name: "Code Interpreter",
            status: "failure",
            message: error instanceof Error ? error.message : String(error),
            durationMs: Date.now() - start,
            details: subChecks,
        };
    }
}

// ── 3. Aggregate Capability Check ────────────────────────────────────────────

/**
 * Aggregates all granular capability checks into a single health result.
 * For the full lifecycle test (create/exec/file-io/git-clone/destroy), use `checkSandboxLifecycle`.
 */
export async function checkSandboxDevCapabilities(
    env: Env,
    hostname?: string
): Promise<HealthStepResult> {
    const start = Date.now();
    const subChecks: Record<string, any> = {};

    try {
        const [gitResult, processResult, portResult, webServerResult, codeInterpreterResult] =
            await Promise.allSettled([
                checkGitCapabilities(env),
                checkProcessManagement(env),
                checkPortExposure(env, hostname),
                checkWebServer(env, hostname),
                checkCodeInterpreter(env),
            ]);

        const toDetails = (r: PromiseSettledResult<HealthStepResult>) =>
            r.status === "fulfilled"
                ? r.value.details
                : {
                      status: "ERROR",
                      message: r.reason instanceof Error ? r.reason.message : String(r.reason),
                  };

        subChecks.git = toDetails(gitResult);
        subChecks.process = toDetails(processResult);
        subChecks.port = toDetails(portResult);
        subChecks.webServer = toDetails(webServerResult);
        subChecks.codeInterpreter = toDetails(codeInterpreterResult);

        const results = [gitResult, processResult, portResult, webServerResult, codeInterpreterResult];
        const hasRejected = results.some((r) => r.status === "rejected");
        const hasSubFailures = results.some(
            (r) =>
                r.status === "fulfilled" &&
                (r.value.status === "failure" ||
                    Object.values(r.value.details ?? {}).some((c: any) => c?.status === "FAIL"))
        );

        const status: "success" | "failure" = hasRejected ? "failure" : "success";
        const message = hasRejected
            ? "Multiple subsystem failures detected"
            : hasSubFailures
            ? "Operational but with subsystem degradation"
            : "All sandbox SDK capabilities operational";

        return {
            name: "Sandbox Dev Capabilities",
            status,
            message,
            durationMs: Date.now() - start,
            details: subChecks,
        };
    } catch (error) {
        return {
            name: "Sandbox Dev Capabilities",
            status: "failure",
            message: error instanceof Error ? error.message : String(error),
            durationMs: Date.now() - start,
            details: subChecks,
        };
    }
}

// ── 4. Canonical Unified Health Check ────────────────────────────────────────
//
// Single entry point for `health/coordinator.ts`.
// Covers: binding — lifecycle — git auth — file I/O — processes — ports — web
//         server — code interpreter.
// Runs the lifecycle probe + all capability checks concurrently, then folds
// into one aggregated HealthStepResult. The coordinator only needs:
//   import { checkHealth } from '@/ai/mcp/tools/sandbox-sdk/health';

/**
 * Canonical health gate for the entire Sandbox SDK subsystem.
 *
 * Checks:
 *  1. SANDBOX binding presence
 *  2. Full lifecycle (create → exec → file-io → git-clone → destroy)
 *  3. GitHub API authentication
 *  4. File read/write roundtrip
 *  5. Process management (start / list / kill / stream)
 *  6. Port exposure (expose / list / unexpose)
 *  7. Web server (start HTTP → expose → fetch response)
 *  8. Code interpreter (Python + Node.js exec)
 */
export async function checkHealth(env: Env): Promise<HealthStepResult> {
    const start = Date.now();
    const details: Record<string, any> = {};

    // ── 0. Binding gate ──────────────────────────────────────────────────
    if (!(env as any).SANDBOX) {
        return {
            name: "Sandbox SDK",
            status: "failure",
            message: "SANDBOX binding missing from environment",
            durationMs: Date.now() - start,
            details: { binding: { status: "FAILURE", error: "SANDBOX binding missing" } },
        };
    }
    details.binding = { status: "OK" };

    // ── 1. Run all probes concurrently ───────────────────────────────────
    const hostname = (env as any).SANDBOX_HOSTNAME || undefined;

    const [
        lifecycleResult,
        gitResult,
        processResult,
        portResult,
        webServerResult,
        codeResult,
    ] = await Promise.allSettled([
        withTimeout(checkSandboxLifecycle(env), 60_000, "Lifecycle"),
        withTimeout(checkGitCapabilities(env), 35_000, "Git"),
        withTimeout(checkProcessManagement(env), 30_000, "Process"),
        withTimeout(checkPortExposure(env, hostname), 30_000, "Port"),
        withTimeout(checkWebServer(env, hostname), 30_000, "WebServer"),
        withTimeout(checkCodeInterpreter(env), 20_000, "CodeInterpreter"),
    ]);

    // ── 2. Fold results ──────────────────────────────────────────────────
    const mapResult = (
        label: string,
        r: PromiseSettledResult<HealthStepResult>,
    ) => {
        if (r.status === "fulfilled") {
            details[label] = {
                status: r.value.status === "success" ? "OK" : "FAIL",
                message: r.value.message,
                latency: r.value.durationMs,
                ...r.value.details,
            };
            return r.value.status === "success";
        }
        details[label] = {
            status: "FAIL",
            error: r.reason instanceof Error ? r.reason.message : String(r.reason),
        };
        return false;
    };

    const allOk = [
        mapResult("lifecycle", lifecycleResult),
        mapResult("git", gitResult),
        mapResult("process", processResult),
        mapResult("port", portResult),
        mapResult("webServer", webServerResult),
        mapResult("codeInterpreter", codeResult),
    ];

    const failCount = allOk.filter((ok) => !ok).length;
    const status: "success" | "failure" = failCount === 0 ? "success" : "failure";
    const message =
        failCount === 0
            ? "Sandbox SDK fully operational — all 8 checks passed"
            : `Sandbox SDK degraded — ${failCount}/6 capability probes failed`;

    return {
        name: "Sandbox SDK",
        status,
        message,
        durationMs: Date.now() - start,
        details,
    };
}
