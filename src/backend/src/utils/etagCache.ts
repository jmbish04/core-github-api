/**
 * @file src/utils/etagCache.ts
 * @description ETag-based caching middleware for Hono using Cloudflare KV.
 * @owner AI-Builder
 */

import { MiddlewareHandler } from 'hono';

/**
 * Creates a cache key from a request URL.
 */
const getCacheKey = (url: string): string => `etag:${url}`;

/**
 * A Hono middleware for ETag-based caching.
 *
 * Behaviour:
 * 1. **304 Not Modified** — Compares the `If-None-Match` header against the
 *    cached ETag in ETAG_KV. If they match, returns a 304 immediately.
 * 2. **Cache new ETags** — After the request is handled, stores any new `etag`
 *    header value in KV with an optional TTL. If no etag is present, deletes
 *    any stale cached entry to prevent incorrect 304 responses.
 *
 * @param options.ttl - Time-to-live in seconds for the cached ETag entry.
 *                      Omit to store indefinitely.
 */
export const etagCache = (options?: {
  ttl?: number;
}): MiddlewareHandler<{ Bindings: Env }> => {
  return async (c, next) => {
    const cacheKey = getCacheKey(c.req.url);
    const ifNoneMatch = c.req.header('if-none-match');

    // 1. Check if the ETag is in the cache
    if (ifNoneMatch) {
      const cachedEtag = await c.env.ETAG_KV.get(cacheKey);
      if (cachedEtag === ifNoneMatch) {
        // Client has the latest version — return 304 Not Modified
        return c.newResponse(null, 304);
      }
    }

    await next();

    // 2. If the response has an ETag, store it in KV
    const etag = c.res.headers.get('etag');
    if (etag) {
      const kvOptions =
        options?.ttl && options.ttl > 0 ? { expirationTtl: options.ttl } : {};
      await c.env.ETAG_KV.put(cacheKey, etag, kvOptions);
    } else {
      // If the response has no etag, clear any stale cached entry
      await c.env.ETAG_KV.delete(cacheKey);
    }
  };
};

/**
 * @extension_point
 * Extension point for additional caching strategies, e.g. using
 * `caches.default` with `Cache-Control` headers for full Response caching.
 */