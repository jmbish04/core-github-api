import { tool } from "@/ai/agents/honi";
import { GOLDEN_PATH_OUTPUT_DISCIPLINE } from "@/services/golden-path-config";
import { z } from "zod";

import { listGoldenPathConfigs } from "@/services/golden-path-config";

/**
 * Dynamic standards tool backed by D1 golden path configuration.
 * Agents use this to pull current coding rules by scope, infrastructure, or tag.
 */
export const makeQueryStandardsTool = (env: Env) => tool({
  name: "query_standards",
  description:
    "Query the active golden path standards stored in D1. Use this before generating code so your output follows the current repository rules and always returns full code without elisions.",
  input: z.object({
    filterByTag: z.string().optional().describe("Optional active tag name filter."),
    filterByScope: z.string().optional().describe("Optional scope title filter, such as frontend, backend, ai, infra, or docs."),
    filterByInfrastructure: z.string().optional().describe("Optional infrastructure filter, such as worker-assets, workers, or coding-agent."),
    search: z.string().optional().describe("Optional free-text search across titles, descriptions, rules, and tags."),
  }),
  handler: async (args: {
    filterByTag?: string;
    filterByScope?: string;
    filterByInfrastructure?: string;
    search?: string;
  }) => {
    const results = await listGoldenPathConfigs(env, {
      tagName: args.filterByTag,
      scopeTitle: args.filterByScope,
      infrastructure: args.filterByInfrastructure,
      search: args.search,
    });

    if (results.length === 0) {
      return `No active golden path standards matched the requested filters.\n\n${GOLDEN_PATH_OUTPUT_DISCIPLINE}`;
    }

    const rendered = results
      .map((item) => {
        const tags = item.scope.tags.length
          ? item.scope.tags.map((tag) => tag.name).join(", ")
          : "none";

        return [
          `Title: ${item.title}`,
          `Description: ${item.description}`,
          `Scope: ${item.scope.title}`,
          `Infrastructure: ${item.scope.infrastructure}`,
          `Scope Description: ${item.scope.description}`,
          `Tags: ${tags}`,
          `Rule:\n${item.rule}`,
        ].join("\n");
      })
      .join("\n\n---\n\n");

    return `${rendered}\n\n---\n\n${GOLDEN_PATH_OUTPUT_DISCIPLINE}`;
  },
});
