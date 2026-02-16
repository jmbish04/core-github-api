import { getWebhooksDb } from '@/db';
import { webhookDeliveries } from '@/db/schemas/github/webhooks';
import { desc, gt, and, like } from 'drizzle-orm';
import { createGitHubIssue, createGitHubComment, updateGitHubIssue } from '../ai/mcp/tools/github/github';
import { HealthStepResult } from '../health/health-check';

export async function checkGitHubHealth(env: Env): Promise<HealthStepResult> {
    const start = Date.now();
    
    // Sub-function results container
    const details: any = {
        api: { status: 'pending', steps: [] },
        webhooks: { status: 'pending', gaps: false, verification: 'pending' }
    };

    try {
        // 1. Check for gaps in webhooks
        const gapCheck = await checkWebhookGaps(env);
        details.webhooks.gaps = gapCheck.hasGaps;
        details.webhooks.lastEvent = gapCheck.lastEvent;

        // 2. Run API Lifecycle Test
        const apiResult = await runApiChecks(env);
        details.api = apiResult;

        // 3. Verify Webhooks
        if (apiResult.status === 'success' && apiResult.issueNumber) {
            await new Promise(r => setTimeout(r, 5000)); // Wait for propagation
            const webhookVerification = await verifyWebhooks(env, apiResult.issueNumber);
            details.webhooks.verification = webhookVerification;
        }

        // Determine success
        const isHealthy = details.api.status === 'success' &&
            details.webhooks.verification !== 'failed' &&
            !details.webhooks.gaps;

        return {
            name: 'Core GitHub Integration',
            status: isHealthy ? 'success' : 'failure',
            message: isHealthy ? 'Operational' : 'Issues detected',
            details: details,
            durationMs: Date.now() - start
        };

    } catch (e: any) {
        return {
            name: 'Core GitHub Integration',
            status: 'failure',
            message: e.message,
            details: { ...details, stack: e.stack },
            durationMs: Date.now() - start
        };
    }
}

async function checkWebhookGaps(env: Env) {
    const db = getWebhooksDb(env.DB_WEBHOOKS);
    const lastEvents = await db.select().from(webhookDeliveries).orderBy(desc(webhookDeliveries.created_at)).limit(1);
    if (!lastEvents.length) return { hasGaps: true, lastEvent: 'never' };

    const lastDate = new Date(lastEvents[0].created_at!);
    const now = new Date();
    const diffDays = (now.getTime() - lastDate.getTime()) / (1000 * 3600 * 24);

    return { hasGaps: diffDays > 15, lastEvent: lastEvents[0].created_at };
}

async function runApiChecks(env: Env) {
    const owner = 'jmbish04';
    const repo = 'testing-oktokit-commands';
    const steps = [];
    let issueNumber: number | null = null;

    try {
        // A. Create Issue
        const title = `Health Check ${new Date().toISOString()}`;
        const issue = await createGitHubIssue(env, owner, repo, title, 'Automated health check running.');
        if (!issue) throw new Error("Failed to create issue");
        steps.push({ step: 'create_issue', status: 'success', id: issue.number });
        issueNumber = issue.number;

        // B. Comment on Issue
        const comment = await createGitHubComment(env, owner, repo, issueNumber, 'Health check comment test.');
        if (!comment) throw new Error("Failed to comment");
        steps.push({ step: 'create_comment', status: 'success', id: comment.id });

        // C. Close Issue
        const closed = await updateGitHubIssue(env, owner, repo, issueNumber, { state: 'closed' });
        if (!closed) throw new Error("Failed to close issue");
        steps.push({ step: 'close_issue', status: 'success' });

        return { status: 'success', steps, issueNumber };

    } catch (e: any) {
        steps.push({ step: 'error', message: e.message });
        return { status: 'failed', steps, issueNumber };
    }
}

async function verifyWebhooks(env: Env, issueNumber: number) {
    if (!issueNumber) return 'skipped';

    const db = getWebhooksDb(env.DB_WEBHOOKS);
    const oneMinuteAgo = new Date(Date.now() - 60000).toISOString();

    const logs = await db.select().from(webhookDeliveries)
        .where(and(
            gt(webhookDeliveries.created_at, oneMinuteAgo),
            like(webhookDeliveries.payload, `%${issueNumber}%`)
        ));

    if (logs.length >= 1) return 'success';
    return 'failed';
}
