import { tool } from "honidev";
import { z } from "zod";
import { getDb } from "@db";
import { standardizationItems, standardizationTagMappings, standardizationTagDefinitions } from "@db/schemas/app/standardization";
import { eq } from "drizzle-orm";

/**
 * An intelligent SDK tool (Honi/CF Agents) that allows agents to autonomously
 * query explicit standardizations rules required for operations within this repository.
 */
export const makeQueryStandardsTool = (env: Env) => tool({
  name: "query_standards",
  description: "Query the active repository standardization rules and design guidelines. Use this before generating code to ensure you follow all standard practices required by this codebase.",
  // @ts-expect-error - mismatch with zod version
  input: z.object({
    filterByTag: z.string().optional().describe("Optional tag name to filter standards by (e.g. 'Frontend', 'Drizzle', 'Hono')")
  }),
  handler: async (args: { filterByTag?: string }) => {
    const db = getDb(env.DB);
    const items = await db.select().from(standardizationItems).where(eq(standardizationItems.isActive, true)).all();
    const mappings = await db.select().from(standardizationTagMappings).all();
    const tags = await db.select().from(standardizationTagDefinitions).all();

    let results = items.map(item => {
      const itemMappings = mappings.filter(m => m.standardizationItemId === item.id);
      const itemTags = itemMappings.map(m => tags.find(t => t.id === m.tagId)?.name).filter(Boolean);
      return { ...item, tags: itemTags };
    });

    if (args.filterByTag) {
        const lowerFilter = args.filterByTag.toLowerCase();
        results = results.filter(r => r.tags.some(t => t?.toLowerCase().includes(lowerFilter)));
    }

    if (results.length === 0) {
        return "No explicit standardization rules found" + (args.filterByTag ? ` for tag: ${args.filterByTag}` : ".");
    }

    return results.map(r => `Rule: ${r.title}\nTags: [${r.tags.join(', ')}]\nDetail:\n${r.rule}`).join('\n\n---\n\n');
  }
});
