import puppeteer from '@cloudflare/puppeteer';
import { createAgent } from '@/ai/agents/honi';
import { buildMaxAgentMemory } from '@/ai/agents/memory';
import { AgentStateStore } from '@/ai/agents/support/state-store';
import type { PersistentAgentState } from '@/ai/agents/support/types';
import { ResearchLogger } from '@research-logger';
import { getDb } from '@db';

type SearchResult = {
  title: string;
  url: string;
  snippet: string;
};

const webSearchRuntime = createAgent<Env>({
  name: 'web-search-agent',
  model: '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
  system: 'You search and summarize public web information when asked.',
  binding: 'WEB_SEARCH_AGENT',
  tools: [],
  memory: buildMaxAgentMemory({
    agentName: 'WebSearchAgent',
    graphId: 'core-github-api-web-search',
  }),
  observability: { enabled: true, aiGatewaySlug: 'core-github-api', collectEvents: true },
});

const WebSearchDurableObject = webSearchRuntime.DurableObject as new (
  ctx: DurableObjectState,
  env: Env,
) => DurableObject & { env: Env };

export class WebSearchAgent extends WebSearchDurableObject {
  declare env: Env;
  private readonly store: AgentStateStore<PersistentAgentState>;
  private readonly doState: DurableObjectState;

  constructor(state: DurableObjectState, env: Env) {
    super(state, env);
    this.env = env;
    this.doState = state;
    this.store = new AgentStateStore<PersistentAgentState>({
      ctx: state,
      env,
      agentName: 'WebSearchAgent',
      initialState: { status: 'idle', history: [] },
    });
  }

  async search(briefId: string, query: string): Promise<SearchResult[]> {
    const db = getDb(this.env.DB);
    const researchLogger = new ResearchLogger(db, briefId, null, 'WebSearchAgent', this.doState);

    await this.store.setStatus('running');
    await researchLogger.logToolInput('GoogleSearch', { query });

    let browser;
    try {
      browser = await puppeteer.launch(this.env.BROWSER as any);
      const page = await browser.newPage();

      await researchLogger.logInfo('Puppeteer', 'Navigating to Google...');

      const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
      await page.goto(searchUrl, { waitUntil: 'networkidle0' });

      const results = await page.evaluate(() => {
        const items: SearchResult[] = [];
        const elements = document.querySelectorAll('.g');

        elements.forEach((el) => {
          const titleEl = el.querySelector('h3');
          const anchorEl = el.querySelector('a');
          const snippetEl = el.querySelector('.VwiC3b');

          if (titleEl && anchorEl) {
            items.push({
              title: titleEl.innerText,
              url: anchorEl.href,
              snippet: snippetEl ? (snippetEl as HTMLElement).innerText : '',
            });
          }
        });
        return items.slice(0, 10);
      });

      await researchLogger.logToolOutput('GoogleSearch', { count: results.length, topResults: results.slice(0, 3) });
      await this.store.set({ ...this.store.state, status: 'completed', lastResult: results });
      return results;
    } catch (error) {
      await researchLogger.logError('GoogleSearch', error);
      await this.store.setStatus('failed');
      throw error;
    } finally {
      if (browser) {
        await browser.close();
      }
    }
  }
}
