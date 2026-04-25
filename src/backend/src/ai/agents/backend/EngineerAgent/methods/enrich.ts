import type { EngineerAgent } from "../index";
import type { Subtask } from "../types";

/**
 * Build enriched coding-agent instructions for a Jules session.
 * Injects project standards, Guardrail rules, and repo context.
 */
export async function buildEnrichedPrompt(
  agent: EngineerAgent,
  subtask: Subtask,
  repoContext?: string,
): Promise<string> {
  const standardsContext = `
## Project Standards (Enforced by GuardrailAgent)
- Use pnpm, never npx
- Env is a global type — never import from worker-configuration
- Use path aliases (@/, @db/) — never deep relative imports (>2 levels)
- Database access in backend/ only — never drizzle in frontend/
- Agent classes use new_sqlite_classes in wrangler migrations
- Use @callable() RPC — never raw DO .fetch()
- Route AI calls through AI Gateway
`;

  const prompt = `You are a Software Engineering Agent working on a specific subtask.

## Subtask
**Title:** ${subtask.title}
**Description:** ${subtask.description}
**Role:** ${subtask.role}
${subtask.files?.length ? `**Files to modify:** ${subtask.files.join(", ")}` : ""}

${standardsContext}

${repoContext ? `## Repository Context\n${repoContext}` : ""}

## Instructions
1. Implement the changes described in the subtask
2. Follow all project standards above
3. Write complete, production-ready code (no placeholder comments)
4. Include error handling and proper TypeScript types
5. After completing your changes, run any available linting/type-checking commands
`;

  return prompt;
}

/**
 * Query the GuardrailAgent to validate code before committing.
 */
export async function requestGuardrailCheck(
  agent: EngineerAgent,
  requestId: string,
  files: Array<{ path: string; content: string; language?: string }>,
): Promise<any> {
  try {
    const a = agent as any;
    const guardrail = await (await import("agents")).getAgentByName<Env>(
      a.env.GUARDRAIL_AGENT,
      "guardrail",
    );
    return await (guardrail as any).evaluatePayload({
      requestId,
      source: "EngineerAgent",
      files,
    });
  } catch (err) {
    console.error("[EngineerAgent:enrich] Guardrail check failed:", err);
    return { status: "warn", score: 50, issues: [], corrections: [] };
  }
}
