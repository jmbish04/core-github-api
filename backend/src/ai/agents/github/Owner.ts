/**
 * @module OwnerAgent
 * @description Cloudflare Durable Object Agent for managing state and processing webhooks 
 * across a GitHub Owner (User or Organization). It aggregates stats across multiple 
 * repositories and tracks organization-wide events and automation runs.
 * @version 1.0.0
 */

import { createAgent } from "@/ai/agents/honi";
import { buildMaxAgentMemory } from "@/ai/agents/memory";
import { callable } from "@/ai/agents/runtime/agents";
import { AgentStateStore } from "@/ai/agents/support/state-store";
import type { PersistentAgentState } from "@/ai/agents/support/types";
import { generateUuid } from "@/utils/common";
import { desc, eq, notInArray } from "drizzle-orm";
import { getAgentDb, agentSchema, migrateAgentDb, type AgentDb } from "@/db/schemas/agents/stateful";
import type {
  GitHubEventType,
  GitHubForkPayload,
  GitHubInstallationPayload,
  GitHubInstallationRepositoriesPayload,
  GitHubIssueCommentPayload,
  GitHubIssuesPayload,
  GitHubPingPayload,
  GitHubPullRequestPayload,
  GitHubPushPayload,
  GitHubReleasePayload,
  GitHubRepository,
  GitHubStarPayload,
  GitHubWebhookPayload,
  StoredEvent,
} from "@/ai/agents/github-types";


/**
 * @interface OwnerState
 * @description Defines the durable state shape for the OwnerAgent, representing aggregated 
 * GitHub owner statistics and webhook configuration status.
 */
export type OwnerState = PersistentAgentState & {
  ownerName: string;
  stats: {
    totalStars: number;
    totalForks: number;
    totalOpenIssues: number;
    repoCount: number;
  };
  lastUpdated: string | null;
  webhookConfigured: boolean;
};

/**
 * @class OwnerAgent
 * @extends Honi Durable Object
 * @description Maintains persistent state for a GitHub Owner and provides an interface 
 * for ingesting webhook events, running automation tracking, and serving metrics.
 */
const ownerRuntime = createAgent<Env>({
  name: "owner-agent",
  model: "claude-3-5-sonnet-latest",
  system: "You track owner-level GitHub state and automation metrics.",
  binding: "OWNER_AGENT",
  tools: [],
  memory: buildMaxAgentMemory({
    agentName: "OwnerAgent",
    graphId: "core-github-api-owner-agent",
  }),
  observability: { enabled: true, aiGatewaySlug: "core-github-api", collectEvents: true },
});

const OwnerDurableObject = ownerRuntime.DurableObject as new (
  state: DurableObjectState,
  env: Env,
) => DurableObject & {
  env: Env;
  fetch(request: Request): Promise<Response>;
};

export class OwnerAgent extends OwnerDurableObject {
  declare env: Env;
  private _db: AgentDb | null = null;
  private readonly store: AgentStateStore<OwnerState>;

  /**
   * @constructor
   * @param {DurableObjectState} state - The Durable Object state injected by Cloudflare.
   * @param {Env} env - Global environment bindings.
   */
  constructor(state: DurableObjectState, env: Env) {
    super(state, env);
    this.env = env;
    this.store = new AgentStateStore<OwnerState>({
      ctx: state,
      env,
      agentName: "OwnerAgent",
      initialState: {
        ownerName: "",
        stats: {
          totalStars: 0,
          totalForks: 0,
          totalOpenIssues: 0,
          repoCount: 0,
        },
        lastUpdated: null,
        webhookConfigured: false,
        status: "idle",
        history: [],
      },
    });
    this._db = getAgentDb(state.storage);
    state.blockConcurrencyWhile(async () => {
      migrateAgentDb(state.storage);
    });
  }

  /**
   * @private
   * @getter db
   * @description Lazily initializes the Drizzle ORM instance backed by the DO's SQLite storage API.
   * @returns {AgentDb} Drizzle ORM Database instance.
   */
  private get db(): AgentDb {
    if (!this._db) {
      this._db = getAgentDb(this.store.ctx.storage);
    }
    return this._db;
  }

  /**
   * @method onRequest
   * @description Standard fetch handler for the Agent. Parses incoming webhook events 
   * and automation run requests, routing them to the appropriate processor.
   * @param {Request} request - The incoming HTTP Request.
   * @returns {Promise<Response>} HTTP Response indicating success or failure.
   */
  async onRequest(request: Request): Promise<Response> {
    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    const url = new URL(request.url);

    // Handle automation run storage from webhook-handler
    if (url.pathname === "/store-automation") {
      const body = await request.json() as {
        id: string;
        ruleId: string;
        ruleName: string;
        workflow: string;
        eventId: string;
        status: string;
        startedAt: string;
      };
      this.storeAutomationRun(body);
      return new Response("OK", { status: 200 });
    }

    // Default: handle webhook event forwarding
    const eventType = request.headers.get("X-GitHub-Event") as GitHubEventType;
    if (!eventType) {
      return new Response("Missing X-GitHub-Event header", { status: 400 });
    }

    // Signature already verified at the router level (webhook-handler.ts)
    const body = await request.text();
    const payload = JSON.parse(body) as GitHubWebhookPayload;
    
    await this.processWebhook(eventType, payload);

    return new Response("OK", { status: 200 });
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "POST" || url.pathname === "/health-probe" || url.pathname === "/memory" || url.pathname === "/history") {
      if (url.pathname === "/health-probe") {
        return Response.json({
          status: "ok",
          agent: "OwnerAgent",
          timestamp: new Date().toISOString(),
        });
      }
      if (url.pathname === "/memory") {
        await this.store.ready();
        return Response.json(this.store.state);
      }
      if (url.pathname === "/history") {
        await this.store.ready();
        return Response.json(this.store.state.history || []);
      }
      return this.onRequest(request);
    }

    return super.fetch(request);
  }

  /**
   * @private
   * @method processWebhook
   * @description Ingests the normalized GitHub payload, updates Owner state metrics, 
   * inserts the event into SQLite, and cleans up historical records.
   * @param {GitHubEventType} eventType - The type of GitHub webhook event.
   * @param {GitHubWebhookPayload} payload - The normalized JSON payload.
   */
  private async processWebhook(
    eventType: GitHubEventType,
    payload: GitHubWebhookPayload
  ): Promise<void> {
    const repo = this.getRepository(payload);
    
    // Extract owner name from various possible payload structures
    const ownerName = repo?.owner.login || 
                      (payload as any).installation?.account?.login || 
                      (payload as any).sender?.login;

    if (ownerName && this.store.state.ownerName !== ownerName) {
        await this.store.set({ ...this.store.state, ownerName });
    }

    // Track activity & webhook health state
    await this.store.set({
      ...this.store.state,
      lastUpdated: new Date().toISOString(),
      webhookConfigured: true
    });

    const event = this.createEvent(eventType, payload);
    if (event) {
      const repoName = repo?.full_name || (payload as any).repository?.full_name || "";

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
          repoName: repoName,
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
            repoName: repoName,
            timestamp: event.timestamp,
          },
        })
        .run();

      // Keep only the latest 200 events — trim the oldest using typed Drizzle delete.
      const keepIds = this.db
        .select({ id: agentSchema.agentEvents.id })
        .from(agentSchema.agentEvents)
        .orderBy(desc(agentSchema.agentEvents.timestamp))
        .limit(200);
      this.db
        .delete(agentSchema.agentEvents)
        .where(notInArray(agentSchema.agentEvents.id, keepIds))
        .run();
    }
  }

  /**
   * @private
   * @method getRepository
   * @description Safe extraction of the repository object from generic webhook payloads.
   * @param {GitHubWebhookPayload} payload - The JSON payload.
   * @returns {GitHubRepository | null} Parsed Repository object, if present.
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
   * @description Translates standard GitHub payloads into our internal StoredEvent format.
   * @param {GitHubEventType} eventType - Webhook event discriminator.
   * @param {GitHubWebhookPayload} payload - Full webhook data.
   * @returns {StoredEvent | null} Standardized StoredEvent record or null if unhandled.
   */
  private createEvent(
    eventType: GitHubEventType,
    payload: GitHubWebhookPayload
  ): StoredEvent | null {
    const id = generateUuid();
    const timestamp = new Date().toISOString();
    
    const getRepoPrefix = () => {
        const repo = this.getRepository(payload);
        return repo ? `[${repo.name}] ` : "";
    };

    switch (eventType) {
      case "ping": {
        const p = payload as GitHubPingPayload;
        return {
          id, type: "ping", title: `${getRepoPrefix()}Webhook configured`, description: p.zen,
          url: p.repository?.html_url || "", actor: { login: p.sender?.login || "github", avatar_url: p.sender?.avatar_url || "" }, timestamp
        };
      }
      case "push": {
        const p = payload as GitHubPushPayload;
        const branch = p.ref.replace("refs/heads/", "");
        const commitCount = p.commits?.length || 0;
        return {
          id, type: "push", 
          title: `${getRepoPrefix()}Pushed ${commitCount} commit${commitCount !== 1 ? "s" : ""} to ${branch}`,
          description: p.commits?.[0]?.message?.split("\n")[0] || "No commit message",
          url: p.commits?.[0]?.url || p.repository.html_url,
          actor: { login: p.sender.login, avatar_url: p.sender.avatar_url }, timestamp
        };
      }
      case "pull_request": {
        const p = payload as GitHubPullRequestPayload;
        return {
          id, type: "pull_request", action: p.action,
          title: `${getRepoPrefix()}PR #${p.number}: ${p.pull_request.title}`,
          description: `${p.action} by ${p.sender.login}`,
          url: p.pull_request.html_url,
          actor: { login: p.sender.login, avatar_url: p.sender.avatar_url }, timestamp
        };
      }
      case "issues": {
        const p = payload as GitHubIssuesPayload;
        return {
          id, type: "issues", action: p.action,
          title: `${getRepoPrefix()}Issue #${p.issue.number}: ${p.issue.title}`,
          description: `${p.action} by ${p.sender.login}`,
          url: p.issue.html_url,
          actor: { login: p.sender.login, avatar_url: p.sender.avatar_url }, timestamp
        };
      }
      case "issue_comment": {
        const p = payload as GitHubIssueCommentPayload;
        return {
          id, type: "issue_comment", action: p.action,
          title: `${getRepoPrefix()}Comment on #${p.issue.number}`,
          description: p.comment.body.slice(0, 100) + (p.comment.body.length > 100 ? "..." : ""),
          url: p.comment.html_url,
          actor: { login: p.sender.login, avatar_url: p.sender.avatar_url }, timestamp
        };
      }
      case "star": {
        const p = payload as GitHubStarPayload;
        return {
            id, type: "star", action: p.action,
            title: `${getRepoPrefix()}${p.action === "created" ? "Repository starred" : "Star removed"}`,
            description: `by ${p.sender.login}`,
            url: p.repository.html_url,
            actor: { login: p.sender.login, avatar_url: p.sender.avatar_url }, timestamp
        };
      }
      case "fork": {
          const p = payload as GitHubForkPayload;
          return {
              id, type: "fork", title: `${getRepoPrefix()}Repository forked`,
              description: `Forked to ${p.forkee.full_name}`,
              url: p.forkee.html_url,
              actor: { login: p.sender.login, avatar_url: p.sender.avatar_url }, timestamp
          };
      }
      case "release": {
          const p = payload as GitHubReleasePayload;
          return {
              id, type: "release", action: p.action,
              title: `${getRepoPrefix()}Release ${p.release.tag_name}`,
              description: p.release.name || `${p.action} by ${p.sender.login}`,
              url: p.release.html_url,
              actor: { login: p.sender.login, avatar_url: p.sender.avatar_url }, timestamp
          };
      }
      case "installation": {
          const p = payload as GitHubInstallationPayload;
          return {
            id, type: "installation", action: p.action,
            title: `App ${p.action}`,
            description: `Installation ${p.action} for ${p.installation.account.login}`,
            url: p.installation.html_url,
            actor: { login: p.sender.login, avatar_url: p.sender.avatar_url }, timestamp
          };
      }
      case "installation_repositories": {
          const p = payload as GitHubInstallationRepositoriesPayload;
          const count = p.repositories_added.length + p.repositories_removed.length;
          return {
            id, type: "installation_repositories", action: p.action,
            title: `Repositories updated`,
            description: `${p.action} ${count} repos by ${p.sender.login}`,
            url: p.installation.account.html_url,
            actor: { login: p.sender.login, avatar_url: p.sender.avatar_url }, timestamp
          };
      }
      case "check_run": {
          const p = payload as any;
          return {
            id, type: "check_run", action: p.action,
            title: `${getRepoPrefix()}Check Run ${p.check_run.status}`,
            description: p.check_run.output?.title || p.check_run.name,
            url: p.check_run.html_url,
            actor: { login: p.sender.login, avatar_url: p.sender.avatar_url }, timestamp
          };
      }
      case "check_suite": {
          const p = payload as any;
          return {
            id, type: "check_suite", action: p.action,
            title: `${getRepoPrefix()}Check Suite ${p.check_suite.status}`,
            description: p.check_suite.conclusion || p.action,
            url: p.check_suite.html_url || p.repository?.html_url,
            actor: { login: p.sender.login, avatar_url: p.sender.avatar_url }, timestamp
          };
      }
      default:
        return {
            id, type: eventType,
            title: `${getRepoPrefix()}${eventType}`,
            description: (payload as any).action || "No description",
            url: (payload as any).repository?.html_url || "",
            actor: { login: (payload as any).sender?.login || "unknown", avatar_url: (payload as any).sender?.avatar_url || "" }, timestamp
        };
    }
  }

  /**
   * @method getEvents
   * @description Callable endpoint to retrieve recent events from SQLite storage.
   * @param {number} limit - The maximum number of events to return (default: 20).
   * @returns {StoredEvent[]} Array of stored events.
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
   * @description Callable endpoint returning the current state statistics.
   * @returns {OwnerState["stats"]} Current aggregation metrics for the Owner.
   */
  @callable()
  getStats(): OwnerState["stats"] {
      return this.store.state.stats;
  }
  
  /**
   * @method clearEvents
   * @description Callable endpoint to truncate all events and automation runs from storage.
   */
  @callable()
  async clearEvents(): Promise<void> {
      this.db.delete(agentSchema.automationRuns).run();
      this.db.delete(agentSchema.agentEvents).run();
      await this.store.set({ ...this.store.state, lastUpdated: new Date().toISOString() });
  }

  /**
   * @method getAutomationRuns
   * @description Retrieves associated automation runs executed via webhooks.
   * @param {string} eventId - The ID of the primary event that triggered the automation.
   * @returns {Array} Array of historical automation run objects.
   */
  @callable()
  getAutomationRuns(eventId: string): Array<{
    id: string;
    ruleId: string;
    ruleName: string;
    workflow: string;
    eventId: string;
    status: string;
    startedAt: string;
    completedAt?: string;
  }> {
    const rows = this.db
      .select()
      .from(agentSchema.automationRuns)
      .where(eq(agentSchema.automationRuns.eventId, eventId))
      .orderBy(desc(agentSchema.automationRuns.startedAt))
      .all();

    return rows.map((r) => ({
      id: r.id,
      ruleId: r.ruleId,
      ruleName: r.ruleName,
      workflow: r.workflow,
      eventId: r.eventId,
      status: r.status,
      startedAt: r.startedAt,
      completedAt: r.completedAt || undefined,
    }));
  }

  /**
   * @method storeAutomationRun
   * @description Upserts an automation execution record into the SQLite storage.
   * @param {Object} run - Data containing execution metrics for a specific workflow automation.
   */
  storeAutomationRun(run: {
    id: string;
    ruleId: string;
    ruleName: string;
    workflow: string;
    eventId: string;
    status: string;
    startedAt: string;
  }): void {
    this.db
      .insert(agentSchema.automationRuns)
      .values({
        id: run.id,
        ruleId: run.ruleId,
        ruleName: run.ruleName,
        workflow: run.workflow,
        eventId: run.eventId,
        status: run.status,
        startedAt: run.startedAt,
      })
      .onConflictDoUpdate({
        target: agentSchema.automationRuns.id,
        set: {
          ruleId: run.ruleId,
          ruleName: run.ruleName,
          workflow: run.workflow,
          eventId: run.eventId,
          status: run.status,
          startedAt: run.startedAt,
        },
      })
      .run();
  }
}
