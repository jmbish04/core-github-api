import { Octokit } from "octokit";
import { getOctokit } from "./octokit/core";
import { getGithubConfigs } from "@utils/github/configs";
import { DEFAULT_TEMPLATE_REPO, DEFAULT_GITHUB_OWNER } from "@github-utils";
import { getDb } from "@db";
import { standardizationRules } from "@db/schemas/app/standardization";
import { eq } from "drizzle-orm";
import type { Agent } from "@openai/agents";
import { createRunner, resolveDefaultAiModel, resolveDefaultAiProvider } from "@/ai/agents/base/agent-ai";

export class StandardizationService {
    private static STANDARD_REPO_OWNER = DEFAULT_GITHUB_OWNER;
    private static STANDARD_REPO_NAME = DEFAULT_TEMPLATE_REPO;
    
    /**
     * Enforce standards on a repository
     * @param env Worker Environment
     * @param targetRepo Target repository metadata
     */
    static async enforce(env: Env, targetRepo: { owner: { login: string }, name: string, default_branch?: string }) {
        console.log(`[Standardization] Enforcing standards on ${targetRepo.owner.login}/${targetRepo.name}`);
        
        const octokit = await getOctokit(env) as unknown as Octokit;
        const config = getGithubConfigs(env);
        const db = getDb(env.DB);

        // 1. Infer Infrastructure Tags for Target Repo
        // We need to list files to infer tags.
        let infraTags: string[] = ["Repository"];
        try {
            const { data: tree } = await octokit.rest.git.getTree({
                owner: targetRepo.owner.login,
                repo: targetRepo.name,
                tree_sha: targetRepo.default_branch || 'main',
                recursive: '1'
            });
            
            const paths = (tree.tree || []).map(t => t.path || "").filter(Boolean);
            infraTags = this.inferProjectTags(paths);
            console.log(`[Standardization] Inferred tags for ${targetRepo.name}:`, infraTags);
        } catch (e) {
            console.warn(`[Standardization] Failed to infer tags (likely empty repo or no access), defaulting to basic tags.`, e);
        }

        // 2. Fetch Rules from DB
        const rules = await db.select().from(standardizationRules).all();

        // 3. Apply Rules
        for (const rule of rules) {
             await this.applyRule(env, octokit, config, rule, targetRepo, infraTags);
        }

        console.log(`[Standardization] Completed enforcement for ${targetRepo.owner.login}/${targetRepo.name}`);
    }

    /**
     * Apply a single rule
     */
    private static async applyRule(
        env: Env,
        octokit: Octokit, 
        config: any, 
        rule: typeof standardizationRules.$inferSelect, 
        targetRepo: { owner: { login: string }, name: string, default_branch?: string },
        targetTags: string[]
    ) {
        // A. Check Relevance
        const relevantInfra = JSON.parse(rule.relevantInfra);
        const irrelevantInfra = JSON.parse(rule.irrelevantInfra);

        // Logic: 
        // - If relevantInfra is empty, it applies to ALL (unless excluded).
        // - If relevantInfra has items, target MUST have at least one.
        // - If target has ANY tag in irrelevantInfra, skip.

        if (irrelevantInfra.length > 0 && targetTags.some(tag => irrelevantInfra.includes(tag))) {
            // console.debug(`[Standardization] Skipping ${rule.filePath} (Irrelevant Infra)`);
            return;
        }

        if (relevantInfra.length > 0 && !targetTags.some(tag => relevantInfra.includes(tag))) {
            // console.debug(`[Standardization] Skipping ${rule.filePath} (Missing Relevant Infra)`);
            return;
        }

        // B. Fetch Source Content
        let content: string | null = null;
        let sourceSha: string | undefined;

        try {
            const [sourceOwner, sourceRepo] = rule.sourceRepo.split('/');
            const { data: sourceFile } = await octokit.rest.repos.getContent({
                owner: sourceOwner,
                repo: sourceRepo,
                path: rule.filePath
            });

            if (!Array.isArray(sourceFile) && sourceFile.type === "file" && sourceFile.content) {
                content = Buffer.from(sourceFile.content, "base64").toString("utf8");
                sourceSha = sourceFile.sha;
            }
        } catch (e: any) {
            console.warn(`[Standardization] Source file ${rule.sourceRepo}/${rule.filePath} not found.`, e.message);
            return;
        }

        if (!content) return;

        // C. AI Customization
        if (rule.aiInstructions) {
             try {
                const provider = resolveDefaultAiProvider(env);
                const model = resolveDefaultAiModel(env, provider);
                
                const runner = await createRunner(env, provider, model);
                const { Agent: OpenAIAgent } = await import("@openai/agents");
                const agent = new OpenAIAgent({
                    name: "StandardizationCustomizer",
                    model,
                    instructions: "Customize the file content based on the instructions. Return ONLY the full customized file content. No markdown fences. Do not output any conversational text.",
                });

                const prompt = `
                Instructions: "${rule.aiInstructions}"

                Target Context:
                Repo: ${targetRepo.owner.login}/${targetRepo.name}
                Tags: ${targetTags.join(', ')}

                File Content:
                ${content}
                `;

                const result = await runner.run(agent, prompt);
                let customized = typeof result.finalOutput === 'string' ? result.finalOutput : String(result.finalOutput);
                
                // Strip markdown fences if present
                customized = customized.replace(/^```[a-z]*\n/i, '').replace(/\n```$/, '').trim();

                if (customized) {
                    content = customized;
                    sourceSha = undefined; 
                }

             } catch (aiError) {
                 console.error(`[Standardization] AI Customization failed for ${rule.filePath}`, aiError);
             }
        }

        // D. Sync to Target
        try {
            // Check existence
             let targetSha: string | undefined;
             try {
                 const { data: targetFile } = await octokit.rest.repos.getContent({
                     owner: targetRepo.owner.login,
                     repo: targetRepo.name,
                     path: rule.filePath
                 });
                 
                 if (!Array.isArray(targetFile) && targetFile.type === "file") {
                     targetSha = targetFile.sha;
                     
                     // If we shouldn't overwrite and it exists, skip.
                     // Exception: if we want to enforce updates, we check overWrite policy.
                     if (!rule.shouldOverwrite) {
                         // console.debug(`[Standardization] Skipping ${rule.filePath} (Exists & No Overwrite)`);
                         return;
                     }

                     // Optimization: If no AI customization happened, we can compare SHAs (if source was pure).
                     if (sourceSha && targetFile.sha === sourceSha) {
                         return; 
                     }
                 }
             } catch (err: any) {
                 if (err.status !== 404) throw err;
             }

            // Write
            await octokit.rest.repos.createOrUpdateFileContents({
                owner: targetRepo.owner.login,
                repo: targetRepo.name,
                path: rule.filePath,
                message: `chore(standards): sync ${rule.filePath}`,
                content: Buffer.from(content || "").toString("base64"),
                sha: targetSha,
                branch: targetRepo.default_branch
            });

            console.log(`[Standardization] Synced ${rule.filePath} to ${targetRepo.name}`);

        } catch (e: any) {
            console.error(`[Standardization] Failed to write ${rule.filePath}`, e);
        }
    }


    /**
     * Infer project tags (Simplified version of logic in projects.ts)
     * We duplicate slightly to avoid circular dependency on "routes" logic or we should move logic to shared util.
     * Moving to shared util is better but for now let's keep it self-contained or use what we can.
     */
    private static inferProjectTags(paths: string[]): string[] {
        const tags = new Set<string>(["Repository"]);
        const lowerPaths = paths.map(p => p.toLowerCase());

        if (lowerPaths.some(p => p.endsWith("wrangler.toml") || p.endsWith("wrangler.json") || p.endsWith("wrangler.jsonc"))) {
            tags.add("cloudflare_worker");
            tags.add("cloudflare");
        }
        if (lowerPaths.some(p => p.endsWith("package.json"))) tags.add("nodejs");
        if (lowerPaths.some(p => p.endsWith(".py") || p.endsWith("requirements.txt"))) tags.add("python");
        if (lowerPaths.some(p => p.includes("next.config"))) tags.add("nextjs");
        if (lowerPaths.some(p => p.includes("astro.config"))) tags.add("astro");

        return Array.from(tags);
    }
}

