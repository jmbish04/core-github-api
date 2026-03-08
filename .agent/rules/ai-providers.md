# Protocol: AI Provider Routing & Resolution

**MANDATORY IMPORT PATH**: Agents must _always and exclusively_ import AI functions from `@/ai/providers`.
**FORBIDDEN IMPORTS**: It is _never_ acceptable to import directly from specific provider files (e.g., `ai/providers/openai`, `ai/providers/gemini`) or the index file explicitly (e.g., `ai/providers/index`).

**FUNCTION USAGE**: When using functions like `generateText`, `generateStructuredResponse`, etc., the agent should specify the `provider` and `model` arguments when known.

**FALLBACK BEHAVIOR**:

- If no provider or model is provided by the caller, the system relies on the `index.ts` routing to default to `worker-ai`, which then utilizes its internal business logic to select the correct fallback model.
- Similarly, if a provider is specified but no model is provided, the specific provider module's logic determines the default model.
- Agents should not hardcode default models unless explicitly required by the business logic.
