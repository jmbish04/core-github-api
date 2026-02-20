// src/db/schema-project.ts
// Drizzle schema for project management tables used by Dice UI integration

import { sql } from "drizzle-orm";
import {
    sqliteTable,
    text,
    integer,
    real,
    primaryKey,
    index,
    check
} from "drizzle-orm/sqlite-core";

import { TaskStatus, KanbanColumn } from "@/types/project-management/enums";

// Tasks table for Kanban board
export const tasks = sqliteTable(
    "tasks",
    {
        id: text("id").primaryKey(), // UUID
        repoId: text("repo_id").notNull(),
        title: text("title").notNull(),
        description: text("description"),
        status: text("status")
            .notNull()
            .default(TaskStatus.BACKLOG),
        priority: text("priority")
            .notNull()
            .default("low"),
        assignee: text("assignee"),
        createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
        updatedAt: text("updated_at").default(sql`CURRENT_TIMESTAMP`),
        position: integer("position").default(0),
        // Roadmap / Gantt fields
        startAt: text("start_at"),
        endAt: text("end_at"),
        // Optional groupings for Roadmap
        group: text("group_name"),
        product: text("product_name"),
        initiative: text("initiative_name"),
        release: text("release_name"),
        isDeleted: integer("is_deleted").default(0),

        // GitHub Sync
        githubIssueId: integer("github_issue_id"), // The number (e.g., 123)
        githubHtmlUrl: text("github_html_url"),

        // Roadmap Integration
        phaseId: text("phase_id"), // FK to project_phases.id (no foreign key constraint string to avoid circular dependecy issues if split files, but logical FK)

        // Kanban Logic
        kanbanColumn: text("kanban_column")
            .notNull()
            .default(KanbanColumn.BACKLOG),
    },
    (table) => ({
        repoIdx: index("idx_tasks_repo").on(table.repoId),
        statusCheck: check("status_check", sql`${table.status} IN (${sql.raw(Object.values(TaskStatus).map(v => `'${v}'`).join(','))})`),
        kanbanCheck: check("kanban_check", sql`${table.kanbanColumn} IN (${sql.raw(Object.values(KanbanColumn).map(v => `'${v}'`).join(','))})`),
        priorityCheck: check("priority_check", sql`${table.priority} IN ('low','medium','high','critical')`)
    })
);

// Task Comments
export const taskComments = sqliteTable(
    "task_comments",
    {
        id: text("id").primaryKey(),
        taskId: text("task_id").notNull(),
        content: text("content").notNull(),
        author: text("author").notNull(),
        githubCommentId: integer("github_comment_id"),
        createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
        updatedAt: text("updated_at").default(sql`CURRENT_TIMESTAMP`),
    },
    (table) => ({
        taskIdx: index("idx_comments_task").on(table.taskId)
    })
);

// Task Audit Events
export const taskEvents = sqliteTable(
    "task_events",
    {
        id: text("id").primaryKey(),
        taskId: text("task_id"), // Can be null if event is generic or task creation failed
        githubIssueId: integer("github_issue_id"),
        requestId: text("request_id"), // Correlate events
        eventType: text("event_type").notNull(), // 'api_request', 'db_create', 'github_create', etc.
        objectType: text("object_type"), // 'task', 'issue', 'comment'
        fieldName: text("field_name"), // 'status', 'assignee', 'title'
        oldValue: text("old_value"),
        newValue: text("new_value"),
        status: text("status").notNull(), // 'pending', 'success', 'failed'
        details: text("details"), // JSON string
        timestamp: text("timestamp").default(sql`CURRENT_TIMESTAMP`)
    },
    (table) => ({
        taskIdx: index("idx_events_task").on(table.taskId),
        reqIdx: index("idx_events_req").on(table.requestId)
    })
);
