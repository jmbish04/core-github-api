/**
 * @file backend/src/automations/pr/SentinelInterceptor.ts
 * @description Active PR Interceptor — analyzes PRs against architectural memory
 * and posts findings as comments using the human persona token.
 *
 * Triggers on pull_request opened/synchronize events.
 * Uses GITHUB_PERSONAL_ACCESS_TOKEN so comments appear from a human account
 * and aren't ignored by bot filters.
 *
 * @module Automations/PR/SentinelInterceptor
 */

import { z } from "zod";
import {
  BaseAutomation,
  type AutomationMetadata,
} from "@/core/BaseAutomation";
import { getDb } from "@db";
import { aiInsights } from "@/db/schemas/github/learning/ai-insights";
import { aiPrReflections } from "@/db/schemas/github/learning/ai-pr-reflections";
import { eq, and } from "drizzle-orm";

const PullRequestPayloadSchema = z.object({
  action: z.enum(["opened", "synchronize"]),
  repository: z.object({
    name: z.string(),
    full_name: z.string(),
    owner: z.object({ login: z.string() }),
  }),
  pull_request: z.object({
    number: z.number(),
    title: z.string(),
    body: z.string().nullable(),
    html_url: z.string(),
    diff_url: z.string(),
    user: z.object({ login: z.string(), type: z.string().optional() }),
    head: z.object({ ref: z.string() }),
    base: z.object({ ref: z.string() }),
  }),
});

type SentinelPayload = z.infer<typeof PullRequestPayloadSchema>;

export class SentinelInterceptor extends BaseAutomation<SentinelPayload> {
  static readonly metadata: AutomationMetadata = {
    key: "sentinel-interceptor",
    domain: "pr",
    description:
      "Analyzes PRs against architectural memory and posts AI-driven findings.",
    events: ["pull_request"],
    alwaysOn: true,
    authPolicy: "pat",
  };

  async shouldRun(): Promise<boolean> {
    const parsed = PullRequestPayloadSchema.safeParse(this.payload);
    if (!parsed.success) return false;
    return (
      this.action === "opened" || this.action === "synchronize"
    );
  }

  async run(): Promise<void> {
    const payload = PullRequestPayloadSchema.parse(this.payload);
    const { repository, pull_request: pr } = payload;
    const repoFullName = repository.full_name;
    const owner = repository.owner.login;
    const repo = repository.name;

    try {
      const octokit = await this.getGitHubClient();

      // Step 1: Post initial analysis comment
      await octokit.rest.issues.createComment({
        owner,
        repo,
        issue_number: pr.number,
        body: `🔍 **Sentinel** is crunching architectural history to optimize this PR...`,
      });

      // Step 2: Fetch the PR diff for analysis
      const { data: diffData } = await octokit.rest.pulls.get({
        owner,
        repo,
        pull_number: pr.number,
        mediaType: { format: "diff" },
      });
      const diff = typeof diffData === "string" ? diffData : JSON.stringify(diffData);

      // Step 3: Query architectural memory
      const db = getDb(this.env.DB);
      const repoInsights = await db
        .select()
        .from(aiInsights)
        .where(
          and(
            eq(aiInsights.githubRepo, repoFullName),
            eq(aiInsights.status, "IMMUNIZED")
          )
        )
        .limit(10);

      // Step 4: Check Vectorize for similar patterns
      let vectorMatches: string[] = [];
      try {
        const embedding = await this.env.AI.run(
          "@cf/baai/bge-large-en-v1.5" as any,
          { text: [pr.title + "\n" + (pr.body || "")] }
        );
        const vectors = (embedding as any).data?.[0];
        if (vectors) {
          const matches = await this.env.VECTORIZE.query(vectors, {
            topK: 5,
            namespace: "learning",
          });
          vectorMatches = (matches.matches || [])
            .filter((m: any) => m.score > 0.75)
            .map(
              (m: any) =>
                `- ${m.metadata?.text?.substring(0, 200) || "Similar pattern detected"} (score: ${m.score.toFixed(2)})`
            );
        }
      } catch (err) {
        console.warn("[SentinelInterceptor] Vectorize query failed:", err);
      }

      // Step 5: Run AI analysis
      const analysisPrompt = `Analyze this PR diff for architectural anti-patterns, style drift, or improvements based on these known patterns:

**Known Immunized Insights for ${repoFullName}:**
${repoInsights.map((i) => `- [${i.category}/${i.severity}] ${i.insightAnalysis?.substring(0, 200)}`).join("\n") || "None yet."}

**Vector Similarity Matches:**
${vectorMatches.join("\n") || "No similar prior patterns found."}

**PR Title:** ${pr.title}
**PR Description:** ${pr.body || "No description provided."}

**Diff (truncated to 50000 chars):**
\`\`\`
${diff.substring(0, 50000)}
\`\`\`

Respond with a concise analysis. If you detect anti-patterns or potential issues, list them as bullet points. If the PR looks clean, say so briefly. Include severity (low/medium/high) for each finding.`;

      const aiResponse = await this.env.AI.run(
        "@cf/meta/llama-3.3-70b-instruct-fp8-fast" as any,
        {
          messages: [
            {
              role: "system",
              content:
                "You are Sentinel, an architectural analysis bot. Be concise, actionable, and constructive. Format findings as GitHub-flavored markdown.",
            },
            { role: "user", content: analysisPrompt },
          ],
          max_tokens: 1000,
        }
      );

      const analysis = (aiResponse as any).response || "Analysis unavailable.";

      // Step 6: Post summary comment
      const baseUrl = (this.env as any).BASE_URL || "https://core-github-api.hacolby.workers.dev";
      const summaryBody = `## 🛡️ Sentinel Analysis

${analysis}

---

<details>
<summary>📊 Context</summary>

- **Immunized patterns for this repo:** ${repoInsights.length}
- **Similar prior patterns:** ${vectorMatches.length}
- **PR Author:** ${pr.user.login} ${pr.user.type === "Bot" ? "(Bot)" : ""}

[View full insights →](${baseUrl}/sentinel)

</details>

*Powered by Sentinel Learning Engine*`;

      // Update the initial comment (or post new one)
      await octokit.rest.issues.createComment({
        owner,
        repo,
        issue_number: pr.number,
        body: summaryBody,
      });

      await this.logExecution(
        "success",
        `Sentinel analysis posted for PR #${pr.number}`,
        pr.number
      );
    } catch (err: any) {
      console.error(
        `[SentinelInterceptor] Failed to analyze PR #${pr.number}:`,
        err
      );
      await this.logExecution(
        "failure",
        `Failed: ${err.message}`,
        pr.number
      );
    }
  }
}
