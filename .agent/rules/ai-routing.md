# AI Routing & Fallback Rules

- **Silent Failures:** Never allow a third-party AI provider failure to crash the request if a `worker-ai` equivalent model can handle the prompt.
- **Type Safety:** Do not alter the return types (`string`, `T`) of the core generation functions to include metadata. Always use the `onFallback` callback mechanism in `AIOptions` to bubble up execution state.
- **Observability:** Every fallback event must be aggressively logged to D1 to track provider reliability and API Gateway latency over time.
