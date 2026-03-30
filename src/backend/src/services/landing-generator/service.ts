
import { Octokit } from "octokit";
import { WorkerAnalyzer } from "./analyzer";
import { BlueprintGenerator } from "./blueprint";
import { TemplateGenerator } from "./template";
import type { WorkerAnalysis, WranglerConfig, PackageJson } from "./types";
import TOML from "@iarna/toml";
import { generateText } from "@/ai/providers";
import { Logger } from "@/lib/logger";

interface GenerateOptions {
    owner: string;
    repo: string;
    prompt?: string; // User context
    githubToken: string;
}

export class LandingGeneratorService {

    static async generateLandingPage(env: any, options: GenerateOptions): Promise<{ prUrl: string; prNumber: number }> {
        const octokit = new Octokit({ auth: options.githubToken });

        console.log(`[LandingGenerator] Starting generation for ${options.owner}/${options.repo}`);

        // 1. Fetch Repository Files
        const files = await this.fetchRepoFiles(env, octokit, options.owner, options.repo);

        // 2. Parse Technical Configs using Analyzer
        // We'll parse them here to pass structured data to the Analyzer
        let wranglerConfig: WranglerConfig | undefined;
        let packageJson: PackageJson | undefined;

        if (files['wrangler.toml']) {
            try {
                // Parse TOML. Adjust type casting as needed based on TOML lib
                wranglerConfig = TOML.parse(files['wrangler.toml']) as unknown as WranglerConfig;
            } catch (e) {
                console.warn("Failed to parse wrangler.toml", e);
            }
        } else if (files['wrangler.json']) {
            try {
                wranglerConfig = JSON.parse(files['wrangler.json']);
            } catch (e) { console.warn("Failed to parse wrangler.json", e); }
        }

        if (files['package.json']) {
            try {
                packageJson = JSON.parse(files['package.json']);
            } catch (e) {
                console.warn("Failed to parse package.json", e);
            }
        }

        // 3. Initial Technical Analysis (Deterministic)
        const baseAnalysis = await WorkerAnalyzer.analyzeWorker({
            wranglerConfig,
            packageJson,
            sourceFiles: files // Analyzer might look at keys or content
        });

        // 4. AI Enhancement (Creative)
        // We ask Gemini to take the base analysis + README + User Prompt and produce the FINAL WorkerAnalysis
        const finalAnalysis = await this.enhanceAnalysisWithAI(env, baseAnalysis, files['README.md'] || "", options.prompt);

        // 5. Generate Content
        const blueprint = BlueprintGenerator.generate(finalAnalysis);
        const html = await TemplateGenerator.generate(blueprint, finalAnalysis.name, finalAnalysis.branding, finalAnalysis.links?.footer);

        // 6. Commit and PR
        return await this.createPullRequest(octokit, options, html);
    }

    private static async fetchRepoFiles(env: Env, octokit: Octokit, owner: string, repo: string): Promise<Record<string, string>> {
        const files: Record<string, string> = {};
        const method = "GET /repos/{owner}/{repo}/contents/{path}";

        // List of files to check
        const targetFiles = ['wrangler.toml', 'wrangler.json', 'package.json', 'README.md', 'README.txt'];

        // We can try to fetch them individually. 
        // Optimization: Get root tree? For now, parallel fetch is fine.
        await Promise.all(targetFiles.map(async (path) => {
            try {
                const { data } = await octokit.request(method, { owner, repo, path });
                if (!Array.isArray(data) && 'content' in data) {
                    files[path] = Buffer.from(data.content, 'base64').toString('utf-8');
                }
            } catch (e) {
                const logger = new Logger(env, 'LandingGenerator');
                logger.error(`Failed to fetch ${path}`, e);
                
                
            }
        }));

        return files;
    }

    private static async enhanceAnalysisWithAI(env: any, baseAnalysis: WorkerAnalysis, readme: string, userPrompt?: string): Promise<WorkerAnalysis> {
        const systemPrompt = `
You are an expert Developer Marketing Agent.
Your goal is to generate a comprehensive "WorkerAnalysis" JSON object for a Cloudflare Worker project.
This object maps directly to sections on a high-converting landing page.

INPUTS:
1. Base Technical Analysis (Tech stack, components -> derived from code).
2. README Content (Context).
3. User Prompt (Specific instructions).

TASK:
- Enhance the "purpose" (Headline, Tagline, Value Statement). Make it punchy and marketing-ready.
- Enhance "features". 
- Identify "painPoints" (Problem/Solution cards).
- Identify "useCases" (Persona, Scenario, Outcome).
- Identify "metrics" (or invent plausible ones based on the tech, e.g. "Low Latency" for Edge).
- Keep the "components" and "techStack" from the Base Analysis unless you see obvious missing items in the README.

OUTPUT:
Return ONLY the JSON matching the WorkerAnalysis structure.
`;

        const userMessage = `
BASE ANALYSIS:
${JSON.stringify(baseAnalysis, null, 2)}

README:
${readme.substring(0, 10000)}

USER PROMPT:
${userPrompt || "Make it sound enterprise-ready."}
`;

        try {
            const text = await generateText(
                env as Env,
                userMessage,
                `${systemPrompt}\n\nReturn valid JSON only, with no markdown or commentary.`
            );

            return JSON.parse(text) as WorkerAnalysis;
        } catch (e) {
            console.error("AI enhancement failed, falling back to base analysis", e);
            return baseAnalysis;
        }
    }

    private static async createPullRequest(octokit: Octokit, options: GenerateOptions, htmlContent: string) {
        const { owner, repo } = options;
        const branchName = `docs/landing-page-${Date.now()}`;
        const baseBranch = 'main'; // Assumption. Should fetch repo default branch ideally.

        // Get SHA of base branch
        const { data: refData } = await octokit.request('GET /repos/{owner}/{repo}/git/ref/{ref}', {
            owner, repo, ref: `heads/${baseBranch}`
        });
        const baseSha = refData.object.sha;

        // Create new branch
        await octokit.request('POST /repos/{owner}/{repo}/git/refs', {
            owner, repo,
            ref: `refs/heads/${branchName}`,
            sha: baseSha
        });

        // Create file
        // We could use the high-level createOrUpdateFileContents, but that requires SHA if updating.
        // Since it's a new branch, we can just create.
        await octokit.request('PUT /repos/{owner}/{repo}/contents/{path}', {
            owner, repo,
            path: 'public/index.html',
            message: 'chore: generate landing page',
            content: Buffer.from(htmlContent).toString('base64'),
            branch: branchName
        });

        // Create PR
        const { data: pr } = await octokit.request('POST /repos/{owner}/{repo}/pulls', {
            owner, repo,
            title: 'docs: Add Generated Landing Page',
            body: 'This PR adds a marketing landing page generated by the Landing Generator Agent. \\n\\nPreview it by deploying to Cloudflare Pages or Workers Assets.',
            head: branchName,
            base: baseBranch
        });

        return { prUrl: pr.html_url, prNumber: pr.number };
    }

    /**
     * Pure HTML generation without GitHub interaction.
     * Used by projects API and CLI.
     */
    static async generateHtml(config: import('./types').GeneratorConfig): Promise<string> {
        // 1. Analyze (using provided configs)
        const baseAnalysis = await WorkerAnalyzer.analyzeWorker({
            wranglerConfig: config.wranglerConfig,
            packageJson: config.packageJson,
        });

        // 2. Merge custom analysis
        // We do a shallow merge of top-level keys. Deep merge might be better but let's start simple.
        const finalAnalysis: WorkerAnalysis = {
            ...baseAnalysis,
            ...config.customAnalysis,
            // Ensure required nested objects are merged if they exist in custom
            branding: config.customAnalysis.branding || baseAnalysis.branding,
            links: config.customAnalysis.links || baseAnalysis.links,
            purpose: config.customAnalysis.purpose || baseAnalysis.purpose,
        };

        // 3. Generate Content
        const blueprint = BlueprintGenerator.generate(finalAnalysis);
        return await TemplateGenerator.generate(blueprint, finalAnalysis.name, finalAnalysis.branding, finalAnalysis.links?.footer);
    }
}
