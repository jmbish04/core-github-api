/**
 * wrangler-config/schema.ts
 *
 * Complete Zod schema covering wrangler.toml and wrangler.jsonc configuration.
 * Based on Cloudflare Wrangler v3.x documentation (wrangler ≥ 3.91.0).
 *
 * Ref: https://developers.cloudflare.com/workers/wrangler/configuration/
 */

import { z } from "zod";

// ---------------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------------

/** A JavaScript-identifier-safe binding name */
const BindingName = z.string().regex(/^[A-Za-z_$][A-Za-z0-9_$]*$/, {
  message: "Binding name must be a valid JavaScript identifier",
});

// ---------------------------------------------------------------------------
// Route shapes
// ---------------------------------------------------------------------------

export const RouteObjectSchema = z.object({
  pattern: z.string(),
  zone_id: z.string().optional(),
  zone_name: z.string().optional(),
  custom_domain: z.boolean().optional(),
});

export const RouteSchema = z.union([z.string(), RouteObjectSchema]);

// ---------------------------------------------------------------------------
// Build config
// ---------------------------------------------------------------------------

export const BuildConfigSchema = z.object({
  command: z.string().optional(),
  cwd: z.string().optional(),
  watch_dir: z.union([z.string(), z.array(z.string())]).optional(),
});

// ---------------------------------------------------------------------------
// Dev config
// ---------------------------------------------------------------------------

export const DevConfigSchema = z.object({
  ip: z.string().optional(),
  port: z.number().int().optional(),
  inspector_port: z.number().int().optional(),
  local_protocol: z.union([z.literal("http"), z.literal("https")]).optional(),
  upstream_protocol: z.union([z.literal("http"), z.literal("https")]).optional(),
  host: z.string().optional(),
});

// ---------------------------------------------------------------------------
// Limits
// ---------------------------------------------------------------------------

export const LimitsSchema = z.object({
  cpu_ms: z.number().int().optional(),
});

// ---------------------------------------------------------------------------
// Observability
// ---------------------------------------------------------------------------

export const ObservabilitySchema = z.object({
  enabled: z.boolean().optional(),
  head_sampling_rate: z.number().min(0).max(1).optional(),
});

// ---------------------------------------------------------------------------
// Assets (static assets / SPA hosting)
// ---------------------------------------------------------------------------

export const AssetsSchema = z.object({
  directory: z.string(),
  binding: BindingName.optional(),
  html_handling: z
    .union([
      z.literal("auto-trailing-slash"),
      z.literal("force-trailing-slash"),
      z.literal("drop-trailing-slash"),
      z.literal("none"),
    ])
    .optional(),
  not_found_handling: z
    .union([z.literal("single-page-application"), z.literal("404-page"), z.literal("none")])
    .optional(),
  run_worker_first: z.boolean().optional(),
});

// ---------------------------------------------------------------------------
// Triggers (cron)
// ---------------------------------------------------------------------------

export const TriggersSchema = z.object({
  crons: z.array(z.string()).optional(),
});

// ---------------------------------------------------------------------------
// Placement
// ---------------------------------------------------------------------------

export const PlacementSchema = z.object({
  mode: z.union([z.literal("smart"), z.literal("off")]).optional(),
});

// ---------------------------------------------------------------------------
// Tail consumers
// ---------------------------------------------------------------------------

export const TailConsumerSchema = z.object({
  service: z.string(),
  environment: z.string().optional(),
  namespace: z.string().optional(),
});

// ---------------------------------------------------------------------------
// Bindings
// ---------------------------------------------------------------------------

// KV
export const KVNamespaceSchema = z.object({
  binding: BindingName,
  id: z.string(),
  preview_id: z.string().optional(),
});

// R2
export const R2BucketSchema = z.object({
  binding: BindingName,
  bucket_name: z.string(),
  preview_bucket_name: z.string().optional(),
  jurisdiction: z.string().optional(),
});

// D1
export const D1DatabaseSchema = z.object({
  binding: BindingName,
  database_name: z.string(),
  database_id: z.string(),
  preview_database_id: z.string().optional(),
  migrations_dir: z.string().optional(),
  migrations_table: z.string().optional(),
});

// Durable Objects
export const DurableObjectBindingSchema = z.object({
  name: BindingName,
  class_name: z.string(),
  script_name: z.string().optional(),
  environment: z.string().optional(),
});

export const DurableObjectsSchema = z.object({
  bindings: z.array(DurableObjectBindingSchema).optional(),
});

// DO Migrations
export const MigrationSchema = z.object({
  tag: z.string(),
  new_classes: z.array(z.string()).optional(),
  renamed_classes: z
    .array(z.object({ from: z.string(), to: z.string() }))
    .optional(),
  deleted_classes: z.array(z.string()).optional(),
  new_sqlite_classes: z.array(z.string()).optional(),
});

// Queues
export const QueueProducerSchema = z.object({
  binding: BindingName,
  queue: z.string(),
  delivery_delay: z.number().int().optional(),
});

export const QueueConsumerSchema = z.object({
  queue: z.string(),
  max_batch_size: z.number().int().optional(),
  max_batch_timeout: z.number().optional(),
  max_retries: z.number().int().optional(),
  dead_letter_queue: z.string().optional(),
  max_concurrency: z.number().int().optional(),
  visibility_timeout_ms: z.number().int().optional(),
  retry_delay: z.number().int().optional(),
});

export const QueuesSchema = z.object({
  producers: z.array(QueueProducerSchema).optional(),
  consumers: z.array(QueueConsumerSchema).optional(),
});

// Service Bindings
export const ServiceBindingSchema = z.object({
  binding: BindingName,
  service: z.string(),
  environment: z.string().optional(),
  entrypoint: z.string().optional(),
});

// Analytics Engine
export const AnalyticsEngineDatasetSchema = z.object({
  binding: BindingName,
  dataset: z.string().optional(),
});

// Workers AI
export const AIBindingSchema = z.object({
  binding: BindingName,
});

// Vectorize
export const VectorizeSchema = z.object({
  binding: BindingName,
  index_name: z.string(),
});

// Hyperdrive
export const HyperdriveSchema = z.object({
  binding: BindingName,
  id: z.string(),
  localConnectionString: z.string().optional(),
});

// Browser Rendering
export const BrowserBindingSchema = z.object({
  binding: BindingName,
});

// Images (Cloudflare Images binding)
export const ImagesBindingSchema = z.object({
  binding: BindingName,
});

// Send Email
export const SendEmailSchema = z.object({
  name: BindingName,
  destination_address: z.string().email().optional(),
  allowed_destination_addresses: z.array(z.string().email()).optional(),
});

// mTLS Certificates
export const MTLSCertificateSchema = z.object({
  binding: BindingName,
  certificate_id: z.string(),
});

// Workers for Platforms – dispatch namespaces
export const DispatchNamespaceSchema = z.object({
  binding: BindingName,
  namespace: z.string(),
  outbound: z
    .object({
      service: z.string(),
      environment: z.string().optional(),
      parameters: z.array(z.string()).optional(),
    })
    .optional(),
});

// logfwdr (log forwarding)
export const LogfwdrBindingSchema = z.object({
  name: z.string(),
  destination: z.string(),
});

export const LogfwdrSchema = z.object({
  bindings: z.array(LogfwdrBindingSchema).optional(),
});

// Unsafe bindings (escape hatch for experimental / unlisted features)
export const UnsafeBindingSchema = z.object({
  type: z.string(),
  name: z.string(),
});

export const UnsafeSchema = z.object({
  bindings: z.array(UnsafeBindingSchema).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

// Rate Limiting
export const RateLimitingSchema = z.object({
  binding: BindingName,
  namespace_id: z.string(),
  simple: z
    .object({
      limit: z.number().int(),
      period: z.number().int(),
    })
    .optional(),
});

// Secrets Store (beta)
export const SecretsStoreSecretSchema = z.object({
  binding: BindingName,
  store_id: z.string(),
  secret_name: z.string(),
});

// Workflows
export const WorkflowBindingSchema = z.object({
  binding: BindingName,
  name: z.string(),
  class_name: z.string(),
  script_name: z.string().optional(),
});

// Version metadata (beta)
export const VersionMetadataSchema = z.object({
  binding: BindingName,
});

// Worker Loader (dynamic dispatch)
export const WorkerLoaderBindingSchema = z.object({
  binding: BindingName,
  loader: z.string().optional(),
});

// ---------------------------------------------------------------------------
// Top-level (and per-env) configuration base
// ---------------------------------------------------------------------------

/**
 * Fields that can appear both at the top level and inside an env block.
 * This is the "inheritable" set per Cloudflare docs.
 */
export const InheritableConfigSchema = z.object({
  // ── Identity ──────────────────────────────────────────────────────────────
  name: z.string().optional(),
  main: z.string().optional(),
  account_id: z.string().optional(),

  // ── Runtime ───────────────────────────────────────────────────────────────
  compatibility_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD")
    .optional(),
  compatibility_flags: z.array(z.string()).optional(),

  // ── Workers.dev / Routing ─────────────────────────────────────────────────
  workers_dev: z.boolean().optional(),
  route: RouteSchema.optional(),
  routes: z.array(RouteSchema).optional(),
  custom_domains: z.array(z.string()).optional(),

  // ── Build & bundling ──────────────────────────────────────────────────────
  tsconfig: z.string().optional(),
  minify: z.boolean().optional(),
  node_compat: z.boolean().optional(),
  upload_source_maps: z.boolean().optional(),
  jsx_factory: z.string().optional(),
  jsx_fragment: z.string().optional(),
  define: z.record(z.string(), z.string()).optional(),
  alias: z.record(z.string(), z.string()).optional(),
  find_additional_modules: z.boolean().optional(),
  preserve_file_names: z.boolean().optional(),
  rules: z
    .array(
      z.object({
        type: z.union([
          z.literal("ESModule"),
          z.literal("CommonJS"),
          z.literal("CompiledWasm"),
          z.literal("Text"),
          z.literal("Data"),
        ]),
        globs: z.array(z.string()),
        fallthrough: z.boolean().optional(),
      })
    )
    .optional(),

  // ── Environment variables & secrets ───────────────────────────────────────
  vars: z.record(z.string(), z.union([z.string(), z.number(), z.record(z.string(), z.unknown())])).optional(),
  // Note: secrets are not in wrangler.toml; they are managed via `wrangler secret`

  // ── Placement ─────────────────────────────────────────────────────────────
  placement: PlacementSchema.optional(),

  // ── Limits ────────────────────────────────────────────────────────────────
  limits: LimitsSchema.optional(),

  // ── Triggers (cron) ───────────────────────────────────────────────────────
  triggers: TriggersSchema.optional(),

  // ── Tail consumers ────────────────────────────────────────────────────────
  tail_consumers: z.array(TailConsumerSchema).optional(),

  // ── Logpush / send_metrics ───────────────────────────────────────────────
  logpush: z.boolean().optional(),
  send_metrics: z.boolean().optional(),
  keep_vars: z.boolean().optional(),

  // ── Observability ─────────────────────────────────────────────────────────
  observability: ObservabilitySchema.optional(),

  // ── Assets ────────────────────────────────────────────────────────────────
  assets: AssetsSchema.optional(),

  // ── Bindings ──────────────────────────────────────────────────────────────
  kv_namespaces: z.array(KVNamespaceSchema).optional(),
  r2_buckets: z.array(R2BucketSchema).optional(),
  d1_databases: z.array(D1DatabaseSchema).optional(),
  durable_objects: DurableObjectsSchema.optional(),
  migrations: z.array(MigrationSchema).optional(),
  queues: QueuesSchema.optional(),
  services: z.array(ServiceBindingSchema).optional(),
  analytics_engine_datasets: z.array(AnalyticsEngineDatasetSchema).optional(),
  ai: AIBindingSchema.optional(),
  vectorize: z.array(VectorizeSchema).optional(),
  hyperdrive: z.array(HyperdriveSchema).optional(),
  browser: BrowserBindingSchema.optional(),
  images: ImagesBindingSchema.optional(),
  send_email: z.array(SendEmailSchema).optional(),
  mtls_certificates: z.array(MTLSCertificateSchema).optional(),
  dispatch_namespaces: z.array(DispatchNamespaceSchema).optional(),
  logfwdr: LogfwdrSchema.optional(),
  unsafe: UnsafeSchema.optional(),
  rate_limiting: z.array(RateLimitingSchema).optional(),
  secrets_store_secrets: z.array(SecretsStoreSecretSchema).optional(),
  workflows: z.array(WorkflowBindingSchema).optional(),
  version_metadata: VersionMetadataSchema.optional(),
  worker_loaders: z.array(WorkerLoaderBindingSchema).optional(),
});

// ---------------------------------------------------------------------------
// Full Wrangler Config Schema
// ---------------------------------------------------------------------------

export const WranglerConfigSchema = InheritableConfigSchema.extend({
  // ── JSON Schema hint ──────────────────────────────────────────────────────
  $schema: z.string().optional(),

  // ── Pages-specific ────────────────────────────────────────────────────────
  pages_build_output_dir: z.string().optional(),

  // ── Build (top-level only) ────────────────────────────────────────────────
  build: BuildConfigSchema.optional(),

  // ── Dev (top-level only) ─────────────────────────────────────────────────
  dev: DevConfigSchema.optional(),

  // ── Named environments ────────────────────────────────────────────────────
  env: z.record(z.string(), InheritableConfigSchema).optional(),
});

// ---------------------------------------------------------------------------
// Exported types
// ---------------------------------------------------------------------------

export type WranglerConfig = z.infer<typeof WranglerConfigSchema>;
export type WranglerEnvConfig = z.infer<typeof InheritableConfigSchema>;
export type RouteObject = z.infer<typeof RouteObjectSchema>;
export type Route = z.infer<typeof RouteSchema>;
export type KVNamespace = z.infer<typeof KVNamespaceSchema>;
export type R2Bucket = z.infer<typeof R2BucketSchema>;
export type D1Database = z.infer<typeof D1DatabaseSchema>;
export type DurableObjectBinding = z.infer<typeof DurableObjectBindingSchema>;
export type Migration = z.infer<typeof MigrationSchema>;
export type QueueProducer = z.infer<typeof QueueProducerSchema>;
export type QueueConsumer = z.infer<typeof QueueConsumerSchema>;
export type ServiceBinding = z.infer<typeof ServiceBindingSchema>;

// ---------------------------------------------------------------------------
// Legacy / Service-Specific Types (for WorkerManagementService)
// ---------------------------------------------------------------------------

export const BindingSchema = z.object({
  name: z.string(),
  type: z.union([
    z.literal('kv_namespace'),
    z.literal('d1_database'),
    z.literal('r2_bucket'),
    z.literal('durable_object_namespace'),
    z.literal('service'),
    z.literal('ai'),
  ]),
  namespace_id: z.string().optional(),
  database_id: z.string().optional(),
  bucket_name: z.string().optional(),
  class_name: z.string().optional(),
  script_name: z.string().optional(),
  environment: z.string().optional(),
});

export const GitConfigSchema = z.object({
  provider: z.literal('github'),
  repoOwner: z.string(),
  repoName: z.string(),
  productionBranch: z.string().default('main'),
  buildCommand: z.string().optional(),
  deployCommand: z.string().default('npx wrangler deploy'),
});

export type Binding = z.infer<typeof BindingSchema>;
export type GitConfig = z.infer<typeof GitConfigSchema>;

/**
 * @deprecated - Generic binding schema for backward compatibility.
 * Use specific schemas (KVNamespaceSchema, D1DatabaseSchema, etc.) instead.
 */
export const WranglerBindingSchema = z.object({
  binding: BindingName,
}).passthrough();
