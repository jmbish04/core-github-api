/**
 * @file src/utils/base64.ts
 * @description Base64 encoding/decoding utilities compatible with Cloudflare Workers.
 */

/**
 * Encodes a string to base64 using the Web Crypto API.
 * Compatible with Cloudflare Workers (no Node Buffer).
 */
export function encodeBase64(input: string): string {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(input);
  let binary = '';
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary);
}

/**
 * Decodes a base64 string using the Web Crypto API.
 * Compatible with Cloudflare Workers (no Node Buffer).
 */
export function decodeBase64(input: string): string {
  const binary = atob(input);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const decoder = new TextDecoder();
  return decoder.decode(bytes);
}

/**
 * Encodes a string to URL-safe base64 (RFC 4648, section 5).
 */
export function encodeBase64Url(input: string): string {
  return encodeBase64(input).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Decodes a URL-safe base64 string (RFC 4648, section 5).
 */
export function decodeBase64Url(input: string): string {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/');
  const rem = padded.length % 4;
  const base64 = rem === 0 ? padded : padded + '='.repeat(4 - rem);
  return decodeBase64(base64);
}

/** @deprecated Use `encodeBase64` instead */
export const encode = encodeBase64;
/** @deprecated Use `decodeBase64` instead */
export const decode = decodeBase64;
/** @deprecated Use `encodeBase64Url` instead */
export const encodeUrl = encodeBase64Url;
/** @deprecated Use `decodeBase64Url` instead */
export const decodeUrl = decodeBase64Url;