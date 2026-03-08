import { Octokit } from '@octokit/rest';
import { createAppAuth } from '@octokit/auth-app';
import { getDb, schema } from '@db';

export abstract class BaseAutomation {
  protected env: Env;
  protected payload: unknown;
  protected installationId?: number;
  protected usePat: boolean;

  constructor(env: Env, payload: unknown, installationId: number | undefined, usePat: boolean) {
    this.env = env;
    this.payload = payload;
    this.installationId = installationId;
    this.usePat = usePat;
  }

  /**
   * Get the GitHub REST client.
   * If usePat is true, uses the personal access token (User Identity).
   * If false, it creates a client using the App Installation token (Bot Identity).
   */
  protected async getGitHubClient(): Promise<Octokit> {
    if (this.usePat) {
      if (!this.env.GITHUB_PERSONAL_ACCESS_TOKEN) {
        throw new Error('GITHUB_PERSONAL_ACCESS_TOKEN is missing but usePat is true.');
      }
      return new Octokit({
        auth: this.env.GITHUB_PERSONAL_ACCESS_TOKEN,
      });
    }

    if (!this.installationId) {
      throw new Error('Installation ID is required but not provided in webhook payload for Bot Identity.');
    }

    return new Octokit({
      authStrategy: createAppAuth,
      auth: {
        appId: this.env.GITHUB_APP_ID,
        privateKey: this.env.GITHUB_APP_PRIVATE_KEY,
        installationId: this.installationId,
      },
    });
  }

  /**
   * Decide whether the automation should execute based on the payload or other factors.
   */
  abstract shouldExecute(): Promise<boolean>;

  /**
   * Run the actual core automation logic.
   */
  abstract execute(): Promise<void>;

  /**
   * Log the execution result to the D1 automationLogs table.
   */
  protected async logExecution(
    status: 'success' | 'failure' | 'skipped',
    details?: string,
    contextNumber?: number
  ): Promise<void> {
    try {
      const db = getDb(this.env.DB);
      const payload = this.payload as { repository?: { full_name?: string } } | undefined;
      const repoFullName = payload?.repository?.full_name || 'unknown/repo';

      await db.insert(schema.automationLogs).values({
        repo: repoFullName,
        automationClass: this.constructor.name,
        status,
        details: details || null,
        prOrIssueNumber: contextNumber || null,
      });
      console.log(`[${this.constructor.name}] Logged execution: ${status} for ${repoFullName}`);
    } catch (e: unknown) {
      console.error(`[${this.constructor.name}] Failed to log execution:`, e);
    }
  }
}
