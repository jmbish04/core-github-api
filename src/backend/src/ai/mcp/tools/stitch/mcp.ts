/**
 * @file backend/src/ai/mcp/tools/stitch/mcp.ts
 * @description Stitch MCP tool group — wraps @google/stitch-sdk operations as MCP tools.
 *
 * All tools delegate to the `StitchService` singleton, which manages the
 * MCP SSE client lifecycle and enforces CPU-time limits.
 *
 * @module AI/MCP/Tools/Stitch
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { StitchService } from '@/services/stitch';

/**
 * Registers all Stitch tools onto the given MCP server instance.
 * Call this from your server factory with the Cloudflare env object.
 */
export function registerStitchTools(server: McpServer, env: Env): void {
  /** Resolve the singleton for this request context */
  const stitch = () => StitchService.getInstance(env);

  // ── Projects ────────────────────────────────────────────────────────────────

  server.tool(
    'stitch_list_projects',
    'List all Stitch projects accessible to the configured API key.',
    {},
    async (_args, _extra) => {
      const svc = stitch();
      const result = await svc.listProjects();
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    'stitch_get_project',
    'Get a specific Stitch project by ID.',
    { projectId: z.string().describe('The Stitch project ID') },
    async ({ projectId }, _extra) => {
      const svc = stitch();
      const result = await svc.getProject({ projectId });
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    'stitch_create_project',
    'Create a new Stitch project with a given title.',
    { title: z.string().optional().describe('Optional project title') },
    async ({ title }, _extra) => {
      const svc = stitch();
      const result = await svc.createProject({ title: title ?? 'New Project' });
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  // ── Screens ─────────────────────────────────────────────────────────────────

  server.tool(
    'stitch_list_screens',
    'List all screens within a Stitch project.',
    { projectId: z.string().describe('The Stitch project ID') },
    async ({ projectId }, _extra) => {
      const svc = stitch();
      const result = await svc.listScreens({ projectId });
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    'stitch_get_screen',
    'Get a specific screen by ID within a project.',
    {
      projectId: z.string().describe('The Stitch project ID'),
      screenId: z.string().describe('The Stitch screen ID'),
    },
    async ({ projectId, screenId }, _extra) => {
      const svc = stitch();
      const result = await svc.getScreen({ projectId, screenId });
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    'stitch_generate_screen',
    'Generate a new screen from a text prompt in a Stitch project.',
    {
      projectId: z.string().describe('The Stitch project ID'),
      prompt: z.string().describe('Text description of the screen to generate'),
      deviceType: z.enum(['DESKTOP', 'MOBILE', 'TABLET']).optional(),
    },
    async ({ projectId, prompt, deviceType }, _extra) => {
      const svc = stitch();
      const result = await svc.generateScreen({ projectId, prompt, deviceType: deviceType ?? 'DESKTOP' });
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    'stitch_edit_screen',
    'Edit existing Stitch screens using a text prompt.',
    {
      projectId: z.string().describe('The Stitch project ID'),
      selectedScreenIds: z.array(z.string()).describe('IDs of screens to edit'),
      prompt: z.string().describe('Text description of the changes to make'),
    },
    async ({ projectId, selectedScreenIds, prompt }, _extra) => {
      const svc = stitch();
      const result = await svc.editScreens({ projectId, selectedScreenIds, prompt });
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    'stitch_generate_variants',
    'Generate design variants for existing Stitch screens.',
    {
      projectId: z.string().describe('The Stitch project ID'),
      selectedScreenIds: z.array(z.string()).describe('IDs of screens to create variants for'),
      prompt: z.string().optional().describe('Optional instructions for variant generation'),
    },
    async ({ projectId, selectedScreenIds, prompt }, _extra) => {
      const svc = stitch();
      const result = await svc.generateVariants({ projectId, selectedScreenIds, prompt });
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    'stitch_list_tools',
    'List all available Stitch MCP tools.',
    {},
    async (_args, _extra) => {
      const svc = stitch();
      const result = await svc.listTools();
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );
}
