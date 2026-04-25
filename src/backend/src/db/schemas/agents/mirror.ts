import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

/**
 * Mirror table for stateful agent data.
 * Allows historical tracking and integration with continuous learning modules.
 */
export const agentStateMirror = sqliteTable(
  "agent_state_mirror",
  {
    id: text("id").primaryKey(),
    agentType: text("agent_type").notNull(), // e.g. "GuardrailAgent"
    agentId: text("agent_id").notNull(),     // The DO name or ID
    stateJson: text("state_json").notNull(), // Full state snapshot
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    agentIdx: index("idx_agent_state_mirror_agent").on(table.agentId),
    typeIdx: index("idx_agent_state_mirror_type").on(table.agentType),
  })
);

/**
 * Historical logs for ChatRoom interactions (any agent collaboration session).
 * Mirrored from the Durable Object WebSocket messages.
 */
export const chatRoomLogs = sqliteTable(
  "chat_room_logs",
  {
    id: text("id").primaryKey(),
    roomId: text("room_id").notNull(),
    userId: text("user_id"),
    userName: text("user_name"),
    messageType: text("message_type").notNull(), // "message", "join", "leave"
    content: text("content"),
    metadataJson: text("metadata_json"),
    timestamp: text("timestamp")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    roomIdx: index("idx_chat_room_logs_room").on(table.roomId),
    timestampIdx: index("idx_chat_room_logs_timestamp").on(table.timestamp),
  })
);

/**
 * D1 mirror of ChatRoom DO SQLite `chat_subscribers`.
 * Persists which agents are subscribed to each room — survives redeploys.
 * On agent `onStart()`, rooms can be re-subscribed by querying this table.
 */
export const chatRoomSubscribers = sqliteTable(
  "chat_room_subscribers",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    roomId: text("room_id").notNull(),
    agentName: text("agent_name").notNull(),
    subscribedAt: integer("subscribed_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    roomIdx: index("idx_chat_room_subscribers_room").on(table.roomId),
    agentIdx: index("idx_chat_room_subscribers_agent").on(table.agentName),
    uniqueIdx: index("idx_chat_room_subscribers_unique").on(table.roomId, table.agentName),
  })
);

/**
 * D1 mirror of GuardrailAgent DO SQLite `guardrail_evaluations`.
 * Every evaluation verdict is written here immediately after the DO write.
 * Enables frontend dashboards, trend analysis, and full audit trails.
 */
export const guardrailEvaluations = sqliteTable(
  "guardrail_evaluations",
  {
    requestId: text("request_id").primaryKey(),
    agentId: text("agent_id").notNull(),    // DO instance ID (multi-instance tracing)
    status: text("status").notNull(),        // "pass" | "warn" | "fail" | "intercepting_stream"
    score: integer("score").notNull(),
    issuesJson: text("issues_json"),         // JSON array of VerdictIssue[]
    evaluatedAt: text("evaluated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    statusIdx: index("idx_guardrail_evals_status").on(table.status),
    agentIdx: index("idx_guardrail_evals_agent").on(table.agentId),
    timeIdx: index("idx_guardrail_evals_time").on(table.evaluatedAt),
  })
);

/**
 * D1 mirror of GuardrailAgent DO SQLite `guardrail_rule_cache`.
 * Persists fetched golden-path rule content so it survives redeployment.
 * Acts as a warm-start seed: on `onStart()` the agent can pre-populate its
 * DO SQLite cache from this table instead of re-fetching from Cloudflare Docs.
 */
export const guardrailRuleCache = sqliteTable(
  "guardrail_rule_cache",
  {
    ruleKey: text("rule_key").primaryKey(),
    agentId: text("agent_id").notNull(),
    content: text("content").notNull(),
    cachedAt: integer("cached_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    agentIdx: index("idx_guardrail_rule_cache_agent").on(table.agentId),
    timeIdx: index("idx_guardrail_rule_cache_time").on(table.cachedAt),
  })
);
