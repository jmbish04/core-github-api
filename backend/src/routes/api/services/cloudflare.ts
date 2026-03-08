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

import { FlareclerkService, PRICING } from "@/services/cloudflare/flareclerk";

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

// ─── Billing & Costs (Flareclerk Integration) ─────────────────────────────────

function parseDateRange(sinceStr?: string) {
    const now = new Date();
    let start = new Date(now.getFullYear(), now.getMonth(), 1);
    
    if (sinceStr) {
        if (/^\d+d$/.test(sinceStr)) {
            const days = parseInt(sinceStr);
            start = new Date(now.getTime() - days * 86400_000);
        } else if (/^\d{4}-\d{2}-\d{2}$/.test(sinceStr)) {
            start = new Date(sinceStr + "T00:00:00Z");
        }
    }
    
    return {
        sinceISO: start.toISOString().slice(0, 19) + "Z",
        untilISO: now.toISOString().slice(0, 19) + "Z",
        sinceDate: start.toISOString().slice(0, 10),
        untilDate: now.toISOString().slice(0, 10),
        prorata: (now.getTime() - start.getTime()) / (30 * 86400_000)
    };
}

cloudflareApi.get("/costs/fleet", async (c) => {
    if (!(c.env as any).CF_ACCOUNT_ID || !(c.env as any).CF_API_TOKEN) {
        return c.json({ error: "Missing Cloudflare API credentials in environment" }, 500);
    }
    
    try {
        const range = parseDateRange(c.req.query("since"));
        const fc = new FlareclerkService((c.env as any).CF_ACCOUNT_ID, (c.env as any).CF_API_TOKEN);
        
        const workers = await fc.discoverFleet();
        const analytics = await fc.fetchAnalytics(workers, range);
        const appResults = fc.aggregateResults(workers, analytics, range.prorata);
        const fleet = fc.applyFreeTier(appResults);

        return c.json({
            since: range.sinceISO,
            until: range.untilISO,
            workers: fleet.appResults,
            grossFleetTotal: fleet.grossFleetTotal,
            freeTierDiscount: fleet.freeTierDiscount,
            netFleetTotal: fleet.netFleetTotal,
            platform: PRICING.platform,
            total: fleet.netFleetTotal + PRICING.platform,
        }, 200);
    } catch (err: any) {
        return c.json({ error: err.message }, 500);
    }
});

cloudflareApi.get("/costs/worker/:name", async (c) => {
    if (!(c.env as any).CF_ACCOUNT_ID || !(c.env as any).CF_API_TOKEN) {
        return c.json({ error: "Missing Cloudflare API credentials" }, 500);
    }
    
    try {
        const name = c.req.param("name");
        const range = parseDateRange(c.req.query("since"));
        const fc = new FlareclerkService((c.env as any).CF_ACCOUNT_ID, (c.env as any).CF_API_TOKEN);
        
        const worker = await fc.discoverWorker(name);
        const analytics = await fc.fetchAnalytics([worker], range);
        const appResults = fc.aggregateResults([worker], analytics, range.prorata);
        const fleet = fc.applyFreeTier(appResults);

        return c.json({
            since: range.sinceISO,
            until: range.untilISO,
            worker: fleet.appResults[0],
            platform: PRICING.platform
        }, 200);
    } catch (err: any) {
        return c.json({ error: err.message }, 500);
    }
});

export default cloudflareApi;
