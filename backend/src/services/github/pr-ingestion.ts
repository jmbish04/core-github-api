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
