import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { JulesSessionBuilder } from "@/services/jules/builder";
import { getOctokit } from "@/services/octokit/core";

const app = new Hono<{ Bindings: Env }>();

const schema = z.object({
  owner: z.string(),
  repo: z.string(),
  pullNumber: z.number(),
  strategy: z.enum(["ai"]).default("ai")
});

/**
 * Endpoint to resolve merge conflicts on a PR using Jules AI
 */
app.post("/", zValidator("json", schema), async (c) => {
  const { owner, repo, pullNumber } = c.req.valid("json");
  
  try {
    const octokit = await getOctokit(c.env);
    
    // 1. Get PR details to find branches
    const { data: pr } = await octokit.pulls.get({
      owner,
      repo,
      pull_number: pullNumber
    });
    
    const headBranch = pr.head.ref;
    const baseBranch = pr.base.ref;
    
    // 2. Build prompt for Jules
    const prompt = `This PR (#${pullNumber}) has merge conflicts between branch '${headBranch}' and base branch '${baseBranch}'.
Please do the following:
1. Run \`git fetch origin ${baseBranch}\`
2. Run \`git config user.name "Jules AI"\` and \`git config user.email "jules@ezagentsdk.com"\`
3. Run \`git merge origin/${baseBranch}\` - this will likely have conflicts.
4. Carefully resolve all merge conflicts in the files.
5. Run \`git add .\`
6. Run \`git commit -m "chore: resolve merge conflicts with ${baseBranch}"\`
7. Run \`git push origin ${headBranch}\`
After pushing, please summarize the files you resolved.`;

    // 3. Start Jules session
    const builder = new JulesSessionBuilder(c.env)
      .withPrompt(prompt)
      .withRepo(owner, repo, headBranch) 
      .withoutApproval();

    const session = await builder.start();
    
    // 4. Post a comment indicating resolution is in progress
    const { data: comment } = await octokit.issues.createComment({
      owner,
      repo,
      issue_number: pullNumber,
      body: `🤖 **Jules AI** is currently attempting to resolve the merge conflicts between \`${headBranch}\` and \`${baseBranch}\`.\n\nSession ID: \`${session.id}\``
    });
    
    return c.json({ 
      success: true, 
      sessionId: session.id, 
      commentUrl: comment.html_url 
    });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

export default app;
