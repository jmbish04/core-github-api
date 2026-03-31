/**
 * @file sandbox-sdk-tools/types.ts
 * @description Shared types for the Cloudflare Sandbox SDK tools layer.
 */

// ---------------------------------------------------------------------------
// Sandbox exec results
// ---------------------------------------------------------------------------

export type SandboxExecResult = {
  success: boolean;
  command: string;
  exitCode: number;
  stdout: string;
  stderr: string;
};

export type SandboxExecOptions = {
  /** Command to execute inside the sandbox */
  command: string;
  /** Session ID to execute within (auto-created if missing) */
  sessionId?: string;
  /** Per-command timeout in ms (default 300 000 – 5 min) */
  timeoutMs?: number;
  /** Extra environment variables merged into the session env */
  env?: Record<string, string>;
  /** Working directory override (relative to session cwd or absolute) */
  cwd?: string;
};

// ---------------------------------------------------------------------------
// Session management
// ---------------------------------------------------------------------------

export type SandboxSessionOptions = {
  /** Unique session id (auto-generated if omitted) */
  id?: string;
  /** Initial working directory */
  cwd?: string;
  /** Environment variables for this session */
  env?: Record<string, string>;
};

export type SandboxSessionResult = {
  success: boolean;
  sessionId: string;
  createdAt: string;
  timestamp: string;
};

// ---------------------------------------------------------------------------
// File operations
// ---------------------------------------------------------------------------

export type SandboxWriteFileOptions = {
  path: string;
  content: string;
  sessionId?: string;
};

export type SandboxReadFileOptions = {
  path: string;
  sessionId?: string;
};

export type SandboxWriteFileResult = {
  success: boolean;
  path: string;
  bytesWritten: number;
};

export type SandboxReadFileResult = {
  success: boolean;
  path: string;
  content: string;
};

// ---------------------------------------------------------------------------
// Process management
// ---------------------------------------------------------------------------

export type ProcessInfo = {
  user: string;
  pid: string;
  command: string;
  cpu: string;
  mem: string;
  time: string;
};

// ---------------------------------------------------------------------------
// Port exposure
// ---------------------------------------------------------------------------

export type ExposePortOptions = {
  port: number;
  sessionId?: string;
  name?: string;
};

export type ExposedPortResult = {
  success: boolean;
  port: number;
  name?: string;
  sessionId: string;
  url: string;
};

// ---------------------------------------------------------------------------
// Wrangler dev port passthrough
// ---------------------------------------------------------------------------

/** Options for starting wrangler dev inside the sandbox. */
export type WranglerDevPreviewOptions = {
  /** Port for wrangler dev to bind on inside the container (default: 8787). */
  port?: number;
  /** Working directory inside the container (e.g. /workspace/repo). */
  cwd?: string;
  /**
   * Hostname for sandbox.exposePort().
   * Defaults to the host extracted from env.BASE_URL.
   */
  hostname?: string;
  /** Extra environment variables passed to wrangler dev. */
  env?: Record<string, string>;
};

/** Result returned by SandboxClient.startWranglerDevPreview(). */
export type WranglerDevPreviewResult = {
  /** Whether wrangler dev is ready and the port is exposed. */
  ready: boolean;
  /** The port wrangler dev is listening on inside the container. */
  port: number;
  /** PID of the wrangler process inside the container (if resolved). */
  pid: string | null;
  /** Public preview URL returned by sandbox.exposePort() (production) or localhost URL (local dev). */
  url: string | null;
  /** Any errors encountered during start or port exposure. */
  errors: string[];
};

/** Diagnostic report returned by SandboxClient.diagnosePortPassthrough(). */
export type PortDiagnosticResult = {
  ready: boolean;
  port: number;
  pid: string | null;
  url: string | null;
  errors: string[];
  bound_ports: number[];
  processes: Array<{ pid: string; cmd: string; port: number | null }>;
  http_check?: { reachable: boolean; http_status?: string; error?: string };
  env_vars: Record<string, string>;
  timestamp: string;
};

// ---------------------------------------------------------------------------
// Git checkout
// ---------------------------------------------------------------------------

export type GitCheckoutOptions = {
  repoUrl: string;
  branch?: string;
  targetDir?: string;
  sessionId?: string;
};

export type GitCheckoutResult = {
  success: boolean;
  repoUrl: string;
  branch: string;
  targetDir: string;
  timestamp: string;
};
