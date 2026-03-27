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

import { FlareclerkService, PRICING } from "@/cloudflare/flareclerk";
import { getDb, schema } from "@db";
import { or, sql } from "drizzle-orm";

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

function normalizeRepoSlug(owner: string, repo: string) {
    return `${owner}/${repo}`.toLowerCase();
}

cloudflareApi.get("/costs/fleet", async (c) => {
    const { getCloudflareApiToken, getCloudflareAccountId } = await import("@utils/secrets");
    const accountId = await getCloudflareAccountId(c.env);
    const apiToken = await getCloudflareApiToken(c.env);

    if (!accountId || !apiToken) {
        return c.json({ error: "Missing Cloudflare API credentials in environment" }, 500);
    }
    
    try {
        const range = parseDateRange(c.req.query("since"));
        const fc = new FlareclerkService(accountId, apiToken);
        
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
    const { getCloudflareApiToken, getCloudflareAccountId } = await import("@utils/secrets");
    const accountId = await getCloudflareAccountId(c.env);
    const apiToken = await getCloudflareApiToken(c.env);

    if (!accountId || !apiToken) {
        return c.json({ error: "Missing Cloudflare API credentials" }, 500);
    }
    
    try {
        const name = c.req.param("name");
        const range = parseDateRange(c.req.query("since"));
        const fc = new FlareclerkService(accountId, apiToken);
        
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

cloudflareApi.get("/costs/repository/:owner/:repo", async (c) => {
    const { getCloudflareApiToken, getCloudflareAccountId } = await import("@utils/secrets");
    const accountId = await getCloudflareAccountId(c.env);
    const apiToken = await getCloudflareApiToken(c.env);

    if (!accountId || !apiToken) {
        return c.json({ error: "Missing Cloudflare API credentials" }, 500);
    }

    try {
        const owner = c.req.param("owner");
        const repo = c.req.param("repo");
        const workerName = (c.req.query("workerName") || "").trim() || null;
        const range = parseDateRange(c.req.query("since"));
        const fc = new FlareclerkService(accountId, apiToken);
        const db = getDb(c.env.DB);
        const repoSlug = normalizeRepoSlug(owner, repo);

        const linkedApps = await db
            .select()
            .from(schema.applications)
            .where(
                or(
                    sql`lower(${schema.applications.githubRepo}) = ${repoSlug}`,
                    sql`lower(${schema.applications.name}) = ${repo.toLowerCase()}`,
                    workerName ? sql`lower(${schema.applications.name}) = ${workerName.toLowerCase()}` : sql`0 = 1`,
                ),
            );

        const appByName = new Map(linkedApps.map((app) => [app.name.toLowerCase(), app]));
        const scriptNames = new Set<string>();
        if (workerName) scriptNames.add(workerName);
        for (const app of linkedApps) {
            scriptNames.add(app.name);
        }

        const discoveredWorkers = await Promise.allSettled(
            Array.from(scriptNames).map(async (scriptName) => {
                const worker = await fc.discoverWorker(scriptName);
                return worker;
            }),
        );

        const workerTargets = discoveredWorkers
            .filter((result): result is PromiseFulfilledResult<any> => result.status === "fulfilled")
            .map((result) => result.value);

        const workerPricing = new Map<string, any>();
        if (workerTargets.length > 0) {
            const analytics = await fc.fetchAnalytics(workerTargets, range);
            const aggregated = fc.aggregateResults(workerTargets, analytics, range.prorata);
            const priced = fc.priceResults(aggregated).appResults;
            for (const result of priced) {
                workerPricing.set(result.name.toLowerCase(), result);
            }
        }

        const linkedWorkerNames = new Set(workerTargets.map((worker) => worker.scriptName.toLowerCase()));
        const resources = linkedApps.map((app) => {
            const spend = workerPricing.get(app.name.toLowerCase()) || null;
            const spendAvailable = Boolean(spend);
            return {
                id: app.id,
                name: app.name,
                type: app.type,
                githubRepo: app.githubRepo,
                url: app.url,
                summary: app.summary,
                lastDeployedDate: app.lastDeployedDate?.toISOString() || null,
                spendAvailable,
                spendSource: spendAvailable ? (app.type === "pages" ? "pages-project-script" : "worker-script") : null,
                reason: spendAvailable
                    ? null
                    : app.type === "pages"
                        ? "No directly priced Worker script was discovered for this Pages project."
                        : "No Cloudflare Worker analytics were discovered for this application.",
                spend,
            };
        });

        if (workerName && !appByName.has(workerName.toLowerCase()) && linkedWorkerNames.has(workerName.toLowerCase())) {
            resources.unshift({
                id: `worker:${workerName}`,
                name: workerName,
                type: "worker",
                githubRepo: `${owner}/${repo}`,
                url: null,
                summary: null,
                lastDeployedDate: null,
                spendAvailable: true,
                spendSource: "overview-worker",
                reason: null,
                spend: workerPricing.get(workerName.toLowerCase()) || null,
            });
        }

        const totals = resources.reduce(
            (acc, resource) => {
                const spend = resource.spend;
                if (!spend) return acc;
                acc.workers += spend.workersCost || 0;
                acc.durableObjects += spend.doCost || 0;
                acc.containers += spend.containerCost || 0;
                acc.d1 += spend.d1Cost || 0;
                acc.kv += spend.kvCost || 0;
                acc.grossTotal += spend.grossTotal || 0;
                return acc;
            },
            { workers: 0, durableObjects: 0, containers: 0, d1: 0, kv: 0, grossTotal: 0 },
        );

        return c.json({
            since: range.sinceISO,
            until: range.untilISO,
            repository: { owner, repo, fullName: `${owner}/${repo}` },
            resources,
            totals,
        }, 200);
    } catch (err: any) {
        return c.json({ error: err.message }, 500);
    }
});

export default cloudflareApi;
