/**
 * @file EngineerAgent/methods/sandbox/files/types.ts
 * @description Type definitions for the files category.
 */

export interface WatchFilesOptions {
  /** Directory to watch inside the sandbox. */
  directory?: string;
  /** Specific filename pattern to check for (e.g. "output.json"). */
  pattern?: string;
  /** Poll interval in milliseconds. Defaults to 1000. */
  intervalMs?: number;
  /** Maximum number of polls before giving up. Defaults to 30. */
  maxAttempts?: number;
}
