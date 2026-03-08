/**
 * @module RepoAgent
 * @description Cloudflare Durable Object Agent for managing state, processing webhooks, 
 * and invoking AI model tool usage specifically scoped to a single GitHub Repository.
 * @version 1.0.0
 */

import { getAgentByName, routeAgentRequest, callable } from "agents";
import { BaseAgent, BaseAgentState, Tool } from "@/ai/agents/base/BaseAgent";
import { Logger } from "@logging";
import { generateUuid } from "@/utils/common";
import { desc, notInArray } from "drizzle-orm";

import {
  DEFAULT_WORKERS_AI_MODEL,
  resolveDefaultAiModel,
  type SupportedProvider,
} from "@/ai/providers/config";
import { verifySignature } from "@/utils/crypto";
import { getAgentDb, agentSchema, migrateAgentDb, type AgentDb } from "@/db/schemas/agents/stateful";

import type {
  GitHubEventType,
  GitHubForkPayload,
  GitHubIssueCommentPayload,
  GitHubIssuesPayload,
  GitHubPingPayload,
  GitHubPullRequestPayload,
  GitHubPushPayload,
  GitHubReleasePayload,
  GitHubRepository,
  GitHubStarPayload,
  GitHubWebhookPayload,
  GitHubInstallationPayload,
  GitHubInstallationRepositoriesPayload,
  StoredEvent,
} from "@/ai/agents/github-types";

/**
 * @interface RepoState
 * @description State shape definition capturing persistent repository metadata and metrics.
 */
export type RepoState = BaseAgentState & {
  repoFullName: string;
  stats: {
    stars: number;
    forks: number;
    openIssues: number;
  };
  lastUpdated: string | null;
  webhookConfigured: boolean;
};

// Default constants for standardizing AI generation
const DEFAULT_AI_PROVIDER = "worker-ai";
const DEFAULT_AI_MODEL = DEFAULT_WORKERS_AI_MODEL;
const DEFAULT_REPO_AGENT_INSTRUCTIONS =
  "You are RepoAgent, a focused repository intelligence assistant. Be concise and specific.";

/**
 * @interface RepoAgentAiOptions
 * @description Common configuration arguments applied across multiple AI generation endpoints.
 */
type RepoAgentAiOptions = {
  provider?: string;
  model?: string;
  instructions?: string;
  name?: string;
};

type GenerateTextInput = RepoAgentAiOptions & {
  prompt: string;
};

type GenerateStructuredResponseInput = RepoAgentAiOptions & {
  prompt: string;
  outputType: any;
};

type GenerateWithToolsInput = RepoAgentAiOptions & {
  prompt: string;
  tools: Tool[];
};

/**
 * @class RepoAgent
 * @extends BaseAgent<Env, RepoState>
 * @description Coordinates intelligence logic and GitHub metrics on a per-repository basis.
 * Orchestrates SQLite local DO interactions as well as multimodal inference requests 
 * through AI Gateway proxies.
 */
export class RepoAgent extends BaseAgent<Env, RepoState> {
  private _db: AgentDb | null = null;
  // logger inherited from BaseAgent

  /**
   * @constructor
   * @param {DurableObjectState} state - Injected Durable Object context/state.
   * @param {Env} env - Global environment bindings.
   */
  constructor(state: DurableObjectState, env: Env) {
    super(state, env);
    // Initialize the Drizzle ORM client backed by the DO's embedded SQLite.
    this._db = getAgentDb(this.ctx.storage);
    // Apply pending schema migrations before any requests can be processed.
    this.ctx.blockConcurrencyWhile(async () => {
      migrateAgentDb(this.ctx.storage);
    });
  }

  /**
   * @private
   * @getter db
   * @description Lazily initializes the Drizzle ORM instance over the DO SQLite Storage.
   * @returns {AgentDb} Configured Drizzle Database client.
   */
  private get db(): AgentDb {
    if (!this._db) {
      this._db = getAgentDb(this.ctx.storage);
    }
    return this._db;
  }

  /**
   * @property initialState
   * @description Baseline state injected before repository ingestion hooks fire.
   */
  initialState: RepoState = {
    repoFullName: "",
    stats: {
      stars: 0,
      forks: 0,
      openIssues: 0,
    },
    lastUpdated: null,
    webhookConfigured: false,
    status: "idle",
    history: []
  };

  /**
   * @method onStart
   * @description Lifecycle hook kept for BaseAgent compatibility.
   * Schema migration is now handled via `blockConcurrencyWhile` in the constructor.
   */
  async onStart(): Promise<void> {
    // No-op: table creation is managed by the Drizzle DO migrator in the constructor.
  }

  /**
   * @method onRequest
   * @description Processes internal Webhook Forwarding, validates payload signatures using
   * local crypto utilities, and subsequently fires async webhook processors.
   * @param {Request} request - Triggered HTTP Request targeting this Agent.
   * @returns {Promise<Response>} 200 OK or appropriate Error Status HTTP Response.
   */
  async onRequest(request: Request): Promise<Response> {
    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    const eventType = request.headers.get("X-GitHub-Event") as GitHubEventType | null;
    if (!eventType) {
      return new Response("Missing X-GitHub-Event header", { status: 400 });
    }

    const signature = request.headers.get("X-Hub-Signature-256");
    const body = await request.text();
    const apiKey = typeof this.env.WORKER_API_KEY === 'string' 
      ? this.env.WORKER_API_KEY 
      : await (this.env.WORKER_API_KEY as any).get();

    if (apiKey) {
      const isValid = await verifySignature(
        body,
        signature,
        apiKey,
      );
      if (!isValid) {
        return new Response("Invalid signature", { status: 401 });
      }
    }

    const payload = JSON.parse(body) as GitHubWebhookPayload;
    await this.processWebhook(eventType, payload);

    return new Response("OK", { status: 200 });
  }

  /**
   * @protected
   * @method resolveProvider
   * @description Helper string normalization formatting for Provider determination.
   * @param {string} provider - Explicit generic string requested by the execution.
   * @returns {SupportedProvider} Strongly typed Supported Provider label.
   */
  protected resolveProvider(provider?: string | null): SupportedProvider {
    const normalized = (provider || "").toLowerCase().trim();

    if (normalized === "worker-ai" || normalized === "workers-ai") {
      return "worker-ai";
    }
    if (normalized === "openai") {
      return "openai";
    }
    if (normalized === "gemini" || normalized === "google" || normalized === "google-ai-studio") {
      return "gemini";
    }
    if (normalized === "anthropic") {
      return "anthropic";
    }

    return "worker-ai";
  }

  /**
   * @method generateText
   * @description Integrates directly with `@openai/agents` mapping into Cloudflare 
   * AI Gateway instances to execute generalized stateless text prompts.
   * @param {GenerateTextInput} input - Instruction configurations and strict prompt injection.
   * @returns {Promise<string>} String-based generative completion.
   */
  async generateText(input: GenerateTextInput): Promise<string> {
    const provider = this.resolveProvider(input.provider || DEFAULT_AI_PROVIDER);
    const model = input.model || resolveDefaultAiModel(this.env, provider) || DEFAULT_AI_MODEL;
    
    this.logger.info("Generating text", { 
       provider, 
       model, 
       promptLength: input.prompt.length 
    });

    return await this.runTextWithModel({
      name: input.name || "RepoAgentText",
      model,
      provider,
      instructions: input.instructions || DEFAULT_REPO_AGENT_INSTRUCTIONS,
      prompt: input.prompt
    });
  }

  /**
   * @method generateStructuredResponse
   * @description Orchestrates structured response completions explicitly constraining the AI 
   * Model to format outputs matching an explicit type signature.
   * @param {GenerateStructuredResponseInput} input - Contains Output Types logic and Prompt.
   * @returns {Promise<T>} Typed structural mapping response.
   */
  async generateStructuredResponse<T = unknown>(
    input: GenerateStructuredResponseInput,
  ): Promise<T> {
    const provider = this.resolveProvider(input.provider || DEFAULT_AI_PROVIDER);
    const model = input.model || resolveDefaultAiModel(this.env, provider) || DEFAULT_AI_MODEL;
    
    this.logger.info("Generating structured response", { provider, model });

    return await this.runStructuredResponseWithModel<T>({
      name: input.name || "RepoAgentStructured",
      model,
      provider,
      instructions: input.instructions || "Return output that strictly matches the requested schema.",
      schema: input.outputType as any,
      prompt: input.prompt,
    });
  }

  /**
   * @method generateWithTools
   * @description Provides multimodal/action-oriented completions, supplying external Tool schemas
   * natively to the underlying Provider for execution/response.
   * @param {GenerateWithToolsInput} input - Supplied Tools logic arrays alongside constraints.
   * @returns {Promise<unknown>} Generative context payload logic potentially capturing nested executions.
   */
  async generateWithTools(input: GenerateWithToolsInput): Promise<unknown> {
    const provider = this.resolveProvider(input.provider || DEFAULT_AI_PROVIDER);
    const model = input.model || resolveDefaultAiModel(this.env, provider) || DEFAULT_AI_MODEL;
    
    this.logger.info("Generating with tools", { provider, model, toolCount: input.tools.length });

    return await this.runTextWithModel({
      name: input.name || "RepoAgentTools",
      model,
      provider,
      instructions: input.instructions || "Use tools when useful and provide concise, actionable outputs.",
      prompt: input.prompt,
      tools: input.tools
    });
  }

  /**
   * @private
   * @method processWebhook
   * @description Internally abstracts the state updating and metric augmentation workflows 
   * derived specifically from GitHub webhook events. Stores parsed event models directly into DO SQLite.
   * @param {GitHubEventType} eventType - Delineator.
   * @param {GitHubWebhookPayload} payload - Generic webhook contents.
   */
  private async processWebhook(
    eventType: GitHubEventType,
    payload: GitHubWebhookPayload,
  ): Promise<void> {
    const repo = this.getRepository(payload);
    if (!repo) return;

    this.setState({
      ...this.state,
      repoFullName: repo.full_name,
      stats: {
        stars: repo.stargazers_count,
        forks: repo.forks_count,
        openIssues: repo.open_issues_count,
      },
      lastUpdated: new Date().toISOString(),
      webhookConfigured: true,
    });

    const event = this.createEvent(eventType, payload);
    if (event) {
      event.repo_name = repo.full_name; // Sync naming convention

      this.db
        .insert(agentSchema.agentEvents)
        .values({
          id: event.id,
          type: event.type,
          action: event.action ?? null,
          title: event.title,
          description: event.description,
          url: event.url,
          actorLogin: event.actor.login,
          actorAvatar: event.actor.avatar_url,
          repoName: event.repo_name ?? null,
          timestamp: event.timestamp,
        })
        .onConflictDoUpdate({
          target: agentSchema.agentEvents.id,
          set: {
            type: event.type,
            action: event.action ?? null,
            title: event.title,
            description: event.description,
            url: event.url,
            actorLogin: event.actor.login,
            actorAvatar: event.actor.avatar_url,
            repoName: event.repo_name ?? null,
            timestamp: event.timestamp,
          },
        })
        .run();

      // Keep only the latest 100 events — trim the oldest using typed Drizzle delete.
      const keepIds = this.db
        .select({ id: agentSchema.agentEvents.id })
        .from(agentSchema.agentEvents)
        .orderBy(desc(agentSchema.agentEvents.timestamp))
        .limit(100);
      this.db
        .delete(agentSchema.agentEvents)
        .where(notInArray(agentSchema.agentEvents.id, keepIds))
        .run();
    }
  }

  /**
   * @private
   * @method getRepository
   * @description Context-safe payload introspection to parse repository constraints cleanly.
   * @param {GitHubWebhookPayload} payload - Arbitrary structured payload execution.
   * @returns {GitHubRepository | null} Strict Repository or Null.
   */
  private getRepository(payload: GitHubWebhookPayload): GitHubRepository | null {
    if ("repository" in payload && payload.repository) {
      return payload.repository;
    }
    return null;
  }

  /**
   * @private
   * @method createEvent
   * @description Unifies internal data representations from diverse GitHub event signatures into a single format.
   * @param {GitHubEventType} eventType - Discriminate hook metric.
   * @param {GitHubWebhookPayload} payload - Complete hook payload.
   * @returns {StoredEvent | null} Standardized event footprint for ingestion.
   */
  private createEvent(
    eventType: GitHubEventType,
    payload: GitHubWebhookPayload,
  ): StoredEvent | null {
    const id = generateUuid();
    const timestamp = new Date().toISOString();

    switch (eventType) {
      case "ping": {
        const p = payload as GitHubPingPayload;
        return {
          id,
          type: "ping",
          title: "Webhook configured",
          description: p.zen,
          url: p.repository?.html_url || "",
          actor: { login: p.sender?.login || "github", avatar_url: p.sender?.avatar_url || "" },
          timestamp,
        };
      }
      case "push": {
        const p = payload as GitHubPushPayload;
        const branch = p.ref.replace("refs/heads/", "");
        const commitCount = p.commits?.length || 0;
        return {
          id,
          type: "push",
          title: `Pushed ${commitCount} commit${commitCount !== 1 ? "s" : ""} to ${branch}`,
          description: p.commits?.[0]?.message?.split("\n")[0] || "No commit message",
          url: p.commits?.[0]?.url || p.repository.html_url,
          actor: { login: p.sender.login, avatar_url: p.sender.avatar_url },
          timestamp,
        };
      }
      case "pull_request": {
        const p = payload as GitHubPullRequestPayload;
        return {
          id,
          type: "pull_request",
          action: p.action,
          title: `PR #${p.number}: ${p.pull_request.title}`,
          description: `${p.action} by ${p.sender.login}`,
          url: p.pull_request.html_url,
          actor: { login: p.sender.login, avatar_url: p.sender.avatar_url },
          timestamp,
        };
      }
      case "issues": {
        const p = payload as GitHubIssuesPayload;
        return {
          id,
          type: "issues",
          action: p.action,
          title: `Issue #${p.issue.number}: ${p.issue.title}`,
          description: `${p.action} by ${p.sender.login}`,
          url: p.issue.html_url,
          actor: { login: p.sender.login, avatar_url: p.sender.avatar_url },
          timestamp,
        };
      }
      case "issue_comment": {
        const p = payload as GitHubIssueCommentPayload;
        return {
          id,
          type: "issue_comment",
          action: p.action,
          title: `Comment on #${p.issue.number}`,
          description: p.comment.body.slice(0, 100) + (p.comment.body.length > 100 ? "..." : ""),
          url: p.comment.html_url,
          actor: { login: p.sender.login, avatar_url: p.sender.avatar_url },
          timestamp,
        };
      }
      case "star": {
        const p = payload as GitHubStarPayload;
        return {
          id,
          type: "star",
          action: p.action,
          title: p.action === "created" ? "Repository starred" : "Star removed",
          description: `by ${p.sender.login}`,
          url: p.repository.html_url,
          actor: { login: p.sender.login, avatar_url: p.sender.avatar_url },
          timestamp,
        };
      }
      case "fork": {
        const p = payload as GitHubForkPayload;
        return {
          id,
          type: "fork",
          title: "Repository forked",
          description: `Forked to ${p.forkee.full_name}`,
          url: p.forkee.html_url,
          actor: { login: p.sender.login, avatar_url: p.sender.avatar_url },
          timestamp,
        };
      }
      case "release": {
        const p = payload as GitHubReleasePayload;
        return {
          id,
          type: "release",
          action: p.action,
          title: `Release ${p.release.tag_name}`,
          description: p.release.name || `${p.action} by ${p.sender.login}`,
          url: p.release.html_url,
          actor: { login: p.sender.login, avatar_url: p.sender.avatar_url },
          timestamp,
        };
      }
      case "installation": {
        const p = payload as GitHubInstallationPayload;
        return {
          id,
          type: "installation",
          action: p.action,
          title: `App ${p.action}`,
          description: `Installation ${p.action} for ${p.installation.account.login}`,
          url: p.installation.html_url,
          actor: { login: p.sender.login, avatar_url: p.sender.avatar_url },
          timestamp,
        };
      }
      case "installation_repositories": {
        const p = payload as GitHubInstallationRepositoriesPayload;
        const count = p.repositories_added.length + p.repositories_removed.length;
        return {
          id,
          type: "installation_repositories",
          action: p.action,
          title: "Repositories updated",
          description: `${p.action} ${count} repos by ${p.sender.login}`,
          url: p.installation.account.html_url,
          actor: { login: p.sender.login, avatar_url: p.sender.avatar_url },
          timestamp,
        };
      }
      case "check_run": {
        const p = payload as any;
        return {
          id,
          type: "check_run",
          action: p.action,
          title: `Check Run ${p.check_run?.status ?? p.action}`,
          description: p.check_run?.output?.title || p.check_run?.name || p.action,
          url: p.check_run?.html_url || p.repository?.html_url || "",
          actor: { login: p.sender?.login || "unknown", avatar_url: p.sender?.avatar_url || "" },
          timestamp,
        };
      }
      case "check_suite": {
        const p = payload as any;
        return {
          id,
          type: "check_suite",
          action: p.action,
          title: `Check Suite ${p.check_suite?.status ?? p.action}`,
          description: p.check_suite?.conclusion || p.action,
          url: p.check_suite?.html_url || p.repository?.html_url || "",
          actor: { login: p.sender?.login || "unknown", avatar_url: p.sender?.avatar_url || "" },
          timestamp,
        };
      }
      default:
        return {
          id,
          type: eventType,
          title: `${eventType} event`,
          description: (payload as any).action || "No description",
          url: (payload as any).repository?.html_url || "",
          actor: { login: (payload as any).sender?.login || "unknown", avatar_url: (payload as any).sender?.avatar_url || "" },
          timestamp,
        };
    }
  }

  /**
   * @method getEvents
   * @description Callable hook returning localized internal Event Arrays sorted optimally.
   * @param {number} limit - Hard cutoff threshold for events logic retrieval.
   * @returns {StoredEvent[]} Extracted SQLite historical payload array.
   */
  @callable()
  getEvents(limit = 20): StoredEvent[] {
    const rows = this.db
      .select()
      .from(agentSchema.agentEvents)
      .orderBy(desc(agentSchema.agentEvents.timestamp))
      .limit(limit)
      .all();

    return rows.map((row) => ({
      id: row.id,
      type: row.type as GitHubEventType,
      action: row.action || undefined,
      title: row.title ?? "",
      description: row.description ?? "",
      url: row.url ?? "",
      actor: { login: row.actorLogin ?? "", avatar_url: row.actorAvatar ?? "" },
      repoName: row.repoName || undefined,
      timestamp: row.timestamp,
    }));
  }

  /**
   * @method getStats
   * @description Returns real-time metrics for Repository.
   * @returns {RepoState["stats"]} Repository State Snapshot details.
   */
  @callable()
  getStats(): RepoState["stats"] {
    return this.state.stats;
  }

  /**
   * @method clearEvents
   * @description Prunes locally scoped Event cache records completely via SQLite delete ops.
   */
  @callable()
  clearEvents(): void {
    this.db.delete(agentSchema.agentEvents).run();
    this.setState({
      ...this.state,
      lastUpdated: new Date().toISOString(),
    });
  }
}

// Re-export from the canonical shared module explicitly to manage agent identifiers safely
import { sanitizeRepoName } from "@/ai/mcp/tools/sandbox-sdk";
export { sanitizeRepoName };

/**
 * @function getRepoAgentByName
 * @description Extracts internal namespace and resolves an Agent ID specifically for routing GitHub repositories.
 * @param {Env} env - Injected Environment config variables.
 * @param {string} repoFullName - Fully qualified string schema matching `owner/repo`.
 * @returns {Promise<any>} Explicit instantiated Agent Reference object for dispatch.
 */
export async function getRepoAgentByName(env: Env, repoFullName: string) {
  const agentName = sanitizeRepoName(repoFullName);
  const getByName = getAgentByName as any;
  return getByName(env.REPO_AGENT, agentName);
}

/**
 * @function routeRepoAgentRequest
 * @description Forwards raw external requests securely over the Agent boundaries directly to internal functions.
 * @param {Request} request - Unprocessed HTTP request payload structure.
 * @param {Env} env - Top-level CF Bindings and environment contexts.
 * @returns {Promise<Response>} Resolution mapping standard dispatch responses.
 */
export async function routeRepoAgentRequest(request: Request, env: Env) {
  return routeAgentRequest(request, env);
}