import { getDb } from '@db';
import { pullRequests, prComments } from '@db/schema';
import { eq } from 'drizzle-orm';

export async function processPullRequestEvent(env: Env, payload: any) {
  const pr = payload.pull_request;
  const repo = payload.repository;
  const db = getDb(env.DB);

  await db.insert(pullRequests).values({
    id: pr.id,
    number: pr.number,
    repoOwner: repo.owner.login,
    repoName: repo.name,
    title: pr.title,
    body: pr.body || '',
    state: pr.state,
    author: pr.user.login,
    authorAvatar: pr.user.avatar_url,
    htmlUrl: pr.html_url,
    createdAt: new Date(pr.created_at),
    updatedAt: new Date(pr.updated_at),
  }).onConflictDoUpdate({
    target: pullRequests.id,
    set: {
      title: pr.title,
      body: pr.body,
      state: pr.state,
      updatedAt: new Date(pr.updated_at)
    }
  });
}

export async function processStandardPrComment(env: Env, payload: any) {
  // Ignore standard issues, we only want PR comments
  if (!payload.issue.pull_request) return; 

  const comment = payload.comment;
  const repo = payload.repository;
  const db = getDb(env.DB);

  if (payload.action === 'deleted') {
    await db.delete(prComments).where(eq(prComments.id, comment.id));
    return;
  }

  await db.insert(prComments).values({
    id: comment.id,
    prNumber: payload.issue.number,
    repoOwner: repo.owner.login,
    repoName: repo.name,
    type: 'standard',
    author: comment.user.login,
    authorAvatar: comment.user.avatar_url,
    body: comment.body,
    htmlUrl: comment.html_url,
    createdAt: new Date(comment.created_at),
    updatedAt: new Date(comment.updated_at),
  }).onConflictDoUpdate({
    target: prComments.id,
    set: { body: comment.body, updatedAt: new Date(comment.updated_at) }
  });
}

export async function processCodeReviewComment(env: Env, payload: any) {
  const comment = payload.comment;
  const repo = payload.repository;
  const pr = payload.pull_request;
  const db = getDb(env.DB);

  if (payload.action === 'deleted') {
    await db.delete(prComments).where(eq(prComments.id, comment.id));
    return;
  }

  await db.insert(prComments).values({
    id: comment.id,
    prNumber: pr.number,
    repoOwner: repo.owner.login,
    repoName: repo.name,
    type: 'code_review',
    author: comment.user.login,
    authorAvatar: comment.user.avatar_url,
    body: comment.body,
    path: comment.path,
    line: comment.line || comment.original_line || null,
    htmlUrl: comment.html_url,
    createdAt: new Date(comment.created_at),
    updatedAt: new Date(comment.updated_at),
  }).onConflictDoUpdate({
    target: prComments.id,
    set: { body: comment.body, updatedAt: new Date(comment.updated_at) }
  });
}

export async function extractReviewCommentsAndPostReply(
    env: Env,
    owner: string,
    repo: string,
    pull_number: number,
    origin: string
): Promise<{ success: boolean; count: number; view_url: string; extraction_id: string; error?: string }> {
    const octokit = await import('@services/octokit/core').then(m => m.getOctokit(env));

    // 1. Fetch Review Comments
    let reviewComments;
    try {
        const result = await octokit.pulls.listReviewComments({
            owner,
            repo,
            pull_number,
        })
        reviewComments = result.data;
    } catch (error: any) {
        console.error(`[comments] Failed to list review comments: ${error.message}`);
        return {
            success: false,
            count: 0,
            view_url: '',
            extraction_id: '',
            error: error.message
        }
    }

    // 2. Process Comments
    const extractedComments = reviewComments.map((comment: any) => {
        // Check for suggestion in body (GitHub suggestions use ```suggestion block)
        const suggestionMatch = comment.body.match(/```suggestion\r?\n([\s\S]*?)\r?\n```/)
        const suggestion = suggestionMatch ? suggestionMatch[1] : undefined

        return {
            id: comment.id,
            path: comment.path,
            line: comment.line, // The line of the comment
            start_line: comment.start_line, // If multi-line
            original_line: comment.original_line,
            // Strip Gemini Code Assist priority badges (e.g., ![high](https://www.gstatic.com/codereviewagent/high-priority.svg))
            body: comment.body.replace(/!\[.*?\]\(https:\/\/www\.gstatic\.com\/codereviewagent\/.*?-priority\.svg\)/g, '').trim(),
            diff_hunk: comment.diff_hunk,
            suggestion,
            user: {
                login: comment.user.login,
                avatar_url: comment.user.avatar_url,
            },
            created_at: comment.created_at,
            html_url: comment.html_url
        }
    })

    if (extractedComments.length === 0) {
        return {
            success: true,
            count: 0,
            view_url: '',
            extraction_id: ''
        };
    }

    // 3. Store in KV
    const extractionId = `${owner}-${repo}-${pull_number}-${Date.now()}`
    const storageKey = `COMMENTS_${extractionId}`

    await env.COMMENTS_KV.put(storageKey, JSON.stringify(extractedComments), {
        expirationTtl: 60 * 60 * 24 * 30 // 30 days
    })

    // 4. Construct Public URL
    const viewUrl = `${origin}/view-comments/${extractionId}`

    // 5. Post URL to PR
    try {
        await octokit.issues.createComment({
            owner,
            repo,
            issue_number: pull_number,
            body: `### ✨ Code Comments Extracted\n\nI have extracted **${extractedComments.length}** code comments for easier triage.\n\n[**View Extracted Comments**](${origin}/view-comments/${owner}/${repo}/pull/${pull_number})`
        })
    } catch (commentError) {
        console.error(`[comments] Failed to post comment to GitHub for ${owner}/${repo}#${pull_number}:`, commentError);
    }

    return {
        success: true,
        count: extractedComments.length,
        view_url: viewUrl,
        extraction_id: extractionId
    }
}
