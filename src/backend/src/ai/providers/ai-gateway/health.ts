/**
 * AI Gateway Health Check
 *
 * Tests all AI providers through Cloudflare AI Gateway using BYOK mode.
 * Each request only sends `cf-aig-authorization: Bearer <token>` — no provider
 * API keys are exposed. The gateway injects stored provider keys automatically.
 *
 * Severity contract:
 *  - Workers AI  → CRITICAL: failure marks the overall check as `failure`
 *  - OpenAI      → WARNING:  failure marks the provider as `warning` only
 *  - Anthropic   → WARNING:  failure marks the provider as `warning` only
 *  - Gemini      → WARNING:  failure marks the provider as `warning` only
 *
 * @module AI/GatewayHealth
 */
import { AIGateway } from './index';
import { Logger } from '@/lib/logger';
import { HealthStepResult } from '@/health/types';

interface ProviderResult {
    status: 'OK' | 'WARNING' | 'FAILURE' | 'SKIPPED';
    latency?: number;
    model?: string;
    error?: string;
    critical?: boolean;
}

/**
 * Resolve the AI Gateway token from the env binding (KV Secret Store or plain string).
 */
async function resolveGatewayToken(env: Env): Promise<string> {
    if (!env.AI_GATEWAY_TOKEN) return '';
    return typeof env.AI_GATEWAY_TOKEN === 'object' && 'get' in env.AI_GATEWAY_TOKEN
        ? (await env.AI_GATEWAY_TOKEN.get()) || ''
        : (env.AI_GATEWAY_TOKEN as string);
}

/**
 * Build the BYOK headers. Only `cf-aig-authorization` is sent — no provider keys.
 */
function byokHeaders(token: string): Record<string, string> {
    return {
        'Content-Type': 'application/json',
        'cf-aig-authorization': `Bearer ${token}`,
    };
}

// ─── Individual Provider Probes ───────────────────────────────────────────────

async function probeWorkersAI(env: Env, token: string): Promise<ProviderResult> {
    const t0 = Date.now();
    try {
        const { baseUrl } = await AIGateway.getBaseUrl(env, { provider: 'workers-ai', endpoint: 'chat', openai_compatible: true });
        const model = '@cf/meta/llama-3.1-8b-instruct';
        const logger = new Logger(env, 'GatewayHealth');
        logger.info(`Probing Workers AI`, { model, url: baseUrl });
        await logger.flush();
        const res = await fetch(baseUrl, {
            method: 'POST',
            headers: byokHeaders(token),
            body: JSON.stringify({
                model,
                messages: [{ role: 'user', content: 'Reply with the single word: Pong' }],
                max_tokens: 10,
            }),
            signal: AbortSignal.timeout(15_000),
        });

        if (!res.ok) {
            const body = await res.text();
            return { status: 'FAILURE', latency: Date.now() - t0, model, error: `HTTP ${res.status}: ${body}`, critical: true };
        }

        const data = await res.json<any>();
        const text: string = data?.choices?.[0]?.message?.content || '';
        if (!text.toLowerCase().includes('pong')) {
            return { status: 'WARNING', latency: Date.now() - t0, model, error: `Unexpected response: ${text.slice(0, 100)}`, critical: true };
        }
        return { status: 'OK', latency: Date.now() - t0, model };
    } catch (e: any) {
        return { status: 'FAILURE', latency: Date.now() - t0, error: e.message, critical: true };
    }
}

async function probeOpenAI(env: Env, token: string): Promise<ProviderResult> {
    const t0 = Date.now();
    const model = 'gpt-4o-mini';
    try {
        const { baseUrl } = await AIGateway.getBaseUrl(env, { provider: 'openai', endpoint: 'chat', openai_compatible: true });
        const logger = new Logger(env, 'GatewayHealth');
        logger.info(`Probing OpenAI`, { model, url: baseUrl });
        await logger.flush();
        const res = await fetch(baseUrl, {
            method: 'POST',
            headers: byokHeaders(token),
            body: JSON.stringify({
                model,
                messages: [{ role: 'user', content: 'Reply with the single word: Pong' }],
                max_tokens: 10,
            }),
            signal: AbortSignal.timeout(20_000),
        });

        if (!res.ok) {
            const body = await res.text();
            if (res.status === 429 || body.includes('insufficient_quota') || body.includes('credit balance is too low')) {
                return { status: 'SKIPPED', latency: Date.now() - t0, model, error: `Quota Exceeded: ${body}` };
            }
            return { status: 'WARNING', latency: Date.now() - t0, model, error: `HTTP ${res.status}: ${body}` };
        }

        const data = await res.json<any>();
        const text: string = data?.choices?.[0]?.message?.content || '';
        if (!text.toLowerCase().includes('pong')) {
            return { status: 'WARNING', latency: Date.now() - t0, model, error: `Unexpected response: ${text.slice(0, 100)}` };
        }
        return { status: 'OK', latency: Date.now() - t0, model };
    } catch (e: any) {
        return { status: 'WARNING', latency: Date.now() - t0, model, error: e.message };
    }
}

async function probeAnthropic(env: Env, token: string): Promise<ProviderResult> {
    const t0 = Date.now();
    const model = 'claude-3-5-haiku-latest';
    try {
        const { baseUrl } = await AIGateway.getBaseUrl(env, { provider: 'anthropic', endpoint: 'chat', openai_compatible: true });
        const logger = new Logger(env, 'GatewayHealth');
        logger.info(`Probing Anthropic`, { model, url: baseUrl });
        await logger.flush();
        const res = await fetch(baseUrl, {
            method: 'POST',
            headers: byokHeaders(token),
            body: JSON.stringify({
                model: `anthropic/${model}`,
                messages: [{ role: 'user', content: 'Reply with the single word: Pong' }],
                max_tokens: 10,
            }),
            signal: AbortSignal.timeout(20_000),
        });

        if (!res.ok) {
            const body = await res.text();
            if (res.status === 429 || body.includes('insufficient_quota') || body.includes('credit balance is too low')) {
                return { status: 'SKIPPED', latency: Date.now() - t0, model, error: `Quota Exceeded: ${body}` };
            }
            return { status: 'WARNING', latency: Date.now() - t0, model, error: `HTTP ${res.status}: ${body}` };
        }

        const data = await res.json<any>();
        const text: string = data?.choices?.[0]?.message?.content || '';
        if (!text.toLowerCase().includes('pong')) {
            return { status: 'WARNING', latency: Date.now() - t0, model, error: `Unexpected response: ${text.slice(0, 100)}` };
        }
        return { status: 'OK', latency: Date.now() - t0, model };
    } catch (e: any) {
        return { status: 'WARNING', latency: Date.now() - t0, model, error: e.message };
    }
}

async function probeGemini(env: Env, token: string): Promise<ProviderResult> {
    const t0 = Date.now();
    const model = 'gemini-2.5-flash';
    try {
        const { baseUrl } = await AIGateway.getBaseUrl(env, { provider: 'gemini' });
        // Gemini via AI Gateway uses the native generateContent endpoint
        const res = await fetch(`${baseUrl}/v1beta/models/${model}:generateContent`, {
            method: 'POST',
            headers: byokHeaders(token),
            body: JSON.stringify({
                contents: [{ role: 'user', parts: [{ text: 'Reply with the single word: Pong' }] }],
                generationConfig: { maxOutputTokens: 10 },
            }),
            signal: AbortSignal.timeout(20_000),
        });

        if (!res.ok) {
            const body = await res.text();
            if (res.status === 429 || body.includes('insufficient_quota') || body.includes('credit balance is too low') || res.status === 404) {
                return { status: 'SKIPPED', latency: Date.now() - t0, model, error: `Quota Exceeded or Not Found: ${body.slice(0, 100)}` };
            }
            return { status: 'WARNING', latency: Date.now() - t0, model, error: `HTTP ${res.status}: ${body.slice(0, 300)}` };
        }

        const data = await res.json<any>();
        const text: string = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
        if (!text.toLowerCase().includes('pong')) {
            return { status: 'WARNING', latency: Date.now() - t0, model, error: `Unexpected response: ${text.slice(0, 100)}` };
        }
        return { status: 'OK', latency: Date.now() - t0, model };
    } catch (e: any) {
        return { status: 'WARNING', latency: Date.now() - t0, model, error: e.message };
    }
}

// ─── Main Export ──────────────────────────────────────────────────────────────

/**
 * Runs a connectivity ping against all AI Gateway providers.
 * Workers AI failure is critical (marks overall as failure).
 * Paid provider failures are warnings — the overall check stays success.
 */
export async function checkAIGatewayHealth(env: Env): Promise<HealthStepResult> {
    const start = Date.now();

    // 1. Verify gateway is configured
    if (!env.CLOUDFLARE_ACCOUNT_ID || !env.AI_GATEWAY_NAME || !env.AI_GATEWAY_TOKEN) {
        return {
            name: 'AI Gateway',
            status: 'failure',
            message: 'Missing required env vars: CLOUDFLARE_ACCOUNT_ID, AI_GATEWAY_NAME, or AI_GATEWAY_TOKEN',
            durationMs: Date.now() - start,
            details: {
                CLOUDFLARE_ACCOUNT_ID: !!env.CLOUDFLARE_ACCOUNT_ID,
                AI_GATEWAY_NAME: !!env.AI_GATEWAY_NAME,
                AI_GATEWAY_TOKEN: !!env.AI_GATEWAY_TOKEN,
            },
        };
    }

    const token = await resolveGatewayToken(env);
    if (!token) {
        return {
            name: 'AI Gateway',
            status: 'failure',
            message: 'AI_GATEWAY_TOKEN resolved to empty string',
            durationMs: Date.now() - start,
            details: {},
        };
    }

    // 2. Probe all providers in parallel
    const [workersAi, openai, anthropic, gemini] = await Promise.all([
        probeWorkersAI(env, token),
        probeOpenAI(env, token),
        probeAnthropic(env, token),
        probeGemini(env, token),
    ]);

    const providers: Record<string, ProviderResult> = { workersAi, openai, anthropic, gemini };

    // 3. Evaluate overall status:
    //    - Workers AI FAILURE → overall failure
    //    - Paid provider failures → warning only (system not degraded)
    const workersAiFailed = workersAi.status === 'FAILURE';
    const paidProviderWarnings = [openai, anthropic, gemini]
        .filter(p => p.status === 'WARNING' || p.status === 'FAILURE')
        .length;

    let overallStatus: 'success' | 'failure' | 'warning';
    let message: string;

    if (workersAiFailed) {
        overallStatus = 'failure';
        message = `Workers AI is unreachable via AI Gateway — gateway may be down. ${paidProviderWarnings > 0 ? `${paidProviderWarnings} paid provider(s) also degraded.` : ''}`;
    } else if (paidProviderWarnings > 0) {
        overallStatus = 'success'; // System is operational; paid providers are non-critical
        const degraded = Object.entries(providers)
            .filter(([k, v]) => k !== 'workersAi' && (v.status === 'WARNING' || v.status === 'FAILURE'))
            .map(([k]) => k);
        message = `AI Gateway operational (Workers AI OK). Paid provider warnings: ${degraded.join(', ')}`;
    } else {
        overallStatus = 'success';
        message = 'All AI Gateway providers are reachable';
    }

    return {
        name: 'AI Gateway',
        status: overallStatus as any,
        message,
        durationMs: Date.now() - start,
        details: providers,
    };
}
