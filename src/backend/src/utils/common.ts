import { validate as uuidValidate, version as uuidVersion, v4 as uuidv4 } from 'uuid';

/**
 * Generates a new v4 UUID.
 */
export function generateUuid(): string {
  return uuidv4();
}

/**
 * Checks if a string is a valid UUID (v4 variant, effectively).
 * Case-insensitive.
 */
export function isUuid(value: string): boolean {
  if (!value) return false;
  return uuidValidate(value) && uuidVersion(value) === 4;
}
