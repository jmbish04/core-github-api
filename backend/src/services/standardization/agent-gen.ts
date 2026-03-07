
import { getOctokit } from "@services/octokit/core";
import { BaseAgent } from "@/ai/agents/base/BaseAgent";

export class AgentGenerator {
    static async ensureAgent(env: Env, owner: string, repo: string) {
        const octokit = await getOctokit(env);
        
        // 1. Check if ANY .agent.md exists in .github/agents/
        // We look for .github/agents/*.agent.md
        // List contents of .github/agents
        let hasAgent = false;
        try {
            const { data: contents } = await octokit.rest.repos.getContent({
                owner,
                repo,
                path: ".github/agents",
            });
            
            if (Array.isArray(contents)) {
                hasAgent = contents.some(file => file.name.endsWith(".agent.md"));
            }
        } catch (err: any) {
            if (err.status !== 404) {
                console.error("[AgentGen] Error checking agents:", err);
            }
            // 404 means directory doesn't exist, so no agent.
        }

        if (hasAgent) {
            console.log(`[AgentGen] Agent already exists for ${owner}/${repo}. Optimizing instructions...`);
            try {
                const { data: files } = await octokit.rest.repos.getContent({
                    owner,
                    repo,
                    path: ".github/agents",
                });
                
                const agentFile = (Array.isArray(files) ? files : [files]).find((f: any) => f.name.endsWith(".agent.md"));
                
                if (agentFile && agentFile.sha) {
                    const { data: fileData } = await octokit.rest.repos.getContent({
                        owner, repo, path: agentFile.path
                    });
                    
                    if (!Array.isArray(fileData) && (fileData as any).content) {
                        const contentBytes = atob((fileData as any).content);
                        
                        if ((env as any).AI) {
                            const response = await (env as any).AI.run('@cf/meta/llama-3.1-8b-instruct', {
                                messages: [
                                    { role: 'system', content: 'You are an expert AI agent architect. Review the provided .agent.md configuration and improve its core instructions for clarity, precision, and tool utilization while strictly preserving the existing YAML frontmatter. Return ONLY the final markdown file content without conversational padding.' },
                                    { role: 'user', content: `Here is the current agent configuration:\n\n${contentBytes}` }
                                ]
                            });
                            
                            const optimizedContent = (response as any).response;
                            
                            if (optimizedContent && optimizedContent.includes('---')) {
                                await octokit.rest.repos.createOrUpdateFileContents({
                                    owner,
                                    repo,
                                    path: agentFile.path,
                                    message: "chore(agent): optimize agent instructions via Workers AI",
                                    content: btoa(optimizedContent),
                                    sha: agentFile.sha,
                                });
                                console.log(`[AgentGen] Successfully optimized ${agentFile.name}`);
                            } else {
                                console.log(`[AgentGen] Optimization discarded (invalid output format)`);
                            }
                        } else {
                             console.warn("[AgentGen] AI binding not found, skipping optimization.");
                        }
                    }
                }
            } catch (error) {
                console.error("[AgentGen] Optimization process failed:", error);
            }
            return; 
        }

        console.log(`[AgentGen] No agent found for ${owner}/${repo}. Generating default specialist...`);

        // 2. Evaluate Tech Stack (Simplistic heuristic for now)
        // Check for package.json, wrangler.toml, etc.
        const stack: string[] = [];
        try {
            await octokit.rest.repos.getContent({ owner, repo, path: "wrangler.toml" });
            stack.push("Cloudflare Workers");
        } catch(e) {
            console.log(`[AgentGen] No wrangler.toml found for ${owner}/${repo}`, JSON.stringify(e));
        }
        try {
            const { data: pkgParams } = await octokit.rest.repos.getContent({ owner, repo, path: "package.json" });
            if ("content" in pkgParams) {
                const pkgJson = JSON.parse(atob(pkgParams.content));
                const deps = { ...pkgJson.dependencies, ...pkgJson.devDependencies };
                if (deps.hono) stack.push("Hono");
                if (deps.drizzle || deps["drizzle-orm"]) stack.push("Drizzle ORM");
                if (deps.astro) stack.push("Astro");
                if (deps.react) stack.push("React");
            }
        } catch(e) {
            console.log(`[AgentGen] No package.json found for ${owner}/${repo}`, JSON.stringify(e));
        }

        const description = stack.length > 0 
            ? `Expert in ${stack.join(", ")} and repository standardization.`
            : "General purpose repository specialist.";

        // 3. Generate .agent.md Content
        const agentName = `${repo}-specialist`;
        const agentContent = `---
name: ${agentName}
description: ${description}
tools: ["*"]
mcp-servers:
  - github
  - cloudflare-docs
---

# ${agentName}

You are the dedicated specialist for the ${repo} repository. 
Your tech stack includes: ${stack.join(", ")}.

## Core Instructions

1. **Code Quality**: Enforce strictly typed TypeScript. Use Zod for validation.
2. **Architecture**: Follow the Modular Backend/Fullstack structure.
3. **Database**: Use Drizzle ORM for all database interactions.
4. **Testing**: Ensure all critical paths are covered by tests.

## MCP Tools
You have access to the full suite of MCP tools. Use them to:
- Search documentation (cloudflare-docs)
- Manage GitHub issues and PRs (github)
- Execute code in the sandbox (sandbox)
`;

        // 4. Push to Repo
        try {
            await octokit.rest.repos.createOrUpdateFileContents({
                owner,
                repo,
                path: `.github/agents/${agentName}.agent.md`,
                message: "feat(agent): bootstrap default repository specialist",
                content: btoa(agentContent),
            });
            console.log(`[AgentGen] Created .github/agents/${agentName}.agent.md`);
        } catch (err) {
            console.error("[AgentGen] Failed to create agent file:", err);
        }
    }
}
