---
description: Implement Universal AI Gateway REST Proxy
---
# Implement Universal AI Gateway REST Proxy

This workflow outlines the standard operating procedure for upgrading the AI Provider abstraction layer to support unified routing through Cloudflare's AI Gateway.

## Pre-Requisites
1. Ensure the project's `wrangler.jsonc` contains the appropriate `AI_GATEWAY_NAME` and `FILE_EMBEDDINGS` Vectorize binding.
2. Confirm `@google/jules-sdk`, `zod`, and `zod-to-json-schema` are installed in the `backend/` workspace.

## Steps
1. Route all provider calls (Worker AI, Gemini) through the Cloudflare AI Gateway compat or standard endpoint using native `fetch`. Do not use provider-specific SDKs.
2. Enforce Zod schemas strictly. Convert `z.ZodType<T>` to JSON schema using `zodToJsonSchema` and utilize the provider's `response_format` JSON schema mode.
3. For large file contexts (> 6000 chars), transparently chunk and vectorize the text using `@cf/baai/bge-large-en-v1.5` and Vectorize RAG. Query the prompt embedding against the index, and append the top matches to the final prompt.
4. Integrate the `@google/jules-sdk` and polyfill missing features like structured output by piping the text response into a smaller, strict formatting model like `worker-ai`.
5. Run `pnpm run check` to ensure strict TypeScript compilation completes successfully.
