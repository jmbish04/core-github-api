/**
 * StitchDesignAgent — Honi agent with Stitch SDK tools.
 *
 * Gives the AI the ability to create and manage Stitch UI design projects,
 * generate screens from text prompts, and retrieve generated HTML/screenshots.
 */
import { createAgent, tool } from '@/ai/agents/honi';
import { z } from 'zod';
import { StitchToolClient } from '@google/stitch-sdk';
import { buildSkillContext } from '@services/octokit/skill-fetcher';

// ---------------------------------------------------------------------------
// Stitch tool definitions
// ---------------------------------------------------------------------------

const createStitchProject = tool(
  'create_stitch_project',
  'Create a new Stitch UI design project. Use when starting a new design.',
  { title: z.string().describe('Project title') },
  async ({ title }: { title: string }, ctx?: { env: Env }) => {
    const apiKey = ctx?.env?.STITCH_API_KEY as string | undefined;
    const client = new StitchToolClient(apiKey ? { apiKey } : undefined);
    try {
      return await client.callTool<{ projectId: string; title: string }>('create_project', { title });
    } finally {
      await client.close();
    }
  },
);

const generateStitchScreen = tool(
  'generate_stitch_screen',
  'Generate a UI screen from a text prompt within an existing Stitch project.',
  {
    projectId: z.string().describe('The Stitch project ID'),
    prompt: z.string().describe('Detailed UI description prompt'),
    deviceType: z
      .enum(['DESKTOP', 'MOBILE', 'TABLET', 'AGNOSTIC'])
      .optional()
      .default('DESKTOP')
      .describe('Target device type'),
  },
  async (
    { projectId, prompt, deviceType }: { projectId: string; prompt: string; deviceType?: string },
    ctx?: { env: Env },
  ) => {
    const apiKey = ctx?.env?.STITCH_API_KEY as string | undefined;
    const client = new StitchToolClient(apiKey ? { apiKey } : undefined);
    try {
      return await client.callTool<{ screenId: string; screenshotUrl?: string; html?: string }>(
        'generate_screen_from_text',
        { projectId, prompt, deviceType },
      );
    } finally {
      await client.close();
    }
  },
);

const getStitchScreen = tool(
  'get_stitch_screen',
  'Retrieve a generated Stitch screen by ID to get the HTML and screenshot.',
  {
    projectId: z.string().describe('The Stitch project ID'),
    screenId: z.string().describe('The Stitch screen ID'),
  },
  async ({ projectId, screenId }: { projectId: string; screenId: string }, ctx?: { env: Env }) => {
    const apiKey = ctx?.env?.STITCH_API_KEY as string | undefined;
    const client = new StitchToolClient(apiKey ? { apiKey } : undefined);
    try {
      return await client.callTool<{
        screenId: string;
        screenshotUrl?: string;
        html?: string;
        status?: string;
      }>('get_screen', { projectId, screenId });
    } finally {
      await client.close();
    }
  },
);

const listStitchProjects = tool(
  'list_stitch_projects',
  'List all Stitch design projects.',
  {},
  async (_params: Record<string, never>, ctx?: { env: Env }) => {
    const apiKey = ctx?.env?.STITCH_API_KEY as string | undefined;
    const client = new StitchToolClient(apiKey ? { apiKey } : undefined);
    try {
      return await client.callTool<{ projects: Array<{ projectId: string; title: string }> }>(
        'list_projects',
        {},
      );
    } finally {
      await client.close();
    }
  },
);

const generateStitchVariants = tool(
  'generate_stitch_variants',
  'Generate multiple design variants for an existing screen with different visual styles.',
  {
    projectId: z.string().describe('The Stitch project ID'),
    screenId: z.string().describe('The screen ID to generate variants for'),
    prompt: z.string().describe('Prompt describing the style variant'),
    count: z.number().min(1).max(4).default(2).describe('Number of variants to generate'),
  },
  async (
    { projectId, screenId, prompt, count }: { projectId: string; screenId: string; prompt: string; count: number },
    ctx?: { env: Env },
  ) => {
    const apiKey = ctx?.env?.STITCH_API_KEY as string | undefined;
    const client = new StitchToolClient(apiKey ? { apiKey } : undefined);
    try {
      return await client.callTool<{ variants: Array<{ screenId: string }> }>('generate_variants', {
        projectId,
        selectedScreenIds: [screenId],
        prompt,
        variantOptions: { count },
      });
    } finally {
      await client.close();
    }
  },
);

// ---------------------------------------------------------------------------
// Agent definition
// ---------------------------------------------------------------------------

// Skills are fetched at startup via module-level lazy init.
// system must be a string — we build it once and cache it.
let _systemPromise: Promise<string> | null = null;

// Called by the route handler during the first warm request.
export async function buildSystemPrompt(env: Env): Promise<string> {
  if (!_systemPromise) {
    _systemPromise = buildSkillContext(env as any, 'StitchDesignAgent').then((skills) => {
      return `You are an expert UI/UX design agent with access to the Google Stitch design generation service.

## Your capabilities
- Create Stitch design projects
- Generate high-fidelity UI screens from text prompts
- Retrieve and inspect generated screens (HTML, screenshots)
- Generate multiple visual variants of existing screens

## Prompt enhancement pattern
When the user gives a vague request like "create a dashboard", enhance it:
"Create a modern dark-mode dashboard with glassmorphism cards, Inter typography,
24px grid spacing, sidebar navigation, KPI stat cards with animated counters,
a line chart using shadcn/recharts, and a recent activity feed."

## Output format
Always return structured JSON with projectId, screenId, and screenshotUrl when available.${skills}`;
    });
  }
  return _systemPromise;
}

export const { Agent, handler } = createAgent<Env>({
  name: 'stitch-design-agent',
  model: 'gemini-2.5-flash-preview',
  system: 'You are an expert UI/UX design agent with access to the Google Stitch design generation service.',
  tools: [
    createStitchProject,
    generateStitchScreen,
    getStitchScreen,
    listStitchProjects,
    generateStitchVariants,
  ],
  mcp: { secretEnvVar: 'STITCH_AGENT_SECRET' },
  observability: { enabled: true },
});

export class StitchDesignAgent extends Agent {}
