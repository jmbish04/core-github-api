# Rule: AI Provider & Structured Responses

## 1. Structured Output Mandate

- **CRYSTAL CLEAR RULE**: ANYTIME the AI model is being instructed to respond with a structured response (JSON), you **MUST** use `generateStructuredResponse` or `generateStructuredWithTools` exported from `@/ai/providers`.
- **FORBIDDEN**: Do not rely on native Agent SDK schemas (e.g. `outputType: MySchema as any` in `@openai/agents`). These frequently fail to map correctly through the Cloudflare AI Gateway or result in brittle string parsing.

## 2. The Extraction Pattern (Agents with Tools)

If you are running an autonomous Agent that requires tool usage (e.g., `HealthDiagnostician` or `ResearchAgent`):

1. Configure the Agent to output standard text/markdown (`outputType` must NOT be explicitly defined).
2. Await the Agent's `finalOutput` inside the execution loop.
3. Pass that string into `generateStructuredResponse` along with your Zod schema (converted via `zodToJsonSchema`) to strictly extract and type the final JSON object. This ensures Gateway compatibility while guaranteeing Zod-verified JSON.
