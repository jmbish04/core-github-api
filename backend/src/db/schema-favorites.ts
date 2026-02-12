import { index, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const projectFavorites = sqliteTable(
  "project_favorites",
  {
    userId: text("user_id").notNull(),
    repoOwner: text("repo_owner").notNull(),
    repoName: text("repo_name").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    pk: primaryKey({
      columns: [table.userId, table.repoOwner, table.repoName],
    }),
    userIdx: index("idx_project_favorites_user").on(table.userId),
  }),
);

