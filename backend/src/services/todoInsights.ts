/**
 * @file src/services/todoInsights.ts
 * @description Generates AI insights for Todos based on their content and crawled links.
 */

import { todoAiInsights, todoLinks, todos } from "../db/schema";
import { getDb } from "../db";
import { eq } from "drizzle-orm";
import { BrowserService } from "./browser_render";
import { Agent as OpenAIAgent } from "@openai/agents";
import { z } from "zod";
import { createRunner, resolveDefaultAiModel, resolveDefaultAiProvider } from "../ai/agent-ai";

const TodoInsightItemSchema = z.object({
    type: z.enum(["offer_to_help", "enrich_todo", "research"]).default("enrich_todo"),
    insight: z.string(),
});

const TodoInsightsSchema = z.object({
    insights: z.array(TodoInsightItemSchema),
});

export class TodoInsightService {

    /**
     * Main entry point: Process a new or updated Todo
     */
    static async processTodo(env: any, todoId: string) {
        const db = getDb(env.DB);
        const browser = new BrowserService(env);

        // 1. Fetch Todo
        const todo = await db.select().from(todos).where(eq(todos.id, todoId)).limit(1).then(rows => rows[0]);
        if (!todo) return;

        console.log(`[Insight] Processing todo ${todoId}: ${todo.title}`);

        // 2. Extract & Crawl Links
        const urls = this.extractUrls(todo.content || "");
        const crawledData = [];

        for (const url of urls) {
            // Check if already exists
            const existing = await db.select().from(todoLinks).where(eq(todoLinks.href, url)).limit(1);

            // Check if we should re-crawl or if it's new
            // For now, always crawl for fresh insights

            try {
                // Use Cloudflare Browser Rendering to get text content
                // We'll use /content (HTML) then strip tags, OR /markdown which is better for LLMs
                console.log(`[Insight] Crawling details for ${url}...`);
                const mdResult = await browser.getMarkdown({ url });

                // Fallback to title from parsing or just use URL if fail
                // We might also want to call /links separately if needed, but content is key here.

                // Note: browser.getMarkdown returns { result: string } or similar depending on actual API response
                // The provided type says "MarkdownRequest" but the return type isn't typed explicitly in the service beyond "any" or "json".
                // Let's assume standard CF response structure: { success: true, result: "markdown content" }
                // Warning: The user provided types for requests but not responses.
                // Assuming result is directly the payload or wrapped. 
                // Based on `proxyToCloudflare` implementation: `return c.json(jsonResponse)` -> it returns what standard CF API returns.
                // Standard CF API usually returns { success: true, result: ... } or just result depending on endpoint.
                // Let's assume `content` from `getMarkdown` is the markdown string or inside `result`.

                const content = (mdResult as any).result || (mdResult as any).markdown || JSON.stringify(mdResult);

                crawledData.push({
                    url,
                    title: `[Link]`, // Browser API might not extract title separately in /markdown. 
                    content: content.substring(0, 5000)
                });

                // Save to DB
                await db.insert(todoLinks).values({
                    id: crypto.randomUUID(),
                    todoId: todo.id,
                    href: url,
                    url: url,
                    content: content.substring(0, 2000), // Store partial
                    crawledAt: new Date().toISOString()
                });

            } catch (e: any) {
                console.error(`[Insight] Failed to crawl ${url}:`, e);
            }
        }

        // 3. Generate Insights using Gemini
        await this.generateInsights(env, todo, crawledData);
    }

    private static extractUrls(text: string): string[] {
        const urlRegex = /(https?:\/\/[^\s]+)/g;
        return text.match(urlRegex) || [];
    }

    private static async generateInsights(env: any, todo: any, links: any[]) {
        const db = getDb(env.DB);

        // Construct Prompt
        const linkContext = links.map(l => `[Link] ${l.url}\nContent: ${l.content}`).join("\n\n");
        const prompt = `
        You are an intelligent productivity assistant.
        Analyze the following To-Do item and offering helpful, actionable insights.
        
        TODO TITLE: ${todo.title}
        TODO CONTENT: ${todo.content}
        
        LINKED CONTEXT:
        ${linkContext}

        Your goal is to suggest ONE or TWO specific actions the user can take to complete this task faster or better.
        Examples:
        - "I found a documentation page that explains this error. Check section X."
        - "This looks like a shopping list. I found a coupon for X."
        - "You mentioned a meeting. Should I draft an agenda?"

        Return response as a JSON array of objects: { "type": "offer_to_help" | "enrich_todo" | "research", "insight": "text" }
        `;

        try {
            const provider = resolveDefaultAiProvider(env as Env);
            const model = resolveDefaultAiModel(env as Env, provider);
            const runner = await createRunner(env as Env, provider, model);
            const agent = new OpenAIAgent({
                name: "TodoInsightAgent",
                model,
                outputType: TodoInsightsSchema,
                instructions:
                    "You are an intelligent productivity assistant. Return only structured JSON with an `insights` array.",
            });
            const result = await runner.run(agent, prompt);
            const insights = TodoInsightsSchema.parse(result.finalOutput ?? { insights: [] }).insights;

            if (Array.isArray(insights)) {
                for (const item of insights) {
                    await db.insert(todoAiInsights).values({
                        id: crypto.randomUUID(),
                        todoId: todo.id,
                        insight: item.insight,
                        type: item.type || 'enrich_todo',
                        status: 'pending_hil'
                    });
                }
            }

        } catch (e) {
            console.error("[Insight] AI Generation failed:", e);
        }
    }
}
