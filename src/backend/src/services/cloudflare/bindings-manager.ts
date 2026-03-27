
import { getOctokitAsBot, getOctokitAsUser } from '../github/client';
import { Logger } from '@/lib/logger';
import { generateStructuredResponse } from '@/ai/providers';
import { z } from 'zod';
import { getCloudflareAccountId } from '@/utils/secrets';
import { getCfSdkClient } from '@/cloudflare/client';

const CloudflareBindingsSchema = z.object({
    worker_name: z.string().describe("The name of the Cloudflare Worker extracted from the configuration file."),
    bindings: z.object({
        d1_databases: z.array(z.object({
            binding: z.string().describe("The binding name (e.g., DB)"),
            database_name: z.string().describe("The proposed standardized name (e.g., {worker_name})"),
            database_id: z.string().optional().describe("The existing database ID if present")
        })),
        kv_namespaces: z.array(z.object({
            binding: z.string().describe("The binding name"),
            title: z.string().describe("The proposed standardized title (e.g., {worker_name}-kv)"),
            id: z.string().optional().describe("The existing namespace ID if present")
        })),
        r2_buckets: z.array(z.object({
            binding: z.string().describe("The binding name"),
            bucket_name: z.string().describe("The proposed standardized bucket name (e.g., {worker_name}-assets)")
        }))
    })
});

type ParsedBindings = z.infer<typeof CloudflareBindingsSchema>;

async function fetchFileSecure(octokit: any, owner: string, repo: string, path: string, ref?: string) {
    try {
        const { data } = await octokit.rest.repos.getContent({
            owner,
            repo,
            path,
            ref
        });
        if (!Array.isArray(data) && data.type === 'file') {
            return atob(data.content.replace(/\n/g, ""));
        }
    } catch {
        return null;
    }
    return null;
}

export class CloudflareBindingsManager {
    private logger: Logger;

    constructor(private env: Env) {
        this.logger = new Logger(env, "CloudflareBindingsManager");
    }

    public async auditPullRequest(owner: string, repo: string, prNumber: number) {
        this.logger.info(`Auditing Pull Request: ${owner}/${repo}#${prNumber}`);
        const octokitApp = await getOctokitAsBot(this.env);
        
        // 1. Fetch Config
        const { content, filename } = await this.extractConfig(octokitApp, owner, repo);
        
        // 2. LLM Parse
        const parsed = await this.parseConfigWithLLM(content);
        
        // 3. API Verification & Auto-Provision
        const provisioned = await this.verifyAndProvisionBindings(parsed);
        
        // 4. Construct
        const newWranglerJsonc = this.buildModernConfig(provisioned);
        
        // 5. Ecosystem Audit
        const { pkgJsonTxt, agentsMdTxt, agentsMdUrl } = await this.auditEcosystem(octokitApp, owner, repo, provisioned.bindings.d1_databases.length > 0);

        // 6. Delivery (Comment on PR)
        let prAssignee = "@copilot";
        try {
            const { data: prData } = await octokitApp.rest.pulls.get({ owner, repo, pull_number: prNumber });
            if (prData.assignees && prData.assignees.length > 0) {
                prAssignee = `@${prData.assignees[0].login}`;
            } else if (prData.user) {
                prAssignee = `@${prData.user.login}`;
            }
        } catch (e: any) {
            this.logger.warn(`Failed to fetch PR assignees: ${e.message}`);
        }

        let body = `${prAssignee} \`CloudflareBindingsManager\` has audited this repository and generated standardized infrastructure.\n\nPlease update the following files and commit to the PR:\n\n### 1. \`wrangler.jsonc\`\nReplace the entire file with this modernized configuration:\n\`\`\`jsonc\n${newWranglerJsonc}\n\`\`\``;
        if (filename === 'wrangler.toml') {
            body += `\n\n> ⚠️ **Important**: Please DELETE \`wrangler.toml\`. We are migrating to \`wrangler.jsonc\`.`;
        }
        if (pkgJsonTxt) {
            body += `\n\n### 2. \`package.json\`\nEnsure your deployment scripts match the standard:\n\`\`\`json\n${pkgJsonTxt}\n\`\`\``;
        }
        if (agentsMdTxt) {
            body += `\n\n### 3. \`${agentsMdUrl}\`\nPlease add these critical secret management rules:\n\`\`\`markdown\n${agentsMdTxt}\n\`\`\``;
        }

        const octokitUser = await getOctokitAsUser(this.env);
        await octokitUser.rest.issues.createComment({
            owner,
            repo,
            issue_number: prNumber,
            body
        });

        return { status: 'comment_posted', prNumber };
    }

    public async auditRepository(owner: string, repo: string) {
        this.logger.info(`Auditing Repository: ${owner}/${repo}`);
        const octokitApp = await getOctokitAsBot(this.env);
        
        // 1. Fetch Config
        const { content, filename } = await this.extractConfig(octokitApp, owner, repo);
        
        // 2. LLM Parse
        const parsed = await this.parseConfigWithLLM(content);
        
        // 3. API Verification & Auto-Provision
        const provisioned = await this.verifyAndProvisionBindings(parsed);
        
        // 4. Construct
        const newWranglerJsonc = this.buildModernConfig(provisioned);
        
        // 5. Ecosystem Audit
        const { pkgJsonTxt, agentsMdTxt, agentsMdUrl } = await this.auditEcosystem(octokitApp, owner, repo, provisioned.bindings.d1_databases.length > 0);

        // 6. Delivery (Create Branch and PR)
        const branchName = `chore/cf-bindings-audit-${Date.now()}`;
        
        // Get main sha
        const { data: refData } = await octokitApp.rest.git.getRef({ owner, repo, ref: 'heads/main' });
        const baseSha = refData.object.sha;

        // Create branch
        await octokitApp.rest.git.createRef({ owner, repo, ref: `refs/heads/${branchName}`, sha: baseSha });

        // Update wrangler.jsonc
        await this.createOrUpdateFileRest(octokitApp, owner, repo, 'wrangler.jsonc', newWranglerJsonc, `chore: modernize wrangler.jsonc`, branchName);
        if (filename === 'wrangler.toml') {
            // Delete toml
            try {
                const { data: fileData } = await octokitApp.rest.repos.getContent({ owner, repo, path: 'wrangler.toml', ref: branchName }) as any;
                await octokitApp.rest.repos.deleteFile({ owner, repo, path: 'wrangler.toml', message: 'Delete wrangler.toml in favor of jsonc', sha: fileData.sha, branch: branchName });
            } catch (e) {
                console.log(`[CloudflareBindingsManager.createOrUpdateFileRest] Error deleting wrangler.toml: `, JSON.stringify(e));
            }
        }

        // Update package.json
        if (pkgJsonTxt) {
            await this.createOrUpdateFileRest(octokitApp, owner, repo, 'package.json', pkgJsonTxt, `chore: standardize package.json scripts`, branchName);
        }

        // Update AGENTS.md
        if (agentsMdTxt) {
            await this.createOrUpdateFileRest(octokitApp, owner, repo, agentsMdUrl, agentsMdTxt, `chore: update agent rules for Secret Store`, branchName);
        }

        // Create PR
        const pr = await octokitApp.rest.pulls.create({
            owner,
            repo,
            title: `chore(cloudflare): Infrastructure Standardization & Provisioning`,
            head: branchName,
            base: 'main',
            body: `CloudflareBindingsManager has autonomously audited and provisioned this repository's infrastructure.\n\n- Migrated to \`wrangler.jsonc\`.\n- Enforced unified observability and Secrets Store injections.\n- Auto-provisioned missing D1, R2, or KV resources generated by LLM parsing.`
        });

        return { status: 'pr_created', html_url: pr.data.html_url };
    }

    private async createOrUpdateFileRest(octokit: any, owner: string, repo: string, path: string, content: string, message: string, branch: string) {
        let sha: string | undefined;
        try {
            const { data } = await octokit.rest.repos.getContent({ owner, repo, path, ref: branch }) as any;
            sha = data.sha;
        } catch(error) {
            console.log('[CloudflareBindingsManager.createOrUpdateFileRest] Error fetching file content: ', JSON.stringify(error));
        }
        
        await octokit.rest.repos.createOrUpdateFileContents({
            owner,
            repo,
            path,
            message,
            content: btoa(unescape(encodeURIComponent(content))),
            branch,
            sha
        });
    }

    private async extractConfig(octokit: any, owner: string, repo: string) {
        let content = await fetchFileSecure(octokit, owner, repo, 'wrangler.jsonc');
        let filename = 'wrangler.jsonc';
        if (!content) {
            content = await fetchFileSecure(octokit, owner, repo, 'wrangler.toml');
            filename = 'wrangler.toml';
        }
        if (!content) {
            throw new Error(`Wrangler configuration not found in ${owner}/${repo}`);
        }
        return { content, filename };
    }

    private async parseConfigWithLLM(content: string): Promise<ParsedBindings> {
        this.logger.info("Sending configuration to AI Gateway for parsing...");
        const prompt = `Here is a wrangler configuration file.\n\n\`\`\`\n${content}\n\`\`\`\n\nExtract the worker name and all bindings. For every binding, propose a standardized name based on the worker_name. The format must be {worker_name}. If there are multiple bindings of the same type, append a suffix like {worker_name}-{purpose}.`;

        const parsed = await generateStructuredResponse<ParsedBindings>(
            this.env,
            prompt,
            CloudflareBindingsSchema as any,
            "You are an expert infrastructure analyzer."
        );
        return parsed;
    }

    private async verifyAndProvisionBindings(parsed: ParsedBindings): Promise<ParsedBindings> {
        const accountId = typeof this.env.CLOUDFLARE_ACCOUNT_ID === 'string'
            ? this.env.CLOUDFLARE_ACCOUNT_ID
            : await getCloudflareAccountId(this.env);

        this.logger.info("Iterating through bindings and provisioning/verifying...");

        // SDK client — uses CLOUDFLARE_D1_KV_TOKEN (D1 + KV + R2 permissions)
        const cf = getCfSdkClient(this.env, "d1kv");
        // NOTE: `cf as any` works around TS shim resolution: `cf.d1`, `cf.kv`, `cf.r2` exist at runtime.
        const cfAny = cf as any;

        // ── D1 ──────────────────────────────────────────────────────────────
        for (const db of parsed.bindings.d1_databases) {
            let found = false;
            if (db.database_id) {
                try {
                    // SDK: verify existing DB by ID
                    await cfAny.d1.database.get(db.database_id, { account_id: accountId });
                    found = true;
                } catch { /* fall through to list */ }
                // [REST] const check = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${db.database_id}`, { headers });
                // [REST] if (check.ok) found = true;
            }
            if (!found) {
                // SDK: list D1 databases, match by name
                const list = await cfAny.d1.database.list({ account_id: accountId });
                // [REST] const listRes = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database`, { headers });
                const match = (list.result ?? []).find((d: any) => d.name === db.database_name);
                if (match) { db.database_id = match.uuid; found = true; }
            }
            if (!found) {
                // SDK: create D1 database
                const created = await cfAny.d1.database.create({ account_id: accountId, name: db.database_name });
                // [REST] const createRes = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database`, {
                // [REST]     method: 'POST', headers, body: JSON.stringify({ name: db.database_name })
                // [REST] });
                if (created?.uuid) db.database_id = created.uuid;
            }
        }

        // ── KV ──────────────────────────────────────────────────────────────
        for (const kv of parsed.bindings.kv_namespaces) {
            let found = false;
            // SDK: list KV namespaces, match by title
            const list = await cfAny.kv.namespaces.list({ account_id: accountId });
            // [REST] const listRes = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/storage/kv/namespaces`, { headers });
            const match = (list.result ?? []).find((d: any) => d.title === kv.title);
            if (match) { kv.id = match.id; found = true; }
            if (!found) {
                // SDK: create KV namespace
                const created = await cfAny.kv.namespaces.create({ account_id: accountId, title: kv.title });
                // [REST] const createRes = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/storage/kv/namespaces`, {
                // [REST]     method: 'POST', headers, body: JSON.stringify({ title: kv.title })
                // [REST] });
                if (created?.id) kv.id = created.id;
            }
        }

        // ── R2 ──────────────────────────────────────────────────────────────
        for (const r2 of parsed.bindings.r2_buckets) {
            try {
                // SDK: create R2 bucket (409 = already exists = fine)
                await cfAny.r2.buckets.create({ account_id: accountId, name: r2.bucket_name });
                // [REST] const createRes = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/r2/buckets`, {
                // [REST]     method: "POST", headers, body: JSON.stringify({ name: r2.bucket_name })
                // [REST] });
            } catch (err: any) {
                if (!err?.message?.includes("already exists") && err?.status !== 409) {
                    this.logger.warn(`R2 bucket '${r2.bucket_name}' warning: ${err?.message}`);
                }
            }
        }

        return parsed;
    }

    private buildModernConfig(parsed: ParsedBindings) {
        const config: any = {
            "name": parsed.worker_name,
            "main": "src/index.ts",
            "compatibility_date": new Date().toISOString().split('T')[0],
            "workers_dev": true,
            "preview_urls": true,
            "observability": {
                "enabled": true,
                "head_sampling_rate": 1,
                "logs": {
                    "enabled": true,
                    "head_sampling_rate": 1,
                    "persist": true,
                    "invocation_logs": true
                },
                "traces": {
                    "enabled": true,
                    "persist": true,
                    "head_sampling_rate": 1
                }
            },
            "assets": {
                "directory": "./public",
                "binding": "ASSETS",
                "run_worker_first": [
                    "/api/*",
                    "/openapi.json",
                    "/swagger",
                    "/scalar",
                    "/health"
                ],
                "not_found_handling": "single-page-application"
            },
            "d1_databases": parsed.bindings.d1_databases.map(db => ({
                binding: db.binding,
                database_name: db.database_name,
                database_id: db.database_id,
                migrations_dir: "drizzle/migrations"
            })),
            "kv_namespaces": parsed.bindings.kv_namespaces.map(kv => ({
                binding: kv.binding,
                id: kv.id
            })),
            "r2_buckets": parsed.bindings.r2_buckets.map(r2 => ({
                binding: r2.binding,
                bucket_name: r2.bucket_name
            })),
            "secrets_store_secrets": [
                {
                    "binding": "CLOUDFLARE_ACCOUNT_ID",
                    "store_id": "8c42fa70938644e0a8a109744467375f",
                    "secret_name": "CLOUDFLARE_ACCOUNT_ID"
                },
                {
                    "binding": "WORKER_API_KEY",
                    "store_id": "8c42fa70938644e0a8a109744467375f",
                    "secret_name": "WORKER_API_KEY"
                },
                {
                    "binding": "AI_GATEWAY_TOKEN",
                    "store_id": "8c42fa70938644e0a8a109744467375f",
                    "secret_name": "CLOUDFLARE_AI_GATEWAY_TOKEN"
                },
                {
                    "binding": "CF_BROWSER_RENDER_TOKEN",
                    "store_id": "8c42fa70938644e0a8a109744467375f",
                    "secret_name": "CLOUDFLARE_BROWSER_RENDER_TOKEN"
                },
                {
                    "binding": "CLOUDFLARE_IMAGES_STREAM_TOKEN",
                    "store_id": "8c42fa70938644e0a8a109744467375f",
                    "secret_name": "CLOUDFLARE_IMAGES_STREAM_TOKEN"
                }
            ]
        };

        if (config.d1_databases.length === 0) delete config.d1_databases;
        if (config.kv_namespaces.length === 0) delete config.kv_namespaces;
        if (config.r2_buckets.length === 0) delete config.r2_buckets;

        return JSON.stringify(config, null, 4);
    }

    private async auditEcosystem(octokit: any, owner: string, repo: string, hasD1: boolean) {
        let pkgJsonTxt = await fetchFileSecure(octokit, owner, repo, 'package.json');
        let pkgJsonUpdated = false;

        if (pkgJsonTxt) {
            try {
                const pkg = JSON.parse(pkgJsonTxt);
                pkg.scripts = pkg.scripts || {};
                
                if (hasD1) {
                    pkg.scripts["drizzle:generate"] = pkg.scripts["drizzle:generate"] || "drizzle-kit generate";
                    pkg.scripts["migrate:remote"] = pkg.scripts["migrate:remote"] || "npx wrangler d1 migrations apply DB --remote";
                }
                
                pkg.scripts["deploy"] = hasD1 
                    ? "pnpm run build && pnpm run migrate:remote && npx wrangler deploy" 
                    : "pnpm run build && npx wrangler deploy";
                
                pkgJsonTxt = JSON.stringify(pkg, null, 2);
                pkgJsonUpdated = true;
            } catch (e) {
                this.logger.warn(`[CloudflareBindingsManager.auditEcosystem] Failed to parse package.json: `, JSON.stringify(e));
            }
        }

        let agentsMdUrl = 'AGENTS.md';
        let agentsMdTxt = await fetchFileSecure(octokit, owner, repo, 'AGENTS.md');
        let agentsMdUpdated = false;

        if (!agentsMdTxt) {
            agentsMdTxt = await fetchFileSecure(octokit, owner, repo, '.agent/rules/secrets.md');
            agentsMdUrl = '.agent/rules/secrets.md';
        }

        if (agentsMdTxt) {
            if (!agentsMdTxt.includes("await env.")) {
                agentsMdTxt += "\n\n## Secret Store Access\nRemember that secrets are accessed via `await env.{secret_binding_name}.get()`. Run `npx wrangler types` so `worker-configuration.d.ts` gets populated.";
                agentsMdUpdated = true;
            }
        } else {
            agentsMdUrl = 'AGENTS.md';
            agentsMdTxt = "# Agent Rules\n\n## Secret Store Access\nRemember that secrets are accessed via `await env.{secret_binding_name}.get()`. Run `npx wrangler types` so `worker-configuration.d.ts` gets populated.";
            agentsMdUpdated = true;
        }

        return {
            pkgJsonTxt: pkgJsonUpdated ? pkgJsonTxt : null,
            agentsMdTxt: agentsMdUpdated ? agentsMdTxt : null,
            agentsMdUrl
        };
    }
}
