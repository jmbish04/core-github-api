/**
 * @file backend/src/automations/pr/SentinelPostMerge.ts
 * @description Post-merge learning automation — when a PR is merged, creates
 * a reflection record and signals the LearningAgent to ingest it.
 *
 * Triggers on pull_request closed events where merged=true.
 *
 * @module Automations/PR/SentinelPostMerge
 */

import { z } from "zod";
import {
  BaseAutomation,
  type AutomationMetadata,
} from "@/automations/core/BaseAutomation";
import { getDb } from "@db";
import { learningAiInsightPrs } from "@db/schemas/github/learning";

const PullRequestClosedPayloadSchema = z.object({
  action: z.literal("closed"),
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
    merged: z.boolean(),
    user: z.object({ login: z.string() }),
  }),
});

type PostMergePayload = z.infer<typeof PullRequestClosedPayloadSchema>;

export class SentinelPostMerge extends BaseAutomation<PostMergePayload> {
  static readonly metadata: AutomationMetadata = {
    key: "sentinel-post-merge",
    domain: "pr",
    description:
      "Creates learning reflection records when PRs are merged for the Contemplation Gate.",
    events: ["pull_request"],
    alwaysOn: true,
    authPolicy: "app",
  };

  async shouldRun(): Promise<boolean> {
    if (this.action !== "closed") return false;
    const parsed = PullRequestClosedPayloadSchema.safeParse(this.payload);
    return parsed.success && parsed.data.pull_request.merged === true;
  }

  async run(): Promise<void> {
    const payload = PullRequestClosedPayloadSchema.parse(this.payload);
    const { repository, pull_request: pr } = payload;

    try {
      const db = getDb(this.env.DB);

      // Record the merged PR in the learning database
      await db.insert(learningAiInsightPrs).values({
        id: crypto.randomUUID(),
        insightId: "", // Linked during analysis
        prNumber: pr.number,
        repo: `${repository.owner.login}/${repository.name}`,
        status: "merged",
        outcome: "merged",
        createdAt: new Date(),
      });

      // Signal the LearningAgent to ingest this PR
      try {
        const agentId = this.env.LEARNING_AGENT.idFromName("default");
        const agentStub = this.env.LEARNING_AGENT.get(agentId);
        await agentStub.fetch(
          new Request("http://internal/ingest-pr", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              prNumber: pr.number,
              repoOwner: repository.owner.login,
              repoName: repository.name,
              prUrl: pr.html_url,
              prDescription: pr.body?.substring(0, 2000),
              merged: true,
            }),
          })
        );
      } catch (err) {
        console.error(
          "[SentinelPostMerge] Failed to signal LearningAgent:",
          err
        );
      }

      await this.logExecution(
        "success",
        `Recorded merged PR #${pr.number} for learning`,
        pr.number
      );
    } catch (err: any) {
      console.error(
        `[SentinelPostMerge] Failed for PR #${pr.number}:`,
        err
      );
      await this.logExecution("failure", `Failed: ${err.message}`, pr.number);
    }
  }
}
