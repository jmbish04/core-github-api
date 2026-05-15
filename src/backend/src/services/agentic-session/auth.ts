/**
 * @file services/agentic-session/auth.ts
 * @description JWT token issue/verify for AgenticSession WebSocket auth.
 *   Uses HMAC-SHA256 with SESSION_TOKEN_SECRET. Tokens are short-lived (1h default).
 */

import { z } from 'zod';

// ── JWT Claims Schema ────────────────────────────────────────────────────

export const SessionTokenClaims = z.object({
  sub: z.string(), // Subject: userId or agentId
  sessionId: z.string().uuid(),
  permissions: z.array(z.enum(['read', 'write', 'admin'])),
  iat: z.number().int().positive(), // Issued at (Unix timestamp)
  exp: z.number().int().positive(), // Expiry (Unix timestamp)
});

export type SessionTokenClaims = z.infer<typeof SessionTokenClaims>;

// ── Token Generation ─────────────────────────────────────────────────────

/**
 * Issues a signed JWT for session access.
 * @param secret - SESSION_TOKEN_SECRET from env
 * @param claims - Token claims (sessionId, subject, permissions)
 * @param ttl - Time-to-live in seconds (default: 3600 = 1h)
 * @returns Signed JWT string
 */
export async function issueSessionToken(
  secret: string,
  claims: Omit<SessionTokenClaims, 'iat' | 'exp'>,
  ttl: number = 3600
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const fullClaims: SessionTokenClaims = {
    ...claims,
    iat: now,
    exp: now + ttl,
  };

  const header = { alg: 'HS256', typ: 'JWT' };
  const encodedHeader = base64urlEncode(JSON.stringify(header));
  const encodedPayload = base64urlEncode(JSON.stringify(fullClaims));

  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signature = await signHmacSha256(secret, signingInput);

  return `${signingInput}.${signature}`;
}

// ── Token Verification ───────────────────────────────────────────────────

/**
 * Verifies and decodes a session JWT.
 * @param secret - SESSION_TOKEN_SECRET from env
 * @param token - JWT string from client
 * @returns Parsed claims if valid
 * @throws Error if signature invalid, expired, or malformed
 */
export async function verifySessionToken(
  secret: string,
  token: string
): Promise<SessionTokenClaims> {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('Invalid token format');
  }

  const [encodedHeader, encodedPayload, providedSignature] = parts;
  const signingInput = `${encodedHeader}.${encodedPayload}`;

  // Verify signature
  const expectedSignature = await signHmacSha256(secret, signingInput);
  if (expectedSignature !== providedSignature) {
    throw new Error('Invalid signature');
  }

  // Decode payload
  const payloadJson = base64urlDecode(encodedPayload);
  const payload = JSON.parse(payloadJson);

  // Validate claims
  const claims = SessionTokenClaims.parse(payload);

  // Check expiry
  const now = Math.floor(Date.now() / 1000);
  if (claims.exp < now) {
    throw new Error('Token expired');
  }

  return claims;
}

// ── Crypto Helpers ───────────────────────────────────────────────────────

async function signHmacSha256(secret: string, data: string): Promise<string> {
  const encoder = new TextEncoder();
  const secretKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign(
    'HMAC',
    secretKey,
    encoder.encode(data)
  );

  return base64urlEncode(signature);
}

function base64urlEncode(input: string | ArrayBuffer): string {
  const bytes = typeof input === 'string'
    ? new TextEncoder().encode(input)
    : new Uint8Array(input);

  // Use btoa with proper binary string conversion
  // Note: btoa expects a binary string where each character is a byte value
  const binaryString = Array.from(bytes, byte => String.fromCharCode(byte)).join('');

  return btoa(binaryString)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

function base64urlDecode(input: string): string {
  // Pad with '=' to make length a multiple of 4
  const padded = input + '===='.slice(0, (4 - (input.length % 4)) % 4);
  const base64 = padded.replace(/-/g, '+').replace(/_/g, '/');

  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  return new TextDecoder().decode(bytes);
}
