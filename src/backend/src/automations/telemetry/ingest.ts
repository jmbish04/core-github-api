import { z } from 'zod';
import { BaseAutomation, type AutomationMetadata } from '@/automations/core/BaseAutomation';
import { getWebhooksDb } from '@db';
import * as eventTables from '@/db/schemas/github/webhooks';

const TelemetryPayloadSchema = z.record(z.string(), z.unknown());

export class TelemetryIngestion extends BaseAutomation<z.infer<typeof TelemetryPayloadSchema>> {
  static readonly metadata: AutomationMetadata = {
    key: 'telemetry-ingestion',
    domain: 'telemetry',
    description: 'Persists delivery-specific webhook event slices into the telemetry database.',
    events: ['*'],
    alwaysOn: true,
    authPolicy: 'app',
  };

  shouldRun(): boolean {
    return TelemetryPayloadSchema.safeParse(this.payload).success;
  }

  async run(): Promise<void> {
    const db = getWebhooksDb(this.env.DB_WEBHOOKS);
    const payload = TelemetryPayloadSchema.parse(this.payload) as Record<string, any>;

    const insertPayload = async (table: unknown, specificFields: Record<string, unknown>) => {
      await db.insert(table as any).values({
        delivery_id: this.deliveryId,
        payload,
        ...specificFields,
      });
    };

    switch (this.eventName) {
      case 'pull_request':
        await insertPayload(eventTables.pullRequest, {
          pr_number: payload.pull_request?.number,
          title: payload.pull_request?.title,
          state: payload.pull_request?.state,
          head_ref: payload.pull_request?.head?.ref,
          head_sha: payload.pull_request?.head?.sha,
          base_ref: payload.pull_request?.base?.ref,
          base_sha: payload.pull_request?.base?.sha,
          merged: payload.pull_request?.merged,
          merged_at: payload.pull_request?.merged_at,
          author_login: payload.pull_request?.user?.login,
          assignee_login: payload.pull_request?.assignee?.login,
        });
        break;
      case 'pull_request_review':
        await insertPayload(eventTables.pullRequestReview, {
          review_id: payload.review?.id,
          pr_number: payload.pull_request?.number,
          state: payload.review?.state,
          author_login: payload.review?.user?.login,
          submitted_at: payload.review?.submitted_at,
          body: payload.review?.body,
        });
        break;
      case 'pull_request_review_comment':
        await insertPayload(eventTables.pullRequestReviewComment, {
          comment_id: payload.comment?.id,
          pr_number: payload.pull_request?.number,
          review_id: payload.comment?.pull_request_review_id || payload.review?.id,
          commit_id: payload.comment?.commit_id,
          path: payload.comment?.path,
          line: payload.comment?.line ?? payload.comment?.original_line ?? null,
          body: payload.comment?.body,
          author_login: payload.comment?.user?.login,
        });
        break;
      case 'issues':
        await insertPayload(eventTables.issues, {
          issue_number: payload.issue?.number,
          title: payload.issue?.title,
          state: payload.issue?.state,
          author_login: payload.issue?.user?.login,
          assignee_login: payload.issue?.assignee?.login,
          milestone_id: payload.issue?.milestone?.id,
          created_at: payload.issue?.created_at,
          closed_at: payload.issue?.closed_at,
        });
        break;
      case 'issue_comment':
        await insertPayload(eventTables.issueComment, {
          issue_number: payload.issue?.number,
          comment_id: payload.comment?.id,
          action: this.action,
          author_login: payload.comment?.user?.login,
          body: payload.comment?.body,
        });
        break;
      case 'push':
        await insertPayload(eventTables.push, {
          ref: payload.ref,
          before_sha: payload.before,
          after_sha: payload.after,
          pusher_name: payload.pusher?.name,
          head_commit_id: payload.head_commit?.id,
          head_commit_message: payload.head_commit?.message,
          size: payload.size,
          distinct_size: payload.distinct_size ?? null,
        });
        break;
      case 'repository':
        await insertPayload(eventTables.repository, {
          repository_id: payload.repository?.id,
          name: payload.repository?.name,
          full_name: payload.repository?.full_name,
          visibility: payload.repository?.visibility,
          owner_login: payload.repository?.owner?.login,
          description: payload.repository?.description,
        });
        break;
      case 'check_run':
        await insertPayload(eventTables.checkRun, {
          check_run_id: payload.check_run?.id,
          name: payload.check_run?.name,
          status: payload.check_run?.status,
          conclusion: payload.check_run?.conclusion,
          started_at: payload.check_run?.started_at,
          completed_at: payload.check_run?.completed_at,
          head_sha: payload.check_run?.head_sha,
          app_id: payload.check_run?.app?.id,
        });
        break;
      case 'workflow_run':
        await insertPayload(eventTables.workflowRun, {
          run_id: payload.workflow_run?.id,
          workflow_id: payload.workflow_run?.workflow_id,
          workflow_name: payload.workflow_run?.name,
          head_branch: payload.workflow_run?.head_branch,
          head_sha: payload.workflow_run?.head_sha,
          status: payload.workflow_run?.status,
          conclusion: payload.workflow_run?.conclusion,
          event: payload.workflow_run?.event,
          run_attempt: payload.workflow_run?.run_attempt,
        });
        break;
      case 'commit_comment':
        await insertPayload(eventTables.commitComment, {
          comment_id: payload.comment?.id,
          commit_id: payload.comment?.commit_id,
          body: payload.comment?.body,
          position: payload.comment?.position,
          line: payload.comment?.line,
          path: payload.comment?.path,
          author_login: payload.comment?.user?.login,
        });
        break;
      case 'create':
        await insertPayload(eventTables.create, {
          ref: payload.ref,
          ref_type: payload.ref_type,
          master_branch: payload.master_branch,
          pusher_type: payload.pusher_type,
          description: payload.description,
        });
        break;
      case 'custom_property':
        await insertPayload(eventTables.customProperty, {
          definition_id: payload.definition?.id,
          property_name: payload.definition?.property_name,
          value_type: payload.definition?.value_type,
          default_value: payload.definition?.default_value,
          required: payload.definition?.required,
        });
        break;
      case 'custom_property_values':
        await insertPayload(eventTables.customPropertyValues, {
          repository_id: payload.repository?.id,
          repository_name: payload.repository?.name,
          organization_id: payload.organization?.id,
          new_values: payload.new_property_values,
        });
        break;
      case 'delete':
        await insertPayload(eventTables.deleteEvent, {
          ref: payload.ref,
          ref_type: payload.ref_type,
          pusher_type: payload.pusher_type,
        });
        break;
      case 'fork':
        await insertPayload(eventTables.fork, {
          forkee_id: payload.forkee?.id,
          forkee_name: payload.forkee?.name,
          forkee_full_name: payload.forkee?.full_name,
          forkee_owner_login: payload.forkee?.owner?.login,
        });
        break;
      case 'label':
        await insertPayload(eventTables.label, {
          label_id: payload.label?.id,
          name: payload.label?.name,
          color: payload.label?.color,
          description: payload.label?.description,
        });
        break;
      case 'milestone':
        await insertPayload(eventTables.milestone, {
          milestone_id: payload.milestone?.id,
          number: payload.milestone?.number,
          title: payload.milestone?.title,
          state: payload.milestone?.state,
          due_on: payload.milestone?.due_on,
        });
        break;
      case 'star':
        await insertPayload(eventTables.star, {
          starred_at: payload.starred_at,
          repository_id: payload.repository?.id,
          sender_login: payload.sender?.login,
        });
        break;
      case 'status':
        await insertPayload(eventTables.status, {
          sha: payload.sha,
          state: payload.state,
          context: payload.context,
          description: payload.description,
          target_url: payload.target_url,
          commit_url: payload.commit?.url,
        });
        break;
      case 'watch':
        await insertPayload(eventTables.watch, {
          repository_id: payload.repository?.id,
          sender_login: payload.sender?.login,
          action: this.action,
        });
        break;
      case 'security_advisory':
        await insertPayload(eventTables.securityAdvisory, {
          ghsa_id: payload.security_advisory?.ghsa_id,
          summary: payload.security_advisory?.summary,
          severity: payload.security_advisory?.severity,
          published_at: payload.security_advisory?.published_at,
          updated_at: payload.security_advisory?.updated_at,
          withdrawn_at: payload.security_advisory?.withdrawn_at,
        });
        break;
      case 'code_scanning_alert':
        await insertPayload(eventTables.codeScanningAlert, {
          alert_number: payload.alert?.number,
          alert_url: payload.alert?.url,
          state: payload.alert?.state,
          resolution: payload.alert?.dismissed_reason || null,
          severity: payload.alert?.rule?.severity,
          rule_id: payload.alert?.rule?.id,
          tool_name: payload.alert?.tool?.name,
          created_at: payload.alert?.created_at,
        });
        break;
      case 'dependabot_alert':
        await insertPayload(eventTables.dependabotAlert, {
          alert_number: payload.alert?.number,
          state: payload.alert?.state,
          dependency_package: payload.alert?.dependency?.package?.name,
          security_advisory_id: payload.alert?.security_advisory?.ghsa_id,
          severity: payload.alert?.security_advisory?.severity,
          dismissed_reason: payload.alert?.dismissed_reason,
          dismissed_at: payload.alert?.dismissed_at,
        });
        break;
      case 'secret_scanning_alert':
        await insertPayload(eventTables.secretScanningAlert, {
          alert_number: payload.alert?.number,
          secret_type: payload.alert?.secret_type,
          resolution: payload.alert?.resolution,
          state: payload.alert?.state,
          created_at: payload.alert?.created_at,
          resolved_at: payload.alert?.resolved_at,
        });
        break;
      default:
        break;
    }

    await this.logExecution('success', `Telemetry ingested for ${this.eventName}.`);
  }
}
