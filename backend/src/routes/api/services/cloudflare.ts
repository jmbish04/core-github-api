/**
 * @file backend/src/routes/api/cloudflare.ts
 * @description REST endpoints for Cloudflare resource browsing and browser rendering.
 *
 * Routes:
 *   POST /api/cloudflare/resources   — invoke any cf_* Zod tool by name
 *   POST /api/cloudflare/browser/:mode — browser rendering (screenshot | markdown | scrape)
 */

import { Hono } from "hono";
import { getAllCloudflareTools } from "@/ai/mcp/tools/cloudflare/registry";
import { BrowserService } from "@/ai/mcp/tools/cloudflare/browser-render/index";

const cloudflareApi = new Hono<{ Bindings: Env }>();

// ─── Resources proxy ──────────────────────────────────────────────────────────
cloudflareApi.post("/resources", async (c) => {
    const body = await c.req.json<{ tool: string; args?: Record<string, unknown> }>();

    if (!body.tool) {
        return c.json({ error: "Missing 'tool' field" }, 400);
    }

    const tools = getAllCloudflareTools(c.env);
    const tool = tools.find(t => t.name === body.tool);

    if (!tool) {
        return c.json({
            error: `Unknown tool: ${body.tool}`,
            available: tools.map(t => t.name)
        }, 404);
    }

    try {
        const result = await tool.execute(body.args ?? {} as any);
        return c.json({ result, tool: body.tool }, 200);
    } catch (err: any) {
        return c.json({ error: err.message, tool: body.tool }, 500);
    }
});

// ─── Browser rendering ─────────────────────────────────────────────────────────
cloudflareApi.post("/browser/screenshot", async (c) => {
    const body = await c.req.json<{ url: string }>();
    if (!body.url) return c.json({ error: "Missing url" }, 400);
    try {
        const svc = new BrowserService(c.env);
        const b64 = await svc.getScreenshotBase64(body.url);
        return c.json(b64, 200);
    } catch (err: any) {
        return c.json({ error: err.message }, 500);
    }
});

cloudflareApi.post("/browser/markdown", async (c) => {
    const body = await c.req.json<{ url: string }>();
    if (!body.url) return c.json({ error: "Missing url" }, 400);
    try {
        const svc = new BrowserService(c.env);
        const result = await svc.getMarkdown({ url: body.url });
        return c.json(result, 200);
    } catch (err: any) {
        return c.json({ error: err.message }, 500);
    }
});

cloudflareApi.post("/browser/scrape", async (c) => {
    const body = await c.req.json<{ url: string; selectors?: string[] }>();
    if (!body.url) return c.json({ error: "Missing url" }, 400);
    try {
        const svc = new BrowserService(c.env);
        const elements = (body.selectors || ["body"]).map(s => ({ selector: s }));
        const result = await svc.scrape({ url: body.url, elements });
        return c.json(result, 200);
    } catch (err: any) {
        return c.json({ error: err.message }, 500);
    }
});

export default cloudflareApi;
