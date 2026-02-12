/**
 * @file backend/src/services/pricing-scraper.ts
 * @description Scrapes AI model pricing from provider documentation pages
 * @owner AI Infrastructure Team
 */

import { v4 as uuidv4 } from 'uuid';
import { eq, desc } from 'drizzle-orm';
import { pricingSnapshots, type NewPricingSnapshot } from '@db';
import { Logger } from '@logging';

interface PricingData {
  modelId: string;
  modelName: string;
  inputCostPerM: number;
  outputCostPerM: number;
  inputLongCostPerM?: number;
  outputLongCostPerM?: number;
  cacheReadCostPerM?: number;
  cacheWriteCostPerM?: number;
  metadata?: Record<string, any>;
}

/**
 * Scrapes pricing from OpenAI documentation
 */
async function scrapeOpenAIPricing(env: Env): Promise<PricingData[]> {
  const logger = new Logger(env, 'PricingScraper');
  const url = 'https://developers.openai.com/api/docs/pricing';
  
  try {
    // Use browser rendering to get structured JSON
    const response = await env.BROWSER.fetch(`https://api.browser.run/json?url=${encodeURIComponent(url)}`);
    const data = await response.json() as any;
    
    logger.info('Scraped OpenAI pricing', { url, dataLength: JSON.stringify(data).length });
    
    // Parse the JSON response to extract pricing
    // This is a simplified parser - actual implementation would need to handle the specific structure
    const pricing: PricingData[] = [];
    
    // Example parsing logic (adjust based on actual JSON structure)
    // The browser rendering service returns structured data that we can parse
    if (data.pricing || data.models) {
      // Parse based on actual structure from browser rendering
      // For now, return empty array - will be filled in based on actual response structure
    }
    
    return pricing;
  } catch (error: any) {
    logger.error('Failed to scrape OpenAI pricing', { error: error.message });
    return [];
  }
}

/**
 * Scrapes pricing from Anthropic documentation
 */
async function scrapeAnthropicPricing(env: Env): Promise<PricingData[]> {
  const logger = new Logger(env, 'PricingScraper');
  const url = 'https://platform.claude.com/docs/en/about-claude/pricing';
  
  try {
    const response = await env.BROWSER.fetch(`https://api.browser.run/json?url=${encodeURIComponent(url)}`);
    const data = await response.json() as any;
    
    logger.info('Scraped Anthropic pricing', { url, dataLength: JSON.stringify(data).length });
    
    const pricing: PricingData[] = [];
    // Parse Anthropic pricing structure
    
    return pricing;
  } catch (error: any) {
    logger.error('Failed to scrape Anthropic pricing', { error: error.message });
    return [];
  }
}

/**
 * Scrapes pricing from Google Gemini documentation
 */
async function scrapeGooglePricing(env: Env): Promise<PricingData[]> {
  const logger = new Logger(env, 'PricingScraper');
  const url = 'https://ai.google.dev/gemini-api/docs/pricing';
  
  try {
    const response = await env.BROWSER.fetch(`https://api.browser.run/json?url=${encodeURIComponent(url)}`);
    const data = await response.json() as any;
    
    logger.info('Scraped Google pricing', { url, dataLength: JSON.stringify(data).length });
    
    const pricing: PricingData[] = [];
    // Parse Google pricing structure
    
    return pricing;
  } catch (error: any) {
    logger.error('Failed to scrape Google pricing', { error: error.message });
    return [];
  }
}

/**
 * Main function to scrape all provider pricing and store in D1
 */
export async function scrapePricing(env: Env, ctx: ExecutionContext): Promise<void> {
  const logger = new Logger(env, 'PricingScraper');
  const db = env.DB;
  
  logger.info('Starting pricing scrape');
  
  try {
    // Scrape all providers
    const [openaiPricing, anthropicPricing, googlePricing] = await Promise.all([
      scrapeOpenAIPricing(env),
      scrapeAnthropicPricing(env),
      scrapeGooglePricing(env),
    ]);
    
    const allPricing = [
      ...openaiPricing.map(p => ({ ...p, provider: 'openai' as const, sourceUrl: 'https://developers.openai.com/api/docs/pricing' })),
      ...anthropicPricing.map(p => ({ ...p, provider: 'anthropic' as const, sourceUrl: 'https://platform.claude.com/docs/en/about-claude/pricing' })),
      ...googlePricing.map(p => ({ ...p, provider: 'google' as const, sourceUrl: 'https://ai.google.dev/gemini-api/docs/pricing' })),
    ];
    
    // Store in D1
    const snapshots: NewPricingSnapshot[] = allPricing.map(pricing => ({
      id: uuidv4(),
      provider: pricing.provider,
      modelId: pricing.modelId,
      modelName: pricing.modelName,
      inputCostPerM: pricing.inputCostPerM,
      outputCostPerM: pricing.outputCostPerM,
      inputLongCostPerM: pricing.inputLongCostPerM ?? null,
      outputLongCostPerM: pricing.outputLongCostPerM ?? null,
      cacheReadCostPerM: pricing.cacheReadCostPerM ?? null,
      cacheWriteCostPerM: pricing.cacheWriteCostPerM ?? null,
      metadata: pricing.metadata ? JSON.stringify(pricing.metadata) : null,
      sourceUrl: pricing.sourceUrl,
      scrapedAt: new Date(),
    }));
    
    if (snapshots.length > 0) {
      await db.insert(pricingSnapshots).values(snapshots);
      logger.info('Stored pricing snapshots', { count: snapshots.length });
    } else {
      logger.warn('No pricing data scraped - check scraper implementations');
    }
    
    // Check for stale data and create GitHub issue if needed
    await checkPricingStaleness(env);
    
  } catch (error: any) {
    logger.error('Pricing scrape failed', { error: error.message, stack: error.stack });
  }
}

/**
 * Checks if pricing data is stale (>3 weeks old) and creates GitHub issue if needed
 */
export async function checkPricingStaleness(env: Env): Promise<void> {
  const logger = new Logger(env, 'PricingScraper');
  const db = env.DB;
  
  try {
    // Get the most recent pricing snapshot
    const latestSnapshot = await db
      .select()
      .from(pricingSnapshots)
      .orderBy(desc(pricingSnapshots.scrapedAt))
      .limit(1);
    
    if (latestSnapshot.length === 0) {
      logger.warn('No pricing snapshots found in database');
      await createStalePricingIssue(env, null);
      return;
    }
    
    const latest = latestSnapshot[0];
    const now = Date.now();
    const threeWeeksMs = 21 * 24 * 60 * 60 * 1000; // 3 weeks in milliseconds
    const age = now - latest.scrapedAt.getTime();
    
    if (age > threeWeeksMs) {
      logger.warn('Pricing data is stale', { 
        lastUpdate: latest.scrapedAt.toISOString(),
        ageInDays: Math.floor(age / (24 * 60 * 60 * 1000))
      });
      await createStalePricingIssue(env, latest.scrapedAt);
    } else {
      logger.info('Pricing data is fresh', { lastUpdate: latest.scrapedAt.toISOString() });
    }
    
  } catch (error: any) {
    logger.error('Failed to check pricing staleness', { error: error.message });
  }
}

/**
 * Creates a GitHub issue alerting about stale pricing data
 */
async function createStalePricingIssue(env: Env, lastUpdate: Date | null): Promise<void> {
  const logger = new Logger(env, 'PricingScraper');
  
  try {
    const { Octokit } = await import('@octokit/rest');
    const githubToken = await env.GITHUB_TOKEN.get();
    
    if (!githubToken) {
      logger.error('GITHUB_TOKEN not found - cannot create issue');
      return;
    }
    
    const octokit = new Octokit({ auth: githubToken });
    
    const title = '⚠️ Stale Pricing Data Alert - Risk of Overbilling';
    const body = `## ⚠️ Stale Pricing Data Alert

**Status**: Pricing data is ${lastUpdate ? '>3 weeks old' : 'missing'} and may be outdated.

${lastUpdate ? `**Last Update**: ${lastUpdate.toISOString()}` : '**Last Update**: Never'}
**Checked At**: ${new Date().toISOString()}

**Risk**: Using potentially incorrect pricing data could lead to:
- ❌ Unexpected cost overruns
- ❌ Incorrect budget tracking  
- ❌ Using expensive models unknowingly
- ❌ Overbilling without realizing

**Action Required**: 
1. Check browser rendering service status
2. Verify weekly cron job is executing
3. Review \`services/pricing-scraper.ts\` for errors
4. Update pricing manually if needed

**Affected Providers**:
- OpenAI
- Anthropic (Claude)
- Google (Gemini)

---
*This issue was automatically created by the pricing monitoring system.*
`;
    
    const response = await octokit.issues.create({
      owner: env.GITHUB_OWNER,
      repo: 'core-github-api',
      title,
      body,
      labels: ['bug', 'critical', 'pricing', 'automated'],
    });
    
    logger.info('Created GitHub issue for stale pricing', { issueNumber: response.data.number });
    
  } catch (error: any) {
    logger.error('Failed to create GitHub issue', { error: error.message });
  }
}

/**
 * Gets the latest pricing from D1 for a specific model
 */
export async function getLatestPricing(
  db: any,
  provider: string,
  modelId: string
): Promise<PricingData | null> {
  try {
    const result = await db
      .select()
      .from(pricingSnapshots)
      .where(eq(pricingSnapshots.provider, provider))
      .where(eq(pricingSnapshots.modelId, modelId))
      .orderBy(desc(pricingSnapshots.scrapedAt))
      .limit(1);
    
    if (result.length === 0) return null;
    
    const snapshot = result[0];
    return {
      modelId: snapshot.modelId,
      modelName: snapshot.modelName,
      inputCostPerM: snapshot.inputCostPerM,
      outputCostPerM: snapshot.outputCostPerM,
      inputLongCostPerM: snapshot.inputLongCostPerM ?? undefined,
      outputLongCostPerM: snapshot.outputLongCostPerM ?? undefined,
      cacheReadCostPerM: snapshot.cacheReadCostPerM ?? undefined,
      cacheWriteCostPerM: snapshot.cacheWriteCostPerM ?? undefined,
      metadata: snapshot.metadata ? JSON.parse(snapshot.metadata) : undefined,
    };
  } catch (error) {
    return null;
  }
}
