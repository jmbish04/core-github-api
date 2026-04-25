import { BaseAgent } from "@/ai/providers";
import { callable } from "agents";
import * as methods from "./methods";
import type { ResearchState, ResearchQuery, ResearchResult, ResearchFinding, ResearchProposalTarget } from "./types";
import type { PollResult } from "./methods/polling";
import type { NewsletterResult } from "./methods/newsletter";
import { interactiveScrapeImpl } from "./methods/browser-execute";
import { z } from "zod";
import type { HealthMode, HealthCheck } from '@/ai/providers/agent-support/health/types';
import type { PeerBindingDescriptor } from '@/ai/providers/agent-support/health';
import { getSecret } from '@/utils/secrets';

export class ResearchAgent extends BaseAgent<ResearchState> {
  protected get skills() {
    return ['deep-research', 'brainstorming', 'source-evaluation'];
  }

  protected get agentName() {
    return 'ResearchAgent';
  }

  // ── Peer Agent Bindings (for HITL deliberation) ────────────────────

  public get peerAgentBindings(): Record<string, PeerBindingDescriptor> {
    return {
      LEARNING_AGENT: { bindingKey: 'LEARNING_AGENT', required: true },
      CLOUDFLARE_AGENT: { bindingKey: 'CLOUDFLARE_AGENT', required: false },
      GUARDRAIL_AGENT: { bindingKey: 'GUARDRAIL_AGENT', required: false },
    };
  }

  protected async agentInit() {}

  // ── Layer 3 Health Checks ────────────────────────────────────────────

  protected override async agentHealthChecks(_mode: HealthMode): Promise<HealthCheck[]> {
    const checks: HealthCheck[] = [];
    
    // 1. Check GitHub capability (Active Ping)
    let start = Date.now();
    const logger = (this as any).logger;
    const logPrefix = '[ResearchAgent] ';
    try {
      const token = getSecret((this as any).env, 'GITHUB_TOKEN');
      if (!token) {
        logger.error(`${logPrefix} Missing GITHUB_TOKEN`);
        throw new Error(`${logPrefix} Missing GITHUB_TOKEN`);
      }
      
      const res = await fetch('https://api.github.com/rate_limit', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'User-Agent': 'core-github-api-health',
        }
      });
      if (!res.ok) {
        logger.error(`${logPrefix} GitHub API error: HTTP ${res.status}`); 
        throw new Error(`${logPrefix} GitHub API error: HTTP ${res.status}`);
      }
      
      logger.info(`${logPrefix} GitHub API health check active ping passed`);
      
      checks.push({
        name: 'agent.research.github',
        layer: 3,
        category: 'tool',
        status: 'pass',
        durationMs: Date.now() - start,
        message: 'GitHub API reachable and token valid'
      });
    } catch (e: any) {
      logger.error(`${logPrefix} GitHub API error: ${e.message || e}`);
      checks.push({ name: 'agent.research.github', layer: 3, category: 'tool', status: 'fail', durationMs: Date.now() - start, message: e.message });
    }

    // 2. Check Discord capability (Active Ping)
    start = Date.now();
    try {
      const token = getSecret((this as any).env, 'DISCORD_BOT_TOKEN');
      if (!token) throw new Error('Missing DISCORD_BOT_TOKEN');

      const res = await fetch('https://discord.com/api/v10/users/@me', {
        headers: {
          'Authorization': `Bot ${token}`,
          'User-Agent': 'DiscordBot (https://github.com/core-github-api, 1.0.0)'
        }
      });
      if (!res.ok) {
        logger.error(`${logPrefix} Discord API error: HTTP ${res.status}`); 
        throw new Error(`${logPrefix} Discord API error: HTTP ${res.status}`);
      }
      
      logger.info(`${logPrefix} Discord API health check active ping passed`);

      checks.push({
        name: 'agent.research.discord',
        layer: 3,
        category: 'tool',
        status: 'pass',
        durationMs: Date.now() - start,
        message: 'Discord API reachable and bot token valid'
      });
    } catch (e: any) {
      logger.error(`${logPrefix} Discord API error: ${e}`); 
      checks.push({ name: 'agent.research.discord', layer: 3, category: 'tool', status: 'fail', durationMs: Date.now() - start, message: e.message });
    }

    // 3. Check Web Search capability (Active Scrape with Browser Render API)
    start = Date.now();
    try {
      const { BrowserService } = await import('@/ai/mcp/tools/browser/browserRenderApi');
      const service = new BrowserService((this as any).env);
      
      // Perform a minimal, fast scrape against a simple edge location to verify the API works
      const result = await service.getContent({ url: 'https://google.com' });
      if (!result) {
        logger.error(`${logPrefix} Browser Render API returned empty payload`); 
        throw new Error(`${logPrefix} Browser Render API returned empty payload`);
      }
      
      logger.info(`${logPrefix} Browser Render API health check scrape passed`);

      checks.push({
        name: 'agent.research.websearch',
        layer: 3,
        category: 'tool',
        status: 'pass',
        durationMs: Date.now() - start,
        message: 'Browser Render API successfully scraped test page'
      });
    } catch (e: any) {
      logger.error(`${logPrefix} Browser Render API error: ${e.message || e}`); 
      checks.push({ name: 'agent.research.websearch', layer: 3, category: 'tool', status: 'fail', durationMs: Date.now() - start, message: e.message });
    }

    return checks;
  }


  /**
   * Deep dive into a topic with optional context.
   */
  @callable()
  async deepDive(topic: string, context?: string): Promise<{ findings: ResearchFinding[]; summary: string }> {
    this.logger.info(`[deepDive] Starting deep dive on: ${topic.slice(0, 80)}`, { hasContext: !!context });
    const result = await methods.deepDive(this, topic, context);
    this.logger.info(`[deepDive] Complete — ${result.findings.length} findings produced`);
    return result;
  }

  /**
   * Summarize content into structured output with key points.
   */
  @callable()
  async summarize(content: string, maxLength?: number): Promise<{ summary: string; keyPoints: string[] }> {
    this.logger.info(`[summarize] Summarizing content (${content.length} chars)`, { maxLength });
    const result = await methods.summarize(this, content, maxLength);
    this.logger.info(`[summarize] Summary generated (${result.summary.length} chars, ${result.keyPoints.length} key points)`);
    return result;
  }

  /**
   * Executes an interactive scrape using the browser tools for unstructured page exploration.
   */
  @callable()
  async interactiveScrape(url: string, instruction: string, perCallTimeoutMs?: number): Promise<{ summary: string; rawJsLog?: string }> {
    this.logger.info(`[interactiveScrape] Starting interactive scrape on: ${url}`);
    const result = await interactiveScrapeImpl(this, { url, instruction, perCallTimeoutMs });
    this.logger.info(`[interactiveScrape] Interactive scrape complete.`);
    return result;
  }

  /**
   * Search across all configured sources for a topic.
   */
  @callable()
  async research(query: ResearchQuery): Promise<ResearchResult> {
    this.logger.info(`[research] Starting multi-source research: "${query.topic}"`, { sources: query.sources, maxResults: query.maxResults });
    const findings: ResearchFinding[] = [];
    const errors: string[] = [];

    // Run source-specific searches in parallel
    const searches = query.sources.map(async (source) => {
      this.logger.info(`[research] Querying source: ${source}`);
      switch (source) {
        case "web": {
          const webRes = await methods.executeWebSearch(
            { env: this.env, ctx: this.ctx },
            query.topic,
            query.topic,
            query.maxResults
          );
          return webRes.map(w => ({
            source: "web" as const,
            title: w.title,
            content: w.snippet,
            url: w.url,
            relevanceScore: 0  // Unscored — AI pass will calculate
          }));
        }
        case "github":
          this.logger.info(`[research] Querying github for: ${query.topic}`);
          return methods.searchGithub(this, query.topic);
        case "discord": {
          this.logger.info(`[research] Querying discord for: ${query.topic}`);
          const discordRes = await methods.searchDiscordMessages(this.env, { 
            query: query.topic,
            maxMessagesPerChannel: 10,
            maxChannels: 5
          });
          this.logger.info(`[research] Found ${discordRes.matches.length} discord messages`);
          return discordRes.matches.map(m => ({
            source: "discord" as const,
            title: `Message from ${m.author}`,
            content: m.content,
            url: `https://discord.com/channels/${m.guildId}/${m.channelId}/${m.messageId}`,
            relevanceScore: 0  // Unscored — AI pass will calculate
          }));
        }
        default:
          this.logger.info(`[research] Unknown source: ${source}`);
          return [] as ResearchFinding[];
      }
    });

    const results = await Promise.allSettled(searches);
    for (const result of results) {
      if (result.status === "fulfilled") {
        findings.push(...result.value);
      } else {
        this.logger.error(`[research] Source search failed`, { error: result.reason?.message });
        errors.push(result.reason?.message || "Unknown error");
      }
    }

    if (findings.length > 0) {
      try {
        const findingsForAi = findings.map((f, index) => ({
          index,
          title: f.title,
          content: f.content.substring(0, 1000)
        }));
        
        const aiResponse = await this.ai.generateStructuredResponse(
          `Calculate a relevance score between 0.0 and 1.0 for each of the following findings against this query: "${query.topic}"\n\nFindings:\n${JSON.stringify(findingsForAi, null, 2)}`,
          z.object({
            scores: z.array(z.object({
              index: z.number(),
              score: z.number().min(0).max(1).describe("Relevance score between 0.0 and 1.0"),
              reasoning: z.string().describe("Brief reasoning for the score")
            }))
          }),
          "You are a strict research evaluator. Analyze how directly relevant each finding is to the user's specific query."
        );
        
        for (const scoreObj of aiResponse.scores) {
          if (findings[scoreObj.index]) {
            findings[scoreObj.index].relevanceScore = scoreObj.score;
          }
        }
      } catch (err) {
        this.logger.error(`[research] Failed to calculate AI relevance scores`, { error: String(err) });
      }
    }

    // Sort by relevance
    findings.sort((a, b) => b.relevanceScore - a.relevanceScore);

    // Generate summary from findings
    const { summary } = await methods.summarize(
      this,
      findings.map((f) => `${f.title}: ${f.content}`).join("\n\n"),
    );

    this.logger.info(`[research] Complete — ${findings.length} total findings, confidence ${findings.length > 0 ? Math.min(90, findings.length * 15) : 10}%`, { errors });

    return {
      query,
      findings: findings.slice(0, query.maxResults || 10),
      summary,
      confidence: findings.length > 0 ? Math.min(90, findings.length * 15) : 10,
      completedAt: new Date().toISOString(),
    };
  }

  // ── Modular Workflow Capabilities ─────────────────────────────────────────

  @callable()
  async searchDiscord(input: any) {
    this.logger.info('[searchDiscord] Searching Discord messages', { query: input?.query });
    return methods.searchDiscordMessages(this.env, input);
  }

  @callable()
  async runDiscordWorkflow(input: any) {
    this.logger.info('[runDiscordWorkflow] Triggering Discord research workflow');
    return methods.triggerDiscordResearchWorkflow(this.env, input);
  }

  @callable()
  async submitBrief(userId: string, title: string, content: any) {
    this.logger.info(`[submitBrief] Submitting research brief: "${title}" by user ${userId}`);
    return methods.submitBrief({ env: this.env, ctx: this.ctx, ai: this.ai }, userId, title, content);
  }

  @callable()
  async generateReport(briefId: string, candidates: any[], plan: any) {
    this.logger.info(`[generateReport] Generating report for brief ${briefId} with ${candidates.length} candidates`);
    return methods.generateReport({ env: this.env, ctx: this.ctx, ai: this.ai }, briefId, candidates, plan);
  }

  @callable()
  async deepReason(message: string, options?: { model?: string }) {
    this.logger.info(`[deepReason] Deep reasoning: ${message.slice(0, 80)}...`, { model: options?.model });
    return methods.deepReason({ env: this.env, ai: this.ai }, message, options);
  }

  // ── Intelligence Hub @callable() — v2 ────────────────────────────────

  /**
   * Poll all active tracked sources for new items.
   * Dispatches to source-specific methods (RSS, GitHub, Discord, Web).
   */
  @callable()
  async pollSources(): Promise<PollResult> {
    this.logger.info('[pollSources] Starting tracked source poll cycle');
    return methods.pollTrackedSources(this);
  }

  /**
   * Dispatch a daily or weekly newsletter digest via SEND_EMAIL_NEWSLETTER.
   * Includes new discoveries and pending HITL proposals with frontend deep-links.
   */
  @callable()
  async sendNewsletter(mode: 'daily' | 'weekly' = 'daily'): Promise<NewsletterResult> {
    this.logger.info(`[sendNewsletter] Dispatching ${mode} newsletter`);
    return methods.dispatchNewsletter(this, mode);
  }

  /**
   * Manually propose a tracked item to the HITL queue for human review.
   */
  @callable()
  async proposeToHitl(
    itemId: string,
    target: ResearchProposalTarget = 'template-repo',
  ): Promise<{ hitlRecordId: string }> {
    this.logger.info(`[proposeToHitl] Manual HITL proposal for item ${itemId}`, { target });
    const { getDb, schema } = await import('@db');
    const db = getDb(this.env.DB);
    const items = await db.select().from(schema.trackedItems).where(
      (await import('drizzle-orm')).eq(schema.trackedItems.id, itemId),
    ).limit(1);
    if (!items.length) throw new Error(`Tracked item not found: ${itemId}`);

    return methods.proposeToHitl(this, items[0], {
      proposalTarget: target,
      reasoning: 'Manually promoted by user',
      suggestedImplementation: '',
    });
  }

  /**
   * Fan out to peer agents (LearningAgent, CloudflareAgent, GuardrailAgent)
   * for opinions on a pending HITL research proposal.
   */
  @callable()
  async requestDeliberation(hitlRecordId: string) {
    this.logger.info(`[requestDeliberation] Requesting multi-agent deliberation for HITL ${hitlRecordId}`);
    return methods.requestDeliberation(this, hitlRecordId);
  }

}
