/**
 * @file EngineerAgent/methods/sandbox/bindings/types.ts
 * @description Types for the Cloudflare bindings proxy category.
 */

export type SupportedBinding = KVNamespace | D1Database | R2Bucket;

export interface BindingProxyOptions {
  /** The binding name (for logging / identification). */
  name: string;
  /** The actual binding object from env. */
  binding: SupportedBinding;
  /** Optional: path inside sandbox to write serialized binding config. */
  configPath?: string;
}
