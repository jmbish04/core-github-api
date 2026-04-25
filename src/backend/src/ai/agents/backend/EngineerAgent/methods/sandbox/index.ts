/**
 * @file EngineerAgent/methods/sandbox/index.ts
 * @description Root aggregator for the Sandbox SDK abstraction layer.
 *              Exports all category methods as a single, flat namespace.
 *
 * @categories
 *   git       — Source Control (checkout, commit+PR, status)
 *   files     — Filesystem (read, write, delete, list, watch)
 *   commands  — Execution (exec, spawn)
 *   code      — Interpreter (runPython, runJs)
 *   storage   — R2 / Volume Mounts (mountBucket, unmountBucket)
 *   ports     — Networking (exposePort, closePort)
 *   services  — Lifecycle (startService)
 *   sessions  — Container Lifecycle (createSession, destroySession, keepAlive)
 *   terminal  — PTY / Interactive (createTerminal)
 *   bindings  — Worker Bindings (proxyBinding)
 *   streaming — Frontend Observability (streamLogs, streamLogsGenerator)
 */

// ── Shared root types ────────────────────────────────────────────────────────
export * from "./types";

// ── Category exports ─────────────────────────────────────────────────────────
export * from "./git";
export * from "./files";
export * from "./commands";
export * from "./code";
export * from "./storage";
export * from "./ports";
export * from "./services";
export * from "./sessions";
export * from "./terminal";
export * from "./bindings";
export * from "./streaming";