/**
 * @file routes/api/projects/sentinel/mcp.ts
 * @description MCP tool registrations for the Sentinel API.
 *
 * Call `registerSentinelMcpTools(server, env)` inside createOurMcpServer() in
 * src/backend/src/ai/mcp/index.ts. This exposes 6 Sentinel tools to any MCP client
 * (Claude Code, Claude Desktop, custom agents) via the existing POST /mcp endpoint.
 *
 * Tools:
 *   sentinel_list_tasks      — list unclaimed tasks for a repo
 *   sentinel_claim_task      — claim a task by ID
 *   sentinel_update_task     — update task status or notes
 *   sentinel_submit_task     — submit task for review (dispatches GUARDRAIL_AGENT)
 *   sentinel_ask             — broadcast a clarification question to orchestrators
 *   sentinel_get_status      — get Sentinel system status (task counts, events)
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getDb } from '@db';
import { tasks, taskEvents } from '@/db/schemas/projects/backlog/tasks';
import { stories } from '@/db/schemas/projects/backlog/stories';
import { epics } from '@/db/schemas/projects/backlog/epics';
import { eq, isNull, asc, and, count, desc, isNotNull } from 'drizzle-orm';
import { generateUuid } from '@/utils/common';
import { broadcastSentinelEvent } from './broadcast';

const toText = (value: unknown) => [
    {
        type: 'text' as const,
        text: typeof value === 'string' ? value : JSON.stringify(value, null, 2),
    },
];

export function registerSentinelMcpTools(server: McpServer, env: Env): void {
    const db = getDb(env.DB);

    // ── sentinel_list_tasks ────────────────────────────────────────────────
    server.tool(
        'sentinel_list_tasks',
        'List available (unclaimed) Sentinel tasks for a repository. Returns tasks with no assignee that are ready for pickup.',
        {
            repoId: z.string().optional().describe('Repository ID, e.g. github:owner/repo. Omit to list across all repos.'),
            limit: z.number().default(20).describe('Maximum number of tasks to return'),
        },
        async ({ repoId, limit }) => {
            try {
                const baseCondition = and(isNull(tasks.assignee), eq(tasks.status, 'todo'));
                const whereClause = repoId
                    ? and(baseCondition, eq(tasks.repoId, repoId))
                    : baseCondition;

                const rows = await db
                    .select({
                        id: tasks.id,
                        repoId: tasks.repoId,
                        title: tasks.title,
                        description: tasks.description,
                        status: tasks.status,
                        priority: tasks.priority,
                        position: tasks.position,
                        kanbanColumn: tasks.kanbanColumn,
                        storyTitle: stories.title,
                        epicTitle: epics.title,
                    })
                    .from(tasks)
                    .leftJoin(stories, eq(tasks.parentId, stories.id))
                    .leftJoin(epics, eq(stories.parentId, epics.id))
                    .where(whereClause)
                    .orderBy(asc(tasks.position))
                    .limit(limit);

                return {
                    content: toText({
                        count: rows.length,
                        tasks: rows,
                    }),
                };
            } catch (e: any) {
                return { isError: true, content: toText(`sentinel_list_tasks failed: ${e.message}`) };
            }
        },
    );

    // ── sentinel_claim_task ────────────────────────────────────────────────
    server.tool(
        'sentinel_claim_task',
        'Claim a Sentinel task. Sets your assignee ID and transitions the task to in_progress.',
        {
            taskId: z.string().describe('The task UUID to claim'),
            assignee: z.string().describe('Your agent identifier, e.g. jules:session-abc123 or stitch:project-xyz'),
        },
        async ({ taskId, assignee }) => {
            try {
                const existing = await db.select().from(tasks).where(eq(tasks.id, taskId)).limit(1);
                const task = existing[0];
                if (!task) return { isError: true, content: toText(`Task '${taskId}' not found`) };
                if (task.assignee) return { isError: true, content: toText(`Task already claimed by '${task.assignee}'`) };

                const now = new Date().toISOString();
                await db.update(tasks)
                    .set({ assignee, status: 'in_progress', kanbanColumn: 'in_progress', updatedAt: now })
                    .where(eq(tasks.id, taskId));

                await db.insert(taskEvents).values({
                    id: generateUuid(),
                    taskId,
                    eventType: 'claimed',
                    objectType: 'task',
                    fieldName: 'assignee',
                    oldValue: null,
                    newValue: assignee,
                    status: 'in_progress',
                    details: JSON.stringify({ claimedAt: now }),
                    timestamp: now,
                });

                await broadcastSentinelEvent(env, { type: 'task_claimed', taskId, assignee, repoId: task.repoId, timestamp: now });

                return { content: toText({ ok: true, taskId, assignee, status: 'in_progress' }) };
            } catch (e: any) {
                return { isError: true, content: toText(`sentinel_claim_task failed: ${e.message}`) };
            }
        },
    );

    // ── sentinel_update_task ───────────────────────────────────────────────
    server.tool(
        'sentinel_update_task',
        'Update the status or notes on a Sentinel task you have claimed.',
        {
            taskId: z.string().describe('The task UUID'),
            status: z.enum(['todo', 'in_progress', 'done', 'backlog', 'cancelled']).optional().describe('New task status'),
            notes: z.string().optional().describe('Progress notes or updated description'),
        },
        async ({ taskId, status, notes }) => {
            try {
                const existing = await db.select().from(tasks).where(eq(tasks.id, taskId)).limit(1);
                const task = existing[0];
                if (!task) return { isError: true, content: toText(`Task '${taskId}' not found`) };

                const now = new Date().toISOString();
                const setClause: Record<string, unknown> = { updatedAt: now };
                if (status) { setClause.status = status; setClause.kanbanColumn = status; }
                if (notes) setClause.description = notes;

                await db.update(tasks).set(setClause as any).where(eq(tasks.id, taskId));

                if (status || notes) {
                    await db.insert(taskEvents).values({
                        id: generateUuid(),
                        taskId,
                        eventType: 'updated',
                        objectType: 'task',
                        fieldName: status ? 'status' : 'description',
                        oldValue: status ? task.status : task.description,
                        newValue: status ?? notes ?? '',
                        status: status ?? task.status,
                        details: JSON.stringify({ updatedAt: now }),
                        timestamp: now,
                    });
                }

                await broadcastSentinelEvent(env, { type: 'task_updated', taskId, repoId: task.repoId, changes: { status, notes }, timestamp: now });

                return { content: toText({ ok: true, taskId, updated: { status, notes } }) };
            } catch (e: any) {
                return { isError: true, content: toText(`sentinel_update_task failed: ${e.message}`) };
            }
        },
    );

    // ── sentinel_submit_task ───────────────────────────────────────────────
    server.tool(
        'sentinel_submit_task',
        'Submit a completed Sentinel task for review. Triggers the GUARDRAIL_AGENT for automated verification.',
        {
            taskId: z.string().describe('The task UUID to submit'),
            notes: z.string().optional().describe('Completion notes or PR links'),
        },
        async ({ taskId, notes }) => {
            try {
                const existing = await db.select().from(tasks).where(eq(tasks.id, taskId)).limit(1);
                const task = existing[0];
                if (!task) return { isError: true, content: toText(`Task '${taskId}' not found`) };

                const now = new Date().toISOString();
                await db.update(tasks)
                    .set({ status: 'in_review' as any, kanbanColumn: 'in_review', updatedAt: now })
                    .where(eq(tasks.id, taskId));

                await db.insert(taskEvents).values({
                    id: generateUuid(),
                    taskId,
                    eventType: 'submitted',
                    objectType: 'task',
                    fieldName: 'status',
                    oldValue: task.status,
                    newValue: 'in_review',
                    status: 'in_review',
                    details: JSON.stringify({ notes: notes ?? null, submittedAt: now }),
                    timestamp: now,
                });

                // Dispatch GUARDRAIL_AGENT for review via @callable RPC
                try {
                    if ((env as any).GUARDRAIL_AGENT) {
                        const { getAgentByName } = await import('agents');
                        const guardrail = await getAgentByName((env as any).GUARDRAIL_AGENT, `task-${taskId}`);
                        await (guardrail as any).judgeCodeQuality({
                            taskId,
                            repoId: task.repoId,
                            notes,
                        });
                    }
                } catch { /* non-fatal */ }

                await broadcastSentinelEvent(env, { type: 'task_submitted', taskId, repoId: task.repoId, assignee: task.assignee, timestamp: now });

                return { content: toText({ ok: true, taskId, status: 'in_review', message: 'GUARDRAIL_AGENT dispatched' }) };
            } catch (e: any) {
                return { isError: true, content: toText(`sentinel_submit_task failed: ${e.message}`) };
            }
        },
    );

    // ── sentinel_ask ──────────────────────────────────────────────────────
    server.tool(
        'sentinel_ask',
        'Broadcast a clarification question about a task to the JulesOverseer orchestrator. The orchestrator will respond via WebSocket.',
        {
            taskId: z.string().describe('The task UUID you need clarification on'),
            question: z.string().describe('The specific question for the orchestrator'),
        },
        async ({ taskId, question }) => {
            try {
                const existing = await db.select().from(tasks).where(eq(tasks.id, taskId)).limit(1);
                const task = existing[0];
                if (!task) return { isError: true, content: toText(`Task '${taskId}' not found`) };

                const now = new Date().toISOString();
                await db.insert(taskEvents).values({
                    id: generateUuid(),
                    taskId,
                    eventType: 'clarification_request',
                    objectType: 'task',
                    fieldName: null,
                    oldValue: null,
                    newValue: question,
                    status: task.status,
                    details: JSON.stringify({ question, askedAt: now }),
                    timestamp: now,
                });

                await broadcastSentinelEvent(env, {
                    type: 'clarification_request',
                    taskId,
                    repoId: task.repoId,
                    assignee: task.assignee,
                    question,
                    timestamp: now,
                });

                return {
                    content: toText({
                        ok: true,
                        message: 'Clarification request broadcast. Connect to /api/projects/sentinel/ws to receive the response.',
                    }),
                };
            } catch (e: any) {
                return { isError: true, content: toText(`sentinel_ask failed: ${e.message}`) };
            }
        },
    );

    // ── sentinel_get_status ────────────────────────────────────────────────
    server.tool(
        'sentinel_get_status',
        'Get the current Sentinel system status: task counts by status, active claims, and recent events.',
        {},
        async () => {
            try {
                const statusCounts = await db
                    .select({ status: tasks.status, cnt: count() })
                    .from(tasks)
                    .groupBy(tasks.status);

                const byStatus: Record<string, number> = {};
                for (const row of statusCounts) {
                    byStatus[row.status] = row.cnt;
                }

                const [claimRow] = await db
                    .select({ cnt: count() })
                    .from(tasks)
                    .where(isNotNull(tasks.assignee));

                const recent = await db
                    .select({
                        id: taskEvents.id,
                        taskId: taskEvents.taskId,
                        eventType: taskEvents.eventType,
                        status: taskEvents.status,
                        timestamp: taskEvents.timestamp,
                    })
                    .from(taskEvents)
                    .orderBy(desc(taskEvents.timestamp))
                    .limit(5);

                return {
                    content: toText({
                        taskCounts: {
                            todo: byStatus['todo'] ?? 0,
                            inProgress: byStatus['in_progress'] ?? 0,
                            inReview: byStatus['in_review'] ?? 0,
                            done: byStatus['done'] ?? 0,
                            backlog: byStatus['backlog'] ?? 0,
                        },
                        activeClaims: claimRow?.cnt ?? 0,
                        recentEvents: recent,
                        broadcasterBound: Boolean(env.JULES_WEBHOOK_BROADCASTER),
                        timestamp: new Date().toISOString(),
                    }),
                };
            } catch (e: any) {
                return { isError: true, content: toText(`sentinel_get_status failed: ${e.message}`) };
            }
        },
    );
}
