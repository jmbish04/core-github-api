// SANCTIONED NON-AGENT queryMCP CALL SITE
// This runs in scheduled-worker context (no DO instance), so the
// agent-specialist-delegation rule does not apply. Do NOT copy this
// pattern into any code path that has access to an agent instance —
// use getPeerAgent(...) → CloudflareAgent.agenticSearch(...) instead.
// See: .agent/rules/agent-specialist-delegation.md
import { queryMCP } from "@/ai/mcp/mcp-client";
import { PlanningBreakdown, PlanningCaptureState } from "./types";

export function excerpt(value: unknown, maxLength = 420): string {
  const text =
    typeof value === "string"
      ? value
      : value == null
        ? ""
        : JSON.stringify(value);

  return text.length <= maxLength ? text : `${text.slice(0, maxLength)}...`;
}

export function toArray<T>(value: Iterable<T> | ArrayLike<T> | undefined | null): T[] {
  return value ? Array.from(value) : [];
}

export function recordSeen(state: PlanningCaptureState, activityId: string): boolean {
  if (state.seenActivityIds.includes(activityId)) {
    return false;
  }

  state.seenActivityIds.push(activityId);
  return true;
}

export async function enrichDocsQueries(
  env: Env,
  breakdown: PlanningBreakdown,
): Promise<Map<string, string>> {
  const querySet = new Set<string>();

  for (const epic of breakdown.epics) {
    epic.docsQueries.forEach((query) => querySet.add(query));
    for (const story of epic.stories) {
      story.docsQueries.forEach((query) => querySet.add(query));
      for (const task of story.tasks) {
        task.docsQueries.forEach((query) => querySet.add(query));
      }
    }
  }

  const queries = Array.from(querySet).slice(0, 8);
  const results = await Promise.all(
    queries.map(async (query) => {
      const docs = await queryMCP(env, query, "PlanningBabysitter");
      return [query, excerpt(docs)] as const;
    }),
  );

  return new Map(results);
}

export function normalizeBreakdown(markdown: string, raw: PlanningBreakdown): PlanningBreakdown {
  if (raw.epics.length > 0) {
    return raw;
  }

  return {
    title: raw.title || "Generated plan",
    summary: raw.summary || excerpt(markdown, 600),
    epics: [
      {
        title: raw.title || "Execution plan",
        description: raw.summary || excerpt(markdown, 800),
        docsQueries: [],
        stories: [
          {
            title: "Review generated plan",
            description: "Translate the raw markdown plan into implementation-ready tasks.",
            docsQueries: [],
            tasks: [
              {
                title: "Review and apply the generated plan",
                description: excerpt(markdown, 900),
                requirements: [],
                successCriteria: ["Plan has been reviewed and translated into executable work."],
                docsQueries: [],
              },
            ],
          },
        ],
      },
    ],
  };
}
