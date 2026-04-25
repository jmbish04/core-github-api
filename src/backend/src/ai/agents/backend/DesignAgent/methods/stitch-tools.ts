/**
 * @file DesignAgent/methods/stitch-tools.ts
 * @description Stitch SDK tool factories for the DesignAgent.
 *              Each factory creates a tool definition compatible with
 *              AIProvider.chat.chatWithTools().
 */

import { z } from 'zod';
import { StitchToolClient } from '@google/stitch-sdk';
import { getSecret } from '@/utils/secrets';

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

async function getApiKey(env: Env): Promise<string | undefined> {
  return getSecret(env, 'STITCH_API_KEY');
}

async function withClient<T>(env: Env, fn: (client: StitchToolClient) => Promise<T>): Promise<T> {
  const apiKey = await getApiKey(env);
  const client = new StitchToolClient(apiKey ? { apiKey } : undefined);
  try {
    return await fn(client);
  } finally {
    await client.close();
  }
}

// ---------------------------------------------------------------------------
// Tool: Create Project
// ---------------------------------------------------------------------------

const createProjectSchema = z.object({
  title: z.string().describe('Project title'),
});

export const makeCreateStitchProjectTool = (env: Env) => ({
  description: 'Create a new Stitch UI design project. Use when starting a new design.',
  parameters: createProjectSchema,
  execute: async (args: z.infer<typeof createProjectSchema>) =>
    withClient(env, (client) =>
      client.callTool<{ projectId: string; title: string }>('create_project', {
        title: args.title,
      }),
    ),
});

// ---------------------------------------------------------------------------
// Tool: Generate Screen
// ---------------------------------------------------------------------------

const generateScreenSchema = z.object({
  projectId: z.string().describe('The Stitch project ID'),
  prompt: z.string().describe('Detailed UI description prompt'),
  deviceType: z
    .enum(['DESKTOP', 'MOBILE', 'TABLET', 'AGNOSTIC'])
    .optional()
    .default('DESKTOP')
    .describe('Target device type'),
});

export const makeGenerateStitchScreenTool = (env: Env) => ({
  description: 'Generate a UI screen from a text prompt within an existing Stitch project.',
  parameters: generateScreenSchema,
  execute: async (args: z.infer<typeof generateScreenSchema>) =>
    withClient(env, (client) =>
      client.callTool<{ screenId: string; screenshotUrl?: string; html?: string }>(
        'generate_screen_from_text',
        { projectId: args.projectId, prompt: args.prompt, deviceType: args.deviceType },
      ),
    ),
});

// ---------------------------------------------------------------------------
// Tool: Get Screen
// ---------------------------------------------------------------------------

const getScreenSchema = z.object({
  projectId: z.string().describe('The Stitch project ID'),
  screenId: z.string().describe('The Stitch screen ID'),
});

export const makeGetStitchScreenTool = (env: Env) => ({
  description: 'Retrieve a generated Stitch screen by ID to get the HTML and screenshot.',
  parameters: getScreenSchema,
  execute: async (args: z.infer<typeof getScreenSchema>) =>
    withClient(env, (client) =>
      client.callTool<{
        screenId: string;
        screenshotUrl?: string;
        html?: string;
        status?: string;
      }>('get_screen', { projectId: args.projectId, screenId: args.screenId }),
    ),
});

// ---------------------------------------------------------------------------
// Tool: List Projects
// ---------------------------------------------------------------------------

const listProjectsSchema = z.object({});

export const makeListStitchProjectsTool = (env: Env) => ({
  description: 'List all Stitch design projects.',
  parameters: listProjectsSchema,
  execute: async (_args: z.infer<typeof listProjectsSchema>) =>
    withClient(env, (client) =>
      client.callTool<{ projects: Array<{ projectId: string; title: string }> }>(
        'list_projects',
        {},
      ),
    ),
});

// ---------------------------------------------------------------------------
// Tool: Generate Variants
// ---------------------------------------------------------------------------

const generateVariantsSchema = z.object({
  projectId: z.string().describe('The Stitch project ID'),
  screenId: z.string().describe('The screen ID to generate variants for'),
  prompt: z.string().describe('Prompt describing the style variant'),
  count: z.number().min(1).max(4).default(2).describe('Number of variants to generate'),
});

export const makeGenerateStitchVariantsTool = (env: Env) => ({
  description:
    'Generate multiple design variants for an existing screen with different visual styles.',
  parameters: generateVariantsSchema,
  execute: async (args: z.infer<typeof generateVariantsSchema>) =>
    withClient(env, (client) =>
      client.callTool<{ variants: Array<{ screenId: string }> }>('generate_variants', {
        projectId: args.projectId,
        selectedScreenIds: [args.screenId],
        prompt: args.prompt,
        variantOptions: { count: args.count },
      }),
    ),
});

// ---------------------------------------------------------------------------
// Aggregate: build all tools for a given env
// ---------------------------------------------------------------------------

export function buildStitchTools(env: Env) {
  return {
    createProject: makeCreateStitchProjectTool(env),
    generateScreen: makeGenerateStitchScreenTool(env),
    getScreen: makeGetStitchScreenTool(env),
    listProjects: makeListStitchProjectsTool(env),
    generateVariants: makeGenerateStitchVariantsTool(env),
  };
}
