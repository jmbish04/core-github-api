/**
 * @module appstore-worker-ai
 * @description Worker AI-only application analyzer for the App Store.
 * Uses the `env.AI` binding (Cloudflare Workers AI) exclusively,
 * avoiding external API keys and staying within the free tier.
 */
import { z } from 'zod';
import { cleanJsonOutput } from '@/ai/utils/sanitizer';

export const AppSummarySchema = z.object({
  summary: z.string().describe("A concise 1-2 sentence summary of what this application does."),
  assigned_tag_names: z.array(z.string()).describe("List of existing tag names assigned to this application."),
  new_tags_to_create: z.array(
    z.object({
      name: z.string().describe("Name of the new tag. Examples: 'Frontend', 'Backend', 'API', 'AI', 'E-commerce'"),
      description: z.string().describe("Short description of what the tag represents"),
      hex_color: z.string().describe("A suitable hex color code for this tag (e.g., #3b82f6)"),
    })
  ).describe("Any new tags that should be created because no existing tag aptly categorizes the app.")
});

export type AppSummaryResult = z.infer<typeof AppSummarySchema>;

const WORKER_AI_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

/**
 * Analyze an application using Worker AI only.
 * No external API keys required — uses the `env.AI` binding.
 */
export async function analyzeApplicationWithWorkerAI(
  env: Env,
  appName: string,
  appType: string,
  description: string | null,
  existingTags: { name: string; description: string | null }[]
): Promise<AppSummaryResult> {

  const prompt = `You are an expert Cloudflare application analyzer.

Analyze the following application:
- Name: ${appName}
- Type: ${appType}
- Description: ${description || 'No description provided.'}

Existing tags in the system (you can assign these):
${existingTags.length > 0 ? existingTags.map(t => `- ${t.name}: ${t.description}`).join('\n') : 'No existing tags.'}

Your tasks:
1. Provide a concise 1-2 sentence summary.
2. Assign relevant tags from the "Existing tags" list. Provide the exact tag names.
3. If the application requires a category not present in the existing tags (e.g., "Frontend", "Shadcn", "API", "AI", "GitHub API"), create new tags. Provide a description and a suitable hex color for each new tag.

Respond ONLY with valid JSON matching this structure:
{
  "summary": "string",
  "assigned_tag_names": ["string"],
  "new_tags_to_create": [{ "name": "string", "description": "string", "hex_color": "#hex" }]
}`;

  const response = await env.AI.run(WORKER_AI_MODEL as any, {
    messages: [
      { role: "system", content: "You are a JSON-only assistant. Always respond with valid JSON and nothing else." },
      { role: "user", content: prompt }
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "app_summary",
        schema: {
          type: "object",
          properties: {
            summary: { type: "string" },
            assigned_tag_names: { type: "array", items: { type: "string" } },
            new_tags_to_create: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  description: { type: "string" },
                  hex_color: { type: "string" }
                },
                required: ["name", "description", "hex_color"]
              }
            }
          },
          required: ["summary", "assigned_tag_names", "new_tags_to_create"]
        },
        strict: true
      }
    }
  });

  if (typeof response === "object" && response !== null && "response" in response) {
    const rawJson = (response as any).response;
    const parsed = typeof rawJson === "object"
      ? rawJson
      : JSON.parse(cleanJsonOutput(String(rawJson)));
    return AppSummarySchema.parse(parsed);
  }

  throw new Error("Unexpected response format from Workers AI");
}
