/**
 * @file src/db/schema-reviews.ts
 * @description Drizzle schema for Code Review Comments and Enrichments.
 * @owner AI-Builder
 */

import {
    sqliteTable,
    integer,
    text,
    index
} from "drizzle-orm/sqlite-core";

/**
 * A single “run” of extracting code review comments from a PR
 * (e.g., one GitHub PR + one AI reviewer like gemini-code-assist).
 */
export const codeReviewRuns = sqliteTable(
    "code_review_runs",
    {
        id: integer("id").primaryKey({ autoIncrement: true }),

        provider: text("provider").notNull(),          // "github"
        repoOwner: text("repo_owner").notNull(),      // "env.GITHUB_OWNER"
        repoName: text("repo_name").notNull(),        // "jh-poc-chrome-extension"
        repoFullName: text("repo_full_name").notNull(), // "env.GITHUB_OWNER/jh-poc-chrome-extension"

        prNumber: integer("pr_number").notNull(),     // 7
        prTitle: text("pr_title"),                    // optional, useful for context
        prUrl: text("pr_url"),                        // https://github.com/.../pull/7

        aiReviewer: text("ai_reviewer").notNull(),    // "gemini-code-assist"
        aiReviewerLogin: text("ai_reviewer_login"),   // "gemini-code-assist[bot]"
        aiReviewerAvatarUrl: text("ai_reviewer_avatar_url"),

        extractedAt: text("extracted_at").notNull(),  // ISO8601 when you ran the scraper
        createdAt: text("created_at").notNull(),      // same as extractedAt or first seen
        updatedAt: text("updated_at").notNull()       // last time you refreshed this run
    },
    (table) => ({
        repoPrIdx: index("idx_code_review_runs_repo_pr").on(
            table.repoOwner,
            table.repoName,
            table.prNumber
        ),
        providerRepoPrIdx: index("idx_code_review_runs_provider_repo_pr").on(
            table.provider,
            table.repoFullName,
            table.prNumber
        )
    })
);

/**
 * Individual AI code review comments (e.g., Gemini suggestions on one PR).
 * This is where you’ll hang embeddings, status, assignee, etc.
 */
export const codeReviewComments = sqliteTable(
    "code_review_comments",
    {
        id: integer("id").primaryKey({ autoIncrement: true }),

        // Foreign keys / context
        runId: integer("run_id")
            .notNull()
            .references(() => codeReviewRuns.id, { onDelete: "cascade" }),

        provider: text("provider").notNull(),         // "github"
        repoOwner: text("repo_owner").notNull(),
        repoName: text("repo_name").notNull(),
        repoFullName: text("repo_full_name").notNull(),
        prNumber: integer("pr_number").notNull(),

        // GitHub discussion id and URL
        externalId: integer("external_id").notNull(), // 2484234947 (GitHub discussion_r...)
        htmlUrl: text("html_url").notNull(),

        // File + location
        filePath: text("file_path").notNull(),        // "src/index.ts"
        line: integer("line"),                        // current line in diff
        startLine: integer("start_line"),             // start of comment range
        originalLine: integer("original_line"),       // original line in base commit

        // Raw content
        bodyMarkdown: text("body_markdown").notNull(), // full body with markdown
        diffHunk: text("diff_hunk"),                   // Git diff hunk snippet

        // Parsed / normalized fields (optional but useful)
        priority: text("priority"),                   // "high","medium","low","unknown"
        summary: text("summary"),                     // short natural language summary
        mainSuggestionCode: text("main_suggestion_code"), // extracted code block if any

        // Author info (usually the AI bot)
        authorLogin: text("author_login").notNull(),  // "gemini-code-assist[bot]"
        authorAvatarUrl: text("author_avatar_url"),

        // Lifecycle
        createdAt: text("created_at").notNull(),      // from GitHub
        updatedAt: text("updated_at"),                // if you track edits
        lastSeenAt: text("last_seen_at"),             // last time you synced

        // Status + assignment (for “who is supposed to fix this / what happened?”)
        status: text("status")
            .notNull()
            // suggested conventions:
            // "open", "in_progress", "fixed", "suggestion_accepted",
            // "suggestion_rejected", "wont_fix", "obsolete"
            .default("open"),
        assignee: text("assignee")
            .notNull()
            // suggested values:
            // "worker_ai", "codex", "claude", "copilot", "gemini",
            // "human", "unassigned"
            .default("unassigned"),
        resolvedAt: text("resolved_at"),
        resolutionNotes: text("resolution_notes"),

        // Categorization / tags
        category: text("category"),                   // e.g. "error_handling","ai_integration"
        tagsJson: text("tags_json"),                  // JSON array like ["cloudflare","workers","ai"]

        // Embedding / vector search metadata
        embeddingId: text("embedding_id"),            // id in Vectorize or other store
        embeddingModel: text("embedding_model"),      // "@cf/baai/bge-large-en-v1.5", etc.
        lastVectorizedAt: text("last_vectorized_at"), // ISO8601
    },
    (table) => ({
        runIdx: index("idx_code_review_comments_run").on(table.runId),
        repoPrIdx: index("idx_code_review_comments_repo_pr").on(
            table.repoOwner,
            table.repoName,
            table.prNumber
        ),
        extIdIdx: index("idx_code_review_comments_external_id").on(table.externalId)
    })
);

/**
 * Enrichments / follow-ups for a given comment.
 * This is where you store Cloudflare Docs MCP answers, GitHub lookups,
 * internal heuristics, etc.
 */
export const codeReviewCommentEnrichments = sqliteTable(
    "code_review_comment_enrichments",
    {
        id: integer("id").primaryKey({ autoIncrement: true }),

        commentId: integer("comment_id")
            .notNull()
            .references(() => codeReviewComments.id, { onDelete: "cascade" }),

        // e.g. "cloudflare-docs-mcp", "github-api", "rules-engine"
        source: text("source").notNull(),
        toolName: text("tool_name"), // specific tool, e.g. "cloudflare-docs", "github-rest"

        // Free-form details of the enrichment
        requestSummary: text("request_summary"),       // short description of what was asked
        requestPayloadJson: text("request_payload_json"), // full JSON payload, if you want to keep it

        responseSummary: text("response_summary"),     // short natural language summary
        responseBody: text("response_body"),           // full text from MCP / API etc.
        responseMetadataJson: text("response_metadata_json"), // status codes, URLs, etc.

        createdAt: text("created_at").notNull()
    },
    (table) => ({
        commentIdx: index("idx_enrichments_comment").on(table.commentId),
        sourceIdx: index("idx_enrichments_source").on(table.source)
    })
);

// env.DB_WEBHOOKS env.DB
