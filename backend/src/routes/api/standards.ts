
import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { McpSync } from "@services/standardization/mcp-sync";
import { SecretSync } from "@services/standardization/secret-sync";
import { getDb, schema } from "@db";
import { C } from "vitest/dist/chunks/reporters.d.BFLkQcL6.js";

const standardsApi = new Hono<{ Bindings: Env }>();

/**
 * GET /api/standards/config
 * Get current standardization configuration (e.g., active default secrets).
 */
standardsApi.get("/config", async (c) => {
    // In a real app, strict config is stored in DB.
    // For now, we return hardcoded or derived config.
    return c.json({
        mcp: {
            masterRepo: `${c.env.GITHUB_OWNER}/${c.env.STANDARDIZATION_REPO_NAME}` || "jmbish04/core-github-standardization",
            masterPath: "mcp.json"
        },
        secrets: {
            // We could return the list of secrets we *intend* to sync
            available: [
                "WORKER_API_KEY",
                "OPENAI_API_KEY",
                "ANTHROPIC_API_KEY",
                // ...
            ]
        }
    });
});

/**
 * POST /api/standards/refresh-mcp
 * Manual trigger to refresh mcp.json in a specific repo (or all).
 */
const RefreshSchema = z.object({
    owner: z.string(),
    repo: z.string()
});

standardsApi.post("/refresh-mcp", zValidator("json", RefreshSchema), async (c) => {
    const { owner, repo } = c.req.valid("json");
    
    // Asynchronously trigger sync
    c.executionCtx.waitUntil(
        McpSync.syncMcpConfig(c.env, owner, repo)
    );

    return c.json({ success: true, message: `Queued MCP sync for ${owner}/${repo}` });
});

/**
 * POST /api/standards/secrets/sync
 * Manual trigger to force sync secrets (same as ops route but specific to this domain).
 */
const SecretSyncSchema = z.object({
    owner: z.string(),
    repo: z.string()
});

standardsApi.post("/secrets/sync", zValidator("json", SecretSyncSchema), async (c) => {
    const { owner, repo } = c.req.valid("json");

    c.executionCtx.waitUntil(
        SecretSync.autoProvisionSecrets(c.env, owner, repo)
    );

    return c.json({ success: true, message: `Queued Secret sync for ${owner}/${repo}` });
});

export default standardsApi;
