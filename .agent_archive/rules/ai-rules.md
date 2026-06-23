# Rule: AI Provider, Routing & Structured Responses

## 1. Core Directives

1.  **SDK**: `import { GoogleGenAI } from "@google/genai";`
2.  **Instantiation**: `const ai = new GoogleGenAI({ apiKey: ... });`
3.  **Models**:
    - **General**: `gemini-2.5-flash` (or `gemini-2.0-flash-exp` if requested)
    - **Reasoning**: `gemini-2.0-flash-thinking-exp-1219` (if available) or `gemini-2.5-pro`
    - **Images**: `gemini-2.5-flash-image`
4.  **Configuration**: Pass `responseMimeType: "application/json"` and `responseSchema` for structured output.

## 2. Code Patterns

### ✅ Correct (New SDK)

```typescript
import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });

const result = await ai.models.generateContent({
  model: "gemini-2.5-flash",
  contents: [{ role: "user", parts: [{ text: "Hello" }] }],
  config: {
    responseMimeType: "application/json",
    // responseSchema: ... (Zod schema converted to JSON)
  },
});

console.log(result.text); // Getter, returns string
```

### ❌ Incorrect (Legacy/Deprecated)

- `require('@google/generative-ai')`
- `genai.getGenerativeModel(...)`
- `model.generateContent(...)` (Called on model instance instead of `ai.models`)
- `generationConfig` (Use `config` property instead)
- `result.response.text()` (Method call)

## 3. Structured Output Mandate

- **CRYSTAL CLEAR RULE**: ANYTIME the AI model is being instructed to respond with a structured response (JSON), you **MUST** use `generateStructuredResponse` or `generateStructuredWithTools` exported from `@/ai/providers`.
- **FORBIDDEN**: Do not rely on native Agent SDK schemas (e.g. `outputType: MySchema as any` in `@openai/agents`). These frequently fail to map correctly through the Cloudflare AI Gateway or result in brittle string parsing.

## 4. The Extraction Pattern (Agents with Tools)

If you are running an autonomous Agent that requires tool usage (e.g., `HealthDiagnostician` or `ResearchAgent`):

1. Configure the Agent to output standard text/markdown (`outputType` must NOT be explicitly defined).
2. Await the Agent's `finalOutput` inside the execution loop.
3. Pass that string into `generateStructuredResponse` along with your Zod schema (converted via `zodToJsonSchema`) to strictly extract and type the final JSON object. This ensures Gateway compatibility while guaranteeing Zod-verified JSON.

## 5. AI Provider Routing & Resolution

- **MANDATORY IMPORT PATH**: Agents must _always and exclusively_ import AI functions from `@/ai/providers`.
- **FORBIDDEN IMPORTS**: It is _never_ acceptable to import directly from specific provider files (e.g., `ai/providers/openai`, `ai/providers/gemini`) or the index file explicitly (e.g., `ai/providers/index`).
- **FUNCTION USAGE**: When using functions like `generateText`, `generateStructuredResponse`, etc., the agent should specify the `provider` and `model` arguments when known.
- **FALLBACK BEHAVIOR**:
  - If no provider or model is provided by the caller, the system relies on the `index.ts` routing to default to `workers-ai`.
  - Similarly, if a provider is specified but no model is provided, the specific provider module's logic determines the default model.
  - Agents should not hardcode default models unless explicitly required by the business logic.
- **Silent Failures:** Never allow a third-party AI provider failure to crash the request if a `worker-ai` equivalent model can handle the prompt.
- **Type Safety:** Do not alter the return types (`string`, `T`) of the core generation functions to include metadata. Always use the `onFallback` callback mechanism in `AIOptions` to bubble up execution state.
- **Observability:** Every fallback event must be aggressively logged to D1 to track provider reliability and API Gateway latency over time.
