import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";

/**
 * Tracks the last-scanned state for each Discord channel so the scanner
 * knows exactly where to resume from on the next run.
 */
export const discordScanLog = sqliteTable(
  "discord_scan_log",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    guildId: text("guild_id").notNull(),
    channelId: text("channel_id").notNull().unique(),
    channelName: text("channel_name"),
    /** The Discord message Snowflake ID of the last message we ingested. */
    lastMessageId: text("last_message_id"),
    /** Unix epoch (seconds) of the last successful scan for this channel. */
    lastScannedAt: integer("last_scanned_at", { mode: "timestamp" }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp" })
      .default(sql`(strftime('%s', 'now'))`)
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .default(sql`(strftime('%s', 'now'))`)
      .notNull(),
  },
  (t) => ({
    guildIdx: index("discord_scan_log_guild_id_idx").on(t.guildId),
  })
);

/**
 * Stores every Discord message we have ingested so we can:
 *  - avoid re-analysing content we have already seen
 *  - look up a message by its Discord ID for deduplication
 *  - surface insights through the research pipeline
 */
export const discordMessages = sqliteTable(
  "discord_messages",
  {
    /** Discord Snowflake ID — used as the primary key for deduplication. */
    id: text("id").primaryKey(),
    guildId: text("guild_id").notNull(),
    channelId: text("channel_id").notNull(),
    channelName: text("channel_name"),
    authorId: text("author_id"),
    authorUsername: text("author_username"),
    content: text("content").notNull(),
    /** ISO-8601 timestamp returned by Discord. */
    discordTimestamp: text("discord_timestamp").notNull(),
    /**
     * Coarse category derived from the channel name:
     * 'what-i-built' | 'announcement' | 'binding' | 'general'
     */
    category: text("category", {
      enum: ["what-i-built", "announcement", "binding", "general"],
    })
      .default("general")
      .notNull(),
    /** AI-assigned interest score 0–100. NULL until analysed. */
    aiScore: integer("ai_score"),
    /** One-sentence AI summary / reasoning. NULL until analysed. */
    aiSummary: text("ai_summary"),
    /** Whether this message has been through the AI analysis pass. */
    analysed: integer("analysed", { mode: "boolean" }).default(false).notNull(),
    ingestedAt: integer("ingested_at", { mode: "timestamp" })
      .default(sql`(strftime('%s', 'now'))`)
      .notNull(),
  },
  (t) => ({
    channelIdx: index("discord_messages_channel_id_idx").on(t.channelId),
    guildIdx: index("discord_messages_guild_id_idx").on(t.guildId),
    categoryIdx: index("discord_messages_category_idx").on(t.category),
    analysedIdx: index("discord_messages_analysed_idx").on(t.analysed),
  })
);
