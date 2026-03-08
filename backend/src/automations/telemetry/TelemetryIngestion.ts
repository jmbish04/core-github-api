import { BaseAutomation } from '@/core/BaseAutomation';
import { getWebhooksDb } from '@db';
import * as eventTables from "@/db/schemas/github/webhooks";

type TelemetryPayload = {
  pull_request?: {
    number?: number;
    title?: string;
    state?: string;
    head?: { ref?: string; sha?: string };
    base?: { ref?: string; sha?: string };
    merged?: boolean;
    merged_at?: string | null;
    user?: { login?: string };
    assignee?: { login?: string } | null;
  };
  review?: {
    id?: number;
    state?: string;
    user?: { login?: string };
    body?: string | null;
  };
  comment?: {
    id?: number;
    body?: string;
    user?: { login?: string };
  };
  issue?: {
    number?: number;
    title?: string;
    state?: string;
    user?: { login?: string };
    assignee?: { login?: string } | null;
    milestone?: { id?: number } | null;
    created_at?: string;
    closed_at?: string | null;
  };
  ref?: string;
  before?: string;
  after?: string;
  pusher?: { name?: string };
  head_commit?: { id?: string; message?: string };
  size?: number;
  distinct_size?: number | null;
  repository?: {
    id?: number;
    name?: string;
    full_name?: string;
    owner?: { login?: string };
    private?: boolean;
  };
  check_run?: {
    id?: number;
    name?: string;
    status?: string;
    conclusion?: string | null;
    started_at?: string;
    completed_at?: string;
    head_sha?: string;
  };
  security_advisory?: {
    ghsa_id?: string;
    summary?: string;
    severity?: string;
    published_at?: string;
    updated_at?: string;
    withdrawn_at?: string | null;
  };
  alert?: {
    number?: number;
    url?: string;
    state?: string;
    dismissed_reason?: string | null;
    dismissed_at?: string | null;
    created_at?: string;
    resolution?: string | null;
    secret_type?: string;
    resolved_at?: string | null;
    rule?: { severity?: string; id?: string };
    tool?: { name?: string };
    dependency?: { package?: { name?: string } };
    security_advisory?: { ghsa_id?: string; severity?: string };
  };
};

export class TelemetryIngestion extends BaseAutomation<TelemetryPayload> {
  private eventName: string;
  private action: string | null;
  private deliveryId: string;

  constructor(env: Env, payload: TelemetryPayload, installationId: number | undefined, usePat: boolean, deliveryId: string, eventName: string, action: string | null) {
    super(env, payload, installationId, usePat);
    this.deliveryId = deliveryId;
    this.eventName = eventName;
    this.action = action;
  }

  async shouldExecute(): Promise<boolean> {
    return true; // Always execute telemetry for every webhook delivery
  }

  async execute(): Promise<void> {
    const db = getWebhooksDb(this.env.DB_WEBHOOKS);
    
    const insertPayload = async (table: Parameters<typeof db.insert>[0], specificFields: Record<string, unknown>) => {
      await db.insert(table).values({
        delivery_id: this.deliveryId,
        payload: this.payload,
        ...specificFields
      });
    };

    switch (this.eventName) {
      case 'pull_request': {
        const prPayload = this.payload;
        await insertPayload(eventTables.pullRequest, {
          pr_number: prPayload.pull_request?.number,
          title: prPayload.pull_request?.title,
          state: prPayload.pull_request?.state,
          head_ref: prPayload.pull_request?.head?.ref,
          head_sha: prPayload.pull_request?.head?.sha,
          base_ref: prPayload.pull_request?.base?.ref,
          base_sha: prPayload.pull_request?.base?.sha,
          merged: prPayload.pull_request?.merged,
          merged_at: prPayload.pull_request?.merged_at,
          author_login: prPayload.pull_request?.user?.login,
          assignee_login: prPayload.pull_request?.assignee?.login,
        });
        break;
      }
      case 'pull_request_review':
      case 'pull_request_review_comment': {
        const reviewPayload = this.payload;
        await insertPayload(eventTables.pullRequestReview, {
          pr_number: reviewPayload.pull_request?.number,
          review_id: reviewPayload.review?.id,
          state: reviewPayload.review?.state,
          author_login: reviewPayload.review?.user?.login,
          body: reviewPayload.review?.body || reviewPayload.comment?.body,
        });
        break;
      }
      case 'issues': {
        const issuesPayload = this.payload;
        await insertPayload(eventTables.issues, {
          issue_number: issuesPayload.issue?.number,
          title: issuesPayload.issue?.title,
          state: issuesPayload.issue?.state,
          author_login: issuesPayload.issue?.user?.login,
          assignee_login: issuesPayload.issue?.assignee?.login,
          milestone_id: issuesPayload.issue?.milestone?.id,
          created_at: issuesPayload.issue?.created_at,
          closed_at: issuesPayload.issue?.closed_at,
        });
        break;
      }
      case 'issue_comment': {
        const issueCommentPayload = this.payload;
        await insertPayload(eventTables.issueComment, {
          issue_number: issueCommentPayload.issue?.number,
          comment_id: issueCommentPayload.comment?.id,
          action: this.action,
          author_login: issueCommentPayload.comment?.user?.login,
          body: issueCommentPayload.comment?.body,
        });
        break;
      }
      case 'push': {
        const pushPayload = this.payload;
        await insertPayload(eventTables.push, {
          ref: pushPayload.ref,
          before_sha: pushPayload.before,
          after_sha: pushPayload.after,
          pusher_name: pushPayload.pusher?.name,
          head_commit_id: pushPayload.head_commit?.id,
          head_commit_message: pushPayload.head_commit?.message,
          size: pushPayload.size,
          distinct_size: pushPayload.distinct_size || null,
        });
        break;
      }
      case 'repository': {
        const repositoryPayload = this.payload;
        await insertPayload(eventTables.repository, {
          repo_id: repositoryPayload.repository?.id,
          name: repositoryPayload.repository?.name,
          full_name: repositoryPayload.repository?.full_name,
          owner_login: repositoryPayload.repository?.owner?.login,
          is_private: repositoryPayload.repository?.private,
        });
        break;
      }
      case 'check_run': {
        const checkRunPayload = this.payload;
        await insertPayload(eventTables.checkRun, {
          check_run_id: checkRunPayload.check_run?.id,
          name: checkRunPayload.check_run?.name,
          status: checkRunPayload.check_run?.status,
          conclusion: checkRunPayload.check_run?.conclusion,
          started_at: checkRunPayload.check_run?.started_at,
          completed_at: checkRunPayload.check_run?.completed_at,
          head_sha: checkRunPayload.check_run?.head_sha,
        });
        break;
      }
      case 'security_advisory': {
        const securityAdvisoryPayload = this.payload;
        await insertPayload(eventTables.securityAdvisory, {
          ghsa_id: securityAdvisoryPayload.security_advisory?.ghsa_id,
          summary: securityAdvisoryPayload.security_advisory?.summary,
          severity: securityAdvisoryPayload.security_advisory?.severity,
          published_at: securityAdvisoryPayload.security_advisory?.published_at,
          updated_at: securityAdvisoryPayload.security_advisory?.updated_at,
          withdrawn_at: securityAdvisoryPayload.security_advisory?.withdrawn_at,
        });
        break;
      }
      case 'code_scanning_alert': {
        const codeScanningPayload = this.payload;
        await insertPayload(eventTables.codeScanningAlert, {
          alert_number: codeScanningPayload.alert?.number,
          alert_url: codeScanningPayload.alert?.url,
          state: codeScanningPayload.alert?.state,
          resolution: codeScanningPayload.alert?.dismissed_reason || null,
          severity: codeScanningPayload.alert?.rule?.severity,
          rule_id: codeScanningPayload.alert?.rule?.id,
          tool_name: codeScanningPayload.alert?.tool?.name,
          created_at: codeScanningPayload.alert?.created_at,
        });
        break;
      }
      case 'dependabot_alert': {
        const dependabotPayload = this.payload;
        await insertPayload(eventTables.dependabotAlert, {
          alert_number: dependabotPayload.alert?.number,
          state: dependabotPayload.alert?.state,
          dependency_package: dependabotPayload.alert?.dependency?.package?.name,
          security_advisory_id: dependabotPayload.alert?.security_advisory?.ghsa_id,
          severity: dependabotPayload.alert?.security_advisory?.severity,
          dismissed_reason: dependabotPayload.alert?.dismissed_reason,
          dismissed_at: dependabotPayload.alert?.dismissed_at,
        });
        break;
      }
      case 'secret_scanning_alert': {
        const secretScanningPayload = this.payload;
        await insertPayload(eventTables.secretScanningAlert, {
          alert_number: secretScanningPayload.alert?.number,
          secret_type: secretScanningPayload.alert?.secret_type,
          resolution: secretScanningPayload.alert?.resolution,
          state: secretScanningPayload.alert?.state,
          created_at: secretScanningPayload.alert?.created_at,
          resolved_at: secretScanningPayload.alert?.resolved_at,
        });
        break;
      }
    }
  }
}
