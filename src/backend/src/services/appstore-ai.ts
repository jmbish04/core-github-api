import { z } from 'zod';
import { AIProvider } from '@/ai/providers';

export const AgentResponseSchema = z.object({
  summary: z.string().describe("A concise 1-2 sentence summary of what this application does."),
  assigned_tag_names: z.array(z.string()).describe("List of existing tag names assigned to this application."),
  new_tags_to_create: z.array(
    z.object({
      name: z.string().describe("Name of the new tag. Examples: 'Frontend', 'Backend', 'API', 'Shadcn', 'E-commerce'"),
      description: z.string().describe("Short description of what the tag represents"),
      hex_color: z.string().describe("A suitable hex color code for this tag (e.g., #3b82f6)"),
    })
  ).describe("Any new tags that should be created because no existing tag aptly categorizes the app.")
});

export async function analyzeApplication(
  env: Env,
  appName: string,
  appType: string,
  description: string | null,
  existingTags: { name: string; description: string | null }[]
): Promise<z.infer<typeof AgentResponseSchema>> {
  const prompt = `
You are an expert Cloudflare application analyzer.

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

Respond strictly matching the required JSON schema.
`;

  const ai = new AIProvider(env);
  const result = await ai.generateStructuredResponse<z.infer<typeof AgentResponseSchema>>(
    prompt,
    AgentResponseSchema,
    undefined,
    { model: "gemini-2.5-flash" }
  );

  return result;
}
