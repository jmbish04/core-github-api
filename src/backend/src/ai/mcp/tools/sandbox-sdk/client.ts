/**
 * @file sandbox-sdk-tools/client.ts
 * @description A thin wrapper around @cloudflare/sandbox that provides a
 * unified interface for all agents to interact with sandboxes.
 *
 * Usage:
 * ```ts
 * import { SandboxClient } from "@sandbox-sdk-tools";
 *
 * const client = SandboxClient.create(env.SANDBOX, "my-sandbox-id");
 * const result = await client.exec({ command: "echo hello" });
 * ```
 *
 * The client delegates to `getSandbox()` from the official Sandbox SDK.
 */

import { getSandbox, type ExecResult, type ExecOptions } from "@cloudflare/sandbox";
import { getSandboxOptions } from "@/ai/utils/sandbox";
import type {
  SandboxExecOptions,
  SandboxExecResult,
  SandboxWriteFileResult,
  SandboxReadFileResult,
  ProcessInfo,
  GitCheckoutOptions,
  GitCheckoutResult,
  WranglerDevPreviewOptions,
  WranglerDevPreviewResult,
  PortDiagnosticResult,
} from "./types";

// Re-export SDK types consumers might want
export type { ExecResult, ExecOptions };

// ---------------------------------------------------------------------------
// SandboxClient
// ---------------------------------------------------------------------------

export class SandboxClient {
  private sandbox: ReturnType<typeof getSandbox>;

  private constructor(sandbox: ReturnType<typeof getSandbox>) {
    this.sandbox = sandbox;
  }

  /**
   * Create a SandboxClient for a given sandbox ID.
   *
   * @param env        The Cloudflare Worker environment bindings
   * @param sandboxId  Unique identifier for this sandbox instance.
   * @param options    Optional SDK options (keepAlive, sleepAfter, normalizeId, etc.)
   */
  static async create(
    env: Env,
    sandboxId: string,
    options?: {
      keepAlive?: boolean;
      sleepAfter?: string | number;
      normalizeId?: boolean;
      containerTimeouts?: {
        instanceGetTimeoutMS?: number;
        portReadyTimeoutMS?: number;
      };
    },
  ): Promise<SandboxClient> {
    const defaultOptions = await getSandboxOptions(env);
    const sandbox = getSandbox(
      (env as any).SANDBOX,
      sandboxId,
      { ...defaultOptions, ...options }
    );
    return new SandboxClient(sandbox);
  }

  /** Expose the underlying SDK Sandbox instance for advanced use. */
  get raw(): ReturnType<typeof getSandbox> {
    return this.sandbox;
  }

  // -------------------------------------------------------------------------
  // Command execution
  // -------------------------------------------------------------------------

  /**
   * Execute a shell command inside the sandbox.
   *
   * If `sessionId` is provided, the command runs in that session's context.
   * Otherwise it runs in the sandbox's default session.
   */
  async exec(opts: SandboxExecOptions): Promise<SandboxExecResult> {
    const execOpts: ExecOptions = {
      timeout: opts.timeoutMs,
      env: opts.env,
      cwd: opts.cwd,
    };

    let result: ExecResult;
    if (opts.sessionId) {
      // Run in a specific session
      const session = await this.sandbox.getSession(opts.sessionId);
      result = await session.exec(opts.command, execOpts);
    } else {
      result = await this.sandbox.exec(opts.command, execOpts);
    }

    return {
      success: result.success,
      command: result.command ?? opts.command,
      exitCode: result.exitCode,
      stdout: result.stdout ?? "",
      stderr: result.stderr ?? "",
    };
  }

  // -------------------------------------------------------------------------
  // Session management
  // -------------------------------------------------------------------------

  /** Create an isolated session with its own shell state. */
  async createSession(opts?: { id?: string; env?: Record<string, string>; cwd?: string }) {
    return this.sandbox.createSession(opts);
  }

  /** Get an existing session by ID. */
  async getSession(sessionId: string) {
    return this.sandbox.getSession(sessionId);
  }

  /** Delete a session. */
  async deleteSession(sessionId: string): Promise<void> {
    await this.sandbox.deleteSession(sessionId);
  }

  // -------------------------------------------------------------------------
  // File operations
  // -------------------------------------------------------------------------

  /** Write a file inside the sandbox filesystem. */
  async writeFile(opts: { path: string; content: string; sessionId?: string }): Promise<SandboxWriteFileResult> {
    await this.sandbox.writeFile(opts.path, opts.content, {
      sessionId: opts.sessionId,
    });
    return {
      success: true,
      path: opts.path,
      bytesWritten: new TextEncoder().encode(opts.content).byteLength,
    };
  }

  /** Read a file from the sandbox filesystem. */
  async readFile(opts: { path: string; sessionId?: string }): Promise<SandboxReadFileResult> {
    const result = await this.sandbox.readFile(opts.path, {
      sessionId: opts.sessionId,
    });
    return {
      success: result.success,
      path: result.path,
      content: result.content,
    };
  }

  // -------------------------------------------------------------------------
  // Process management
  // -------------------------------------------------------------------------

  /** List running processes inside the container. */
  async listProcesses(): Promise<ProcessInfo[]> {
    const processes = await this.sandbox.listProcesses();
    return (processes ?? []).map((p: any) => ({
      user: p.user ?? "",
      pid: String(p.pid ?? p.id ?? ""),
      command: p.command ?? "",
      cpu: p.cpu ?? "0",
      mem: p.mem ?? "0",
      time: p.time ?? "",
    }));
  }

  /** Start a background process. */
  async startProcess(command: string, options?: { cwd?: string; env?: Record<string, string> }) {
    return this.sandbox.startProcess(command, options);
  }

  /** Kill all running processes. */
  async killAllProcesses(): Promise<number> {
    return this.sandbox.killAllProcesses();
  }

  // -------------------------------------------------------------------------
  // Port exposure
  // -------------------------------------------------------------------------

  /** Expose a container port for preview URL access. Requires hostname. */
  async exposePort(
    port: number,
    options: { hostname: string; name?: string },
  ) {
    return this.sandbox.exposePort(port, options);
  }

  /** Unexpose a previously exposed port. */
  async unexposePort(port: number): Promise<void> {
    await this.sandbox.unexposePort(port);
  }

  // -------------------------------------------------------------------------
  // Git operations (convenience — runs git commands via exec)
  // -------------------------------------------------------------------------

  /** Clone a git repository into the sandbox workspace. */
  async gitClone(opts: GitCheckoutOptions): Promise<GitCheckoutResult> {
    const targetDir = opts.targetDir ?? "/workspace/repo";
    const parts = ["git", "clone", "--depth=1"];
    if (opts.branch) parts.push("--branch", opts.branch);
    parts.push(opts.repoUrl, targetDir);

    const result = await this.exec({
      command: parts.join(" "),
      sessionId: opts.sessionId,
      timeoutMs: 120_000,
    });

    return {
      success: result.success,
      repoUrl: opts.repoUrl,
      branch: opts.branch ?? "default",
      targetDir,
      timestamp: new Date().toISOString(),
    };
  }

  // -------------------------------------------------------------------------
  // Container API (task_runner & system)
  // -------------------------------------------------------------------------

  /** Execute a task in the container via the task_runner */
  async executeTask(opts: { command: string; repoUrl?: string; payload?: any }) {
    const res = await this.sandbox.fetch(new Request("http://localhost:8788/execute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(opts),
    }));
    return res.json();
  }

  /** Stop the current task_runner process */
  async stopTask() {
    const res = await this.sandbox.fetch(new Request("http://localhost:8788/stop", {
      method: "POST",
    }));
    return res.json();
  }

  /** Proxy a generic fetch request to the container's HTTP API */
  async proxyFetch(path: string, init?: RequestInit, port: number = 8788) {
    const url = `http://localhost:${port}${path}`;
    return this.sandbox.fetch(new Request(url, init as any));
  }


  // -------------------------------------------------------------------------
  // Python script helpers
  // -------------------------------------------------------------------------

  /**
   * Run health.py inside the container.
   * Returns the parsed JSON output from `python3 /scripts/health.py`.
   * Checks available: exec | fs | git | proc | net (default: all)
   */
  async runHealthScript(
    checks: "all" | string = "all",
  ): Promise<{ success: boolean; checks: Record<string, any>; timestamp: string }> {
    const result = await this.sandbox.exec(
      `python3 /scripts/health.py --check ${checks}`,
    );

    try {
      return JSON.parse(result.stdout);
    } catch {
      throw new Error(
        `health.py produced non-JSON output (exit ${result.exitCode}): ${result.stdout || result.stderr}`,
      );
    }
  }

  // -------------------------------------------------------------------------
  // Wrangler dev port passthrough
  // -------------------------------------------------------------------------

  /**
   * Start wrangler dev on `port` inside the container,
   * wait for readiness, then call sandbox.exposePort() so the
   * running worker is accessible via a preview URL.
   *
   * hostname is resolved from opts.hostname ?? new URL(env.BASE_URL).hostname
   */
  async startWranglerDevPreview(
    env: Env,
    opts: WranglerDevPreviewOptions = {},
  ): Promise<WranglerDevPreviewResult> {
    const port = opts.port ?? 8787;
    const cwdArg = opts.cwd ? ` --cwd ${opts.cwd}` : "";

    // 1. Start wrangler dev inside the container
    const startResult = await this.sandbox.exec(
      `python3 /scripts/port_passthrough.py --start --port ${port}${cwdArg}`,
      { timeout: 45_000 },
    );

    let parsed: any;
    try {
      parsed = JSON.parse(startResult.stdout);
    } catch {
      return {
        ready: false,
        port,
        pid: null,
        url: null,
        errors: [`port_passthrough.py produced non-JSON: ${startResult.stdout || startResult.stderr}`],
      };
    }

    if (!parsed.ready) {
      return { ready: false, port, pid: parsed.pid ?? null, url: null, errors: parsed.errors ?? [] };
    }

    // 2. Resolve hostname — prefer explicit opt, then env.BASE_URL, then fallback
    let hostname: string;
    try {
      hostname = opts.hostname ?? new URL((env as any).BASE_URL ?? "").hostname;
    } catch {
      hostname = "";
    }

    if (!hostname) {
      return {
        ready: true,
        port,
        pid: parsed.pid ?? null,
        url: `http://localhost:${port}`,
        errors: ["BASE_URL not set — returning localhost URL. Set env.BASE_URL for a public preview URL."],
      };
    }

    // 3. Expose the port via the Sandbox SDK
    try {
      const exposed = await this.sandbox.exposePort(port, { hostname });
      return {
        ready: true,
        port,
        pid: parsed.pid ?? null,
        url: (exposed as any).url ?? `http://localhost:${port}`,
        errors: [],
      };
    } catch (err: any) {
      return {
        ready: true, // wrangler dev IS running
        port,
        pid: parsed.pid ?? null,
        url: `http://localhost:${port}`,
        errors: [`exposePort failed: ${err?.message ?? String(err)}`],
      };
    }
  }

  async diagnosePortPassthrough(opts: { port?: number } = {}): Promise<PortDiagnosticResult> {
    const port = opts.port ?? 8787;
    const result = await this.sandbox.exec(
      `python3 /scripts/port_passthrough.py --diagnose --port ${port}`,
      { timeout: 15_000 },
    );

    try {
      return JSON.parse(result.stdout) as PortDiagnosticResult;
    } catch {
      throw new Error(
        `port_passthrough.py --diagnose produced non-JSON (exit ${result.exitCode}): ${result.stdout || result.stderr}`,
      );
    }
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  /** Destroy the sandbox and its container. */
  async destroy(): Promise<void> {
    await this.sandbox.destroy();
  }
}
