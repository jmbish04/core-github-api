/**
 * @file CloudflareAgent/index.ts
 * @description CloudflareAgent — Agent for Cloudflare SDK, API, docs, and infrastructure.
 *              Absorbs CloudflareDocs + CfAgentsSdk into a unified Durable Object.
 *
 * @capabilities
 *  - query-docs: Cloudflare documentation queries with dynamic standardization rules
 *  - agents-sdk-expert: Agents SDK scaffolding, debugging, and code review
 *  - manage-bindings: D1, KV, R2, DO binding management (stub)
 *  - manage-wrangler: wrangler config review/creation (stub)
 *  - extract-build-logs: Deployment build log extraction (stub)
 */

import { BaseChatAgent } from '@/ai/providers';
import { callable } from 'agents';
import { queryDocs, chatAgentsSdkExpert } from './methods';
import type { CloudflareAgentState, StructuredChatResult } from './types';
import { getSecret } from '@/utils/secrets';
import { testAnyValidToken } from '@/utils/cloudflare/tokens';
import type { HealthCheck, HealthMode } from '@/ai/providers/agent-support/health';
import { createBrowserToolsForAgent } from '@/ai/tools/browser-tools';

// ─────────────────────────────────────────────────────────────────────────────
// Agent Class
// ─────────────────────────────────────────────────────────────────────────────

export class CloudflareAgent extends BaseChatAgent<CloudflareAgentState> {
  protected get skills() {
    return ['cloudflare-docs', 'workers-architecture', 'debugging'];
  }

  protected get agentName() {
    return 'CloudflareAgent';
  }

  initialState: CloudflareAgentState = {
    repoContext: null,
    status: 'idle',
    history: [],
    mcpCache: {},
    projectScaffolded: false,
  };

  protected async agentInit(): Promise<void> {
    // any extra initialization can go here
  }

  // ── Browser Tools ────────────────────────────────────────────────────

  protected getTools(): Record<string, any> {
    // Retrieve base tools (if any are returned by superclass)
    let tools = {};
    if (typeof (super.getTools as any) === 'function') {
      tools = (super as any).getTools() || {};
    }

    if ((this as any).env.BROWSER_TOOLS_ENABLED === '1') {
      const browserTools = createBrowserToolsForAgent((this as any).env, { agentId: this.agentName });
      tools = { ...tools, ...browserTools };
    }

    return tools;
  }

  // ── Layer 3 Health Checks ────────────────────────────────────────────

  protected override async agentHealthChecks(_mode: HealthMode): Promise<HealthCheck[]> {
    const checks: HealthCheck[] = [];

    // CF API Token verification (user + account auto-detect)
    const start = Date.now();
    try {
      const token = await getSecret((this as any).env, 'CLOUDFLARE_API_TOKEN');
      const accountId = (await getSecret((this as any).env, 'CLOUDFLARE_ACCOUNT_ID')) ?? '';
      const result = await testAnyValidToken(token, accountId, 'CLOUDFLARE_API_TOKEN');

      checks.push({
        name: 'agent.cf.apiTokenVerify',
        layer: 3,
        category: 'tool',
        status: result.passed ? 'pass' : 'fail',
        durationMs: Date.now() - start,
        message: result.passed
          ? `CF API token valid (${result.detectedType} token)`
          : `CF API token check failed: ${result.reason}`,
        details: {
          reason: result.reason,
          detectedType: result.detectedType,
        },
      });
    } catch (err: any) {
      checks.push({
        name: 'agent.cf.apiTokenVerify',
        layer: 3,
        category: 'tool',
        status: 'fail',
        durationMs: Date.now() - start,
        message: 'CF API token verification failed',
        error: err.message,
      });
    }

    return checks;
  }

  /**
   * General Cloudflare docs query — used by GuardrailAgent, EngineerAgent, LearningAgent.
   */
  @callable()
  async chat(
    message: string,
    history: unknown[] = [],
    context?: unknown,
    source = 'api',
    sessionId = 'default',
    requestedModel?: string,
  ): Promise<StructuredChatResult> {
    this.logger.info(`[queryDocs] ${message.slice(0, 80)}...`);
    return queryDocs(this.ai, this.stateStore, (this as any).env, message, history, context, source, sessionId, requestedModel);
  }

  /**
   * Agents SDK expert chat — scaffolding, debugging, code review.
   */
  @callable()
  async chatSdkExpert(
    message: string,
    history: unknown[] = [],
    context?: unknown,
    source = 'api',
    sessionId = 'default',
    requestedModel?: string,
  ): Promise<StructuredChatResult> {
    this.logger.info(`[sdkExpert] ${message.slice(0, 80)}...`);
    return chatAgentsSdkExpert(this.ai, this.stateStore, (this as any).env, message, history, context, source, sessionId, requestedModel);
  }

  /**
   * Analyze what Cloudflare bindings (D1, KV, DO, etc) are needed based on the architecture.
   */
  @callable()
  async analyzeBindingNeeds(_architectureDescription: string): Promise<{ status: string; bindings: string[] }> {
    this.logger.info(`[analyzeBindingNeeds] Analyzing Cloudflare binding requirements...`);
    // TODO: Implement binding analysis
    return { status: 'stub', bindings: [] };
  }

  /**
   * Provision Cloudflare bindings by modifying wrangler config and creating resources.
   */
  @callable()
  async provisionBindings(requestedBindings: string[]): Promise<{ status: string; provisioned: boolean }> {
    this.logger.info(`[provisionBindings] Provisioning requested bindings: ${requestedBindings.join(', ')}...`);
    // TODO: Implement binding provisioning
    return { status: 'stub', provisioned: false };
  }

  /**
   * Validate that the implemented worker code correctly uses the configured bindings.
   */
  @callable()
  async validateImplementation(_codeContext: string): Promise<{ status: string; valid: boolean; issues: string[] }> {
    this.logger.info(`[validateImplementation] Validating worker implementation...`);
    // TODO: Implement worker code validation
    return { status: 'stub', valid: true, issues: [] };
  }

  /**
   * Perform an agentic search against Cloudflare documentation utilizing the MCP tool.
   * This implements the L4 Golden-Path pattern where queries are rewritten based on 
   * context (such as files or error messages) before executing the MCP targeted search.
   * Exposed as an @callable method so other agents (like GuardrailAgent) can delegate 
   * complex Cloudflare-specific research.
   */
  @callable()
  async agenticSearch(questionBase: string, context?: Record<string, any>): Promise<{ mcpQuery: string, docsContext: string | null }> {
    this.logger.info(`[CloudflareAgent - agenticSearch] Starting for: ${questionBase.substring(0, 50)}...`);
    
    // Step 1: Agentic MCP documentation lookup - Rewrite query
    const mcpQuestion = await this.ai.rewriteQuestionForMCP(questionBase, context);
    this.logger.info(`[CloudflareAgent - agenticSearch] Rewritten query: ${mcpQuestion}`);

    // Step 2: Query Cloudflare docs MCP for latest documentation
    const { queryMCP } = await import('@/ai/mcp/mcp-client');
    let docsContext: string | null = null;
    try {
      const mcpResult = await queryMCP((this as any).env, mcpQuestion, "CloudflareAgent");
      if (typeof mcpResult === "string") {
        docsContext = mcpResult;
      } else if (mcpResult && !(mcpResult as any).error) {
        docsContext = JSON.stringify(mcpResult);
      }
    } catch (err: any) {
      this.logger.error(`[CloudflareAgent - agenticSearch] MCP query failed: ${err.message}`);
    }

    return { mcpQuery: mcpQuestion, docsContext };
  }
}
