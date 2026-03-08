/**
 * @file src/utils/rateLimit.ts
 * @description This file contains a Hono middleware for Cloudflare Workers Rate Limiting.
 * @owner AI-Builder
 */

import { MiddlewareHandler } from 'hono';

/**
 * Creates a rate limiting middleware using the native Cloudflare Workers Rate Limiting API.
 * Ensure you have configured the `ratelimits` binding in your wrangler.jsonc or wrangler.toml.
 *
 * @param {string} bindingName - The Env key for your rate limiting configuration (e.g. 'REST_API_LIMITER').
 * @param {(c: any) => string} [keyExtractor] - Optional function to extract a unique key per incoming request for limiting (e.g. userId). Defaults to 'cf-connecting-ip'.
 * @returns {MiddlewareHandler} The configured Hono middleware.
 */
export const rateLimit = (
  bindingName: string = 'RATE_LIMITER',
  keyExtractor?: (c: any) => string
): MiddlewareHandler => {
  return async (c, next) => {
    const limiter = (c.env as any)[bindingName];
    
    if (!limiter || typeof limiter.limit !== 'function') {
      console.warn(`[rateLimit] Rate limiter binding '${bindingName}' not configured on env. Bypassing rate limit.`);
      return next();
    }

    // Determine the unique key for the rate bucket. 
    // Best practice is to use stable identifiers like User ID or API keys.
    let key = "global";
    if (keyExtractor) {
        key = keyExtractor(c);
    } else {
        key = c.req.header("cf-connecting-ip") || "unknown-ip"; 
    }

    try {
      const { success } = await limiter.limit({ key });
      
      if (!success) {
        return c.json({ 
          error: "Too Many Requests", 
          message: "You have exceeded the allowed rate limit. Please try again later."
        }, 429);
      }
    } catch (err) {
      console.error(`[rateLimit] Failed to evaluate rate limit for key ${key}:`, err);
      // Fail open to avoid blocking legitimate traffic on misconfiguration
    }

    await next();
  };
};
