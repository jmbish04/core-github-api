import type { GuardrailAgent } from "../index";
import type { EvaluationPayload, VerdictIssue, CorrectionPrompt } from "../types";

interface StandardsResult {
  issues: VerdictIssue[];
  corrections: CorrectionPrompt[];
}

/**
 * Standards checking — verifies code payloads against the project's
 * established conventions from .agent/rules/ and AGENTS.md.
 */
export async function checkStandards(
  _agent: GuardrailAgent,
  payload: EvaluationPayload,
): Promise<StandardsResult> {
  const issues: VerdictIssue[] = [];
  const corrections: CorrectionPrompt[] = [];

  for (const file of payload.files) {
    // Rule: globals.md — No Env imports (Env is global)
    if (/import\s+(?:type\s+)?{[^}]*Env[^}]*}\s+from\s+["'](?:\.\.\/)*worker-configuration/.test(file.content)) {
      issues.push({
        severity: "error",
        rule: "standards:no-env-import",
        file: file.path,
        message: "Do not import Env from worker-configuration. Env is a global type via wrangler types.",
      });
    }

    // Rule: paths.md — No deep relative imports (>2 levels)
    const deepRelativePattern = /from\s+["'](?:\.\.\/){3,}/g;
    if (deepRelativePattern.test(file.content)) {
      issues.push({
        severity: "warning",
        rule: "standards:no-deep-relative",
        file: file.path,
        message: "Deep relative imports detected (>2 levels). Use path aliases (@/, @db/, etc.).",
      });
    }

    // Rule: workspace-awareness.md — No npx usage
    if (file.content.includes("npx ") && !file.content.includes("pnpm dlx")) {
      issues.push({
        severity: "warning",
        rule: "standards:no-npx",
        file: file.path,
        message: "Use 'pnpm dlx' instead of 'npx' per workspace standards.",
      });
    }

    // Rule: full-code-output.md — Detect placeholder comments
    const placeholderPatterns = [
      /\/\/\s*\.\.\.\s*rest\s+of/i,
      /\/\/\s*leaving\s+as\s+is/i,
      /\/\/\s*existing\s+code\s+omitted/i,
      /\/\*\s*unchanged\s*\*\//i,
    ];
    for (const pattern of placeholderPatterns) {
      if (pattern.test(file.content)) {
        issues.push({
          severity: "error",
          rule: "standards:no-placeholder-comments",
          file: file.path,
          message: "Placeholder/elision comment detected. Always provide full code output.",
        });
        break;
      }
    }

    // Rule: architecture.md — No drizzle imports in frontend
    if (file.path.includes("frontend/") && /from\s+["']drizzle/.test(file.content)) {
      issues.push({
        severity: "critical",
        rule: "standards:no-db-in-frontend",
        file: file.path,
        message: "Database imports detected in frontend code. Database access must stay in backend/.",
      });
    }
  }

  return { issues, corrections };
}
