/**
 * @file backend/src/services/stitch/service.ts
 * @description Canonical Stitch UX design service.
 *
 * `StitchService` is the single point of integration with the Google Stitch
 * MCP server (`https://stitch.googleapis.com/mcp`). It wraps MCP Client
 * calls into typed methods for screen generation, editing, and project management.
 *
 * ## Singleton Pattern
 * `StitchService.getInstance(env)` returns a request-scoped singleton so that
 * multiple callers within the same Worker request share one service instance.
 *
 * ## Connection Lifecycle
 * Each method creates and destroys its own MCP Client connection. This is
 * required because Cloudflare Workers have CPU time limits that prevent
 * long-lived SSE connections from being pooled.
 *
 * @module Services/Stitch
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import type {
  GenerateScreenParams,
  GenerateScreenResult,
  EditScreensParams,
  GetScreenParams,
  CreateProjectParams,
} from "./types";

// ─── StitchService ───────────────────────────────────────────────────────────

export class StitchService {
  private static instance: StitchService | null = null;
  private static instanceEnv: WeakRef<Env> | null = null;

  private constructor(private readonly env: Env) {}

  /**
   * Returns a `StitchService` scoped to the given `env`. If the `env` object
   * changes (e.g. across requests in the same isolate), the old instance is
   * discarded and a fresh one is created.
   */
  public static getInstance(env: Env): StitchService {
    // If env reference changed (new request context), discard stale instance
    if (!StitchService.instance || StitchService.instanceEnv?.deref() !== env) {
      StitchService.instance = new StitchService(env);
      StitchService.instanceEnv = new WeakRef(env);
    }
    return StitchService.instance;
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  /**
   * Creates a temporary MCP client connected to the Stitch endpoint.
   * Caller is responsible for closing the client after use.
   */
  private async createClient(): Promise<Client> {
    const apiKey =
      typeof (this.env as any).STITCH_API_KEY?.get === "function"
        ? await (this.env as any).STITCH_API_KEY.get()
        : (this.env as any).STITCH_API_KEY;

    if (!apiKey) {
      throw new Error("[StitchService] STITCH_API_KEY is not configured.");
    }

    const transport = new SSEClientTransport(
      new URL("https://stitch.googleapis.com/mcp"),
      {
        requestInit: {
          headers: { "X-Goog-Api-Key": apiKey },
        },
      }
    );

    const client = new Client(
      { name: "core-github-api-stitch", version: "1.0.0" },
      { capabilities: {} }
    );

    await client.connect(transport);
    return client;
  }

  /**
   * Executes a tool on the Stitch MCP server with automatic connection management.
   */
  private async callTool(
    toolName: string,
    args: Record<string, unknown>
  ): Promise<unknown> {
    const client = await this.createClient();
    try {
      const result = await client.callTool({
        name: toolName,
        arguments: args,
      });
      return result.content;
    } finally {
      await client.close();
    }
  }

  /**
   * Extracts text content from an MCP tool result content array.
   */
  private extractText(content: unknown): string {
    if (Array.isArray(content)) {
      const textItem = content.find(
        (c: any) => c.type === "text" && c.text
      ) as any;
      return textItem?.text || JSON.stringify(content);
    }
    return typeof content === "string" ? content : JSON.stringify(content);
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Generates a new screen in a Stitch project from a UX prompt.
   */
  async generateScreen(
    params: GenerateScreenParams
  ): Promise<GenerateScreenResult> {
    console.log(
      `[StitchService] Generating screen: ${params.prompt.substring(0, 60)}...`
    );

    const content = await this.callTool("generate_screen_from_text", {
      projectId: params.projectId,
      text: params.prompt,
      deviceType: params.deviceType,
    });

    const text = this.extractText(content);

    try {
      const parsed = JSON.parse(text);
      return {
        screenId: parsed.screenId || parsed.id,
        html: parsed.html || parsed.htmlCode,
        htmlCode: parsed.htmlCode || parsed.html,
      };
    } catch {
      return { html: text, htmlCode: text };
    }
  }

  /**
   * Edits existing screens with a modification prompt.
   */
  async editScreens(params: EditScreensParams): Promise<unknown> {
    console.log(
      `[StitchService] Editing ${params.screenIds.length} screens in ${params.projectId}`
    );

    return this.callTool("edit_screens", {
      projectId: params.projectId,
      screenIds: params.screenIds,
      editInstructions: params.editPrompt,
    });
  }

  /**
   * Retrieves a specific screen's data from a Stitch project.
   */
  async getScreen(params: GetScreenParams): Promise<unknown> {
    return this.callTool("get_screen", {
      projectId: params.projectId,
      screenId: params.screenId,
    });
  }

  /**
   * Lists all screens in a Stitch project.
   */
  async listScreens(projectId: string): Promise<unknown> {
    return this.callTool("list_screens", { projectId });
  }

  /**
   * Retrieves a Stitch project by ID.
   */
  async getProject(projectId: string): Promise<unknown> {
    return this.callTool("get_project", { projectId });
  }

  /**
   * Lists all Stitch projects.
   */
  async listProjects(): Promise<unknown> {
    return this.callTool("list_projects", {});
  }

  /**
   * Creates a new Stitch project.
   */
  async createProject(params: CreateProjectParams): Promise<unknown> {
    console.log(`[StitchService] Creating project: ${params.name}`);
    return this.callTool("create_project", {
      name: params.name,
      description: params.description,
    });
  }
}
