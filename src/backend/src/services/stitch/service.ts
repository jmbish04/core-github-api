/**
 * StitchService — singleton wrapper for @google/stitch-sdk
 *
 * Uses StitchToolClient.callTool() as the single generic method that maps
 * directly to every operation in the Stitch MCP tool manifest. This avoids
 * the need to use the higher-level Stitch/Project/Screen domain classes,
 * which mirror the callTool calls (to the exact same MCP endpoints) but add
 * constructor coupling that makes the singleton pattern fragile in Workers.
 *
 * Canonical tool names from the manifest (verbatim):
 *   list_projects, create_project, generate_screen_from_text, list_screens,
 *   get_screen, edit_screens, generate_variants
 */

import type { Env } from '@/types';
import { StitchToolClient } from '@google/stitch-sdk';

/** Resolve the STITCH_API_KEY from either a plain string or Secrets Store binding */
async function resolveApiKey(env: Env): Promise<string> {
  const rawKey = (env as any).STITCH_API_KEY;
  if (!rawKey) return '';
  if (typeof rawKey === 'string') return rawKey;
  return (await rawKey.get()) as string;
}

export class StitchService {
  private static instance: StitchService | null = null;

  private client: StitchToolClient;

  private constructor(apiKey: string) {
    this.client = new StitchToolClient({ apiKey });
  }

  /**
   * Returns the singleton, lazily connecting with the resolved API key.
   * Must be called with `await` since key resolution may be async.
   */
  static async getInstance(env: Env): Promise<StitchService> {
    if (!StitchService.instance) {
      const apiKey = await resolveApiKey(env);
      StitchService.instance = new StitchService(apiKey);
    }
    return StitchService.instance;
  }

  // ── Core delegation ──────────────────────────────────────────────────────────

  /**
   * Generic method that forwards all calls to `StitchToolClient.callTool()`.
   * Every public method below is a thin wrapper around this.
   */
  private async call<T>(toolName: string, args: Record<string, any> = {}): Promise<T> {
    return this.client.callTool<T>(toolName, args);
  }

  // ── Projects ─────────────────────────────────────────────────────────────────

  async listProjects(): Promise<any> {
    return this.call('list_projects', {});
  }

  async createProject(title?: string): Promise<any> {
    return this.call('create_project', title ? { title } : {});
  }

  async getProject(projectId: string): Promise<any> {
    return this.call('get_project', { projectId });
  }

  // ── Screens ──────────────────────────────────────────────────────────────────

  async listScreens(projectId: string): Promise<any> {
    return this.call('list_screens', { projectId });
  }

  async getScreen(projectId: string, screenId: string): Promise<any> {
    return this.call('get_screen', { projectId, screenId });
  }

  async generateScreen(
    projectId: string,
    prompt: string,
    deviceType?: string,
    modelId?: string,
  ): Promise<any> {
    return this.call('generate_screen_from_text', {
      projectId,
      prompt,
      ...(deviceType ? { deviceType } : {}),
      ...(modelId ? { modelId } : {}),
    });
  }

  async editScreen(
    projectId: string,
    selectedScreenIds: string[],
    prompt: string,
    deviceType?: string,
    modelId?: string,
  ): Promise<any> {
    return this.call('edit_screens', {
      projectId,
      selectedScreenIds,
      prompt,
      ...(deviceType ? { deviceType } : {}),
      ...(modelId ? { modelId } : {}),
    });
  }

  async generateVariants(
    projectId: string,
    selectedScreenIds: string[],
    prompt: string,
    variantOptions: Record<string, any>,
    deviceType?: string,
    modelId?: string,
  ): Promise<any> {
    return this.call('generate_variants', {
      projectId,
      selectedScreenIds,
      prompt,
      variantOptions,
      ...(deviceType ? { deviceType } : {}),
      ...(modelId ? { modelId } : {}),
    });
  }

  // ── Tool introspection ────────────────────────────────────────────────────────

  async listTools(): Promise<any> {
    return this.client.listTools();
  }

  // ── MCP Tool Dispatcher (mirrors stitch.ts MCP tool names) ───────────────────

  async executeMCPTool(toolName: string, args: Record<string, any>): Promise<any> {
    switch (toolName) {
      case 'stitch_list_projects':
        return this.listProjects();
      case 'stitch_create_project':
        return this.createProject(args.title);
      case 'stitch_get_project':
        return this.getProject(args.projectId);
      case 'stitch_list_screens':
        return this.listScreens(args.projectId);
      case 'stitch_get_screen':
        return this.getScreen(args.projectId, args.screenId);
      case 'stitch_generate_screen':
        return this.generateScreen(args.projectId, args.prompt, args.deviceType, args.modelId);
      case 'stitch_edit_screen':
        return this.editScreen(
          args.projectId,
          args.selectedScreenIds ?? [],
          args.prompt,
          args.deviceType,
          args.modelId,
        );
      case 'stitch_generate_variants':
        return this.generateVariants(
          args.projectId,
          args.selectedScreenIds ?? [],
          args.prompt,
          args.variantOptions ?? {},
          args.deviceType,
          args.modelId,
        );
      case 'stitch_list_tools':
        return this.listTools();
      default:
        throw new Error(`[StitchService.executeMCPTool] Unknown tool: ${toolName}`);
    }
  }
}
