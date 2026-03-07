import { App } from 'octokit';
import { withCompatOctokit } from "@/services/octokit/compat";
import { appendSignature } from "@/utils/github/signature";
import {
  runLeakPlumberWorkflow,
  shouldRunLeakPlumber,
} from "../workflows/leak-plumber";
import * as eventTables from "@/db/schemas/github/webhooks";
import type { WebhookHandlerContext } from '../types';

export async function handleRepository({ c, payload, appId, privateKey, insertPayload }: WebhookHandlerContext) {
  if (payload.action === 'created' && appId && privateKey && payload.installation?.id) {
       try {
          const app = new App({ appId: appId, privateKey: privateKey });
          const octokit = withCompatOctokit(await app.getInstallationOctokit(payload.installation.id));
          const workflowContent = `name: Jules Maintainer\non:\n  push:\n    branches: [ main, master ]\n  workflow_dispatch:\n\njobs:\n  notify-jules:\n    runs-on: ubuntu-latest\n    steps:\n      - name: Notify Core GitHub API\n        run: |\n          curl -X POST "\${{ secrets.CORE_API_URL }}/api/webhooks" \\\n          -H "Content-Type: application/json" \\\n          -H "X-GitHub-Event: push" \\\n          -d @$GITHUB_EVENT_PATH\n`;
          await octokit.rest.repos.createOrUpdateFileContents({
              owner: payload.repository?.owner?.login,
              repo: payload.repository?.name,
              path: '.github/workflows/jules-maintainer.yml',
              message: "ci: add jules-maintainer workflow",
              content: btoa(appendSignature(workflowContent, '.github/workflows/jules-maintainer.yml'))
          });
       } catch (err: any) {
           console.error(`[Jules] Failed to inject workflow:`, err);
       }
  }

  if (shouldRunLeakPlumber(payload)) {
    c.executionCtx.waitUntil(
      runLeakPlumberWorkflow({
        env: c.env,
        payload,
      }).catch((error) => {
        console.error('[LeakPlumber] Workflow failed:', error)
      })
    );
  }

  await insertPayload(eventTables.repository, {
    repository_id: payload.repository?.id,
    name: payload.repository?.name,
    full_name: payload.repository?.full_name,
    visibility: payload.repository?.visibility,
    owner_login: payload.repository?.owner?.login,
    description: payload.repository?.description,
  });
}
