import { BaseAutomation } from '@/core/BaseAutomation';
import { getWebhooksDb } from '@db';
import * as eventTables from "@/db/schemas/github/webhooks";

export class TelemetryIngestion extends BaseAutomation {
  private eventName: string;
  private action: string | null;
  private deliveryId: string;

  constructor(env: Env, payload: unknown, installationId: number | undefined, usePat: boolean, deliveryId: string, eventName: string, action: string | null) {
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
    
    const insertPayload = async (table: unknown, specificFields: Record<string, unknown>) => {
      await db.insert(table).values({
        delivery_id: this.deliveryId,
        payload: this.payload,
        ...specificFields
      });
    };

    switch (this.eventName) {
      case 'pull_request':
        await insertPayload(eventTables.pullRequest, {
          pr_number: this.payload.pull_request?.number,
          title: this.payload.pull_request?.title,
          state: this.payload.pull_request?.state,
          head_ref: this.payload.pull_request?.head?.ref,
          head_sha: this.payload.pull_request?.head?.sha,
          base_ref: this.payload.pull_request?.base?.ref,
          base_sha: this.payload.pull_request?.base?.sha,
          merged: this.payload.pull_request?.merged,
          merged_at: this.payload.pull_request?.merged_at,
          author_login: this.payload.pull_request?.user?.login,
          assignee_login: this.payload.pull_request?.assignee?.login,
        });
        break;
      case 'pull_request_review':
      case 'pull_request_review_comment':
        await insertPayload(eventTables.pullRequestReview, {
          pr_number: this.payload.pull_request?.number,
          review_id: this.payload.review?.id,
          state: this.payload.review?.state,
          author_login: this.payload.review?.user?.login,
          body: this.payload.review?.body || this.payload.comment?.body,
        });
        break;
      case 'issues':
        await insertPayload(eventTables.issues, {
          issue_number: this.payload.issue?.number,
          title: this.payload.issue?.title,
          state: this.payload.issue?.state,
          author_login: this.payload.issue?.user?.login,
          assignee_login: this.payload.issue?.assignee?.login,
          milestone_id: this.payload.issue?.milestone?.id,
          created_at: this.payload.issue?.created_at,
          closed_at: this.payload.issue?.closed_at,
        });
        break;
      case 'issue_comment':
        await insertPayload(eventTables.issueComment, {
          issue_number: this.payload.issue?.number,
          comment_id: this.payload.comment?.id,
          action: this.action,
          author_login: this.payload.comment?.user?.login,
          body: this.payload.comment?.body,
        });
        break;
      case 'push':
        await insertPayload(eventTables.push, {
          ref: this.payload.ref,
          before_sha: this.payload.before,
          after_sha: this.payload.after,
          pusher_name: this.payload.pusher?.name,
          head_commit_id: this.payload.head_commit?.id,
          head_commit_message: this.payload.head_commit?.message,
          size: this.payload.size,
          distinct_size: this.payload.distinct_size || null,
        });
        break;
      case 'repository':
        await insertPayload(eventTables.repository, {
          repo_id: this.payload.repository?.id,
          name: this.payload.repository?.name,
          full_name: this.payload.repository?.full_name,
          owner_login: this.payload.repository?.owner?.login,
          is_private: this.payload.repository?.private,
        });
        break;
      case 'check_run':
        await insertPayload(eventTables.checkRun, {
          check_run_id: this.payload.check_run?.id,
          name: this.payload.check_run?.name,
          status: this.payload.check_run?.status,
          conclusion: this.payload.check_run?.conclusion,
          started_at: this.payload.check_run?.started_at,
          completed_at: this.payload.check_run?.completed_at,
          head_sha: this.payload.check_run?.head_sha,
        });
        break;
      case 'security_advisory':
        await insertPayload(eventTables.securityAdvisory, {
          ghsa_id: this.payload.security_advisory?.ghsa_id,
          summary: this.payload.security_advisory?.summary,
          severity: this.payload.security_advisory?.severity,
          published_at: this.payload.security_advisory?.published_at,
          updated_at: this.payload.security_advisory?.updated_at,
          withdrawn_at: this.payload.security_advisory?.withdrawn_at,
        });
        break;
      case 'code_scanning_alert':
        await insertPayload(eventTables.codeScanningAlert, {
          alert_number: this.payload.alert?.number,
          alert_url: this.payload.alert?.url,
          state: this.payload.alert?.state,
          resolution: this.payload.alert?.dismissed_reason || null,
          severity: this.payload.alert?.rule?.severity,
          rule_id: this.payload.alert?.rule?.id,
          tool_name: this.payload.alert?.tool?.name,
          created_at: this.payload.alert?.created_at,
        });
        break;
      case 'dependabot_alert':
        await insertPayload(eventTables.dependabotAlert, {
          alert_number: this.payload.alert?.number,
          state: this.payload.alert?.state,
          dependency_package: this.payload.alert?.dependency?.package?.name,
          security_advisory_id: this.payload.alert?.security_advisory?.ghsa_id,
          severity: this.payload.alert?.security_advisory?.severity,
          dismissed_reason: this.payload.alert?.dismissed_reason,
          dismissed_at: this.payload.alert?.dismissed_at,
        });
        break;
      case 'secret_scanning_alert':
        await insertPayload(eventTables.secretScanningAlert, {
          alert_number: this.payload.alert?.number,
          secret_type: this.payload.alert?.secret_type,
          resolution: this.payload.alert?.resolution,
          state: this.payload.alert?.state,
          created_at: this.payload.alert?.created_at,
          resolved_at: this.payload.alert?.resolved_at,
        });
        break;
    }
  }
}
