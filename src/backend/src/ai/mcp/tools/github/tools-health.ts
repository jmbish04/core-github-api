/**
 * @file ai/mcp/tools/github/tools-health.ts
 * @description Functional health check for the GitHub MCP tools.
 *
 * Tests that the core GitHub tools are reachable and authorized by:
 * 1. Verifying the GitHub App token resolves (via /installation/repositories)
 * 2. Testing search API connectivity (search repositories)
 * 3. Testing repo content API (list tree on the health-test repo)
 * 4. Testing issues list API read access
 *
 * This is separate from the full lifecycle test in health.ts (which creates/deletes real content).
 * These checks are read-only and safe to run on every health poll.
 */

import { HealthStepResult } from "@/health/types";
import { getGitHubAppId, getGitHubPrivateKey } from "@/utils/secrets";
import { generateJWT, getInstallationAccessToken } from "@/utils/github/auth";
import { DEFAULT_GITHUB_OWNER } from "@github-utils";

interface SubCheck { status: "OK" | "FAILURE" | "SKIPPED"; latency?: number; error?: string; details?: Record<string, unknown>; }

export async function checkGitHubToolsHealth(env: Env): Promise<HealthStepResult> {
    const start = Date.now();
    const checks: Record<string, SubCheck> = {};

    let token: string | undefined;

    try {
        const appId = await getGitHubAppId(env);
        const privateKey = await getGitHubPrivateKey(env);

        if (appId && privateKey) {
            const jwt = await generateJWT(appId, privateKey);
            const res = await fetch("https://api.github.com/app/installations", {
                headers: {
                    Authorization: `Bearer ${jwt}`,
                    Accept: "application/vnd.github+json",
                    "User-Agent": "Cloudflare-Workers-GitHub-App",
                }
            });
            if (res.ok) {
                const installations = await res.json() as any[];
                const install = installations.find((i: any) => i.account.login === DEFAULT_GITHUB_OWNER) || installations[0];
                if (install) {
                    token = await getInstallationAccessToken(appId, privateKey, install.id);
                }
            }
        }
    } catch (e: any) {
        console.error("Failed to acquire App Installation token for health checks:", e);
    }

    if (!token) {
        return {
            name: "GitHub MCP Tools",
            status: "failure",
            message: "Missing GitHub App Configuration — all GitHub tools are non-functional",
            durationMs: Date.now() - start,
            details: { auth: { status: "FAILURE", error: "Token not resolved" } }
        };
    }

    const headers = {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "Cloudflare-Workers-GitHub-App",
    };

    const run = async (name: string, fn: () => Promise<SubCheck>) => {
        try {
            checks[name] = await fn();
        } catch (e: any) {
            checks[name] = { status: "FAILURE", error: e.message };
        }
    };

    // 1. Auth — GET /installation/repositories (App tokens cannot access /user)
    await run("auth", async () => {
        const t = Date.now();
        const res = await fetch("https://api.github.com/installation/repositories?per_page=1", { headers });
        if (!res.ok) throw new Error(`GET /installation/repositories → HTTP ${res.status}`);
        const data = await res.json() as { total_count: number };
        return { status: "OK", latency: Date.now() - t, details: { total_repositories: data.total_count } };
    });

    // 2. Search repositories (read-only)
    await run("searchRepositories", async () => {
        const t = Date.now();
        const res = await fetch(
            `https://api.github.com/search/repositories?q=org%3A${encodeURIComponent(DEFAULT_GITHUB_OWNER)}+is%3Apublic&per_page=1`,
            { headers }
        );
        if (!res.ok) throw new Error(`Search repos → HTTP ${res.status}`);
        const data = await res.json() as { total_count: number };
        return { status: "OK", latency: Date.now() - t, details: { totalCount: data.total_count } };
    });

    // 3. List repo tree (read-only)
    const testRepo = env.HEALTH_TEST_REPO_NAME || "testing-oktokit-commands";
    await run("listRepoTree", async () => {
        const t = Date.now();
        const res = await fetch(
            `https://api.github.com/repos/${DEFAULT_GITHUB_OWNER}/${testRepo}/git/trees/HEAD?recursive=0`,
            { headers }
        );
        if (!res.ok) throw new Error(`List tree → HTTP ${res.status}`);
        const data = await res.json() as { sha: string; tree: unknown[] };
        return { status: "OK", latency: Date.now() - t, details: { sha: data.sha, entryCount: data.tree.length } };
    });

    // 4. List issues (read-only)
    await run("listIssues", async () => {
        const t = Date.now();
        const res = await fetch(
            `https://api.github.com/repos/${DEFAULT_GITHUB_OWNER}/${testRepo}/issues?state=all&per_page=1`,
            { headers }
        );
        if (!res.ok) throw new Error(`List issues → HTTP ${res.status}`);
        return { status: "OK", latency: Date.now() - t };
    });

    // 5. List pull requests (read-only)
    await run("listPullRequests", async () => {
        const t = Date.now();
        const res = await fetch(
            `https://api.github.com/repos/${DEFAULT_GITHUB_OWNER}/${testRepo}/pulls?state=all&per_page=1`,
            { headers }
        );
        if (!res.ok) throw new Error(`List PRs → HTTP ${res.status}`);
        return { status: "OK", latency: Date.now() - t };
    });

    // 6. Rate limit status
    await run("rateLimit", async () => {
        const t = Date.now();
        const res = await fetch("https://api.github.com/rate_limit", { headers });
        if (!res.ok) throw new Error(`Rate limit → HTTP ${res.status}`);
        const data = await res.json() as { rate: { remaining: number; limit: number; reset: number } };
        const remaining = data.rate?.remaining ?? 0;
        if (remaining < 50) throw new Error(`Rate limit critically low: ${remaining}/${data.rate?.limit} remaining`);
        return {
            status: "OK",
            latency: Date.now() - t,
            details: { remaining: data.rate?.remaining, limit: data.rate?.limit, resetAt: new Date(data.rate?.reset * 1000).toISOString() }
        };
    });

    const hasFailure = Object.values(checks).some(c => c.status === "FAILURE");

    return {
        name: "GitHub MCP Tools",
        status: hasFailure ? "failure" : "success",
        message: hasFailure
            ? `GitHub tool checks failed: ${Object.entries(checks).filter(([, v]) => v.status === "FAILURE").map(([k]) => k).join(", ")}`
            : "All GitHub MCP tools operational",
        durationMs: Date.now() - start,
        details: checks,
    };
}
