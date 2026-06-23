import { JulesService } from "../jules/service";
import { getCfSdkClient } from "../../cloudflare/client";
import { Logger } from "@/lib/logger";

export class BuildLogAnalyzer {
    private logger: Logger;
    constructor(private env: Env) {
        this.logger = new Logger(env, 'BuildLogAnalyzer');
    }

    private async fetchCloudflareDocs(url: string): Promise<string> {
        try {
            const baseUrl = url.split('#')[0];
            const res = await fetch(baseUrl, {
                headers: {
                    "Accept": "text/markdown",
                    "User-Agent": "Jules-Automated-PR-Reviewer/1.0"
                }
            });
            if (!res.ok) throw new Error(`Status ${res.status}`);
            const text = await res.text();
            return text.substring(0, 3000);
        } catch (e: any) {
            return `Failed to fetch documentation from ${url}: ${e.message}`;
        }
    }

    private async provisionCloudflareBindings(cfToken: string, accountId: string, workerName: string): Promise<string> {
        console.log(`[🔧] Binding issue detected. Auto-provisioning resources for '${workerName}'...`);
        // const headers = { "Authorization": `Bearer ${cfToken}`, "Content-Type": "application/json" };
        const cfAny = getCfSdkClient(this.env as any, "workerAdmin") as any;
        const provisioned: string[] = [];

        // KV
        // [REST] const kvRes = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/storage/kv/namespaces`, {
        // [REST]     method: "POST", headers, body: JSON.stringify({ title: workerName })
        // [REST] });
        // [REST] if (kvRes.ok) {
        // [REST]     const json: any = await kvRes.json();
        // [REST]     provisioned.push(`- KV Namespace \`${workerName}\` created. ID: \`${json.result.id}\``);
        // [REST] } else {
        // [REST]     const kvList = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/storage/kv/namespaces`, { headers });
        // [REST]     if (kvList.ok) {
        // [REST]         const json: any = await kvList.json();
        // [REST]         const found = (json.result || []).find((kv: any) => kv.title === workerName);
        // [REST]         if (found) provisioned.push(`- KV Namespace \`${workerName}\` exists. ID: \`${found.id}\``);
        // [REST]     }
        // [REST] }
        try {
            const data = await cfAny.kv.namespaces.create({ account_id: accountId, title: workerName });
            if (data?.result?.id || data?.id) {
                const id = data.result ? data.result.id : data.id;
                provisioned.push(`- KV Namespace \`${workerName}\` created. ID: \`${id}\``);
            }
        } catch (err: any) {
            console.error("[BuildLogAnalyzer] Failed to create KV namespace", JSON.stringify(err));
            try {
                const kvList = await cfAny.kv.namespaces.list({ account_id: accountId });
                const found = (kvList.result || []).find((kv: any) => kv.title === workerName);
                if (found) provisioned.push(`- KV Namespace \`${workerName}\` exists. ID: \`${found.id}\``);
            } catch (ignore) {
                console.error("[BuildLogAnalyzer] Failed to list KV namespaces", JSON.stringify(ignore));
            }
        }

        // D1
        // [REST] const d1Res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database`, {
        // [REST]     method: "POST", headers, body: JSON.stringify({ name: workerName })
        // [REST] });
        // [REST] if (d1Res.ok) {
        // [REST]     const json: any = await d1Res.json();
        // [REST]     provisioned.push(`- D1 Database \`${workerName}\` created. ID: \`${json.result.uuid}\``);
        // [REST] } else {
        // [REST]     const d1List = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database`, { headers });
        // [REST]     if (d1List.ok) {
        // [REST]         const json: any = await d1List.json();
        // [REST]         const found = (json.result || []).find((d1: any) => d1.name === workerName);
        // [REST]         if (found) provisioned.push(`- D1 Database \`${workerName}\` exists. ID: \`${found.uuid}\``);
        // [REST]     }
        // [REST] }
        try {
            const data = await cfAny.d1.database.create({ account_id: accountId, name: workerName });
            if (data?.result?.uuid || data?.uuid) {
                const uuid = data.result ? data.result.uuid : data.uuid;
                provisioned.push(`- D1 Database \`${workerName}\` created. ID: \`${uuid}\``);
            }
        } catch (err: any) {
            console.error("[BuildLogAnalyzer] Failed to create D1 database", JSON.stringify(err));
            try {
                const d1List = await cfAny.d1.database.list({ account_id: accountId });
                const found = (d1List.result || []).find((db: any) => db.name === workerName);
                if (found) provisioned.push(`- D1 Database \`${workerName}\` exists. ID: \`${found.uuid}\``);
            } catch (ignore) {
                const errorMessage = `[BuildLogAnalyzer] Failed to list D1 databases ${JSON.stringify(ignore)}`;
                this.logger.error(errorMessage);
            }
        }

        // R2 
        // [REST] const r2Res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/r2/buckets`, {
        // [REST]     method: "POST", headers, body: JSON.stringify({ name: workerName })
        // [REST] });
        // [REST] if (r2Res.ok) {
        // [REST]     provisioned.push(`- R2 Bucket \`${workerName}\` is available. (R2 uses bucket name as ID)`);
        // [REST] } else if (r2Res.status === 400) {
        // [REST]     const txt = await r2Res.text();
        // [REST]     if (txt.includes("already exists")) {
        // [REST]         provisioned.push(`- R2 Bucket \`${workerName}\` is available. (R2 uses bucket name as ID)`);
        // [REST]     }
        // [REST] }
        try {
            await cfAny.r2.buckets.create({ account_id: accountId, name: workerName });
            provisioned.push(`- R2 Bucket \`${workerName}\` is available. (R2 uses bucket name as ID)`);
        } catch (err: any) {
             const txt = String(err);
             if (txt.includes("already exists")) {
                 provisioned.push(`- R2 Bucket \`${workerName}\` is available. (R2 uses bucket name as ID)`);
             }
        }

        if (provisioned.length > 0) {
            return "**AUTOMATED PROVISIONING:** I detected a potential missing or invalid binding ID in your logs. " +
                   "I have automatically ensured the following resources exist on Cloudflare for this worker. " +
                   "Please update `wrangler.jsonc` with these IDs if necessary:\n" + provisioned.join("\n");
        }
        return "";
    }

    public async scanHeuristics(logsText: string, cfToken: string, accountId: string, scriptName: string) {
        const instructions: string[] = [];
        const urlsToFetch = new Set<string>();
        let docsContent = "";

        const lowerLogs = logsText.toLowerCase();

        if (lowerLogs.includes("pnpm approve-builds")) {
            instructions.push("- Run `pnpm approve-builds` and approve all ignored build scripts to fix the build warning.");
        }
        if (lowerLogs.includes("warning ts(") || lowerLogs.includes("error ts(")) {
            instructions.push("- Fix the TypeScript (tsc) warnings and errors shown in the build logs.");
        }
        if (lowerLogs.includes("wrangler") && lowerLogs.includes("update available")) {
            instructions.push("- Update wrangler to the latest version by running `pnpm add -D wrangler@latest`.");
        }
        if (lowerLogs.includes("lockfile") && (lowerLogs.includes("error") || lowerLogs.includes("fail") || lowerLogs.includes("frozen"))) {
            instructions.push("- Delete any existing lockfiles and run `pnpm install --frozen-lockfile` for a clean remediation.");
        }
        
        if (lowerLogs.includes("enter id here") || lowerLogs.includes("invalid binding") || (lowerLogs.includes("binding") && lowerLogs.includes("not found"))) {
            const msg = await this.provisionCloudflareBindings(cfToken, accountId, scriptName);
            if (msg) instructions.push(msg);
        }

        const doMatch = logsText.match(/Version upload failed.*?Durable Object migration.*?See\s+(https:\/\/[^\s]+)/is);
        if (doMatch) {
            const url = doMatch[1].replace(/[\].)]+$/, "");
            urlsToFetch.add(url);
            instructions.push("- The deployment failed due to a Durable Object migration issue (Code 10211). Check `wrangler.jsonc`/`wrangler.toml`. Ensure you are not adding new `new_sqlite_classes` to a new migration tag (like v2) if v1 hasn't even been deployed yet. Fix the migration history based on the documentation below.");
        }

        const learnMoreRegex = /To learn more about this error, visit:\s*(https:\/\/[^\s]+)/ig;
        let match;
        while ((match = learnMoreRegex.exec(logsText)) !== null) {
            const url = match[1].replace(/[\].)]+$/, "");
            urlsToFetch.add(url);
            instructions.push(`- Fix the deployment error by referencing the material extracted from ${url} provided below.`);
        }

        for (const url of urlsToFetch) {
            const content = await this.fetchCloudflareDocs(url);
            docsContent += `\n\n### Extracted Doc Content from ${url}:\n\`\`\`markdown\n${content}\n\`\`\``;
        }

        return { instructions, docsContent };
    }

    public async analyzeWithJules(logsText: string): Promise<string> {
        const truncatedLogs = logsText.split("\n").slice(-200).join("\n");
        const currentDate = new Date().toISOString().split("T")[0];

        const systemPrompt = `You are an expert Cloudflare Workers and Astro orchestrator. 
Your job is to read failing build logs and write a comprehensive, step-by-step prompt 
instructing an autonomous coding agent on exactly how to fix the bugs. 

CRITICAL RULES YOU MUST ENFORCE:
1. WRANGLER CONFIGURATION: 
   - \`wrangler.jsonc\` is the absolute standard. If \`wrangler.toml\` is found, instruct the agent to retrofit it to \`wrangler.jsonc\` and delete the .toml file.
   - It MUST have observability enabled: \`"observability": { "enabled": true }\`.
   - The \`compatibility_date\` MUST be updated to today's date (which is ${currentDate}).
2. CI/CD DEPLOYMENTS:
   - Deployments are handled ENTIRELY via Cloudflare Dashboard CI/CD. 
   - DO NOT instruct the agent to use GitHub Actions for deployment.
3. PACKAGE.JSON SCRIPTS:
   - Deployment scripts MUST be managed using \`package.json\`. 
   - Ensure the agent implements exactly the requested script architecture for deployment, testing, generated bindings, and sandbox checking.

You must explicitly address ALL TypeScript (tsc) errors, ignored scripts, and deployment failures found in the logs.
Do not apologize or use pleasantries. Output ONLY the instructions for the coding agent.
Here are the failing build logs:

\`\`\`
${truncatedLogs}
\`\`\`

Provide the exact instructions to fix all issues.`;

        const jules = JulesService.getInstance(this.env as any);
        const analysis = await jules.runRepolessSession(systemPrompt);
        return analysis.agentMessage || "No analysis provided.";
    }

    public extractBuildIdFromCheckRunSummary(summary: string): { accountId: string, scriptName: string, buildUuid: string } | null {
        const cfUrlMatch = summary.match(new RegExp("https://dash\\\\.cloudflare\\\\.com/([a-f0-9]+)/workers/services/view/([^/]+)/production/builds/([a-f0-9-]+)"));
        if (!cfUrlMatch) return null;
        return {
            accountId: cfUrlMatch[1],
            scriptName: cfUrlMatch[2],
            buildUuid: cfUrlMatch[3]
        };
    }

    public async getBuildLogsByDeploymentId(accountId: string, deploymentId: string, cfToken: string): Promise<string | null> {
        // [REST] const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/builds/builds/${deploymentId}/logs`;
        // [REST] const res = await fetch(url, { headers: { "Authorization": `Bearer ${cfToken}`, "Content-Type": "application/json" } });
        // [REST] if (!res.ok) return null;
        // [REST] const data: any = await res.json();
        // [REST] return this.parseCloudflareLogsResponse(data);
        // const cfAny = getCfSdkClient(this.env as any, "workerAdmin") as any;
        // We don't use `cfAny` here because the Cloudflare SDK v5 does not natively expose the `/builds/builds`
        // or `/builds/workers` namespace yet for Worker CI/CD logs (only `pages.projects.deployments`).
        try {
            const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/builds/builds/${deploymentId}/logs`;
            const res = await fetch(url, { headers: { "Authorization": `Bearer ${cfToken}`, "Content-Type": "application/json" } });
            if (!res.ok) return null;
            const data: any = await res.json();
            return this.parseCloudflareLogsResponse(data);
        } catch (ignore) {
            console.error("[BuildLogAnalyzer] Failed to get build logs", JSON.stringify(ignore));
            return null;
        }
    }

    public async getLatestBuildLogs(accountId: string, scriptName: string, cfToken: string): Promise<string | null> {
        // [REST] const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/builds/workers/${scriptName}/builds`;
        // [REST] const res = await fetch(url, { headers: { "Authorization": `Bearer ${cfToken}`, "Content-Type": "application/json" } });
        // [REST] if (!res.ok) return null;
        // [REST] const data: any = await res.json();
        // [REST] const builds = data.result || [];
        // [REST] if (builds.length === 0) return null;
        try {
            const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/builds/workers/${scriptName}/builds`;
            const res = await fetch(url, { headers: { "Authorization": `Bearer ${cfToken}`, "Content-Type": "application/json" } });
            if (!res.ok) return null;
            const data: any = await res.json();
            const builds = data.result || [];
            if (builds.length === 0) return null;
            
            const latestBuildId = builds[0].build_uuid || builds[0].id;
            return this.getBuildLogsByDeploymentId(accountId, latestBuildId, cfToken);
        } catch (ignore) {
            console.error("[BuildLogAnalyzer] Failed to get build logs", JSON.stringify(ignore));
            return null;
        }
    }

    private parseCloudflareLogsResponse(data: any): string {
        let parsed = "";
        if (data && data.result) {
            const lines = data.result.lines || [];
            for (const batch of lines) {
                for (const lineData of batch) {
                    if (Array.isArray(lineData) && lineData.length === 2) {
                        parsed += lineData[1] + "\n";
                    } else if (lineData && lineData.line) {
                        parsed += lineData.line + "\n";
                    } else {
                        parsed += String(lineData) + "\n";
                    }
                }
            }
        }
        return parsed;
    }
}
