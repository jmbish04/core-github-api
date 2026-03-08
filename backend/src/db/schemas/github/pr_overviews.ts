import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";

export const prOverviews = sqliteTable(
    "pr_overviews",
    {
        id: integer("id").primaryKey({ autoIncrement: true }),
        repoOwner: text("repo_owner").notNull(),
        repoName: text("repo_name").notNull(),
        prNumber: integer("pr_number").notNull(),
        
        aiSummary: text("ai_summary").notNull(),
        
        createdAt: text("created_at").notNull(),
        updatedAt: text("updated_at").notNull()
    },
    (table) => ({
        lookupIdx: index("idx_pr_overviews_lookup").on(
            table.repoOwner,
            table.repoName,
            table.prNumber
        )
    })
);
