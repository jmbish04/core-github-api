import { index, primaryKey, sqliteTable, text , integer} from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const projectFavorites = sqliteTable(
  "project_favorites",
  {
    userId: text("user_id").notNull(),
    projectId: text("project_id"),
    repoOwner: text("repo_owner").notNull(),
    repoName: text("repo_name").notNull(),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    timeFavorited: text("time_favorited").notNull().default(sql`CURRENT_TIMESTAMP`),
    timeUnfavorited: text("time_unfavorited"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    pk: primaryKey({
      columns: [table.userId, table.repoOwner, table.repoName],
    }),
    userIdx: index("idx_project_favorites_user").on(table.userId),
  }),
);

