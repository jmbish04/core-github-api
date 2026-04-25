import { BrowserService } from "@/ai/mcp/tools/browser/browserRenderApi";
import { getDb } from "@db";
import { ResearchLogger } from "@research-logger";

export type WebSearchResult = {
  title: string;
  url: string;
  snippet: string;
};

type WebSearchDeps = {
  env: Env;
  ctx: ExecutionContext | DurableObjectState;
};

/**
 * Native execution of Web Search utilizing the Cloudflare Browser Render API.
 * Replaces the legacy Puppeteer usage.
 */
export async function executeWebSearch(
  deps: WebSearchDeps,
  briefId: string,
  query: string,
  maxResults = 10
): Promise<WebSearchResult[]> {
  const db = getDb(deps.env.DB as any);
  const researchLogger = new ResearchLogger(db, briefId, null, 'ResearchAgent/WebSearch', deps.ctx);

  await researchLogger.logToolInput('CloudflareBrowserAPI', { query });

  try {
    const service = new BrowserService(deps.env);
    const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
    
    // Leverage the JSON extraction endpoint of the Browser Render API
    const result = await service.getJson({
      url: searchUrl,
      prompt: `Extract the top ${maxResults} organic search results.`,
      response_format: {
        type: "json_schema",
        schema: {
          type: "object",
          properties: {
            results: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  title: { type: "string" },
                  url: { type: "string" },
                  snippet: { type: "string" }
                },
                required: ["title", "url", "snippet"]
              }
            }
          },
          required: ["results"]
        }
      }
    });

    const parsed = (result as any)?.results || [];

    await researchLogger.logToolOutput('CloudflareBrowserAPI', { count: parsed.length, topResults: parsed.slice(0, 3) });
    return parsed;
  } catch (error) {
    await researchLogger.logError('CloudflareBrowserAPI', error);
    throw error;
  }
}
