import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { JulesSessionBuilder } from "@/services/jules/builder";

const app = new Hono<{ Bindings: Env }>();

const schema = z.object({
  repositoryOwner: z.string(),
  repositoryName: z.string(),
  pullRequestNumber: z.number(),
  reviewComments: z.string().describe("Merge feedback or patch resolution text.")
});

/**
 * Emulates the .merge capabilities by injecting feedback into a PR targeted session.
 */
app.post("/", zValidator("json", schema), async (c) => {
  const { repositoryOwner, repositoryName, pullRequestNumber, reviewComments } = c.req.valid("json");
  
  try {
    const builder = new JulesSessionBuilder(c.env)
      .withPrompt(`Merge review feedback:\n${reviewComments}\nPlease adjust the existing PR to resolve these comments.`)
      // Typically we'd fetch the PR branch name from GitHub API, passing "main" as a placeholder for now
      .withRepo(repositoryOwner, repositoryName, "main") 
      .withoutApproval();

    const session = await builder.start();
    
    return c.json({ success: true, sessionId: session.id, target: `${repositoryOwner}/${repositoryName}#${pullRequestNumber}` });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

export default app;
