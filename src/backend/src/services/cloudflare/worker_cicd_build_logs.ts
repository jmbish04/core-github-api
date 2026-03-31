/**
 * @file src/services/ci/CILogService.ts
 * @description Fetches GitHub check run metadata to extract the Cloudflare Build ID,
 * then retrieves the raw build logs from the Cloudflare Workers Builds API.
 *
 * Used by JulesOverseer to diagnose CI failures and craft targeted remediation prompts.
 */

import { Octokit } from '@octokit/rest';

export type CheckRunStatus = 'queued' | 'in_progress' | 'completed';
export type CheckRunConclusion =
  | 'success' | 'failure' | 'neutral' | 'cancelled'
  | 'skipped' | 'timed_out' | 'action_required' | null;

export interface CICheckRun {
  id: number;
  name: string;
  status: CheckRunStatus;
  conclusion: CheckRunConclusion;
  detailsUrl: string | null;
  externalId: string | null;
  outputSummary: string | null;
}

export interface CIBuildLog {
  checkRunId: number;
  buildId: string | null;
  logs: string | null;
  error?: string;
}

const UUID_REGEX = /[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/i;
const CF_BUILDS_BASE = 'https://api.cloudflare.com/client/v4';

export class CILogService {
  private octokit: Octokit;
  private cfToken: string;
  private cfAccountId: string;

  constructor(env: { GITHUB_PERSONAL_ACCESS_TOKEN?: string; CLOUDFLARE_API_TOKEN: string; CLOUDFLARE_ACCOUNT_ID: string }) {
    this.octokit = new Octokit({ auth: env.GITHUB_PERSONAL_ACCESS_TOKEN });
    this.cfToken = env.CLOUDFLARE_API_TOKEN;
    this.cfAccountId = env.CLOUDFLARE_ACCOUNT_ID;
  }

  /**
   * Lists all check runs for a given PR commit SHA.
   * This is the entry point when the JulesOverseer detects a CI failure mention
   * inside a Jules session snapshot, and needs to know which check(s) failed.
   */
  async getCheckRunsForPR(owner: string, repo: string, prNumber: number): Promise<CICheckRun[]> {
    // 1. Resolve the PR's HEAD commit SHA
    const { data: pr } = await this.octokit.rest.pulls.get({ owner, repo, pull_number: prNumber });
    const sha = pr.head.sha;

    // 2. Fetch all check runs for that commit
    const { data } = await this.octokit.rest.checks.listForRef({ owner, repo, ref: sha });

    return data.check_runs.map((run) => ({
      id: run.id,
      name: run.name,
      status: run.status as CheckRunStatus,
      conclusion: run.conclusion as CheckRunConclusion,
      detailsUrl: run.details_url ?? null,
      externalId: run.external_id ?? null,
      outputSummary: run.output?.summary ?? null,
    }));
  }

  /**
   * Finds the first failed Workers Build check run in the list.
   * Matches by name containing "Workers Builds" (case insensitive).
   */
  findFailedWorkersBuildRun(checkRuns: CICheckRun[]): CICheckRun | null {
    return checkRuns.find(
      (r) =>
        r.name.toLowerCase().includes('workers build') &&
        r.conclusion === 'failure',
    ) ?? null;
  }

  /**
   * Given a check run ID, fetches its metadata from GitHub and attempts to
   * extract a Cloudflare Build UUID from any of the check's text fields.
   */
  async extractBuildIdFromCheckRun(owner: string, repo: string, checkRunId: number): Promise<string | null> {
    const { data: checkRun } = await this.octokit.rest.checks.get({ owner, repo, check_run_id: checkRunId });

    const searchableText = [
      checkRun.external_id,
      checkRun.output?.title,
      checkRun.output?.summary,
      checkRun.output?.text,
      checkRun.details_url,
    ].filter(Boolean).join(' ');

    const match = searchableText.match(UUID_REGEX);
    return match ? match[0] : null;
  }

  /**
   * Fetches raw build logs from Cloudflare Workers Builds API for a given build UUID.
   */
  async fetchBuildLogs(buildId: string): Promise<string | null> {
    const url = `${CF_BUILDS_BASE}/accounts/${this.cfAccountId}/builds/builds/${buildId}/logs`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${this.cfToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!res.ok) {
      throw new Error(`Cloudflare Builds API error ${res.status}: ${await res.text()}`);
    }

    const body = await res.json<{ result: any }>();

    // Normalise: if result is an array of log lines, join them; otherwise stringify.
    const result = body.result ?? body;
    if (Array.isArray(result)) {
      return result
        .map((entry: any) => (typeof entry === 'string' ? entry : JSON.stringify(entry)))
        .join('\n');
    }
    if (typeof result === 'string') return result;
    return JSON.stringify(result, null, 2);
  }

  /**
   * High-level convenience: given a check run ID, resolve the Cloudflare build ID
   * and fetch its logs in one call.
   */
  async getLogsForCheckRun(owner: string, repo: string, checkRunId: number): Promise<CIBuildLog> {
    try {
      const buildId = await this.extractBuildIdFromCheckRun(owner, repo, checkRunId);
      if (!buildId) {
        return {
          checkRunId,
          buildId: null,
          logs: null,
          error: 'Could not parse a Cloudflare Build UUID from the GitHub Check Run metadata.',
        };
      }

      const logs = await this.fetchBuildLogs(buildId);
      return { checkRunId, buildId, logs };
    } catch (err: any) {
      return {
        checkRunId,
        buildId: null,
        logs: null,
        error: err.message ?? 'Unknown error fetching build logs.',
      };
    }
  }
}
