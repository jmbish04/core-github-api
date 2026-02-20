
import { getOctokit } from "@services/octokit/core";
import { BaseAgent } from "@agents/BaseAgent";

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
            // TODO: Implement optimization logic (read existing, run LLM to improve)
            // For now, we respect existing agents and do nothing, or maybe just log.
            return; 
        }

        console.log(`[AgentGen] No agent found for ${owner}/${repo}. Generating default specialist...`);

        // 2. Evaluate Tech Stack (Simplistic heuristic for now)
        // Check for package.json, wrangler.toml, etc.
        const stack: string[] = [];
        try {
            await octokit.rest.repos.getContent({ owner, repo, path: "wrangler.toml" });
            stack.push("Cloudflare Workers");
        } catch {}
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
        } catch {}

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
