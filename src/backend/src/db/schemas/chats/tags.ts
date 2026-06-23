import { sqliteTable, text, integer, primaryKey } from "drizzle-orm/sqlite-core";
import { threads } from './threads';
import { messages } from './messages';

// chat_tags table
export const chatTag = sqliteTable("chat_tag", {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    description: text("description").notNull(),
    hexColor: text("hex_color").notNull().unique(),
    isActive: integer({mode: 'boolean'}).default(true),
    createdAt: integer('created_at', { mode: 'timestamp' })
        .$defaultFn(() => new Date())
        .notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp' })
        .$defaultFn(() => new Date())
        .notNull(),
});

export const chatTagMapping = sqliteTable("chat_tag_mapping", {
    threadId: text("thread_id").notNull().references(() => threads.id, { onDelete: "cascade" }),
    messageId: integer("message_id").notNull().references(() => messages.id, { onDelete: "cascade" }),
    tagId: integer("tag_id").notNull().references(() => chatTag.id, { onDelete: "cascade" }),
    rationale: text("rationale").notNull(),
    notes: text("notes"),
}, (table) => ({
    pk: primaryKey({ columns: [table.threadId, table.messageId, table.tagId] })
}));