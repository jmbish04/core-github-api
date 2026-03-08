import { BaseAutomation } from '@/core/BaseAutomation';
import { getDb } from '@db';
import { tasks, repos } from '@db/schema';
import { eq, and } from 'drizzle-orm';
import { generateUuid } from "@/utils/common";

export class TaskSync extends BaseAutomation {
  async shouldExecute(): Promise<boolean> {
    return !!this.payload.issue && !this.payload.comment;
  }

  async execute(): Promise<void> {
    const issuesPayload = this.payload;
    const dbCore = getDb(this.env.DB);
    const { TaskStatus, KanbanColumn } = await import('@/types/project-management/enums');
    const { StatusMapper } = await import('@services/statusMapper');

    try {
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
                const actionName = (issuesPayload as Record<string, unknown>).action;
                if (actionName === 'assigned' || actionName === 'unassigned') {
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
                const updatePayload: Record<string, unknown> = {
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
            await this.logExecution('success', 'Task synced to DB', issuesPayload.issue.number);
        } else {
             await this.logExecution('skipped', 'Repo not tracked internally', issuesPayload.issue.number);
        }
    } catch (err: unknown) {
        console.error('[TaskSync] failed', err);
        await this.logExecution('failure', `Update failed: ${err.message}`, issuesPayload.issue?.number);
    }
  }
}
