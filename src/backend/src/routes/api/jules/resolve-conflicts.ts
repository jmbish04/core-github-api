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
    const prompt = `Jules, this PR (#${pullNumber}) has merge conflicts between branch '${headBranch}' and base branch '${baseBranch}'. Please execute a complete conflict resolution workflow by following these exact steps:

1. Execute the following setup script to configure your environment and start the merge:
\`\`\`bash
git config user.name "Jules AI"
git config user.email "jules@ezagentsdk.com"
git fetch origin ${baseBranch}
# Note: This will likely return a conflict status, which is expected.
git merge origin/${baseBranch} || true
\`\`\`

2. Identify all files currently containing Git conflict markers (\`<<<<<<<\`, \`=======\`, \`>>>>>>>\`).

3. For each conflicted file:
   - Analyze the intent of the incoming changes from the target branch.
   - Analyze the modifications made in this PR.
   - Reconcile the logic to preserve both intents. Prioritize the architectural logic of this PR while ensuring any upstream bug fixes or structural updates are seamlessly integrated.

4. Remove all conflict markers and ensure the resulting syntax is perfectly valid.

5. Run standard workspace type checks and validations to ensure the newly integrated code does not introduce regressions.

6. Once all conflicts are resolved and checks pass, execute the following script to complete the process:
\`\`\`bash
git add .
git commit -m "chore: resolve merge conflicts with ${baseBranch}"
git push origin ${headBranch}
\`\`\`

After pushing, please summarize the files you resolved and the architectural decisions made during reconciliation.`;

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
