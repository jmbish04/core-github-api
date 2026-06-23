import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { createAgent, routeToAgent } from '../honi';
import { Agent, run } from '@openai/agents';
import { setupOpenAIAgentClient, getJulesClient } from '../../providers';
import { Octokit } from '@octokit/rest';

const PrManagerTaskSchema = z.object({
  owner: z.string(),
  repo: z.string(),
  pullNumber: z.number().optional(),
});

const runtime = createAgent<Env>({
  name: "PrManagerAgent",
  description: "Autonomous agent for managing and resolving PR conflicts.",

  async onTask(task: z.infer<typeof PrManagerTaskSchema>, { env, ctx: _ctx }: { env: Env, ctx: any }) {
    return {
      status: "success",
      message: "PR Manager task executed."
    };
  }
});

export class PrManagerAgent extends runtime.Agent {
  async fetch(request: Request) {
    const url = new URL(request.url);
    if (url.pathname === '/scheduled') {
      await this.scheduled();
      return new Response('OK');
    }
    if (url.pathname === '/api/jobs') {
      await this.onStart();
      const results = this.sql.prepare("SELECT * FROM pr_manager_jobs ORDER BY created_at DESC LIMIT 50").all();
      return new Response(JSON.stringify(results), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
    return super.fetch(request);
  }

  async onStart() {
    // DO SQLite state management init
    this.sql.prepare(`
      CREATE TABLE IF NOT EXISTS pr_manager_jobs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        owner TEXT NOT NULL,
        repo TEXT NOT NULL,
        pull_number INTEGER NOT NULL,
        status TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `).run();
  }

  async scheduled() {
    console.log('[PrManagerAgent] Running scheduled PR scan...');
    // Ensure agent state is initialized
    await this.onStart();
    const owner = this.env.TEST_REPO_OWNER || 'cloudflare';
    const repo = this.env.TEST_REPO_NAME || 'core-github-api';

    await setupOpenAIAgentClient(this.env, "workers-ai");

    const conflictResolver = new Agent({
      name: "ConflictResolver",
      instructions: `You are an expert developer resolving Git merge conflicts.
You will be provided with the base branch file content and the PR branch file content for a conflicted file.
Output a JSON object with:
- "confidence": A number from 0 to 1 indicating your confidence in resolving the conflict safely.
- "resolvedContent": The full raw text of the file with the conflict correctly resolved. Do not wrap in markdown code blocks.`,
      model: "workers-ai/@cf/openai/gpt-oss-120b",
    });

    const octokit = new Octokit({ auth: this.env.GITHUB_TOKEN });

    try {
      const pullsResponse = await octokit.rest.pulls.list({ owner, repo, state: 'open' });

      for (const pr of pullsResponse.data) {
        console.log(`[PrManagerAgent] Checking PR #${pr.number}`);
        const prDetails = await octokit.rest.pulls.get({ owner, repo, pull_number: pr.number });

        if (prDetails.data.mergeable_state === 'dirty') {
          console.log(`[PrManagerAgent] Found conflict in PR #${pr.number}`);

          const filesResponse = await octokit.rest.pulls.listFiles({ owner, repo, pull_number: pr.number });
          const baseSha = prDetails.data.base.sha;
          const headSha = prDetails.data.head.sha;
          const headRef = prDetails.data.head.ref;

          let allResolved = true;
          let newTreeItems: any[] = [];

          for (const file of filesResponse.data) {
            // Simplified: we'll only try to resolve files if they are potentially conflicted
            if (file.status !== 'modified') continue;

            const baseContentRes = await octokit.rest.repos.getContent({ owner, repo, path: file.filename, ref: baseSha }).catch(() => null);
            const headContentRes = await octokit.rest.repos.getContent({ owner, repo, path: file.filename, ref: headSha }).catch(() => null);

            if (!baseContentRes || !headContentRes || !('content' in baseContentRes.data) || !('content' in headContentRes.data)) continue;

            const baseContent = Buffer.from(baseContentRes.data.content, 'base64').toString('utf-8');
            const headContent = Buffer.from(headContentRes.data.content, 'base64').toString('utf-8');

            const resolutionAttempt = await run(conflictResolver, `Analyze conflicts for ${file.filename}.\n\nBase Branch Content:\n${baseContent}\n\nPR Branch Content:\n${headContent}`);

            let confidence = 0;
            let resolvedContent = "";
            try {
              const outputString = typeof resolutionAttempt.finalOutput === 'string' ? resolutionAttempt.finalOutput : JSON.stringify(resolutionAttempt.finalOutput);
              const jsonMatch = outputString.match(/\{[\s\S]*\}/);
              if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]);
                confidence = parsed.confidence || 0;
                resolvedContent = parsed.resolvedContent || "";
              }
            } catch (e) {
              console.warn(`[PrManagerAgent] Failed to parse conflict resolution for ${file.filename}`);
            }

            if (confidence < 0.8) {
              allResolved = false;
              break; // Abort if any file has low confidence
            }

            // Create blob for the resolved file
            const blobRes = await octokit.rest.git.createBlob({ owner, repo, content: resolvedContent, encoding: 'utf-8' });
            newTreeItems.push({
              path: file.filename,
              mode: '100644',
              type: 'blob',
              sha: blobRes.data.sha
            });
          }

          if (!allResolved || newTreeItems.length === 0) {
            console.log(`[PrManagerAgent] Low confidence in resolving PR #${pr.number}. Adding comment.`);
            await octokit.rest.issues.createComment({ owner, repo, issue_number: pr.number, body: "I am unable to confidently resolve these conflicts automatically. Manual intervention is required." });
            this.sql.prepare('INSERT INTO pr_manager_jobs (owner, repo, pull_number, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').bind(owner, repo, pr.number, 'conflict_commented', Date.now(), Date.now()).run();
          } else {
             console.log(`[PrManagerAgent] High confidence in resolving PR #${pr.number}. Attempting multi-parent merge commit...`);
             try {
                const treeRes = await octokit.rest.git.createTree({ owner, repo, base_tree: headSha, tree: newTreeItems });
                const commitRes = await octokit.rest.git.createCommit({ owner, repo, message: "Auto-resolved merge conflicts", tree: treeRes.data.sha, parents: [headSha, baseSha] });
                await octokit.rest.git.updateRef({ owner, repo, ref: `heads/${headRef}`, sha: commitRes.data.sha });
                this.sql.prepare('INSERT INTO pr_manager_jobs (owner, repo, pull_number, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').bind(owner, repo, pr.number, 'conflict_resolved', Date.now(), Date.now()).run();
             } catch (err) {
                console.error(`[PrManagerAgent] Failed to merge PR #${pr.number}:`, err);
             }
          }
        }
      }
    } catch (e) {
      console.error('[PrManagerAgent] Error scanning PRs:', e);
    }
  }
}

const app = new Hono<{ Bindings: Env }>();

export default app;
