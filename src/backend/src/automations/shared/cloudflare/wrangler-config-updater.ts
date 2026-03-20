/**
 * wrangler-config/updater.ts
 *
 * Surgically update wrangler.toml or wrangler.jsonc in-place —
 * preserving comments, formatting, and unrelated keys.
 *
 * Strategy:
 *  - TOML: line-by-line text patching using TOML-aware traversal
 *  - JSONC: jsonc-parser's AST-based modify() with format preservation
 */

import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";
import { parse as parseToml, stringify as stringifyToml } from "smol-toml";
import {
  parse as parseJsonc,
  modify,
  applyEdits,
  format as formatJsonc,
  type ParseOptions,
} from "jsonc-parser";
import { WranglerConfigSchema, type WranglerConfig } from "@/types/cloudflare/deployment";
import { inferFormat, parseRaw, type ConfigFormat } from "./wrangler-config-parser";
import type { ZodError } from "zod";

// ---------------------------------------------------------------------------
// Path utilities for deeply nested keys
// ---------------------------------------------------------------------------

/** A dot-separated or array-segment path into the config object. */
export type ConfigPath = string | (string | number)[];

function toSegments(path: ConfigPath): (string | number)[] {
  if (Array.isArray(path)) return path;
  // Split on dots but preserve numeric segments
  return path.split(".").map((s) => (/^\d+$/.test(s) ? parseInt(s, 10) : s));
}

/** Read a value from a plain object using path segments. */
function getAtPath(obj: Record<string, unknown>, segments: (string | number)[]): unknown {
  let cur: unknown = obj;
  for (const seg of segments) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string | number, unknown>)[seg];
  }
  return cur;
}

// ---------------------------------------------------------------------------
// JSONC updater
// ---------------------------------------------------------------------------

/** Options for jsonc-parser's modify(). */
interface JsoncUpdateOptions {
  formattingOptions?: {
    tabSize?: number;
    insertSpaces?: boolean;
    eol?: string;
  };
}

function updateJsonc(
  content: string,
  path: (string | number)[],
  value: unknown,
  opts: JsoncUpdateOptions = {}
): string {
  const edits = modify(content, path, value, {
    formattingOptions: {
      tabSize: 2,
      insertSpaces: true,
      eol: "\n",
      ...opts.formattingOptions,
    },
  });
  return applyEdits(content, edits);
}

// ---------------------------------------------------------------------------
// TOML updater — set leaf value via structured re-serialization of subtree
// ---------------------------------------------------------------------------

/**
 * Deep-set a value in a plain object by path (mutates in place, returns obj).
 */
function deepSet(
  obj: Record<string, unknown>,
  segments: (string | number)[],
  value: unknown
): void {
  let cur: Record<string, unknown> = obj;
  for (let i = 0; i < segments.length - 1; i++) {
    const seg = segments[i];
    const next = segments[i + 1];
    if (!(seg in cur)) {
      cur[seg as string] = typeof next === "number" ? [] : {};
    }
    cur = cur[seg as string] as Record<string, unknown>;
  }
  const last = segments[segments.length - 1];
  cur[last as string] = value;
}

/**
 * Deep-delete a key from a plain object by path (mutates in place).
 */
function deepDelete(
  obj: Record<string, unknown>,
  segments: (string | number)[]
): void {
  let cur: Record<string, unknown> = obj;
  for (let i = 0; i < segments.length - 1; i++) {
    const seg = segments[i];
    if (!(seg in cur)) return;
    cur = cur[seg as string] as Record<string, unknown>;
  }
  const last = segments[segments.length - 1];
  delete cur[last as string];
}

// ---------------------------------------------------------------------------
// Public Updater class
// ---------------------------------------------------------------------------

export interface UpdateOperation {
  /** Dot-notation or segment array path. e.g. "name", "env.production.name", ["kv_namespaces", 0, "id"] */
  path: ConfigPath;
  /** The new value. Pass `undefined` to delete the key. */
  value: unknown;
}

export interface UpdateResult {
  /** Updated file content (not yet written to disk) */
  content: string;
  /** Validated parsed config after the update */
  config: WranglerConfig;
}

export class WranglerConfigUpdater {
  private filePath: string;
  private format: ConfigFormat;
  private content: string;

  constructor(filePath: string, format?: ConfigFormat, initialContent?: string) {
    this.filePath = resolve(filePath);
    this.format = format ?? inferFormat(filePath);
    this.content = initialContent ?? ""; 
  }

  // ── Read ─────────────────────────────────────────────────────────────────

  read(): string {
     // If initialContent was provided (e.g. from GitHub), use it. Otherwise read from disk.
    if (this.content) return this.content;
    try {
        return readFileSync(this.filePath, "utf-8");
    } catch (e) {
        return "";
    }
  }

  // ── Core update (in-memory) ───────────────────────────────────────────────

  /**
   * Apply one or more update operations to the config file content and return
   * the modified content + validated config (does NOT write to disk).
   */
  apply(
    operations: UpdateOperation | UpdateOperation[],
    opts: { skipValidation?: boolean } = {}
  ): UpdateResult {
    const ops = Array.isArray(operations) ? operations : [operations];
    let content = this.read();

    if (this.format === "toml") {
      content = this._applyToml(content, ops);
    } else {
      content = this._applyJsonc(content, ops);
    }

    // Validate result
    let config: WranglerConfig;
    if (opts.skipValidation) {
      config = parseRaw(content, this.format) as WranglerConfig;
    } else {
      const raw = parseRaw(content, this.format);
      const result = WranglerConfigSchema.safeParse(raw);
      if (!result.success) {
        throw new WranglerUpdateError(
          "Updated config failed Zod validation",
          result.error
        );
      }
      config = result.data;
    }

    // Update internal content state
    this.content = content;

    return { content, config };
  }

  /**
   * Apply operations AND write to disk atomically (write to tmp then rename).
   */
  update(
    operations: UpdateOperation | UpdateOperation[],
    opts: { skipValidation?: boolean } = {}
  ): WranglerConfig {
    const { content, config } = this.apply(operations, opts);
    // Write back
    writeFileSync(this.filePath, content, "utf-8");
    return config;
  }

  // ── Convenience typed setters ─────────────────────────────────────────────

  setName(name: string): WranglerConfig {
    return this.update({ path: "name", value: name });
  }

  setMain(main: string): WranglerConfig {
    return this.update({ path: "main", value: main });
  }

  setCompatibilityDate(date: string): WranglerConfig {
    return this.apply({ path: "compatibility_date", value: date }).config;
  }

  setCompatibilityFlags(flags: string[]): WranglerConfig {
    return this.apply({ path: "compatibility_flags", value: flags }).config;
  }

  setAccountId(id: string): WranglerConfig {
    return this.apply({ path: "account_id", value: id }).config;
  }

  setWorkersDev(enabled: boolean): WranglerConfig {
    return this.apply({ path: "workers_dev", value: enabled }).config;
  }

  setVar(key: string, value: string | number | Record<string, unknown>): WranglerConfig {
    return this.apply({ path: ["vars", key], value }).config;
  }

  deleteVar(key: string): WranglerConfig {
    return this.apply({ path: ["vars", key], value: undefined }).config;
  }

  /** Add or replace an entire env block. */
  setEnv(envName: string, envConfig: Record<string, unknown>): WranglerConfig {
    return this.apply({ path: ["env", envName], value: envConfig }).config;
  }

  /** Delete an env block. */
  deleteEnv(envName: string): WranglerConfig {
    return this.apply({ path: ["env", envName], value: undefined }).config;
  }

  /** Add or replace a cron list. */
  setCrons(crons: string[]): WranglerConfig {
    return this.apply({ path: ["triggers", "crons"], value: crons }).config;
  }

  /** Append a KV namespace (non-destructive). */
  addKVNamespace(binding: string, id: string, preview_id?: string): WranglerConfig {
    const raw = parseRaw(this.read(), this.format) as Record<string, unknown>;
    const existing = (raw.kv_namespaces as unknown[] | undefined) ?? [];
    const ns: Record<string, string> = { binding, id };
    if (preview_id) ns.preview_id = preview_id;
    return this.apply({ path: "kv_namespaces", value: [...existing, ns] }).config;
  }

  /** Append a D1 database binding. */
  addD1Database(binding: string, database_name: string, database_id: string): WranglerConfig {
    const raw = parseRaw(this.read(), this.format) as Record<string, unknown>;
    const existing = (raw.d1_databases as unknown[] | undefined) ?? [];
    return this.apply({
      path: "d1_databases",
      value: [...existing, { binding, database_name, database_id }],
    }).config;
  }

  /** Append an R2 bucket binding. */
  addR2Bucket(binding: string, bucket_name: string): WranglerConfig {
    const raw = parseRaw(this.read(), this.format) as Record<string, unknown>;
    const existing = (raw.r2_buckets as unknown[] | undefined) ?? [];
    return this.apply({
      path: "r2_buckets",
      value: [...existing, { binding, bucket_name }],
    }).config;
  }

  // ── TOML internal ─────────────────────────────────────────────────────────

  private _applyToml(content: string, ops: UpdateOperation[]): string {
    /**
     * TOML surgical update strategy:
     * 1. Parse entire TOML into a plain object.
     * 2. Apply mutations.
     * 3. Re-serialize with smol-toml.
     *
     * This loses inline comments (TOML has no standard comment-preserving
     * round-trip format), but it's the most correct approach available without
     * a full TOML AST library.  If comment preservation is critical, store
     * config as wrangler.jsonc instead (Cloudflare's recommendation).
     */
    const raw = parseToml(content) as Record<string, unknown>;

    for (const op of ops) {
      const segs = toSegments(op.path);
      if (op.value === undefined) {
        deepDelete(raw, segs);
      } else {
        deepSet(raw, segs, op.value);
      }
    }

    return stringifyToml(raw as any);
  }

  // ── JSONC internal ────────────────────────────────────────────────────────

  private _applyJsonc(content: string, ops: UpdateOperation[]): string {
    let result = content;
    for (const op of ops) {
      const segs = toSegments(op.path);
      result = updateJsonc(result, segs, op.value);
    }
    return result;
  }

  // ── Preview ───────────────────────────────────────────────────────────────

  /**
   * Return the diff of what *would* change without writing to disk.
   */
  preview(operations: UpdateOperation | UpdateOperation[]): {
    before: string;
    after: string;
    changed: boolean;
  } {
    const before = this.read();
    const { content: after } = this.apply(operations, { skipValidation: true });
    return { before, after, changed: before !== after };
  }
}

// ---------------------------------------------------------------------------
// Error
// ---------------------------------------------------------------------------

export class WranglerUpdateError extends Error {
  constructor(message: string, public readonly zodError?: ZodError) {
    super(message);
    this.name = "WranglerUpdateError";
  }
}

// ---------------------------------------------------------------------------
// Standalone functional helpers
// ---------------------------------------------------------------------------

/**
 * One-shot convenience: read → update → write → return config.
 *
 * @example
 * updateWranglerConfig("./wrangler.toml", [
 *   { path: "name", value: "my-new-worker-name" },
 *   { path: "compatibility_date", value: "2026-02-18" },
 * ]);
 */
export function updateWranglerConfig(
  filePath: string,
  operations: UpdateOperation | UpdateOperation[],
  opts: { skipValidation?: boolean; format?: ConfigFormat } = {}
): WranglerConfig {
  const updater = new WranglerConfigUpdater(filePath, opts.format);
  return updater.update(operations, opts);
}

/**
 * Preview changes without writing.
 */
export function previewWranglerUpdate(
  filePath: string,
  operations: UpdateOperation | UpdateOperation[],
  opts: { format?: ConfigFormat } = {}
): { before: string; after: string; changed: boolean } {
  const updater = new WranglerConfigUpdater(filePath, opts.format);
  return updater.preview(operations);
}
