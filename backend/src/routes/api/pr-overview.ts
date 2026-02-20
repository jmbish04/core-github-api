/**
 * @file backend/src/routes/api/pr-overview.ts
 * @description API routes for PR overview, AI summary, and review status.
 */

import { Hono } from "hono";
import { getOctokit } from "@/services/octokit/core";
import { generateText } from "@/ai/providers/index";
import { getWebhooksDb } from "@db";
import * as eventTables from "@/db/schemas/github/webhooks";
import { sql } from "drizzle-orm";

const prOverviewApi = new Hono<{ Bindings: Env }>();

// ==========================================
// GET /pr/:owner/:repo/:number/overview
// ==========================================
prOverviewApi.get("/pr/:owner/:repo/:number/overview", async (c) => {
  const { owner, repo, number } = c.req.param();
  const prNumber = parseInt(number, 10);

  if (isNaN(prNumber)) {
    return c.json({ error: "Invalid PR number" }, 400);
  }

  try {
    const octokit = await getOctokit(c.env);

    // Fetch PR details
    const prRes = await octokit.pulls.get({ owner, repo, pull_number: prNumber });
    const pr = prRes.data;

    // Fetch top-level issue comments (not code review comments)
    const commentsRes = await octokit.issues.listComments({
      owner,
      repo,
      issue_number: prNumber,
      per_page: 50,
    });

    const highLevelComments = commentsRes.data.map((c: any) => ({
      id: c.id,
      author: c.user?.login || "unknown",
      avatar: c.user?.avatar_url || "",
      body: c.body || "",
      createdAt: c.created_at,
      htmlUrl: c.html_url,
    }));

    // Generate AI summary
    let aiSummary = "";
    try {
      const summaryPrompt = `Summarize the following GitHub Pull Request for a developer dashboard overview.

PR #${prNumber}: "${pr.title}"
Author: ${pr.user?.login}
Branch: ${pr.head.ref} → ${pr.base.ref}
State: ${pr.state} | Merged: ${pr.merged || false}
Changed Files: ${pr.changed_files} | Additions: ${pr.additions} | Deletions: ${pr.deletions}

Description:
${(pr.body || "No description provided.").slice(0, 3000)}

Top-level comments (${highLevelComments.length}):
${highLevelComments
  .slice(0, 10)
  .map((c: any) => `- ${c.author}: ${c.body.slice(0, 200)}`)
  .join("\n")}

Provide a concise 3-5 sentence summary covering: what the PR does, key discussion points, and current status.`;

      aiSummary = await generateText(c.env, summaryPrompt, undefined, {
        maxTokens: 500,
      });
    } catch (e) {
      console.error("[pr-overview] AI summary failed:", e);
      aiSummary = "AI summary unavailable.";
    }

    return c.json({
      success: true,
      pr: {
        number: pr.number,
        title: pr.title,
        state: pr.state,
        draft: pr.draft,
        author: pr.user?.login,
        authorAvatar: pr.user?.avatar_url,
        description: pr.body || "",
        headRef: pr.head.ref,
        baseRef: pr.base.ref,
        changedFiles: pr.changed_files,
        additions: pr.additions,
        deletions: pr.deletions,
        merged: pr.merged,
        createdAt: pr.created_at,
        updatedAt: pr.updated_at,
      },
      aiSummary,
      comments: highLevelComments,
    });
  } catch (error: any) {
    console.error("[pr-overview] Failed to fetch PR overview:", error);
    return c.json({ error: error.message }, 500);
  }
});

// ==========================================
// GET /pr/:owner/:repo/:number/review-status
// ==========================================
prOverviewApi.get("/pr/:owner/:repo/:number/review-status", async (c) => {
  const { owner, repo, number } = c.req.param();
  const prNumber = parseInt(number, 10);
  const repoFullName = `${owner}/${repo}`;

  if (isNaN(prNumber)) {
    return c.json({ error: "Invalid PR number" }, 400);
  }

  try {
    const db = getWebhooksDb(c.env.DB_WEBHOOKS);

    // Check for review events
    const reviews = await db
      .select()
      .from(eventTables.pullRequestReview)
      .where(
        sql`${eventTables.pullRequestReview.pr_number} = ${prNumber} AND ${eventTables.pullRequestReview.delivery_id} IN (
          SELECT ${eventTables.webhookDeliveries.delivery_id} FROM ${eventTables.webhookDeliveries} WHERE ${eventTables.webhookDeliveries.repo_full_name} = ${repoFullName}
        )`
      )
      .all();

    // Check for review comments
    const reviewComments = await db
      .select()
      .from(eventTables.pullRequestReviewComment)
      .where(
        sql`${eventTables.pullRequestReviewComment.pr_number} = ${prNumber} AND ${eventTables.pullRequestReviewComment.delivery_id} IN (
          SELECT ${eventTables.webhookDeliveries.delivery_id} FROM ${eventTables.webhookDeliveries} WHERE ${eventTables.webhookDeliveries.repo_full_name} = ${repoFullName}
        )`
      )
      .all();

    // Derive status
    let status: "pending_review" | "review_started" | "review_provided" | "comments_fixed" = "pending_review";
    const commentCount = reviewComments.length;

    if (reviews.length > 0) {
      const hasApproval = reviews.some((r: any) => r.state === "approved");
      if (hasApproval) {
        status = "comments_fixed";
      } else {
        status = "review_provided";
      }
    } else if (commentCount > 0) {
      status = "review_started";
    }

    // Also fetch from GitHub API for more accurate comment counts
    let githubCommentCount = commentCount;
    try {
      const octokit = await getOctokit(c.env);
      const prRes = await octokit.pulls.get({ owner, repo, pull_number: prNumber });
      githubCommentCount = prRes.data.review_comments || commentCount;
    } catch {
      // fallback to webhook data
    }

    return c.json({
      success: true,
      prNumber,
      status,
      commentCount: githubCommentCount,
      reviewCount: reviews.length,
    });
  } catch (error: any) {
    console.error("[pr-overview] Failed to fetch review status:", error);
    return c.json({ error: error.message }, 500);
  }
});

export default prOverviewApi;
