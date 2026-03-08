import { BaseAgent } from "../ai/agents/base/BaseAgent";
import { callable } from "agents";
import { z } from "zod";
import { getOctokitWithAuth } from "../services/github/octokit";
import { generateText, tool } from "ai";
import { getModel } from "../services/ai/providers";
import { getDrizzle } from "../db/index";
import { retrofitPrompts, retrofitThreads, retrofitComments, retrofitMessages } from "../db/schemas/agents/retrofit";
import { eq, desc } from "drizzle-orm";
import { createJulesSession } from "../services/jules/service";
import { getMcpClient } from "../services/mcp/index";

export interface RetrofitAgentState {
    draftPrompt: string;
    versionNumber: number;
    julesStatus: string;
    julesSessionId?: string;
    repoName?: string;
}

const AnalyzeDraftInput = z.object({
    repo: z.string().describe("The repository to analyze, e.g., 'owner/repo'"),
    instructions: z.string().describe("Optional instructions to pass to the MCP analysis"),
});

const ApplyInlineCommentsInput = z.object({
    comments: z.array(z.object({
        selectedText: z.string(),
        comment: z.string()
    }))
});

const ApproveDelegateInput = z.object({
    destinationRepo: z.string().optional()
});

const ForkRepoInput = z.object({
    repo: z.string()
});

export class RetrofitAgent extends BaseAgent<RetrofitAgentState> {

    constructor(ctx: any, env: any) {
        super(ctx, env);
    }

    // Make sure we have a fresh MCP client that can reach cloudflare-docs
    async getDocsMcp() {
       return await getMcpClient('cloudflare-docs', this.env);
    }

    async getOctokit() {
        return getOctokitWithAuth(this.env);
    }

    @callable({ description: "Analyze the repository and create a draft prompt based on Cloudflare best practices" })
    async analyze_and_draft(input: z.infer<typeof AnalyzeDraftInput>) {
        const db = getDrizzle(this.env);

        // 1. Fetch repo details to get a sense of it
        const octokit = await this.getOctokit();
        const [owner, name] = input.repo.split("/");

        let repoContext = "No repo context";
        try {
           const { data: repoInfo } = await octokit.rest.repos.get({ owner, repo: name });
           const { data: tree } = await octokit.rest.git.getTree({ owner, repo: name, tree_sha: repoInfo.default_branch, recursive: "1" });
           repoContext = `Repo: ${repoInfo.full_name}\nDescription: ${repoInfo.description}\nFiles: \n` + tree.tree.slice(0, 100).map(t => t.path).join("\n");
        } catch(e) {
           console.log("Error getting repo info", e);
        }

        // 2. Query MCP for docs
        const mcpClient = await this.getDocsMcp();
        let docsContext = "";
        try {
             // In a real implementation we would call tools on the MCP client to search for 'hono', 'drizzle', 'workers'
             // For this implementation, we will mock the interaction if MCP tool call fails or just use generic prompt.
             const result = await mcpClient.callTool({
                name: "search_docs",
                arguments: { query: "Hono routing Drizzle D1 setup Worker" }
             });
             if(result && result.content && result.content.length > 0) {
                 docsContext = result.content[0].text as string;
             }
        } catch(e) {
            console.log("MCP call failed, using fallback context", e);
            docsContext = "Cloudflare Workers standard: Use Hono for routing, Drizzle ORM for D1, and wrangler for deployment.";
        }

        // 3. Draft the prompt
        const promptSystem = `You are a Retrofit Architect. Your task is to write a detailed implementation prompt to retrofit a repository to Cloudflare Workers.

        Repository Context:
        ${repoContext}

        Cloudflare Docs Context:
        ${docsContext}

        User Instructions:
        ${input.instructions || "Make it run on Workers."}

        Write a very detailed prompt meant for a software engineering AI agent ('Jules'). It should detail the steps to migrate to Hono/Drizzle on Cloudflare Workers.`;

        const { text: draftText } = await generateText({
            model: getModel(this.env, "gemini-2.5-flash"),
            system: promptSystem,
            prompt: "Generate the implementation prompt."
        });

        const threadId = this.ctx.id.toString();

        // 4. Update state and DB
        let currentVersion = 1;
        if(this.state.versionNumber) {
            currentVersion = this.state.versionNumber + 1;
        }

        await db.insert(retrofitPrompts).values({
            threadId: threadId,
            versionNumber: currentVersion,
            promptContent: draftText
        });

        // Also ensure thread exists
        const existingThread = await db.query.retrofitThreads.findFirst({
            where: eq(retrofitThreads.id, threadId)
        });

        if(!existingThread) {
            await db.insert(retrofitThreads).values({
                id: threadId,
                sourceRepo: input.repo,
                status: 'drafting'
            });
        }

        this.setState({
            ...this.state,
            draftPrompt: draftText,
            versionNumber: currentVersion,
            repoName: input.repo
        });

        return { message: "Draft updated successfully." };
    }

    @callable({ description: "Fork the repository to the user's account" })
    async fork_repo(input: z.infer<typeof ForkRepoInput>) {
        const octokit = await this.getOctokit();
        const [owner, name] = input.repo.split("/");
        try {
            const { data: fork } = await octokit.rest.repos.createFork({ owner, repo: name });
            return { message: "Repository forked successfully.", destinationRepo: fork.full_name };
        } catch(e: any) {
            return { error: `Failed to fork repo: ${e.message}` };
        }
    }

    @callable({ description: "Apply user inline comments to refine the draft prompt" })
    async apply_inline_comments(input: z.infer<typeof ApplyInlineCommentsInput>) {
         const db = getDrizzle(this.env);
         const threadId = this.ctx.id.toString();

         const promptSystem = `You are refining a draft prompt based on user comments.

         Current Draft:
         ${this.state.draftPrompt}

         User Comments:
         ${JSON.stringify(input.comments, null, 2)}

         Rewrite the draft prompt incorporating these changes. Return the full updated prompt text.`;

         const { text: updatedDraft } = await generateText({
            model: getModel(this.env, "gemini-2.5-flash"),
            system: "You are a helpful assistant.",
            prompt: promptSystem
         });

         const newVersion = (this.state.versionNumber || 1) + 1;

         // Insert new prompt
         const [newPromptRec] = await db.insert(retrofitPrompts).values({
            threadId: threadId,
            versionNumber: newVersion,
            promptContent: updatedDraft
         }).returning();

         // Record comments
         for(const c of input.comments) {
             await db.insert(retrofitComments).values({
                 draftPromptId: newPromptRec.id,
                 draftPromptVersion: newVersion,
                 userComment: `Selected: "${c.selectedText}" - Comment: ${c.comment}`,
                 resolved: true
             });
         }

         this.setState({
             ...this.state,
             draftPrompt: updatedDraft,
             versionNumber: newVersion
         });

         return { message: "Comments applied and draft updated." };
    }

    @callable({ description: "Approve the draft prompt and delegate the work to the Jules service" })
    async approve_and_delegate(input: z.infer<typeof ApproveDelegateInput>) {
        const db = getDrizzle(this.env);
        const threadId = this.ctx.id.toString();

        let targetRepo = input.destinationRepo;
        if(!targetRepo && this.state.repoName) {
            targetRepo = this.state.repoName; // fallback
        }

        if(!targetRepo) {
            return { error: "Destination repository is required to delegate." };
        }

        // 1. Call Jules service
        const promptToSend = this.state.draftPrompt;

        try {
            const session = await createJulesSession(this.env, {
                title: `Retrofit ${targetRepo}`,
                owner: "RetrofitAgent", // or github user
                projectPath: targetRepo
            });

            // Add the instruction to the session.
            // In the real system, we'd add an instruction message to the session here.

            const julesSessionId = session.id;

            // 2. Update thread
            await db.update(retrofitThreads).set({
                status: 'implementing',
                julesSessionId: julesSessionId,
                destinationRepo: targetRepo
            }).where(eq(retrofitThreads.id, threadId));

            this.setState({
                ...this.state,
                julesStatus: "In Progress",
                julesSessionId: julesSessionId
            });

            return { message: "Delegated to Jules successfully.", sessionId: julesSessionId };

        } catch(e: any) {
             return { error: `Failed to create Jules session: ${e.message}` };
        }
    }

    @callable({ description: "Check the current status of the delegated Jules task" })
    async check_jules_status() {
         if(!this.state.julesSessionId) {
             return { message: "No active Jules session." };
         }

         // In a real implementation we would fetch the session status from the jules service
         return {
             status: this.state.julesStatus || "Unknown",
             sessionId: this.state.julesSessionId
         };
    }

    // Webhook Handlers (callable from the DO instance externally)
    async review_pr(payload: any) {
        // Triggered by webhook when Jules opens a PR or gemini-code-assist comments
        const db = getDrizzle(this.env);
        const threadId = this.ctx.id.toString();

        await db.update(retrofitThreads).set({
            status: 'pr_review'
        }).where(eq(retrofitThreads.id, threadId));

        this.setState({
            ...this.state,
            julesStatus: "PR Review"
        });

        // Follow up logic using Jules API if changes are needed
        // ...
    }

    async merge_pr(payload: any) {
        // Merges PR
         const db = getDrizzle(this.env);
         const threadId = this.ctx.id.toString();

         await db.update(retrofitThreads).set({
            status: 'completed'
         }).where(eq(retrofitThreads.id, threadId));

         this.setState({
            ...this.state,
            julesStatus: "Merged"
         });
    }

    async onMessage(message: any) {
         // handle normal chat with user
         const db = getDrizzle(this.env);
         const threadId = this.ctx.id.toString();

         // Save user message
         await db.insert(retrofitMessages).values({
             threadId,
             role: "user",
             content: message.content
         });

         // basic passthrough to model using tools
         const response = await generateText({
            model: getModel(this.env, "gemini-2.5-flash"),
            system: `You are the Retrofit Agent, helping users retrofit their repos to Cloudflare Workers.
            You have access to tools to analyze the repo, fork it, and delegate work to Jules.
            Current Draft Prompt Version: ${this.state.versionNumber || 0}.`,
            prompt: message.content,
            tools: {
                analyze_and_draft: tool({
                    description: "Analyze the repository and create a draft prompt",
                    parameters: AnalyzeDraftInput,
                    execute: async (args) => this.analyze_and_draft(args)
                }),
                fork_repo: tool({
                     description: "Fork the repository",
                     parameters: ForkRepoInput,
                     execute: async (args) => this.fork_repo(args)
                }),
                approve_and_delegate: tool({
                     description: "Approve the draft and delegate to Jules",
                     parameters: ApproveDelegateInput,
                     execute: async (args) => this.approve_and_delegate(args)
                })
            }
         });

         await db.insert(retrofitMessages).values({
             threadId,
             role: "assistant",
             content: response.text
         });

         return response.text;
    }
}
