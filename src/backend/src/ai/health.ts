/**
 * AI Domain Health & Diagnostic Suite
 *
 * Validates core Workers AI functionality via the NATIVE env.AI binding:
 * text generation, structured output, and embeddings.
 *
 * Gateway-level multi-provider probes are handled by `ai-gateway/health.ts`.
 * This check intentionally bypasses the gateway to isolate Workers AI binding health.
 *
 * All sub-checks run in PARALLEL to fit within the coordinator's 8s timeout.
 *
 * @module AI/Health
 */
import { cleanJsonOutput, sanitizeAndFormatResponse } from "./utils/sanitizer";
import { HealthStepResult } from "@/health/types";

interface SubCheck {
    status: 'OK' | 'FAILURE' | 'SKIPPED';
    latency?: number;
    error?: string;
    [key: string]: any;
}

/**
 * Runs a check safely and returns a SubCheck result.
 */
async function safeRun(name: string, fn: () => Promise<Record<string, any>>): Promise<[string, SubCheck]> {
    const checkStart = Date.now();
    try {
        const result = await fn();
        return [name, { status: 'OK', latency: Date.now() - checkStart, ...result }];
    } catch (e: any) {
        return [name, {
            status: 'FAILURE',
            latency: Date.now() - checkStart,
            error: e instanceof Error ? e.message : String(e),
            errorName: e?.name || 'Error',
        }];
    }
}

/**
 * Performs a focused health check of the AI subsystem using NATIVE env.AI binding.
 *
 * Validates:
 * 1. Sanitizer utilities (synchronous, fast).
 * 2. Text generation via env.AI.run() (Workers AI native, no gateway).
 * 3. Structured output via env.AI.run() (Workers AI native, no gateway).
 * 4. Embeddings generation via env.AI.run() (Workers AI native, no gateway).
 *
 * Gateway-specific multi-provider probes (Gemini, OpenAI, Anthropic) are handled
 * by the separate `checkAIGatewayHealth` check to avoid redundancy.
 */
export async function checkHealth(env: Env): Promise<HealthStepResult> {
    const start = Date.now();

    // --- 1. Sanitizer (Synchronous — always fast) ---
    let sanitizerCheck: [string, SubCheck];
    try {
        const dirtyJson = '```json\n{"status": "ok"}\n```';
        const cleanJson = cleanJsonOutput(dirtyJson);
        if (cleanJson !== '{"status": "ok"}') {
            throw new Error(`cleanJsonOutput failed. Got: ${cleanJson}`);
        }

        const markdown = "**Bold** and `code`";
        const html = sanitizeAndFormatResponse(markdown);
        if (!html.includes("<strong>Bold</strong>") || !html.includes("<code>code</code>")) {
            throw new Error(`sanitizeAndFormatResponse failed. Got: ${html}`);
        }
        sanitizerCheck = ['sanitizer', { status: 'OK', latency: 0 }];
    } catch (e: any) {
        sanitizerCheck = ['sanitizer', { status: 'FAILURE', error: e.message }];
    }

    // --- 2-4. Async checks in PARALLEL (Native env.AI binding — bypasses gateway) ---
    if (!env.AI) {
        return {
            name: 'AI Domain',
            status: 'failure',
            message: 'env.AI binding missing — Workers AI unavailable',
            durationMs: Date.now() - start,
            details: {
                sanitizer: sanitizerCheck[1],
                generateText: { status: 'SKIPPED', reason: 'env.AI binding missing' },
                generateStructured: { status: 'SKIPPED', reason: 'env.AI binding missing' },
                generateEmbedding: { status: 'SKIPPED', reason: 'env.AI binding missing' },
            },
        };
    }

    const TEXT_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
    const EMBEDDING_MODEL = '@cf/baai/bge-large-en-v1.5';

    const asyncChecks = await Promise.all([
        // Text generation — native env.AI.run() to isolate from gateway auth
        safeRun('generateText', async () => {
            const response = await env.AI.run(TEXT_MODEL as any, {
                messages: [
                    { role: 'system', content: 'Reply with exactly the word requested.' },
                    { role: 'user', content: 'Reply with exactly: Pong' },
                ],
                max_tokens: 10,
                stream: false,
            });
            const raw = (response as any)?.response;
            const text = typeof raw === 'string' ? raw : '';
            if (!text || text.trim().length === 0) {
                throw new Error("Empty response from env.AI.run()");
            }
            return { sample: text.substring(0, 50), model: TEXT_MODEL };
        }),

        // Structured output — native env.AI.run() with response_format
        safeRun('generateStructured', async () => {
            const response = await env.AI.run(TEXT_MODEL as any, {
                messages: [
                    { role: 'system', content: 'You output valid JSON only. No markdown.' },
                    { role: 'user', content: 'Generate JSON with message="hello" and number=42' },
                ],
                max_tokens: 100,
                stream: false,
            });
            const raw = (response as any)?.response;
            const text = typeof raw === 'string' ? raw : '';
            if (!text || text.trim().length === 0) {
                throw new Error("Empty response from env.AI.run()");
            }
            // Attempt to parse as JSON to validate structured capability
            const parsed = JSON.parse(cleanJsonOutput(text));
            return { response: parsed, model: TEXT_MODEL };
        }),

        // Embeddings — native env.AI.run()
        safeRun('generateEmbedding', async () => {
            const response = await env.AI.run(EMBEDDING_MODEL as any, { text: ["Health check embedding test"] });
            const vector = (response as any)?.data?.[0];
            if (!Array.isArray(vector) || vector.length === 0) {
                throw new Error("Invalid vector returned from env.AI.run()");
            }
            return { dimensions: vector.length, model: EMBEDDING_MODEL };
        }),
    ]);

    // --- Assemble results ---
    const subChecks: Record<string, SubCheck> = {};
    subChecks[sanitizerCheck[0]] = sanitizerCheck[1];
    for (const [name, result] of asyncChecks) {
        subChecks[name] = result;
    }

    // --- Determine Overall Status ---
    const failedChecks = Object.entries(subChecks)
        .filter(([, v]) => v.status === 'FAILURE')
        .map(([k]) => k);

    const overallStatus: 'success' | 'failure' = failedChecks.length > 0 ? 'failure' : 'success';
    const message = failedChecks.length > 0
        ? `Failed: ${failedChecks.join(', ')}`
        : 'All AI subsystems operational';

    return {
        name: 'AI Domain',
        status: overallStatus,
        message,
        durationMs: Date.now() - start,
        details: subChecks,
    };
}