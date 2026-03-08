import { App } from 'octokit';
import { withCompatOctokit } from "@/services/octokit/compat";
import * as eventTables from "@/db/schemas/github/webhooks";
import type { WebhookHandlerContext } from '../types';
import { getDb } from '@db';
import { tasks, repos } from '@db/schema';
import { eq, and } from 'drizzle-orm';
import { generateUuid } from "@/utils/common";
import { SlashCommandRouter } from "../workflows/gardener/router";
import { GitHubConditionals } from "@/utils/github/conditionals";
import {
  runBugHunterWorkflow,
  shouldRunBugHunter,
} from "../workflows/bug-hunter";
import { JulesService } from "@/services/jules/jules";
import type { GitHubIssuesPayload } from '@/types/github/webhooks';

export async function handleIssues({ c, payload, appId, privateKey, deliveryId, insertPayload }: WebhookHandlerContext) {
  const isIssues = !!payload.issue && !payload.comment;
  
  if (isIssues) {
      if (shouldRunBugHunter(payload)) {
        c.executionCtx.waitUntil(
          runBugHunterWorkflow({
            env: c.env,
            payload,
            deliveryId,
          }).catch((error) => {
            console.error('[BugHunter] Workflow failed:', error)
          })
        );
      }
      
      const issuesPayload = payload as GitHubIssuesPayload & Record<string, any>;
      const dbCore = getDb(c.env.DB);
      const { TaskStatus, KanbanColumn } = await import('@/types/project-management/enums');
      const { StatusMapper } = await import('@services/statusMapper');

      const repoRecord = await dbCore.select()
          .from(repos)
          .where(and(eq(repos.owner, issuesPayload.repository.owner.login), eq(repos.name, issuesPayload.repository.name)))
          .limit(1);

      if (repoRecord.length) {
          const internalRepoId = repoRecord[0].id;
          let assignee = issuesPayload.issue.assignee ? issuesPayload.issue.assignee.login : null;
          if (issuesPayload.issue.body && issuesPayload.issue.body.includes('/colby')) {
              assignee = 'system';
          }

          let status = TaskStatus.BACKLOG;
          let kanbanColumn = KanbanColumn.BACKLOG;
          if (issuesPayload.issue.state === 'closed') {
              status = TaskStatus.DONE;
              kanbanColumn = KanbanColumn.DONE;
          } else {
              if (assignee) {
                  status = TaskStatus.TODO;
                  kanbanColumn = StatusMapper.mapStatusToColumn(status);
              }
              if ((issuesPayload.action as any) === 'assigned' || (issuesPayload.action as any) === 'unassigned') {
                  kanbanColumn = assignee ? KanbanColumn.PLANNED : KanbanColumn.BACKLOG;
                  status = StatusMapper.mapColumnToStatus(kanbanColumn);
              } else if (issuesPayload.action === 'edited' && kanbanColumn !== KanbanColumn.DONE) {
                  if (kanbanColumn !== KanbanColumn.BACKLOG) {
                      status = TaskStatus.IN_PROGRESS;
                      kanbanColumn = KanbanColumn.IN_PROGRESS;
                  }
              }
          }

          let endAt: string | undefined;
          if (status === TaskStatus.DONE || kanbanColumn === KanbanColumn.DONE) {
              endAt = new Date().toISOString();
          }

          if (issuesPayload.action === 'opened') {
              await dbCore.insert(tasks).values({
                  id: generateUuid(),
                  repoId: internalRepoId,
                  title: issuesPayload.issue.title,
                  description: issuesPayload.issue.body,
                  status: status,
                  kanbanColumn: kanbanColumn,
                  assignee: assignee,
                  githubIssueId: issuesPayload.issue.number,
                  githubHtmlUrl: issuesPayload.issue.html_url,
                  createdAt: issuesPayload.issue.created_at,
                  updatedAt: issuesPayload.issue.updated_at,
                  endAt: endAt
              });
          } else if (['edited', 'closed', 'reopened'].includes(issuesPayload.action!)) {
              const updatePayload: any = {
                  title: issuesPayload.issue.title,
                  description: issuesPayload.issue.body,
                  status: status,
                  kanbanColumn: kanbanColumn,
                  assignee: assignee,
                  updatedAt: new Date().toISOString(),
                  endAt: endAt
              };
              if (status !== TaskStatus.DONE && kanbanColumn !== KanbanColumn.DONE) {
                  updatePayload.endAt = null;
              }
              await dbCore.update(tasks)
                  .set(updatePayload)
                  .where(and(eq(tasks.repoId, internalRepoId), eq(tasks.githubIssueId, issuesPayload.issue.number)));
          }
      }

      if ((payload.action === 'opened' || payload.action === 'edited') && payload.issue?.body?.includes('/colby')) {
        if (appId && privateKey && payload.installation?.id) {
          const app = new App({ appId: appId, privateKey: privateKey });
          const octokit = withCompatOctokit(await app.getInstallationOctokit(payload.installation.id));
          await SlashCommandRouter.handleAndReply(
            payload.issue.body,
            {
              env: c.env,
              executionCtx: { ...c.executionCtx, exports: {} as any },
              repo: { owner: payload.repository?.owner?.login, name: payload.repository?.name, defaultBranch: payload.repository?.default_branch },
              octokit
            },
            { issueNumber: payload.issue?.number, issueBody: payload.issue?.body }
          );
        }
      }

      await insertPayload(eventTables.issues, {
        issue_number: payload.issue?.number,
        title: payload.issue?.title,
        state: payload.issue?.state,
        author_login: payload.issue?.user?.login,
        assignee_login: payload.issue?.assignee?.login,
        milestone_id: payload.issue?.milestone?.id,
        created_at: payload.issue?.created_at,
        closed_at: payload.issue?.closed_at,
      });
  } else if (payload.comment) {
      // Issue Comment
      const isGemini = GitHubConditionals.isBotOrAgentUser(payload.comment?.user as { login?: string; type?: string }); 
      
      if (isGemini && payload.action === 'created') {
           const feedback = payload.comment.body;
           if (feedback && (feedback.includes('Review') || feedback.includes('suggestion'))) {
                try {
                    const julesService = JulesService.getInstance(c.env);
                    const prompt = `Gemini Code Assist provided a review on PR #${payload.issue?.number}.\n\nFeedback:\n${feedback}\n\nPlease apply the fixes suggested in the feedback.`;
                    await julesService.startSession({
                        prompt: prompt,
                        repo: { 
                            owner: payload.repository?.owner?.login, 
                            repo: payload.repository?.name,
                        },
                        autoPr: true 
                    });
                } catch (err: any) {
                    console.error(`[Jules] Failed to trigger auto-fix:`, err);
                }
           }
      }

      const commentBody = payload.comment?.body || '';
      if (commentBody.includes('/colby')) {
        if (payload.action === 'created' && appId && privateKey && payload.installation?.id) {
          const app = new App({ appId: appId, privateKey: privateKey });
          const octokit = withCompatOctokit(await app.getInstallationOctokit(payload.installation.id));
          await SlashCommandRouter.handleAndReply(
            commentBody,
            {
              env: c.env,
              executionCtx: { ...c.executionCtx, exports: {} as any },
              repo: { owner: payload.repository?.owner?.login, name: payload.repository?.name, defaultBranch: payload.repository?.default_branch },
              octokit
            },
            { issueNumber: payload.issue?.number, issueBody: payload.issue?.body }
          );
        }
      }

      await insertPayload(eventTables.issueComment, {
        issue_number: payload.issue?.number,
        comment_id: payload.comment?.id,
        action: payload.action,
        author_login: payload.comment?.user?.login,
        body: payload.comment?.body,
      });
  }
}
