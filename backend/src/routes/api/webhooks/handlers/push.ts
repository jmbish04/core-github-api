import { App } from 'octokit';
import { withCompatOctokit } from "@/services/octokit/compat";
import { GardenerOrchestrator } from "../workflows/gardener";
import { JulesService } from "@/services/jules/jules";
import { JULES_STANDARDS } from "@/config/jules-standards";
import * as eventTables from "@/db/schemas/github/webhooks";
import type { WebhookHandlerContext } from '../types';

export async function handlePush({ c, payload, appId, privateKey, insertPayload }: WebhookHandlerContext) {
  // Trigger Stats Update on Push (from target file)
  c.executionCtx.waitUntil(
      import('@services/stats-updater').then(m => 
          m.updateRepoStats(c.env, payload.repository!.owner.login, payload.repository!.name)
      )
  );

  if (payload.ref === `refs/heads/${payload.repository?.default_branch}`) {
    try {
        const julesService = JulesService.getInstance(c.env);
        await julesService.startSession({
            prompt: `New Push detected to ${payload.repository?.full_name}. Analyze this push for standards compliance.\n\n${JULES_STANDARDS}`,
            repo: {
                owner: payload.repository?.owner?.login,
                repo: payload.repository?.name,
                branch: payload.repository?.default_branch
            }
        });
    } catch (err: any) {
        console.error('[Jules] Failed to start analysis:', err);
    }

    try {
      if (payload.installation?.id && appId && privateKey) {
        const app = new App({ appId: appId, privateKey: privateKey });
        const octokit = withCompatOctokit(await app.getInstallationOctokit(payload.installation.id));
        c.executionCtx.waitUntil(GardenerOrchestrator.handlePushEvent(c, octokit, payload));
      }
    } catch (err) {
      console.error('[Gardener] Failed to launch:', err);
    }
  }

  await insertPayload(eventTables.push, {
    ref: payload.ref,
    before_sha: payload.before,
    after_sha: payload.after,
    pusher_name: payload.pusher?.name,
    head_commit_id: payload.head_commit?.id,
    head_commit_message: payload.head_commit?.message,
    size: payload.size,
    distinct_size: payload.distinct_size || null,
  });
}
