import { BaseAgent } from "@/ai/agents/base/BaseAgent";
import { generateText } from "@/ai/providers";

const FALLBACK_CUSTOM_AGENT_DOCS = `
# Custom agents configuration

Reference for configuring custom agents.
The following table outlines the properties that you can configure for agent profiles in GitHub.com:
- \`name\` (string): Display name for the custom agent. Optional.
- \`description\` (Required string): Description of the custom agent's purpose and capabilities
- \`tools\` (list of strings): List of tool names the custom agent can use. e.g. ["read", "edit", "search"]. Omit or use ["*"] for all.
- \`mcp-servers\` (object): Additional MCP servers and tools.

Available tools aliases: 'execute', 'read', 'edit', 'search', 'agent', 'web', 'todo'.

Your YAML frontmatter must look like this:
---
name: [Agent Name]
description: [Short description of capabilities]
tools: ["read", "search", "edit"] # or ["*"] 
---
[Your LLM system prompt goes here, explicitly referencing repository details like standards, context, and capabilities.]
`;

export class RepoSpecialistBuilder extends BaseAgent {
    
    /**
     * Fetches the latest documentation from GitHub or falls back to hardcoded docs.
     */
    private async fetchCustomAgentDocs(): Promise<string> {
        try {
            this.logger.info("Fetching latest custom-agents-configuration docs from GitHub API...");
            
            const response = await fetch("https://docs.github.com/api/article/body?pathname=/en/copilot/reference/custom-agents-configuration", {
                headers: {
                    "User-Agent": "Cloudflare-Worker-Custom-Agent-Builder",
                    "Accept": "application/json"
                }
            });

            if (!response.ok) {
                 this.logger.warn(`Failed to fetch docs (HTTP ${response.status}). Using fallback.`);
                 return FALLBACK_CUSTOM_AGENT_DOCS;
            }

            const contentType = response.headers.get("content-type") || "";
            if (contentType.includes("application/json")) {
                const data: any = await response.json();
                if (data && typeof data === "string") return data;
                if (data && data.body) return data.body;
                if (data && data.content) return data.content;
                return JSON.stringify(data);
            } 

            const text = await response.text();
            if (text && text.length > 50) return text;

            return FALLBACK_CUSTOM_AGENT_DOCS;
        } catch (e) {
            this.logger.error("Network error fetching docs. Using fallback.", { error: e });
            return FALLBACK_CUSTOM_AGENT_DOCS;
        }
    }

    /**
     * Builds or regenerates the .github/agents/repo-specialist.agent.md file content.
     */
    public async generateAgentMarkdown(repoName: string, repoDescription: string | null, existingContent: string | null): Promise<string> {
        const docs = await this.fetchCustomAgentDocs();

        const systemPrompt = `You are an expert GitHub Custom Agent architecture AI.
Your ONLY job is to output a single Markdown file containing a YAML frontmatter block followed by an optimized LLM system prompt.
This markdown string will be committed directly to \`.github/agents/repo-specialist.agent.md\`.

Here is the Official GitHub Custom Agents Documentation (you must strictly follow these frontmatter rules):
<github_docs>
${docs}
</github_docs>

You are building the "Repo Specialist" customized for the repository: "${repoName}".
Repository Description: "${repoDescription || 'No description provided.'}".

${existingContent ? `Here is the EXISTING Custom Agent content for this repo. Analyze it, fix any missing/deprecated fields (e.g., removing 'infer: false' and using 'disable-model-invocation/user-invocable' instead), keep the repository-specific logic if valid, and output the fully optimized version:\n<existing>\n${existingContent}\n</existing>` : `Create a brand new Agent from scratch that acts as a specialized assistant for the ${repoName} repository.`}

RULES:
1. OUTPUT ENTIRELY IN RAW MARKDOWN. Do NOT wrap your output in \`\`\`markdown and \`\`\` tags because your raw output will be written directly to the file! The very first line should be \`---\`.
2. The frontmatter MUST include \`name\` and \`description\`.
3. If no specific tools are absolutely required to restrict, use \`tools: ["*"]\` to give the agent access to all MCP tools (like cloudflare-docs or stitch) configured in the MCP payload.
4. Provide a robust, opinionated, and highly specific LLM prompt for the agent that acts as a Senior Developer on the project.
`;

        try {
            this.logger.info(`Generating optimized custom agent for ${repoName} via Workers AI...`);
            
            // Generate the Markdown response using the exact provider override requested
            let text = await generateText(
                this.env,
                systemPrompt,
                undefined,
                { model: "@cf/meta/llama-3.1-8b-instruct" },
                "worker-ai"
            );

            // Strip markdown formatting if the model still surrounds output with it
            if (text.startsWith("```markdown")) {
                text = text.substring("```markdown\n".length);
            }
            if (text.startsWith("```")) {
                text = text.replace(/^```[a-z]*\n/, "");
            }
            if (text.endsWith("```")) {
                text = text.substring(0, text.length - 3);
            }
            if (text.endsWith("```\n")) {
                text = text.substring(0, text.length - 4);
            }
            
            return text.trim() + "\n";
        } catch (e: any) {
             this.logger.error(`LLM Generation failed`, { error: e });
             throw new Error(`Failed to generate custom agent: ${e.message}`);
        }
    }
}
