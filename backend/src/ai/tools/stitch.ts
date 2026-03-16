import { tool } from "@/ai/agents/honi";
import { z } from "zod";
import { Stitch, StitchToolClient } from "@google/stitch-sdk";

async function getStitchClient(env: Env): Promise<Stitch> {
  let apiKey = '';
  const rawKey = env.STITCH_API_KEY;
  if (typeof rawKey === 'string') {
    apiKey = rawKey;
  } else if (rawKey && typeof (rawKey as any).get === 'function') {
    apiKey = await (rawKey as any).get();
  }
  
  if (!apiKey) {
    throw new Error("STITCH_API_KEY is not configured.");
  }
  
  return new Stitch(new StitchToolClient({ apiKey }));
}

export const makeStitchCreateProjectTool = (env: Env) => tool({
  name: "stitch_create_project",
  description: "Creates a new Stitch project container for UI designs.",
  input: z.object({
    title: z.string().optional().describe('Optional title for the project'),
  }),
  handler: async (args) => {
    const client = await getStitchClient(env);
    const result = await client.createProject(args.title);
    return `Project created. ID: ${result.id} (Title: ${result.data?.title})`;
  }
});

export const makeStitchGenerateScreensTool = (env: Env) => tool({
  name: "stitch_generate_screens",
  description: "Generates new UI screens within a project from a text prompt.",
  input: z.object({
    projectId: z.string().describe('The Stitch Project ID (e.g. 4044680601076201931)'),
    prompt: z.string().describe('Input text or description of the screen to generate'),
  }),
  handler: async (args) => {
    const client = await getStitchClient(env);
    const project = client.project(args.projectId);
    const screen = await project.generate(args.prompt);
    
    const html = await screen.getHtml();
    return `Screen generated successfully. HTML Snippet:\n\n${html.substring(0, 500)}...\n\n(Full HTML has been generated.)`;
  }
});

export const makeStitchListProjectsTool = (env: Env) => tool({
  name: "stitch_list_projects",
  description: "Lists all Stitch projects accessible to the user.",
  input: z.object({
    filter: z.string().optional().describe('Filter (e.g. view=owned)'),
  }),
  handler: async (_args) => {
    const client = await getStitchClient(env);
    const result = await client.projects();
    return JSON.stringify(result.map(p => ({ id: p.id, title: p.data?.title })), null, 2);
  }
});
