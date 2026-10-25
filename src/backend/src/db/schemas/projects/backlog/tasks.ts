// env.DB
import {
    sqliteTable,
    text,
    integer,
    index,
    check
} from "drizzle-orm/sqlite-core";
import { sql } from 'drizzle-orm';
import { repositories } from "@/db/schemas/github/repos";
import { 
    TaskStatus, 
    KanbanColumn 
} from "@/types/project-management/enums";
import { stories } from "./stories";

// 3. Tasks (Actionable leaf nodes, displayed on Kanban)
export const tasks = sqliteTable("tasks", {
    id: text("id").primaryKey(), // UUID
    repoId: text("repo_id")
        .notNull()
        .references(() => repositories.id, { onDelete: "cascade" }),
    parentId: text("parent_id")
        .references(() => stories.id, { onDelete: "cascade" }), // Belongs to a Story
    title: text("title").notNull(),
    description: text("description"),
    status: text("status").notNull().default(TaskStatus.BACKLOG),
    priority: text("priority").notNull().default("low"),
    assignee: text("assignee"),
    position: integer("position").default(0), // Useful for Kanban sorting
    kanbanColumn: text("kanban_column").notNull().default(KanbanColumn.BACKLOG),
    
    // GitHub Sync
    githubIssueId: integer("github_issue_id"),
    githubHtmlUrl: text("github_html_url"),

    isDeleted: integer("is_deleted").default(0),
    createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").default(sql`CURRENT_TIMESTAMP`),
}, (table) => ({
    repoIdx: index("idx_tasks_repo").on(table.repoId),
    parentIdx: index("idx_tasks_parent").on(table.parentId),
    statusCheck: check("status_check", sql`${table.status} IN ('todo','in_progress','done','backlog','cancelled')`),
    kanbanCheck: check("kanban_check", sql`${table.kanbanColumn} IN ('backlog','todo','in_progress','in_review','done')`),
    priorityCheck: check("priority_check", sql`${table.priority} IN ('low','medium','high','critical','urgent')`)
}));

// Task Comments
export const taskComments = sqliteTable("task_comments", {
    id: text("id").primaryKey(),
    taskId: text("task_id").notNull().references(() => tasks.id, { onDelete: "cascade" }),
    content: text("content").notNull(),
    author: text("author").notNull(),
    githubCommentId: integer("github_comment_id"),
    createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").default(sql`CURRENT_TIMESTAMP`),
}, (table) => ({
    taskIdx: index("idx_comments_task").on(table.taskId)
}));

// Task Audit Events
export const taskEvents = sqliteTable("task_events", {
    id: text("id").primaryKey(),
    taskId: text("task_id"), // Can be null if event is generic
    githubIssueId: integer("github_issue_id"),
    requestId: text("request_id"), // Correlate events
    eventType: text("event_type").notNull(), // 'api_request', 'db_create', 'github_create', etc.
    objectType: text("object_type"), // 'task', 'issue', 'comment', 'epic', 'story'
    fieldName: text("field_name"), 
    oldValue: text("old_value"),
    newValue: text("new_value"),
    status: text("status").notNull(), // 'pending', 'success', 'failed'
    details: text("details"), // JSON string
    timestamp: text("timestamp").default(sql`CURRENT_TIMESTAMP`)
}, (table) => ({
    taskIdx: index("idx_events_task").on(table.taskId),
    reqIdx: index("idx_events_req").on(table.requestId)
}));