import { StitchToolClient, Stitch } from "@google/stitch-sdk";
import { Logger } from "@/lib/logger";
import { getSecret } from "@/utils/secrets";

import { createProject } from "./methods/createProject";
import { getProject } from "./methods/getProject";
import { listProjects } from "./methods/listProjects";
import { generateScreenFromText } from "./methods/generateScreenFromText";
import { editScreens } from "./methods/editScreens";
import { getScreen } from "./methods/getScreen";
import { listScreens } from "./methods/listScreens";

import type {
  CreateProjectParams,
  GetProjectParams,
  ListProjectsParams,
  GenerateScreenFromTextParams,
  EditScreensParams,
  GetScreenParams,
  ListScreensParams
} from "./types";

/**
 * @file backend/src/services/stitch/index.ts
 * @description Modularized Stitch UX design service for Google MCP integration.
 */
export class StitchService {
  private static instance: StitchService | null = null;
  private static instanceEnv: WeakRef<Env> | null = null;
  public logger: Logger;
  public env: Env;

  private constructor(env: Env) {
    this.env = env;
    this.logger = new Logger(env, "StitchService");
  }

  /**
   * Returns a request-scoped `StitchService` bounded to the current `Env`.
   */
  public static getInstance(env: Env): StitchService {
    if (!StitchService.instance || StitchService.instanceEnv?.deref() !== env) {
      StitchService.instance = new StitchService(env);
      StitchService.instanceEnv = new WeakRef(env);
    }
    return StitchService.instance;
  }

  /**
   * Manages the lifecycle of an MCP SSE Client, enforcing connection disposal
   * to respect Cloudflare Worker CPU limits.
   */
  public async withClient<T>(
    callback: (client: StitchToolClient, stitch: Stitch) => Promise<T>
  ): Promise<T> {
    const apiKey = await getSecret(this.env, "STITCH_API_KEY");
    if (!apiKey) {
      throw new Error("STITCH_API_KEY is not configured.");
    }

    const client = new StitchToolClient({ apiKey });
    const stitch = new Stitch(client);

    try {
      this.logger.info("[StitchService] Executing guarded MCP call...");
      const result = await callback(client, stitch);
      this.logger.info("[StitchService] MCP call completed successfully.");
      return result;
    } catch (e: any) {
      this.logger.error(`[StitchService] Executing guarded MCP call failed: ${e.message}`, e);
      throw e;
    } finally {
      this.logger.info("[StitchService] Resolving client transport closure.");
      await client.close();
    }
  }

  // ── Bound execution methods ────────────────────────────────────────────────

  /**
   * Create a project. Accepts `title` or `name` interchangeably for
   * backward-compatibility with callers that pass `{ name: "..." }`.
   */
  public createProject = (params: CreateProjectParams) =>
    createProject(this, { ...params, title: params.title ?? params.name });

  public getProject = (params: GetProjectParams) => getProject(this, params);
  public listProjects = (params?: ListProjectsParams) => listProjects(this, params ?? {});

  /**
   * Generate a new screen from a text prompt.
   * `generateScreen` is an alias for `generateScreenFromText`.
   */
  public generateScreenFromText = (params: GenerateScreenFromTextParams) =>
    generateScreenFromText(this, params);

  /** Alias — preferred by route-level callers. */
  public generateScreen = (params: GenerateScreenFromTextParams) =>
    generateScreenFromText(this, params);

  /**
   * Edit existing screens.
   * Normalises `screenIds` → `selectedScreenIds` and `editPrompt` → `prompt`
   * for backward-compatibility.
   */
  public editScreens = (params: EditScreensParams) => {
    const normalised: EditScreensParams = {
      ...params,
      selectedScreenIds: params.selectedScreenIds ?? params.screenIds,
      prompt: params.prompt ?? params.editPrompt,
    };
    return editScreens(this, normalised);
  };

  public getScreen = (params: GetScreenParams) => getScreen(this, params);
  public listScreens = (params: ListScreensParams | string) =>
    listScreens(this, typeof params === 'string' ? { projectId: params } : params);

  /**
   * Generate design variants for existing screens.
   * Stub — delegates to editScreens with the variant prompt.
   */
  public generateVariants = (params: EditScreensParams) =>
    editScreens(this, {
      ...params,
      selectedScreenIds: params.selectedScreenIds ?? params.screenIds,
      prompt: params.prompt ?? params.editPrompt ?? 'Generate visual variants',
    });

  /**
   * List available Stitch MCP tools.
   * Returns a static manifest — no network call required.
   */
  public listTools = (): Promise<{ name: string; description: string }[]> =>
    Promise.resolve([
      { name: 'create_project', description: 'Create a Stitch project' },
      { name: 'generate_screen_from_text', description: 'Generate a screen from text' },
      { name: 'edit_screens', description: 'Edit existing screens' },
      { name: 'get_screen', description: 'Get a screen by ID' },
      { name: 'list_screens', description: 'List screens in a project' },
    ]);
}
