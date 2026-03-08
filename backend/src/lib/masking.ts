/**
 * @file src/lib/masking.ts
 * @description Utility functions for masking sensitive configuration values.
 * @owner AI-Builder
 */

/**
 * Suffixes that indicate a configuration value is sensitive.
 */
const SENSITIVE_SUFFIXES = ['_KEY', '_TOKEN', '_SECRET', 'PASSWORD'];

/**
 * Determines if a configuration key holds sensitive data.
 */
export function isSensitiveKey(key: string): boolean {
  const upperKey = key.toUpperCase();
  return SENSITIVE_SUFFIXES.some(suffix => upperKey.endsWith(suffix));
}

/**
 * Masks a string value, keeping only the first 3 and last 4 characters visible.
 * e.g., "sk-1234567890abcdef" -> "sk-***cdef"
 */
export function maskValue(value: any): string {
  const strValue = String(value);
  
  // Handle very short secrets by masking entirely to avoid leaking structure
  if (strValue.length <= 8) {
    return '*'.repeat(strValue.length || 4); // Default to **** if empty/null
  }

  const start = strValue.slice(0, 3);
  const end = strValue.slice(-4);
  // Use fixed length masking to prevent leaking length information
  return `${start}********${end}`;
}

/**
 * Prepares a configuration value for audit logging.
 * If the key is sensitive, the value is masked. Otherwise, it's stringified.
 */
export function sanitizeForAudit(key: string, value: any): string {
  if (value === undefined || value === null) {
    return "N/A";
  }
  
  if (isSensitiveKey(key)) {
    return maskValue(value);
  }
  
  // Convert booleans/numbers to strings for D1 text storage
  return String(value);
}
