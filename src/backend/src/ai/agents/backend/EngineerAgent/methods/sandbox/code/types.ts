/**
 * @file EngineerAgent/methods/sandbox/code/types.ts
 * @description Type definitions for the code interpreter category.
 */

export interface CodeResult {
  success: boolean;
  stdout?: string;
  stderr?: string;
  traceback?: string;
  error?: string;
  message?: string;
}
