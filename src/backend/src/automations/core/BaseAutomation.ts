import type { Context } from 'hono';
import { Octokit } from '@octokit/rest';
import { createAppAuth } from '@octokit/auth-app';
import { getDb } from '@db';
import { automationLogs } from '@/db/schemas/logs/automation';
import { getGitHubAppId, getGitHubPrivateKey } from '@utils/secrets';
import { withCompatOctokit } from '@services/octokit/compat';

export type AuthPolicy = 'app' | 'pat';
export type AutomationDomain =
  | 'pr'
  | 'issues'
  | 'push'
  | 'repository'
  | 'security'
  | 'telemetry';

export interface AutomationMetadata {
  key: string;
  domain: AutomationDomain;
  description: string;
  events: string[];
  alwaysOn: boolean;
  authPolicy: AuthPolicy;
}

export type AutomationPayload = Record<string, unknown>;

export interface AutomationExecutionContext<TPayload extends AutomationPayload = AutomationPayload> {
  env: Env;
  payload: TPayload;
  deliveryId: string;
  eventName: string;
  action: string | null;
  installationId?: number;
  requestContext?: Context<{ Bindings: Env }>;
}

export type AutomationClass<TPayload extends AutomationPayload = AutomationPayload> = {
  new (context: AutomationExecutionContext<TPayload>): BaseAutomation<TPayload>;
  readonly metadata: AutomationMetadata;
  readonly name: string;
};

export abstract class BaseAutomation<TPayload extends AutomationPayload = AutomationPayload> {
  static readonly metadata: AutomationMetadata;

  protected readonly env: Env;
  protected readonly payload: TPayload;
  protected readonly deliveryId: string;
  protected readonly eventName: string;
  protected readonly action: string | null;
  protected readonly installationId?: number;
  protected readonly requestContext?: Context<{ Bindings: Env }>;

  constructor(context: AutomationExecutionContext<TPayload>) {
    this.env = context.env;
    this.payload = context.payload;
    this.deliveryId = context.deliveryId;
    this.eventName = context.eventName;
    this.action = context.action;
    this.installationId = context.installationId;
    this.requestContext = context.requestContext;
  }

  get metadata(): AutomationMetadata {
    return (this.constructor as AutomationClass<TPayload>).metadata;
  }

  get automationClass(): string {
    return (this.constructor as AutomationClass<TPayload>).name;
  }

  requiresPat(): boolean {
    return this.metadata.authPolicy === 'pat';
  }

  protected get repoFullName(): string {
    const repository = this.payload.repository as { full_name?: string } | undefined;
    return repository?.full_name || 'unknown/repo';
  }

  protected get contextNumber(): number | undefined {
    const pullRequest = this.payload.pull_request as { number?: number } | undefined;
    const issue = this.payload.issue as { number?: number } | undefined;
    return pullRequest?.number ?? issue?.number;
  }

  protected get octokitRequestContext(): Context<{ Bindings: Env }> {
    if (!this.requestContext) {
      throw new Error(`${this.automationClass} requires the Hono request context but none was provided.`);
    }
    return this.requestContext;
  }

  protected async getPatToken(): Promise<string> {
    const secret = this.env.GITHUB_PERSONAL_ACCESS_TOKEN;
    const token = typeof secret === 'string' ? secret : await secret?.get?.();

    if (!token) {
      throw new Error('GITHUB_PERSONAL_ACCESS_TOKEN is required for PAT-authenticated automations.');
    }

    return token;
  }

  protected async getGitHubClient(): Promise<Octokit> {
    if (this.requiresPat()) {
      return withCompatOctokit(
        new Octokit({
          auth: await this.getPatToken(),
        }),
      );
    }

    if (!this.installationId) {
      throw new Error(`${this.automationClass} requires an installation id for GitHub App authentication.`);
    }

    return withCompatOctokit(
      new Octokit({
        authStrategy: createAppAuth,
        auth: {
          appId: await getGitHubAppId(this.env),
          privateKey: await getGitHubPrivateKey(this.env),
          installationId: this.installationId,
        },
      }),
    );
  }

  public async logExecution(
    status: 'success' | 'failure' | 'skipped',
    details?: string,
    contextNumber: number | null = this.contextNumber ?? null,
  ): Promise<void> {
    try {
      const db = getDb(this.env.DB);
      await db.insert(automationLogs).values({
        repo: this.repoFullName,
        automationClass: this.automationClass,
        status,
        details: details || null,
        prOrIssueNumber: contextNumber,
        deliveryId: this.deliveryId,
        eventName: this.eventName,
      });
    } catch (error) {
      console.error(`[${this.automationClass}] Failed to write automation log`, error);
    }
  }

  abstract shouldRun(): Promise<boolean> | boolean;

  abstract run(): Promise<void>;
}
