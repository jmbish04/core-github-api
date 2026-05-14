/**
 * AI Gateway Health Check
 *
 * Tests all AI providers through the unified AIProvider interface.
 * Each probe delegates to `ai.generateText()` with provider overrides,
 * ensuring requests flow through the standardized AI Gateway routing.
 *
 * Severity contract:
 *  - Workers AI  → CRITICAL: failure marks the overall check as `failure`
 *  - OpenAI      → WARNING:  failure marks the provider as `warning` only
 *  - Anthropic   → WARNING:  failure marks the provider as `warning` only
 *  - Gemini      → WARNING:  failure marks the provider as `warning` only
 *
 * @module AI/GatewayHealth
 */
import { AIProvider } from '@/ai/providers';
import { HealthStepResult } from '@/health/types';

interface ProviderResult {
    status: 'OK' | 'WARNING' | 'FAILURE' | 'SKIPPED';
    latency?: number;
    model?: string;
    error?: string;
    critical?: boolean;
}

const HEALTH_PROMPT = 'Reply with the single word: Pong';
const HEALTH_SYSTEM = 'You are a health check bot. Reply with exactly the word requested.';

// ─── Individual Provider Probes ───────────────────────────────────────────────

async function probeWorkersAI(ai: AIProvider): Promise<ProviderResult> {
    const t0 = Date.now();
    const model = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
    try {
        const response = await ai.generateText(HEALTH_PROMPT, HEALTH_SYSTEM, {
            provider: 'worker-ai',
            model,
        });
        if (!response.toLowerCase().includes('pong')) {
            return { status: 'WARNING', latency: Date.now() - t0, model, error: `Unexpected response: ${response.slice(0, 100)}`, critical: true };
        }
        return { status: 'OK', latency: Date.now() - t0, model };
    } catch (e: any) {
        return { status: 'FAILURE', latency: Date.now() - t0, model, error: e.message, critical: true };
    }
}

async function probeOpenAI(ai: AIProvider): Promise<ProviderResult> {
    const t0 = Date.now();
    const model = 'gpt-4o-mini';
    try {
        const response = await ai.generateText(HEALTH_PROMPT, HEALTH_SYSTEM, {
            provider: 'openai',
            model,
        });
        if (!response.toLowerCase().includes('pong')) {
            return { status: 'WARNING', latency: Date.now() - t0, model, error: `Unexpected response: ${response.slice(0, 100)}` };
        }
        return { status: 'OK', latency: Date.now() - t0, model };
    } catch (e: any) {
        if (e.message?.includes('insufficient_quota') || e.message?.includes('credit balance') || e.message?.includes('429')) {
            return { status: 'SKIPPED', latency: Date.now() - t0, model, error: `Quota: ${e.message}` };
        }
        return { status: 'WARNING', latency: Date.now() - t0, model, error: e.message };
    }
}

async function probeAnthropic(ai: AIProvider): Promise<ProviderResult> {
    const t0 = Date.now();
    const model = 'claude-3-5-haiku-latest';
    try {
        const response = await ai.generateText(HEALTH_PROMPT, HEALTH_SYSTEM, {
            provider: 'anthropic',
            model,
        });
        if (!response.toLowerCase().includes('pong')) {
            return { status: 'WARNING', latency: Date.now() - t0, model, error: `Unexpected response: ${response.slice(0, 100)}` };
        }
        return { status: 'OK', latency: Date.now() - t0, model };
    } catch (e: any) {
        if (e.message?.includes('insufficient_quota') || e.message?.includes('credit balance') || e.message?.includes('429')) {
            return { status: 'SKIPPED', latency: Date.now() - t0, model, error: `Quota: ${e.message}` };
        }
        return { status: 'WARNING', latency: Date.now() - t0, model, error: e.message };
    }
}

async function probeGemini(ai: AIProvider): Promise<ProviderResult> {
    const t0 = Date.now();
    const model = 'gemini-2.5-flash';
    try {
        const response = await ai.generateText(HEALTH_PROMPT, HEALTH_SYSTEM, {
            provider: 'gemini',
            model,
        });
        if (!response.toLowerCase().includes('pong')) {
            return { status: 'WARNING', latency: Date.now() - t0, model, error: `Unexpected response: ${response.slice(0, 100)}` };
        }
        return { status: 'OK', latency: Date.now() - t0, model };
    } catch (e: any) {
        if (e.message?.includes('insufficient_quota') || e.message?.includes('credit balance') || e.message?.includes('429') || e.message?.includes('404')) {
            return { status: 'SKIPPED', latency: Date.now() - t0, model, error: `Quota/Not Found: ${e.message}` };
        }
        return { status: 'WARNING', latency: Date.now() - t0, model, error: e.message };
    }
}

// ─── Per-probe timeout helper ─────────────────────────────────────────────────

/**
 * Races a probe against a hard timeout.
 * Ensures we always return a typed ProviderResult even if the gateway hangs,
 * so the coordinator never sees a raw exception and replaces `details` with
 * the generic { errorName, timeout, category } shape.
 *
 * Budget: coordinator gives ai_gateway 8 s.  We leave 1.5 s for overhead,
 * so each probe gets 6.5 s.
 */
const PROBE_TIMEOUT_MS = 6_500;

async function withProbeTimeout(
    probeFn: () => Promise<ProviderResult>,
    model: string,
): Promise<ProviderResult> {
    const t0 = Date.now();
    return Promise.race([
        probeFn(),
        new Promise<ProviderResult>((resolve) =>
            setTimeout(
                () => resolve({
                    status: 'FAILURE',
                    latency: Date.now() - t0,
                    model,
                    error: `Probe timed out after ${PROBE_TIMEOUT_MS}ms`,
                }),
                PROBE_TIMEOUT_MS,
            )
        ),
    ]);
}

// ─── Main Export ──────────────────────────────────────────────────────────────

/**
 * Runs a connectivity ping against all AI providers through AIProvider.
 * Workers AI failure is critical (marks overall as failure).
 * Paid provider failures are warnings — the overall check stays success.
 *
 * All probes run in parallel, each capped at PROBE_TIMEOUT_MS so the
 * coordinator's outer 8 s wall-clock cannot fire before we return a
 * structured ProviderResult for every provider.
 */
export async function checkAIGatewayHealth(env: Env): Promise<HealthStepResult> {
    const start = Date.now();
    const ai = new AIProvider(env);

    // Probe all providers in parallel — each is individually time-boxed
    const [workersAi, openai, anthropic, gemini] = await Promise.all([
        withProbeTimeout(() => probeWorkersAI(ai), '@cf/meta/llama-3.3-70b-instruct-fp8-fast'),
        withProbeTimeout(() => probeOpenAI(ai),    'gpt-4o-mini'),
        withProbeTimeout(() => probeAnthropic(ai), 'claude-3-5-haiku-latest'),
        withProbeTimeout(() => probeGemini(ai),    'gemini-2.5-flash'),
    ]);

    const providers: Record<string, ProviderResult> = { workersAi, openai, anthropic, gemini };

    // Evaluate overall status:
    //   - Workers AI FAILURE → overall failure
    //   - Paid provider failures → warning only (system not degraded)
    const workersAiFailed = workersAi.status === 'FAILURE';
    const paidProviderWarnings = [openai, anthropic, gemini]
        .filter(p => p.status === 'WARNING' || p.status === 'FAILURE')
        .length;

    let overallStatus: 'success' | 'failure' | 'warning';
    let message: string;

    if (workersAiFailed) {
        overallStatus = 'failure';
        message = `Workers AI unreachable via AIProvider — check AI binding and gateway config. ${paidProviderWarnings > 0 ? `${paidProviderWarnings} paid provider(s) also degraded.` : ''}`;
    } else if (paidProviderWarnings > 0) {
        overallStatus = 'success'; // System is operational; paid providers are non-critical
        const degraded = Object.entries(providers)
            .filter(([k, v]) => k !== 'workersAi' && (v.status === 'WARNING' || v.status === 'FAILURE'))
            .map(([k]) => k);
        message = `AI Gateway operational (Workers AI OK). Paid provider warnings: ${degraded.join(', ')}`;
    } else {
        overallStatus = 'success';
        message = 'All AI providers reachable via AIProvider';
    }

    return {
        name: 'AI Gateway',
        status: overallStatus as any,
        message,
        durationMs: Date.now() - start,
        details: providers,
    };
}
