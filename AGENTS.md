# Gemini Agent Development Guidelines

> **Golden Rule**: ALWAYS use the `@google/genai` SDK. NEVER use `@google/generative-ai`.

## Core Directives

1.  **SDK**: `import { GoogleGenAI } from "@google/genai";`
2.  **Instantiation**: `const ai = new GoogleGenAI({ apiKey: ... });`
3.  **Models**:
    -   **General**: `gemini-2.5-flash` (or `gemini-2.0-flash-exp` if requested)
    -   **Reasoning**: `gemini-2.0-flash-thinking-exp-1219` (if available) or `gemini-2.5-pro`
    -   **Images**: `gemini-2.5-flash-image`
4.  **Configuration**: Pass `responseMimeType: "application/json"` and `responseSchema` for structured output.

## Code Patterns

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
  }
});

console.log(result.text); // Getter, returns string
```

### ❌ Incorrect (Legacy/Deprecated)

-   `require('@google/generative-ai')`
-   `genai.getGenerativeModel(...)`
-   `model.generateContent(...)` (Called on model instance instead of `ai.models`)
-   `generationConfig` (Use `config` property instead)
-   `result.response.text()` (Method call)

## Structured Outputs

Always use `zod` and `zod-to-json-schema` to define your `responseSchema`.

```typescript
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

const MySchema = z.object({ ... });

// ... inside generateContent config:
responseSchema: zodToJsonSchema(MySchema) as any
```

## Tools (MCP)

When integrating tools:
1.  Use `src/lib/mcp.ts` to connect to Cloudflare Docs or other MCP servers.

## Exit Criteria & Verification

Before reporting a task or turn as complete, you **MUST**:

1.  **Clear Linting Errors**: Ensure `bun run check` (or checking the IDE output) reveals no linting or compilation errors.
2.  **Verify Deployment**: Run `bun run dry-run` to validate the worker configuration and build process.
    -   This executes `wrangler deploy --dry-run` to catch binding issues, bundle size limits, or config errors.
    -   **Fix any errors** reported by this command before finishing.
