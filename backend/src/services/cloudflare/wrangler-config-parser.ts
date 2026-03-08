/**
 * wrangler-config/parser.ts
 *
 * Reads wrangler.toml or wrangler.jsonc → WranglerConfig (validated by Zod).
 * Wraps @iarna/toml (or smol-toml) and jsonc-parser.
 */

import { readFileSync, existsSync } from "fs";
import { resolve, extname, basename } from "path";
import { parse as parseToml } from "smol-toml";
import { parse as parseJsonc, type ParseError } from "jsonc-parser";
import { ZodError } from "zod";
import { WranglerConfigSchema, type WranglerConfig, type WranglerEnvConfig, type Route, type KVNamespace, type R2Bucket, type D1Database, type DurableObjectBinding, type QueueProducer, type QueueConsumer, type ServiceBinding, type AIBindingSchema, type VectorizeSchema, type HyperdriveSchema } from "@/types/cloudflare/deployment";

// ---------------------------------------------------------------------------
// File discovery
// ---------------------------------------------------------------------------

export type ConfigFormat = "toml" | "jsonc" | "json";

export interface DiscoveredConfig {
  filePath: string;
  format: ConfigFormat;
}

const CANDIDATE_NAMES = [
  { name: "wrangler.jsonc", format: "jsonc" as const },
  { name: "wrangler.json", format: "json" as const },
  { name: "wrangler.toml", format: "toml" as const },
];

/**
 * Find the first wrangler config file in `dir` (or `cwd` by default).
 * Preference order: wrangler.jsonc → wrangler.json → wrangler.toml
 */
export function findWranglerConfig(dir?: string): DiscoveredConfig | null {
  const base = resolve(dir ?? process.cwd());
  for (const candidate of CANDIDATE_NAMES) {
    const filePath = resolve(base, candidate.name);
    if (existsSync(filePath)) {
      return { filePath, format: candidate.format };
    }
  }
  return null;
}

/**
 * Infer the format from a file path.
 */
export function inferFormat(filePath: string): ConfigFormat {
  const ext = extname(filePath).toLowerCase();
  const base = basename(filePath).toLowerCase();
  if (ext === ".toml") return "toml";
  if (ext === ".jsonc") return "jsonc";
  if (ext === ".json" || base === "wrangler.json") return "json";
  throw new Error(`Cannot infer wrangler config format from: ${filePath}`);
}

// ---------------------------------------------------------------------------
// Raw parsing (no validation)
// ---------------------------------------------------------------------------

export function parseRaw(
  content: string,
  format: ConfigFormat
): Record<string, unknown> {
  if (format === "toml") {
    // smol-toml returns a plain object
    return parseToml(content) as Record<string, unknown>;
  }
  // Both json and jsonc use jsonc-parser (handles comments, trailing commas)
  const errors: ParseError[] = [];
  const result = parseJsonc(content, errors, {
    allowTrailingComma: true,
    allowEmptyContent: false,
  });
  if (errors.length > 0) {
    const msg = errors.map((e) => `offset ${e.offset}: error code ${e.error}`).join("; ");
    throw new SyntaxError(`JSONC parse errors: ${msg}`);
  }
  return result as Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Validated parsing
// ---------------------------------------------------------------------------

export interface ParseResult {
  config: WranglerConfig;
  filePath: string;
  format: ConfigFormat;
  raw: Record<string, unknown>;
}

export class WranglerConfigError extends Error {
  constructor(
    message: string,
    public readonly zodError?: ZodError,
    public readonly filePath?: string
  ) {
    super(message);
    this.name = "WranglerConfigError";
  }
}

/**
 * Parse and validate a wrangler config config string (content).
 * Throws `WranglerConfigError` on failure.
 */
export function parseWranglerConfigContent(
  content: string,
  format: ConfigFormat,
  filePath: string = "in-memory-config"
): ParseResult {
  const raw = parseRaw(content, format);

  const result = WranglerConfigSchema.safeParse(raw);
  if (!result.success) {
    throw new WranglerConfigError(
      `Invalid wrangler config at ${filePath}:\n${formatZodError(result.error)}`,
      result.error,
      filePath
    );
  }

  return { config: result.data, filePath, format, raw };
}

/**
 * Parse and validate a wrangler config file from disk.
 */
export function parseWranglerConfig(
  filePath: string,
  format?: ConfigFormat
): ParseResult {
  const resolvedPath = resolve(filePath);
  const fmt = format ?? inferFormat(resolvedPath);
  const content = readFileSync(resolvedPath, "utf-8");
  return parseWranglerConfigContent(content, fmt, resolvedPath);
}

/**
 * Auto-discover and parse the wrangler config in `dir`.
 */
export function parseWranglerConfigDir(dir?: string): ParseResult {
  const found = findWranglerConfig(dir);
  if (!found) {
    throw new WranglerConfigError(
      `No wrangler config file found in ${resolve(dir ?? process.cwd())}`
    );
  }
  return parseWranglerConfig(found.filePath, found.format);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatZodError(error: ZodError): string {
  return error.issues
    .map((i) => `  [${i.path.join(".")}] ${i.message}`)
    .join("\n");
}

// ---------------------------------------------------------------------------
// Type-safe getters (convenience layer on top of parsed config)
// ---------------------------------------------------------------------------

export class WranglerConfigReader {
  public readonly config: WranglerConfig;
  public readonly filePath: string;
  public readonly format: ConfigFormat;

  constructor(result: ParseResult) {
    this.config = result.config;
    this.filePath = result.filePath;
    this.format = result.format;
  }

  // ── Core getters ─────────────────────────────────────────────────────────

  get name(): string | undefined {
    return this.config.name;
  }

  get main(): string | undefined {
    return this.config.main;
  }

  get compatibilityDate(): string | undefined {
    return this.config.compatibility_date;
  }

  get compatibilityFlags(): string[] {
    return this.config.compatibility_flags ?? [];
  }

  get accountId(): string | undefined {
    return this.config.account_id;
  }

  get workersDev(): boolean {
    return this.config.workers_dev ?? false;
  }

  // ── Bindings ─────────────────────────────────────────────────────────────

  get kvNamespaces(): KVNamespace[] {
    return this.config.kv_namespaces ?? [];
  }

  get r2Buckets(): R2Bucket[] {
    return this.config.r2_buckets ?? [];
  }

  get d1Databases(): D1Database[] {
    return this.config.d1_databases ?? [];
  }

  get durableObjects(): DurableObjectBinding[] {
    return this.config.durable_objects?.bindings ?? [];
  }

  get queueProducers(): QueueProducer[] {
    return this.config.queues?.producers ?? [];
  }

  get queueConsumers(): QueueConsumer[] {
    return this.config.queues?.consumers ?? [];
  }

  get services(): ServiceBinding[] {
    return this.config.services ?? [];
  }

  get aiBinding() {
    return this.config.ai;
  }

  get workflows() {
    return this.config.workflows ?? [];
  }

  get vectorize() {
    return this.config.vectorize ?? [];
  }

  get hyperdrive() {
    return this.config.hyperdrive ?? [];
  }

  // ── Triggers ─────────────────────────────────────────────────────────────

  get crons(): string[] {
    return this.config.triggers?.crons ?? [];
  }

  // ── Routes ───────────────────────────────────────────────────────────────

  get routes(): Route[] {
    const cfg = this.config;
    const all: Route[] = [];
    if (cfg.route) all.push(cfg.route);
    if (cfg.routes) all.push(...cfg.routes);
    return all;
  }

  // ── Environment config ───────────────────────────────────────────────────

  env(name: string): WranglerConfig | undefined {
    return this.config.env?.[name] as WranglerConfig | undefined;
  }

  envNames(): string[] {
    return Object.keys(this.config.env ?? {});
  }

  /** Merge top-level config with a named env (env values take precedence). */
  mergedEnv(name: string): WranglerConfig {
    const envConfig = this.config.env?.[name] ?? {};
    return { ...this.config, ...envConfig, env: undefined };
  }

  // ── Vars ─────────────────────────────────────────────────────────────────

  vars(envName?: string): Record<string, string | number | Record<string, unknown>> {
    const base = this.config.vars ?? {};
    if (!envName) return base;
    const envVars = this.config.env?.[envName]?.vars ?? {};
    return { ...base, ...envVars };
  }

  // ── Convenience summary ──────────────────────────────────────────────────

  summary(): string {
    const c = this.config;
    const lines = [
      `Worker:        ${c.name ?? "(unnamed)"}`,
      `Main:          ${c.main ?? "(not set)"}`,
      `Compat date:   ${c.compatibility_date ?? "(not set)"}`,
      `Account:       ${c.account_id ?? "(not set)"}`,
      `Workers.dev:   ${c.workers_dev ?? false}`,
      `KV namespaces: ${(c.kv_namespaces ?? []).length}`,
      `R2 buckets:    ${(c.r2_buckets ?? []).length}`,
      `D1 databases:  ${(c.d1_databases ?? []).length}`,
      `DO bindings:   ${(c.durable_objects?.bindings ?? []).length}`,
      `Queues:        ${(c.queues?.producers ?? []).length}p / ${(c.queues?.consumers ?? []).length}c`,
      `Services:      ${(c.services ?? []).length}`,
      `Environments:  ${Object.keys(c.env ?? {}).join(", ") || "(none)"}`,
      `Crons:         ${(c.triggers?.crons ?? []).join(", ") || "(none)"}`,
    ];
    return lines.join("\n");
  }
}
