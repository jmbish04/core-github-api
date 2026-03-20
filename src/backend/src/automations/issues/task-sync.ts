import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { BaseAutomation, type AutomationMetadata } from '@/automations/core/BaseAutomation';
import { getDb } from '@db';
import { repos, tasks } from '@db/schema';
import { generateUuid } from '@/utils/common';
import { StatusMapper } from '@/automations/shared/status-mapper';
import { KanbanColumn, TaskStatus } from '@/types/project-management/enums';

const TaskSyncPayloadSchema = z.object({
  action: z.string(),
  repository: z.object({
    name: z.string(),
    owner: z.object({
      login: z.string(),
    }),
  }),
  issue: z.object({
    number: z.number(),
    title: z.string(),
    body: z.string().nullable().optional(),
    state: z.string(),
    html_url: z.string(),
    created_at: z.string(),
    updated_at: z.string(),
    assignee: z
      .object({
        login: z.string(),
      })
      .nullable()
      .optional(),
  }),
});

type TaskSyncPayload = z.infer<typeof TaskSyncPayloadSchema>;

export class TaskSync extends BaseAutomation<TaskSyncPayload> {
  static readonly metadata: AutomationMetadata = {
    key: 'task-sync',
    domain: 'issues',
    description: 'Synchronizes GitHub issues into the internal task board.',
    events: ['issues'],
    alwaysOn: true,
    authPolicy: 'app',
  };

  async shouldRun(): Promise<boolean> {
    return this.eventName === 'issues' && TaskSyncPayloadSchema.safeParse(this.payload).success;
  }

  async run(): Promise<void> {
    const payload = TaskSyncPayloadSchema.parse(this.payload);
    const db = getDb(this.env.DB);
    const issueNumber = payload.issue.number;

    try {
      const repoRecord = await db
        .select()
        .from(repos)
        .where(
          and(
            eq(repos.owner, payload.repository.owner.login),
            eq(repos.name, payload.repository.name),
          ),
        )
        .limit(1);

      if (!repoRecord.length) {
        await this.logExecution('skipped', 'Repository is not tracked internally.', issueNumber);
        return;
      }

      const repoId = repoRecord[0].id;
      let assignee = payload.issue.assignee?.login || null;
      if ((payload.issue.body || '').includes('/colby')) {
        assignee = 'system';
      }

      let status = TaskStatus.BACKLOG;
      let kanbanColumn = KanbanColumn.BACKLOG;

      if (payload.issue.state === 'closed') {
        status = TaskStatus.DONE;
        kanbanColumn = KanbanColumn.DONE;
      } else {
        if (assignee) {
          status = TaskStatus.TODO;
          kanbanColumn = StatusMapper.mapStatusToColumn(status);
        }

        if (payload.action === 'assigned' || payload.action === 'unassigned') {
          kanbanColumn = assignee ? KanbanColumn.PLANNED : KanbanColumn.BACKLOG;
          status = StatusMapper.mapColumnToStatus(kanbanColumn);
        } else if (payload.action === 'edited' && kanbanColumn !== KanbanColumn.DONE) {
          if (kanbanColumn !== KanbanColumn.BACKLOG) {
            status = TaskStatus.IN_PROGRESS;
            kanbanColumn = KanbanColumn.IN_PROGRESS;
          }
        }
      }

      const endAt =
        status === TaskStatus.DONE || kanbanColumn === KanbanColumn.DONE
          ? new Date().toISOString()
          : null;

      if (payload.action === 'opened') {
        await db.insert(tasks).values({
          id: generateUuid(),
          repoId,
          title: payload.issue.title,
          description: payload.issue.body || null,
          status,
          kanbanColumn,
          assignee,
          githubIssueId: issueNumber,
          githubHtmlUrl: payload.issue.html_url,
          createdAt: payload.issue.created_at,
          updatedAt: payload.issue.updated_at,
          endAt,
        });
      } else if (['edited', 'closed', 'reopened', 'assigned', 'unassigned'].includes(payload.action)) {
        await db
          .update(tasks)
          .set({
            title: payload.issue.title,
            description: payload.issue.body || null,
            status,
            kanbanColumn,
            assignee,
            updatedAt: new Date().toISOString(),
            endAt,
          })
          .where(and(eq(tasks.repoId, repoId), eq(tasks.githubIssueId, issueNumber)));
      }

      await this.logExecution('success', 'Synchronized GitHub issue to internal task board.', issueNumber);
    } catch (error) {
      await this.logExecution(
        'failure',
        `Task sync failed: ${error instanceof Error ? error.message : String(error)}`,
        issueNumber,
      );
      throw error;
    }
  }
}
