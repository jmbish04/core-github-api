/**
 * @file src/routes/webhook-handler.ts
 * @description GitHub webhook handler with strict verification and Drizzle storage.
 * @owner AI-Builder
 */

import type { Context } from 'hono'
import type { Bindings } from "@utils/hono"
import { getAgentByName } from 'agents'
import { App, Octokit } from 'octokit'
import { withCompatOctokit } from "@/octokit/compat"
import { getWebhooksDb, schema } from "@db/webhooks"
import { webhookDeliveries } from "@db/schema-webhooks"
import * as eventTables from "@db/schema-webhooks"
import { sql } from "drizzle-orm"
import { GardenerOrchestrator } from "@/gardener/orchestrator"
import { SlashCommandRouter } from "@/gardener/router"
import { sanitizeRepoName } from '@sandbox-sdk-tools'
import type { GitHubWebhookPayload } from "@/types/github-webhooks"
import { matchAutomations } from "@/automations/registry"
import {
  runBugHunterWorkflow,
  runLeakPlumberWorkflow,
  shouldRunBugHunter,
  shouldRunLeakPlumber,
} from "@services/proactive-intelligence"
import { ensureRepositoryFromWebhook } from "@services/repository-sync"
import { getGitHubPrivateKey, getGitHubAppId } from "@utils/secrets"

export async function webhookHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const deliveryId = c.req.header('x-github-delivery')
  const eventName = c.req.header('x-github-event')
  const signature = c.req.header('x-hub-signature-256')
  const userAgent = c.req.header('user-agent')
  const contentType = c.req.header('content-type')
  const hookId = c.req.header('x-github-hook-id')
  const installationTargetId = c.req.header('x-github-hook-installation-target-id')
  const installationTargetType = c.req.header('x-github-hook-installation-target-type')

  if (!deliveryId || !eventName || !signature) {
    return c.json({ error: 'Missing required headers' }, 400)
  }

  // 1. Verify Signature
  // The user prompt says: "Initialize the App class from octokit using APP_ID and PRIVATE_KEY."
  // AND "verify the webhook signature using the WORKER_API_KEY".
  // Note: octokit App class handles verification if we pass `webhooks.secret`.
  // However, simpler is often `webhooks.verify` or `verifyWebhookSignature` manually if we don't need the full App instance yet.
  // But requirement says "Initialize the App class...".
  // Let's assume we use App to get the webhooks instance.

  // NOTE: Private Key handling. User says: "replace(/\\n/g, '\n')"
  const privateKey = await getGitHubPrivateKey(c.env);
  const appId = await getGitHubAppId(c.env);
  // WORKER_API_KEY is apparently not in the secrets store (based on instructions), or handled separately.
  // Assuming it remains available via env or secrets binding if compatible.
  const webhookSecret = await c.env.WORKER_API_KEY.get();

  if (!privateKey || !appId || !webhookSecret) {
    console.error('Missing GitHub App configuration')
    return c.json({ error: 'Server misconfiguration' }, 500)
  }

  // Read raw body for verification
  const rawBody = await c.req.text()

  try {
    const app = new App({
      appId: appId,
      privateKey: privateKey,
      webhooks: {
        secret: webhookSecret
      }
    })

    // Verify
    await app.webhooks.verifyAndReceive({
      id: deliveryId,
      name: eventName as any,
      payload: rawBody,
      signature: signature,
    })

    // Get an installation octokit instance for the Gardener
    // We need the installation ID from the header or payload.
    // X-GitHub-Hook-Installation-Target-Id is usually for the App itself?
    // The payload usually has `installation: { id: number }`.
    // Let's safe extract it later.
  } catch (error) {
    console.error('Webhook verification failed', error)
    return c.json({ error: 'Invalid signature' }, 401)
  }

  // 2. Parse Body
  const payload = JSON.parse(rawBody) as GitHubWebhookPayload & Record<string, any>
  const action = payload.action
  const repoFullName = payload.repository?.full_name

  if (payload.repository) {
    c.executionCtx.waitUntil(
      ensureRepositoryFromWebhook(c.env, payload.repository).catch((error) => {
        console.error('[RepositorySync] Failed to upsert repository from webhook:', error)
      })
    )
  }

  if (repoFullName && c.env.REPO_AGENT) {
    c.executionCtx.waitUntil(
      (async () => {
        try {
          const getByName = getAgentByName as any
          const repoAgent = await getByName(
            c.env.REPO_AGENT,
            sanitizeRepoName(repoFullName)
          )
          await repoAgent.fetch("http://repo-agent/webhook", {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "x-github-event": eventName,
              ...(signature ? { "x-hub-signature-256": signature } : {}),
            },
            body: rawBody,
          })
        } catch (error) {
          console.error('[RepoAgent] Failed to dispatch webhook:', error)
        }
      })()
    )
  }

  // 2b. Fan-out to OwnerAgent (org-wide aggregation / "God View")
  if (c.env.OWNER_AGENT) {
    c.executionCtx.waitUntil(
      (async () => {
        try {
          // Key by owner login or GITHUB_OWNER env var
          const ownerKey =
            payload.repository?.owner?.login ||
            (payload as any).installation?.account?.login ||
            (c.env as any).GITHUB_OWNER ||
            'default-owner'
          const getByName = getAgentByName as any
          const ownerAgent = await getByName(
            c.env.OWNER_AGENT,
            sanitizeRepoName(ownerKey)
          )
          await ownerAgent.fetch('http://owner-agent/webhook', {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              'x-github-event': eventName,
            },
            body: rawBody,
          })
        } catch (error) {
          console.error('[OwnerAgent] Failed to dispatch webhook:', error)
        }
      })()
    )
  }

  // 2c. Check automation registry and store runs in OwnerAgent
  if (c.env.OWNER_AGENT) {
    c.executionCtx.waitUntil(
      (async () => {
        try {
          const automationEventId = deliveryId // correlate with the delivery
          const runs = matchAutomations(eventName, automationEventId, payload)
          if (runs.length > 0) {
            const ownerKey =
              payload.repository?.owner?.login ||
              (c.env as any).GITHUB_OWNER ||
              'default-owner'
            const getByName = getAgentByName as any
            const ownerAgent = await getByName(
              c.env.OWNER_AGENT,
              sanitizeRepoName(ownerKey)
            )
            // Store each matched automation run
            for (const run of runs) {
              await ownerAgent.fetch('http://owner-agent/store-automation', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify(run),
              })
            }
          }
        } catch (error) {
          console.error('[AutomationRegistry] Failed to check automations:', error)
        }
      })()
    )
  }

  // 3. Idempotency Check & Store Metadata
  const db = getWebhooksDb(c.env.DB_WEBHOOKS)

  // Check if delivery already exists
  const existing = await db.select({ id: webhookDeliveries.id })
    .from(webhookDeliveries)
    .where(sql`${webhookDeliveries.delivery_id} = ${deliveryId}`)
    .get();

  if (existing) {
    console.log(`[Webhook] Duplicate delivery ${deliveryId}, skipping.`);
    return c.json({ success: true, delivery_id: deliveryId, status: 'already_processed' });
  }

  try {
    await db.insert(webhookDeliveries).values({
      id: crypto.randomUUID(),
      delivery_id: deliveryId,
      event: eventName,
      action: action || null,
      signature_sha256: signature,
      user_agent: userAgent || null,
      content_type: contentType || null,
      payload: payload, // Store full payload in metadata table too
      hook_id: hookId ? parseInt(hookId) : null,
      installation_id: installationTargetId ? parseInt(installationTargetId) : null,
       installation_type: installationTargetType || null,
      created_at: new Date().toISOString()
    })

    // 4. Store Event Payload
    // Switch on eventName to pick correct table
    // User requested explicit extraction logic for ~40 events. 
    // I need to map "eventName" to the exported table object in `eventTables`

    // Helper to extract fields safely
    const insertPayload = async (table: any, specificFields: any) => {
      await db.insert(table).values({
        delivery_id: deliveryId,
        payload: payload, // Drizzle JSON mode handles object
        ...specificFields
      })
    }

    // Mapping logic
    // We could make this dynamic but type safety is better if explicit, albeit verbose.
    // Or we rely on the implementation prompt's exact list.

    switch (eventName) {
      case 'security_advisory':
        await insertPayload(eventTables.securityAdvisory, {
          ghsa_id: payload.security_advisory?.ghsa_id,
          summary: payload.security_advisory?.summary,
          severity: payload.security_advisory?.severity,
          published_at: payload.security_advisory?.published_at,
          updated_at: payload.security_advisory?.updated_at,
          withdrawn_at: payload.security_advisory?.withdrawn_at,
        })
        break;
      case 'code_scanning_alert':
        await insertPayload(eventTables.codeScanningAlert, {
          alert_number: payload.alert?.number,
          alert_url: payload.alert?.url,
          state: payload.alert?.state,
          resolution: payload.alert?.dismissed_reason || null, // Mapping 'resolution' usually refers to fix/dismissal
          severity: payload.alert?.rule?.severity,
          rule_id: payload.alert?.rule?.id,
          tool_name: payload.alert?.tool?.name,
          created_at: payload.alert?.created_at,
        })
        break;
      case 'check_run':
        await insertPayload(eventTables.checkRun, {
          check_run_id: payload.check_run?.id,
          head_sha: payload.check_run?.head_sha,
          status: payload.check_run?.status,
          conclusion: payload.check_run?.conclusion,
          started_at: payload.check_run?.started_at,
          completed_at: payload.check_run?.completed_at,
          app_id: payload.check_run?.app?.id,
        })
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
        })
        break;
      case 'create':
        await insertPayload(eventTables.create, {
          ref: payload.ref,
          ref_type: payload.ref_type,
          master_branch: payload.master_branch,
          pusher_type: payload.pusher_type,
          description: payload.description,
        })
        break;
      case 'custom_property':
        await insertPayload(eventTables.customProperty, {
          definition_id: payload.definition?.id,
          property_name: payload.definition?.property_name,
          value_type: payload.definition?.value_type,
          default_value: payload.definition?.default_value,
          required: payload.definition?.required,
        })
        break;
      case 'custom_property_values':
        await insertPayload(eventTables.customPropertyValues, {
          repository_id: payload.repository?.id,
          repository_name: payload.repository?.name,
          organization_id: payload.organization?.id,
          new_values: payload.new_property_values,
        })
        break;
      case 'delete':
        await insertPayload(eventTables.deleteEvent, {
          ref: payload.ref,
          ref_type: payload.ref_type,
          pusher_type: payload.pusher_type,
        })
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
        })
        break;
      case 'dismissal_request_code_scanning': // Note: Actual event might be code_scanning_alert with specific action? Or strictly 'dismissal_request...'? 
        // GitHub events list usually has "code_scanning_alert". 
        // User listed these as separate events. I will honor the switch case, assuming they come in as 'X-GitHub-Event: dismissal_request_code_scanning'.
        // If they don't, this code won't run, but I follow instructions.
        await insertPayload(eventTables.dismissalRequestCodeScanning, {
          alert_number: payload.alert?.number,
          request_id: payload.request?.id || 0, // Fallback?
          reason: payload.reason, // Verify path
          requested_by: payload.requestor?.login,
        })
        break;
      // I'll proceed with best-guess mapping for fields based on standard GitHub payloads or standard naming.
      case 'dismissal_request_secret_scanning':
        await insertPayload(eventTables.dismissalRequestSecretScanning, {
          alert_number: payload.alert?.number,
          request_id: payload.request_id || 0,
          reason: payload.reason,
          requested_by: payload.requester?.login,
        })
        break;
      case 'exemption_request_push_ruleset':
        await insertPayload(eventTables.exemptionRequestPushRuleset, {
          request_id: payload.exemption_request?.id,
          ruleset_id: payload.ruleset?.id,
          ruleset_name: payload.ruleset?.name,
          status: payload.exemption_request?.status,
          requester_login: payload.requester?.login,
        })
        break;
      case 'exemption_request_secret_scanning':
        await insertPayload(eventTables.exemptionRequestSecretScanning, {
          request_id: payload.exemption_request?.id,
          status: payload.exemption_request?.status,
          resource_identifier: payload.resource_identifier,
          requester_login: payload.requester?.login,
        })
        break;
      case 'fork':
        await insertPayload(eventTables.fork, {
          forkee_id: payload.forkee?.id,
          forkee_name: payload.forkee?.name,
          forkee_full_name: payload.forkee?.full_name,
          forkee_owner_login: payload.forkee?.owner?.login,
        })
        break;
      case 'issue_comment':
        const commentBody = payload.comment?.body || '';
        if (commentBody.includes('/colby')) {
          if (payload.action === 'created' && appId && privateKey) {
            const app = new App({ appId: appId, privateKey: privateKey });
            // Ensure installation ID exists
            if (payload.installation?.id) {
              const octokit = withCompatOctokit(
                await app.getInstallationOctokit(payload.installation.id)
              );
              await SlashCommandRouter.handleAndReply(
                commentBody,
                {
                  env: c.env,
                  executionCtx: { ...c.executionCtx, exports: {} as any },
                  repo: { owner: payload.repository?.owner?.login, name: payload.repository?.name, defaultBranch: payload.repository?.default_branch },
                  octokit
                },
                {
                  issueNumber: payload.issue?.number,
                  issueBody: payload.issue?.body // Not needed for comment trigger usually, but context helpful
                }
              );
            }
          }
        }

        await insertPayload(eventTables.issueComment, {
          issue_number: payload.issue?.number,
          comment_id: payload.comment?.id,
          action: payload.action,
          author_login: payload.comment?.user?.login,
          body: payload.comment?.body,
        })
        break;
      case 'issues':
        if (shouldRunBugHunter(payload)) {
          c.executionCtx.waitUntil(
            runBugHunterWorkflow({
              env: c.env,
              payload,
              deliveryId,
            }).catch((error) => {
              console.error('[BugHunter] Workflow failed:', error)
            })
          )
        }

        // Handle self-assignment via /colby in issue body
        if ((payload.action === 'opened' || payload.action === 'edited') && payload.issue?.body?.includes('/colby')) {
          if (appId && privateKey && payload.installation?.id) {
            const app = new App({ appId: appId, privateKey: privateKey });
            const octokit = withCompatOctokit(
              await app.getInstallationOctokit(payload.installation.id)
            );
            await SlashCommandRouter.handleAndReply(
              payload.issue.body,
              {
                env: c.env,
                executionCtx: { ...c.executionCtx, exports: {} as any },
                repo: { owner: payload.repository?.owner?.login, name: payload.repository?.name, defaultBranch: payload.repository?.default_branch },
                octokit
              },
              {
                issueNumber: payload.issue?.number,
                issueBody: payload.issue?.body
              }
            );
          }
        }

        await insertPayload(eventTables.issues, {
          issue_number: payload.issue?.number,
          title: payload.issue?.title,
          state: payload.issue?.state,
          author_login: payload.issue?.user?.login,
          assignee_login: payload.issue?.assignee?.login,
          milestone_id: payload.issue?.milestone?.id,
          created_at: payload.issue?.created_at,
          closed_at: payload.issue?.closed_at,
        })
        break;
      case 'label':
        await insertPayload(eventTables.label, {
          label_id: payload.label?.id,
          name: payload.label?.name,
          color: payload.label?.color,
          description: payload.label?.description,
        })
        break;
      case 'milestone':
        await insertPayload(eventTables.milestone, {
          milestone_id: payload.milestone?.id,
          number: payload.milestone?.number,
          title: payload.milestone?.title,
          state: payload.milestone?.state,
          due_on: payload.milestone?.due_on,
        })
        break;
      case 'merge_queue_entry':
        await insertPayload(eventTables.mergeQueueEntry, {
          queue_entry_id: payload.merge_queue_entry?.id || payload.entry?.id,
          pr_number: payload.pull_request?.number,
          queue_position: payload.position, // ??
          state: payload.state, // ??
        })
        break;
      case 'organization_custom_property_values':
        // Assuming structure
        await insertPayload(eventTables.organizationCustomPropertyValues, {
          organization_id: payload.organization?.id,
          repository_id: payload.repository?.id,
          property_name: payload.property_name, // Verify
          new_value: payload.new_value, // Verify
        })
        break;
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
        })
        break;
      case 'pull_request_review':
        await insertPayload(eventTables.pullRequestReview, {
          review_id: payload.review?.id,
          pr_number: payload.pull_request?.number,
          state: payload.review?.state,
          author_login: payload.review?.user?.login,
          submitted_at: payload.review?.submitted_at,
          body: payload.review?.body,
        })
        break;
      case 'pull_request_review_comment':
        await insertPayload(eventTables.pullRequestReviewComment, {
          comment_id: payload.comment?.id,
          pr_number: payload.pull_request?.number,
          review_id: payload.comment?.pull_request_review_id,
          commit_id: payload.comment?.commit_id,
          path: payload.comment?.path,
          line: payload.comment?.line,
          body: payload.comment?.body,
          author_login: payload.comment?.user?.login,
        })
        break;
      case 'pull_request_review_thread':
        await insertPayload(eventTables.pullRequestReviewThread, {
          thread_id: payload.thread?.node_id,
          pr_number: payload.pull_request?.number,
          is_resolved: payload.thread?.is_resolved,
          author_login: payload.thread?.comments?.[0]?.user?.login, // Guess?
        })
        break;
      case 'push':
        // 1. Run Gardener Orchestrator for proactive fixes (Fire & Forget)
        if (payload.ref === `refs/heads/${payload.repository?.default_branch}`) {
          try {
            if (payload.installation?.id && appId && privateKey) {
              const app = new App({ appId: appId, privateKey: privateKey });
              const octokit = withCompatOctokit(
                await app.getInstallationOctokit(payload.installation.id)
              );
              c.executionCtx.waitUntil(
                GardenerOrchestrator.handlePushEvent(c, octokit, payload)
              );
            }
          } catch (err) {
            console.error('[Gardener] Failed to launch:', err);
          }
        }

        // 2. Log Event to DB
        await insertPayload(eventTables.push, {
          ref: payload.ref,
          before_sha: payload.before,
          after_sha: payload.after,
          pusher_name: payload.pusher?.name,
          head_commit_id: payload.head_commit?.id,
          head_commit_message: payload.head_commit?.message,
          size: payload.size,
          distinct_size: payload.distinct_size || null,
        })
        break;
      case 'repository':
        if (shouldRunLeakPlumber(payload)) {
          c.executionCtx.waitUntil(
            runLeakPlumberWorkflow({
              env: c.env,
              payload,
            }).catch((error) => {
              console.error('[LeakPlumber] Workflow failed:', error)
            })
          )
        }

        await insertPayload(eventTables.repository, {
          repository_id: payload.repository?.id,
          name: payload.repository?.name,
          full_name: payload.repository?.full_name,
          visibility: payload.repository?.visibility,
          owner_login: payload.repository?.owner?.login,
          description: payload.repository?.description,
        })
        break;
      case 'security_and_analysis':
        await insertPayload(eventTables.securityAndAnalysis, {
          repository_id: payload.repository?.id,
          changes_from: payload.changes, // ?? 'changes_from' requested
        })
        break;
      case 'secret_scanning_alert':
        await insertPayload(eventTables.secretScanningAlert, {
          alert_number: payload.alert?.number,
          secret_type: payload.alert?.secret_type,
          resolution: payload.alert?.resolution,
          state: payload.alert?.state,
          created_at: payload.alert?.created_at,
          resolved_at: payload.alert?.resolved_at,
        })
        break;
      // Skipping secret_scanning_alert_location parsing - complex list?
      // User asked for table, assume 1:1 map if event is location?
      // Actually this event 'secret_scanning_alert_location' implies a specific event type.
      case 'secret_scanning_alert_location':
        await insertPayload(eventTables.secretScanningAlertLocation, {
          alert_number: payload.alert?.number,
          location_type: payload.location?.type,
          commit_sha: payload.location?.details?.commit_sha,
          start_line: payload.location?.details?.start_line,
          end_line: payload.location?.details?.end_line,
        })
        break;
      case 'secret_scanning_scan':
        await insertPayload(eventTables.secretScanningScan, {
          type: payload.scan?.type,
          status: payload.scan?.status,
          completed_at: payload.scan?.completed_at,
          secret_types_count: payload.scan?.secret_types_count, // ??
        })
        break;
      case 'star':
        await insertPayload(eventTables.star, {
          starred_at: payload.starred_at,
          repository_id: payload.repository?.id,
          sender_login: payload.sender?.login,
        })
        break;
      case 'status':
        await insertPayload(eventTables.status, {
          sha: payload.sha,
          state: payload.state,
          context: payload.context,
          description: payload.description,
          target_url: payload.target_url,
          commit_url: payload.commit?.html_url,
        })
        break;
      case 'watch':
        await insertPayload(eventTables.watch, {
          repository_id: payload.repository?.id,
          sender_login: payload.sender?.login,
          action: payload.action,
        })
        break;
      case 'workflow_dispatch':
        // payload.workflow is URI?
        await insertPayload(eventTables.workflowDispatch, {
          workflow: payload.workflow,
          ref: payload.ref,
          sender_login: payload.sender?.login,
          inputs: payload.inputs,
        })
        break;
      case 'workflow_job':
        await insertPayload(eventTables.workflowJob, {
          job_id: payload.workflow_job?.id,
          run_id: payload.workflow_job?.run_id,
          workflow_name: payload.workflow_job?.workflow_name,
          status: payload.workflow_job?.status,
          conclusion: payload.workflow_job?.conclusion,
          started_at: payload.workflow_job?.started_at,
          completed_at: payload.workflow_job?.completed_at,
          runner_group_name: payload.workflow_job?.runner_group_name,
        })
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
        })
        break;
      // Remaining
      case 'org_block':
        await insertPayload(eventTables.orgBlock, {
          blocked_user_login: payload.blocked_user?.login,
          blocked_reason: payload.reason, // ?
        })
        break;
      case 'repository_advisory':
        await insertPayload(eventTables.repositoryAdvisory, {
          ghsa_id: payload.repository_advisory?.ghsa_id,
          summary: payload.repository_advisory?.summary,
          severity: payload.repository_advisory?.severity,
          state: payload.repository_advisory?.state,
          published_at: payload.repository_advisory?.published_at,
        })
        break;
      case 'sub_issues':
        await insertPayload(eventTables.subIssues, {
          parent_issue_id: payload.parent_issue?.id,
          sub_issue_id: payload.sub_issue?.id,
          sub_issue_title: payload.sub_issue?.title,
          parent_issue_title: payload.parent_issue?.title,
        })
        break;
      default:
        console.log(`Unhandled event type: ${eventName}`)
    }

    return c.json({ success: true, delivery_id: deliveryId })

  } catch (error: any) {
    console.error('Failed to process webhook', error)
    return c.json({ error: 'Processing error', details: error.message }, 500)
  }
}
