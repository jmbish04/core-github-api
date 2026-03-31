/**
 * @file health/checks/webhook-staleness.ts
 *
 * Compares the latest GitHub API activity date for the configured owner
 * against the latest webhook_deliveries timestamp in DB_WEBHOOKS.
 *
 * Flags as stale if:
 *   - No webhooks have ever been received, OR
 *   - The most recent webhook is >24h older than the most recent GitHub event
 *
 * This surfaces the silent failure case where webhooks stop arriving
 * (misconfigured secret, webhook disabled, etc.) while GitHub activity continues.
 */

import { getWebhooksDb } from '@db';
import { webhookDeliveries } from '@db/schemas/github/webhooks';
import { desc } from 'drizzle-orm';
import { HealthStepResult } from '@/health/types';
import { DEFAULT_GITHUB_OWNER } from '@github-utils';
import { getGitHubPrivateKey, getGitHubAppId } from '@/utils/secrets';
import { App } from 'octokit';

/** How many hours behind the latest GitHub event a webhook is allowed to be. */
const STALE_THRESHOLD_HOURS = 24;

export async function checkWebhookStaleness(env: Env): Promise<HealthStepResult> {
    const start = Date.now();
    const details: Record<string, any> = {};

    try {
        // 1. Latest webhook received in D1
        const db = getWebhooksDb(env.DB_WEBHOOKS);
        const latest = await db
            .select({ created_at: webhookDeliveries.created_at })
            .from(webhookDeliveries)
            .orderBy(desc(webhookDeliveries.created_at))
            .limit(1)
            .get();

        details.latestWebhook = latest?.created_at ?? null;

        // 2. Latest GitHub activity for the owner via GitHub API
        const owner = DEFAULT_GITHUB_OWNER;
        const appId = await getGitHubAppId(env);
        const privateKey = await getGitHubPrivateKey(env);

        let latestGithubEvent: string | null = null;
        try {
            const app = new App({ appId, privateKey });
            const installations = await app.octokit.request('GET /app/installations', { per_page: 1 });
            const installId = installations.data[0]?.id;

            if (installId) {
                const octokit = await app.getInstallationOctokit(installId);
                const events = await octokit.request('GET /users/{username}/events/public', {
                    username: owner,
                    per_page: 1,
                });
                latestGithubEvent = events.data[0]?.created_at ?? null;
            }
        } catch (e: any) {
            details.githubApiError = e.message;
        }

        details.latestGithubEvent = latestGithubEvent;

        // 3. Staleness evaluation
        if (!latest) {
            return {
                name: 'Webhook Staleness',
                status: 'failure',
                message: 'No webhooks ever received — webhook_deliveries is empty. Check GitHub App webhook config.',
                durationMs: Date.now() - start,
                details,
            };
        }

        if (latestGithubEvent && latest.created_at) {
            const ghDate = new Date(latestGithubEvent).getTime();
            const whDate = new Date(latest.created_at).getTime();
            const diffHours = (ghDate - whDate) / (1000 * 3600);
            details.lagHours = Math.round(diffHours);

            if (diffHours > STALE_THRESHOLD_HOURS) {
                return {
                    name: 'Webhook Staleness',
                    status: 'failure',
                    message: `Webhooks are stale — latest delivery is ${details.lagHours}h behind latest GitHub event.`,
                    durationMs: Date.now() - start,
                    details,
                };
            }
        }

        // 4. Also flag if last webhook is >30 days old regardless of GitHub activity
        const lastWebhookAge = (Date.now() - new Date(latest.created_at!).getTime()) / (1000 * 3600 * 24);
        details.lastWebhookAgeDays = Math.round(lastWebhookAge);
        if (lastWebhookAge > 30) {
            return {
                name: 'Webhook Staleness',
                status: 'failure',
                message: `No webhooks received in ${details.lastWebhookAgeDays} days.`,
                durationMs: Date.now() - start,
                details,
            };
        }

        return {
            name: 'Webhook Staleness',
            status: 'success',
            message: `Webhooks current (lag: ${details.lagHours ?? 'N/A'}h, last: ${latest.created_at})`,
            durationMs: Date.now() - start,
            details,
        };

    } catch (e: any) {
        return {
            name: 'Webhook Staleness',
            status: 'failure',
            message: e.message,
            durationMs: Date.now() - start,
            details: { ...details, errorStack: e.stack },
        };
    }
}
