import type { EngineerAgent } from "../index";
import type { Verdict } from "../../GuardrailAgent/types";
import { requestGuardrailCheck } from "./enrich";

/**
 * Bridge to GuardrailAgent — validates code files before committing.
 * Returns the Verdict and automatically posts results to the appropriate
 * ChatRoom for visibility.
 */
export async function runGuardrailCheck(
  agent: EngineerAgent,
  requestId: string,
  files: Array<{ path: string; content: string; language?: string }>,
): Promise<Verdict> {
  const verdict = await requestGuardrailCheck(agent, requestId, files);

  // If verdict is a failure, log it prominently
  if (verdict.status === "fail") {
    console.warn(
      `[EngineerAgent:guardrail] Verdict FAIL for ${requestId}: ` +
      `${verdict.issues.length} issues, score ${verdict.score}`,
    );
  }

  return verdict;
}
