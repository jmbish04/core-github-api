/**
 * @file backend/src/routes/api/pr-overview.ts
 * @description API routes for PR overview, AI summary, and review status.
 */

import { Hono } from "hono";
import { getOctokit } from "@/services/octokit/core";
import { generateText, FallbackAlert } from "@/ai/providers/index";
import { getWebhooksDb } from "@db";
import * as eventTables from "@/db/schemas/github/webhooks";
import { prOverviews } from "@/db/schemas/github/pr_overviews";
import { getDb } from "@db";
import { eq, and, inArray } from "drizzle-orm";
import { createFallbackHandler } from "@/ai/fallbackLogger";

const prOverviewApi = new Hono<{ Bindings: Env; Variables: { fallbackAlert?: FallbackAlert } }>();

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

    // Check if an AI summary already exists in the database
    const db = getDb(c.env.DB);
    const existingOverview = await db
      .select()
      .from(prOverviews)
      .where(
        and(
          eq(prOverviews.repoOwner, owner),
          eq(prOverviews.repoName, repo),
          eq(prOverviews.prNumber, prNumber)
        )
      )
      .get();

    let aiSummary = "";
    if (existingOverview && existingOverview.aiSummary) {
      // Use cached summary
      aiSummary = existingOverview.aiSummary;
    } else {
      // Generate AI summary
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
        onFallback: createFallbackHandler(c),
      });

      try {
        await db.insert(prOverviews).values({
          repoOwner: owner,
          repoName: repo,
          prNumber,
          aiSummary,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
      } catch (insertErr) {
        console.error("[pr-overview] Failed to persist AI summary:", insertErr);
      }
    } catch (e) {
      console.error("[pr-overview] AI summary failed:", e);
      aiSummary = "AI summary unavailable.";
    }
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
      fallbackAlert: c.get("fallbackAlert"),
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

    // Build a typed subquery for delivery IDs scoped to this repo
    const deliverySubquery = db
      .select({ delivery_id: eventTables.webhookDeliveries.delivery_id })
      .from(eventTables.webhookDeliveries)
      .where(eq(eventTables.webhookDeliveries.repo_full_name, repoFullName));

    // Check for review events
    const reviews = await db
      .select()
      .from(eventTables.pullRequestReview)
      .where(
        and(
          eq(eventTables.pullRequestReview.pr_number, prNumber),
          inArray(eventTables.pullRequestReview.delivery_id, deliverySubquery)
        )
      )
      .all();

    // Check for review comments (reusing the same typed subquery)
    const reviewComments = await db
      .select()
      .from(eventTables.pullRequestReviewComment)
      .where(
        and(
          eq(eventTables.pullRequestReviewComment.pr_number, prNumber),
          inArray(eventTables.pullRequestReviewComment.delivery_id, deliverySubquery)
        )
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
