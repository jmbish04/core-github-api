import { HealthStepResult } from '@/health/types';
import { getDb } from '@/db';
import { researchRecommendations } from '@/db/schemas/github/research';
import { count } from 'drizzle-orm';

/**
 * Validates the health of the Deep Research infrastructure.
 * This ensures D1 DB, AI Gateway, Email Sender, and GitHub tokens are active.
 */
export async function checkHealth(env: Env): Promise<HealthStepResult> {
    const start = Date.now();
    const subChecks: Record<string, any> = {};

    const runCheck = async (name: string, fn: () => Promise<any>) => {
        const checkStart = Date.now();
        try {
            const result = await fn();
            subChecks[name] = { status: "OK", latency: Date.now() - checkStart, ...result };
        } catch (e: any) {
            subChecks[name] = {
                status: "FAILURE",
                latency: Date.now() - checkStart,
                error: e instanceof Error ? e.message : String(e)
            };
        }
    };

    // --- 1. Database Check (Drizzle + D1) ---
    await runCheck("database", async () => {
        const db = getDb(env.DB);
        const [result] = await db.select({ value: count() }).from(researchRecommendations);
        return { message: "D1 Schema Accessible", rowCount: result?.value || 0 };
    });

    // --- 2. GitHub Token Check ---
    await runCheck("GITHUB_PERSONAL_ACCESS_TOKEN", async () => {
        if (!env.GITHUB_PERSONAL_ACCESS_TOKEN) {
            throw new Error("GITHUB_PERSONAL_ACCESS_TOKEN missing from environment");
        }
        return { message: "GITHUB_PERSONAL_ACCESS_TOKEN present" };
    });

    // --- 3. AI Gateway Check ---
    await runCheck("ai_binding", async () => {
        if (!env.AI) {
            throw new Error("AI Binding missing from environment");
        }
        return { message: "AI binding present" };
    });

    // --- 4. Email Config Check ---
    await runCheck("email_config", async () => {
        if (!env.SEND_EMAIL_NEWSLETTER) {
            throw new Error("Send Email Binding (SEND_EMAIL_NEWSLETTER) missing");
        }
        return { 
            message: "Cloudflare SEND_EMAIL_NEWSLETTER Binding present", 
            targetEmail: "ai@126colby.com"
        };
    });

    const allChecks = Object.values(subChecks);
    const hasFailure = allChecks.some((c: any) => c.status === "FAILURE");

    return {
        name: "Deep Research",
        status: hasFailure ? 'failure' : 'success',
        message: hasFailure ? "One or more deep research dependencies failed" : "All research dependencies healthy",
        durationMs: Date.now() - start,
        details: subChecks
    };
}
