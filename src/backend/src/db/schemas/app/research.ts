// env.DB
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const agentSessions = sqliteTable("agent_sessions", {
    sessionId: text("session_id").primaryKey(),
    status: text("status").notNull(),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
});

export const researchFindings = sqliteTable("research_findings", {
    id: text("id").primaryKey(),
    sessionId: text("session_id").notNull(),
    repoUrl: text("repo_url").notNull(),
    summary: text("summary").notNull(),
    agentRole: text("agent_role").notNull(),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
});

export const newsletterRepos = sqliteTable("newsletter_repos", {
    repoUrl: text("repo_url").primaryKey(),
    publishedAt: integer("published_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
});
