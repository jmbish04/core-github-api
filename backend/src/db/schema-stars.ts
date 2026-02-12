/**
 * @file src/db/schema-stars.ts
 * @description Drizzle schema for User Starred Repositories (Awesome Stars).
 * @owner AI-Builder
 */

import { sqliteTable, text, integer, primaryKey, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { repositories } from "./schema-repos";

// ----------------------
// starred_repos
// ----------------------
export const starredRepos = sqliteTable(
    "starred_repos",
    {
        userId: text("user_id").notNull(), // GitHub login (e.g. "jmbish04")
        repoId: text("repo_id")
            .notNull()
            .references(() => repositories.id, { onDelete: "cascade" }), // "github:owner/name"
        
        starredAt: text("starred_at").default(sql`CURRENT_TIMESTAMP`),
        
        // Optional metadata from the sync payload if needed
        syncBatchId: text("sync_batch_id"), // Correlation ID for the sync run
    },
    (table) => ({
        pk: primaryKey({ columns: [table.userId, table.repoId] }),
        userIdx: index("idx_starred_repos_user").on(table.userId),
        repoIdx: index("idx_starred_repos_repo").on(table.repoId),
    })
);
