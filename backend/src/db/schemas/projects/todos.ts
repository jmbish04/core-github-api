/**
 * @file src/db/schema-todos.ts
 * @description Drizzle schema for General Todos (Post-it notes), Tags, Links, AI Insights,
 *              and Corkboard Labels.
 * @owner AI-Builder
 */

import { sql } from "drizzle-orm";
import {
    sqliteTable,
    text,
    integer,
    real,
    index,
    check
} from "drizzle-orm/sqlite-core";

// General Todo Items — also used as corkboard post-it notes
export const todos = sqliteTable(
    "todos",
    {
        id: text("id").primaryKey(), // UUID
        title: text("title"),
        content: text("content"), // JSON content from Editor
        status: text("status").notNull().default("pending"), // pending, done, archived
        priority: text("priority").default("normal"), // low, normal, high
        position: integer("position").default(0),
        isDeleted: integer("is_deleted").default(0),
        createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
        updatedAt: text("updated_at").default(sql`CURRENT_TIMESTAMP`),
        completedAt: text("completed_at"),

        // ── Corkboard / Post-it fields ────────────────────────────────────
        /** X position (px) on the corkboard canvas */
        posX: real("pos_x").default(40),
        /** Y position (px) on the corkboard canvas */
        posY: real("pos_y").default(40),
        /** Small rotation in degrees (-3 to +3) for the skewed look */
        rotation: real("rotation").default(0),
        /** Post-it note hex colour, e.g. #fde68a */
        noteColor: text("note_color").default("#fde68a"),
        /** 1 = active on board, 0 = done / archived */
        isActive: integer("is_active").default(1),
        /** ISO timestamp when the note was marked done */
        dateCompleted: text("date_completed"),
    },
    (table) => ({
        statusCheck: check("todo_status_check", sql`${table.status} IN ('pending','done','archived')`)
    })
);

// ── Corkboard Labels ──────────────────────────────────────────────────────────
/** Draggable torn-paper group labels pinned to the corkboard */
export const corkboardLabels = sqliteTable(
    "corkboard_labels",
    {
        id: text("id").primaryKey(), // UUID
        text: text("text").notNull(),
        posX: real("pos_x").default(60),
        posY: real("pos_y").default(20),
        rotation: real("rotation").default(0),
        isDeleted: integer("is_deleted").default(0),
        createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
        updatedAt: text("updated_at").default(sql`CURRENT_TIMESTAMP`),
    }
);

// Tags Master List
export const todoTags = sqliteTable(
    "todo_tags",
    {
        id: text("id").primaryKey(), // UUID or slug
        name: text("name").notNull().unique(),
        color: text("color").default("#94a3b8"), // Slate-400 default
        description: text("description"),
        isDeleted: integer("is_deleted").default(0)
    }
);

// Todo <-> Tags Mapping
export const todoTagMap = sqliteTable(
    "todo_tag_map",
    {
        todoId: text("todo_id").notNull(), // FK to todos.id
        tagId: text("tag_id").notNull(), // FK to todoTags.id
    },
    (table) => ({
        pk: index("pk_todo_tag_map").on(table.todoId, table.tagId),
        todoIdx: index("idx_tag_map_todo").on(table.todoId),
        tagIdx: index("idx_tag_map_tag").on(table.tagId)
    })
);

// Todo Links (for AI Analysis)
export const todoLinks = sqliteTable(
    "todo_links",
    {
        id: text("id").primaryKey(),
        todoId: text("todo_id").notNull(),
        href: text("href").notNull(),
        url: text("url"),
        content: text("content"), // Scraped content (Markdown)
        crawledAt: text("crawled_at"),
        createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`)
    },
    (table) => ({
        todoIdx: index("idx_links_todo").on(table.todoId)
    })
);

// AI Insights for Todos
export const todoAiInsights = sqliteTable(
    "todo_ai_insights",
    {
        id: text("id").primaryKey(),
        todoId: text("todo_id").notNull(),
        insight: text("insight").notNull(), // Markdown/Text suggestion
        type: text("type").notNull(), // 'offer_to_help', 'enrich_todo', 'research'
        status: text("status").notNull().default("pending_hil"), // pending_hil, done, rejected
        createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`)
    },
    (table) => ({
        todoIdx: index("idx_insights_todo").on(table.todoId),
        statusCheck: check("insight_status_check", sql`${table.status} IN ('pending_hil','done','rejected')`)
    })
);
