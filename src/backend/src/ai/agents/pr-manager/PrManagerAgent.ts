import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { createAgent, routeToAgent } from '../honi';
import { Agent, run } from '@openai/agents';
import { setupOpenAIAgentClient, getJulesClient } from '../../providers';
import { Octokit } from '@octokit/rest';
import { getAgentByName } from 'agents';

function safeParseJson(output: string) {
  let clean = output.trim();
  if (clean.startsWith('```json')) {
    clean = clean.slice(7);
  } else if (clean.startsWith('```')) {
    clean = clean.slice(3);
  }
  if (clean.endsWith('```')) {
    clean = clean.slice(0, -3);
  }
  return JSON.parse(clean.trim());
}

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
      const results = Array.from(this.ctx.storage.sql.exec("SELECT * FROM pr_manager_jobs ORDER BY created_at DESC LIMIT 50"));
      return new Response(JSON.stringify(results), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
    return super.fetch(request);
  }

  async onStart() {
    // DO SQLite state management init
    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS pr_manager_jobs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        owner TEXT NOT NULL,
        repo TEXT NOT NULL,
        pull_number INTEGER NOT NULL,
        status TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);
  }

  async scheduled() {
    console.log('[PrManagerAgent] Running scheduled PR scan...');
    // Ensure agent state is initialized
    await this.onStart();
    const owner = this.env.GITHUB_OWNER || 'cloudflare';
    const repo = this.env.HEALTH_TEST_REPO_NAME || 'core-github-api';

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

    const octokit = new Octokit({ auth: this.env.GITHUB_PERSONAL_ACCESS_TOKEN });

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

          // Perform resolution using SandboxAgent
          const sessionId = `pr-${pr.number}-${Date.now()}`;
          const sandboxAgent = await getAgentByName(this.env.SANDBOX_AGENT as any, sessionId);

          const execInSandbox = async (command: string) => {
             const res = await sandboxAgent.fetch(new Request('http://do/task', {
                 method: 'POST',
                 body: JSON.stringify({
                     name: 'exec_command',
                     args: { command, sessionId }
                 })
             }));
             const data = await res.json() as any;
             if (!data.success) throw new Error(`Command failed: ${data.error}`);
             return data;
          };

          try {
            await execInSandbox(`git clone https://x-access-token:${this.env.GITHUB_PERSONAL_ACCESS_TOKEN}@github.com/${owner}/${repo}.git .`);
            await execInSandbox(`git checkout ${headRef}`);
            await execInSandbox('git config user.email "ai@cloudflare.com" && git config user.name "PR Manager Agent"');

            // This merge will likely fail due to conflicts
            let mergeFailed = false;
            try {
               await execInSandbox(`git merge origin/${prDetails.data.base.ref}`);
            } catch (e: any) {
               if (e.message.includes('Automatic merge failed') || e.message.includes('Command failed')) {
                   mergeFailed = true;
               } else {
                   throw e;
               }
            }

            if (mergeFailed) {
              for (const file of filesResponse.data) {
                if (file.status === 'added' || file.status === 'removed' || file.status === 'renamed') {
                  allResolved = false;
                  break;
                }
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
                  const parsed = safeParseJson(outputString);
                  confidence = parsed.confidence || 0;
                  resolvedContent = parsed.resolvedContent || "";
                } catch (e) {
                  console.warn(`[PrManagerAgent] Failed to parse conflict resolution for ${file.filename}`);
                }

                if (confidence < 0.8) {
                  allResolved = false;
                  break;
                }

                // Write resolved content directly to the file in the sandbox
                const writeRes = await sandboxAgent.fetch(new Request('http://do/task', {
                    method: 'POST',
                    body: JSON.stringify({
                        name: 'write_file',
                        args: { path: file.filename, content: resolvedContent, sessionId }
                    })
                }));
                const writeData = await writeRes.json() as any;
                if (!writeData.success) throw new Error(`Write failed: ${writeData.error}`);
              }

              if (!allResolved) {
                console.log(`[PrManagerAgent] Low confidence in resolving PR #${pr.number}. Adding comment.`);
                await octokit.rest.issues.createComment({ owner, repo, issue_number: pr.number, body: "I am unable to confidently resolve these conflicts automatically. Manual intervention is required." });
                this.ctx.storage.sql.exec('INSERT INTO pr_manager_jobs (owner, repo, pull_number, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)', owner, repo, pr.number, 'conflict_commented', Date.now(), Date.now());
                await execInSandbox('git merge --abort');
              } else {
                 console.log(`[PrManagerAgent] High confidence in resolving PR #${pr.number}. Pushing merge commit...`);
                 await execInSandbox('git add .');
                 await execInSandbox('git commit -m "Auto-resolved merge conflicts"');
                 await execInSandbox(`git push origin ${headRef}`);
                 this.ctx.storage.sql.exec('INSERT INTO pr_manager_jobs (owner, repo, pull_number, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)', owner, repo, pr.number, 'conflict_resolved', Date.now(), Date.now());
              }
            } else {
               // Merge succeeded cleanly? Should not happen if mergeable_state === 'dirty', but handle just in case
               console.log(`[PrManagerAgent] Merge surprisingly succeeded without conflicts for PR #${pr.number}`);
               await execInSandbox(`git push origin ${headRef}`);
               this.ctx.storage.sql.exec('INSERT INTO pr_manager_jobs (owner, repo, pull_number, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)', owner, repo, pr.number, 'conflict_resolved', Date.now(), Date.now());
            }
          } catch (err) {
             console.error(`[PrManagerAgent] Failed to merge PR #${pr.number}:`, err);
             this.ctx.storage.sql.exec('INSERT INTO pr_manager_jobs (owner, repo, pull_number, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)', owner, repo, pr.number, 'conflict_failed', Date.now(), Date.now());
          } finally {
             // Let Sandbox terminate normally, no explicit cleanup needed here unless requested.
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
