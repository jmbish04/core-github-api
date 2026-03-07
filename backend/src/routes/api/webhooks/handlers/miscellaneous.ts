import * as eventTables from "@/db/schemas/github/webhooks";
import type { WebhookHandlerContext } from '../types';

export async function handleMiscellaneous({ payload, eventName, insertPayload }: WebhookHandlerContext) {
  switch (eventName) {
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
  }
}
