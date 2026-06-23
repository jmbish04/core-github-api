/**
 * @file EngineerAgent/methods/sandbox/storage/types.ts
 * @description Types for the storage (R2 / bucket mount) category.
 */

export type BucketProvider = "r2" | "s3" | "gcs";

export interface BucketCredentials {
  accessKeyId: string;
  secretAccessKey: string;
}

export interface MountBucketOptions {
  /**
   * S3-compatible endpoint URL.
   * Required when localBucket is false or unset.
   * R2: 'https://YOUR_ACCOUNT_ID.r2.cloudflarestorage.com'
   * S3: 'https://s3.amazonaws.com'
   * GCS: 'https://storage.googleapis.com'
   */
  endpoint?: string;

  /**
   * Mount an R2 bucket using the Worker's R2 binding during local development with wrangler dev.
   * When true, the SDK syncs the R2 binding directly instead of using an S3 endpoint.
   * endpoint and credentials are not required when this is true.
   * provider and s3fsOptions are not used when this is true.
   * Default: false
   */
  localBucket?: boolean;

  /**
   * Storage provider hint. Enables provider-specific optimizations.
   * Values: 'r2', 's3', 'gcs'
   */
  provider?: BucketProvider;

  /**
   * API credentials. Contains accessKeyId and secretAccessKey.
   * If not provided, uses environment variables.
   */
  credentials?: BucketCredentials;

  /**
   * Mount in read-only mode.
   * Default: false
   */
  readOnly?: boolean;

  /**
   * Subdirectory within the bucket to mount.
   * When specified, only contents under this prefix are visible at the mount point.
   * Must start and end with / (e.g., /data/uploads/)
   * Default: Mount entire bucket
   */
  prefix?: string;

  /**
   * Advanced s3fs mount flags.
   * Example: { 'use_cache': '/tmp/cache' }
   */
  s3fsOptions?: Record<string, string>;
}