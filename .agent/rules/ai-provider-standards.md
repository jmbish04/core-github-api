# Rule: AI Provider Standards (Antigravity)

## 1. Zod Supremacy
- Every structured AI call (`generateStructuredResponse`, `generateStructuredWithTools`) MUST accept a `z.ZodType<T>` payload.
- Weak interfaces (`any` or `Record<string, unknown>`) are forbidden for output generation.
- Use `zod-to-json-schema` to natively pipe the schema into the payload's `response_format` for supported compat endpoints.
- Always call `schema.parse(rawParsed)` on the final JSON result to guarantee structural integrity.

## 2. Universal File Context
- Any method ending in `*FromFiles` must handle payloads consisting of `FileInput` objects (`{ name, type, data, isBase64 }`).
- Providers with native file processing (e.g., Gemini's `inlineData`) should construct standard multi-part arrays.
- Providers without native large-file limits (e.g., Worker AI) MUST use the transparent Vectorize RAG chunking algorithm if the total string length exceeds 6,000 characters to prevent hitting input limits.

## 3. Jules SDK Integration
- Since Jules operates via long-running chat streams, large structured responses should be handled by getting broad context from Jules, and piping its output into `worker-ai` `generateStructuredResponse` to enforce strict formatting.
- Explicit reasoning and agent orchestration features (`analyzeRepo`, `completeTask`, `createPlan`) should exclusively utilize Jules.

## 4. No Vercel AI SDK
- Under no circumstances will you import `ai` or `@ai-sdk/`. It has been banned due to edge runtime parsing inconsistencies on Workers. 
- Use the native `fetch` API against the Cloudflare AI Gateway instead.
