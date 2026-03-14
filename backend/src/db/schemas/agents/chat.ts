import { sqliteTable, text, integer, primaryKey } from "drizzle-orm/sqlite-core";
import { repositories } from "@db/schemas/github/repos";

// chat_threads table
export const chatThreads = sqliteTable("chat_threads", {
    id: text("id").primaryKey(), // UUID
    subject: text("subject"), // AI generated subject line
    repoId: text("repo_id").references(() => repositories.id, { onDelete: "set null" }),
    agentId: text("agent_id"), // Optional: ID of the specific agent (e.g., "cloudflare-docs", "researcher")
    timestampStarted: text("timestamp_started").notNull(), // ISO8601
});

// chat_messages table
export const chatMessages = sqliteTable("chat_messages", {
    id: integer("id").primaryKey({ autoIncrement: true }),
    threadId: text("thread_id").notNull().references(() => chatThreads.id, { onDelete: "cascade" }),
    timestamp: text("timestamp").notNull(), // ISO8601
    author: text("author").notNull(), // 'user' | 'agent'
    message: text("message").notNull(),
});

// chat_tags table
