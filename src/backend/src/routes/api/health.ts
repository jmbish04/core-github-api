import { getDb } from '@db';
import { healthRuns } from '@db/schemas/logs/health';
import { HealthStepResult } from '@/health/health-check';
import { v4 as uuidv4 } from 'uuid';
import { getCloudflareApiToken, getCloudflareAccountId } from '@utils/secrets';
import { verifyCloudflareTokens } from '@utils/cloudflare/tokens';

export async function checkAPIHealth(env: Env): Promise<HealthStepResult> {
    const start = Date.now();
    const subChecks: Record<string, any> = {};

    try {
        // --- 1. D1 Connectivity Check ---
        const dbStart = Date.now();
        try {
            const db = getDb(env.DB);
            await db.select().from(healthRuns).limit(1);
            subChecks.database = { status: "OK", latency: Date.now() - dbStart };
        } catch (dbErr: any) {
            subChecks.database = { status: "FAIL", error: dbErr.message, latency: Date.now() - dbStart };
        }

        // --- 2. Cloudflare API Token Verification ---
        const cfTokenStart = Date.now();
        const tokenName = "CLOUDFLARE_API_TOKEN";
        try {
            const cfToken = await getCloudflareApiToken(env);
            const accountId = await getCloudflareAccountId(env);

            if (!cfToken) {
                subChecks.cloudflareToken = { status: "SKIPPED", reason: "Missing CLOUDFLARE_API_TOKEN" };
            } else {
                const checkResult = await verifyCloudflareTokens(cfToken, accountId || "", tokenName);

                if (checkResult.passed) {
                    subChecks.cloudflareToken = { 
                        token_name: checkResult.token_name || tokenName,
                        status: "OK", 
                        latency: Date.now() - cfTokenStart, 
                        message: checkResult.detectedType === "account" ? "Account Token Active" : "User Token Active",
                        checkResult
                    };
                } else {
                    const errors: any[] = [];
                    if (!accountId) {
                        errors.push({ type: "Account", details: "Missing CLOUDFLARE_ACCOUNT_ID for account token check" });
                    } else if (checkResult.details?.account?.errors) {
                        errors.push({ type: "Account", details: checkResult.details.account.errors });
                    }
                    
                    if (checkResult.details?.user?.errors) {
                        errors.push({ type: "User", details: checkResult.details.user.errors });
                    }
                    
                    throw new Error(`Cloudflare Token verification failed: ${errors.length > 0 ? JSON.stringify(errors) : checkResult.reason}`);
                }
            }
        } catch (cfErr: any) {
             subChecks.cloudflareToken = { 
                token_name: tokenName,
                status: "FAIL", 
                error: cfErr.message, 
                latency: Date.now() - cfTokenStart 
            };
        }

        const isOverallSuccess = Object.values(subChecks).every(s => s.status !== "FAIL");

        return {
            name: 'API & Database Domain',
            status: isOverallSuccess ? 'success' : 'failure',
            message: isOverallSuccess ? 'Accessible' : 'Errors detected',
            durationMs: Date.now() - start,
            details: subChecks
        };
    } catch (e: any) {
        return {
            name: 'API & Database Domain',
            status: 'failure',
            message: e.message,
            durationMs: Date.now() - start,
            details: { ...subChecks, unexpectedError: e.message }
        };
    }
}

import { Hono } from 'hono';
const app = new Hono<{ Bindings: Env }>();

app.get('/', async (c) => {
    const result = await checkAPIHealth(c.env);
    return c.json(result, result.status === 'success' ? 200 : 503);
});

export default app;
