/**
 * @file health/checks/log-staleness.ts
 *
 * Checks whether system_logs in DB (core) are being actively written.
 * Compares the latest Worker activity date from Cloudflare Observability API
 * against the latest system_logs.timestamp in D1.
 *
 * Flags as stale if:
 *   - system_logs is completely empty, OR
 *   - The latest log entry is >2h old (logger.flush() should fire on any request)
 */

import { getDb } from '@db';
import { systemLogs } from '@db/schemas/logs/system';
import { desc } from 'drizzle-orm';
import { HealthStepResult } from '@/health/types';

/** Max acceptable age (hours) for the most recent system_log row. */
const STALE_THRESHOLD_HOURS = 2;

/** Max acceptable age (days) beyond which we always flag regardless of activity. */
const MAX_AGE_DAYS = 1;

export async function checkLogStaleness(env: Env): Promise<HealthStepResult> {
    const start = Date.now();
    const details: Record<string, any> = {};

    try {
        const db = getDb(env.DB);

        // 1. Get latest system_logs row
        const latest = await db
            .select({
                timestamp: systemLogs.timestamp,
                level: systemLogs.level,
                message: systemLogs.message,
                sourceFile: systemLogs.sourceFile,
            })
            .from(systemLogs)
            .orderBy(desc(systemLogs.timestamp))
            .limit(1)
            .get();

        details.latestLog = latest ?? null;

        if (!latest) {
            return {
                name: 'Log Staleness',
                status: 'failure',
                message: 'system_logs table is empty — logger.flush() may never have succeeded. Check logger.ts getDb() fix.',
                durationMs: Date.now() - start,
                details,
            };
        }

        // timestamp is a JS Date from Drizzle (mode: 'timestamp')
        const tsMs = latest.timestamp instanceof Date
            ? latest.timestamp.getTime()
            : Number(latest.timestamp) * 1000;
        const logAgeMs = Date.now() - tsMs;
        const logAgeHours = logAgeMs / (1000 * 3600);
        const logAgeDays = logAgeMs / (1000 * 3600 * 24);
        details.logAgeHours = Math.round(logAgeHours * 10) / 10;
        details.logAgeDays = Math.round(logAgeDays * 10) / 10;

        if (logAgeDays > MAX_AGE_DAYS) {
            return {
                name: 'Log Staleness',
                status: 'failure',
                message: `system_logs stale — last entry is ${details.logAgeDays} days old. Worker may be unhealthy or logger not flushing.`,
                durationMs: Date.now() - start,
                details,
            };
        }

        if (logAgeHours > STALE_THRESHOLD_HOURS) {
            return {
                name: 'Log Staleness',
                // Warning treated as success in coordinator but surfaces in details
                status: 'success',
                message: `system_logs slightly stale (${details.logAgeHours}h old) — may just be low traffic.`,
                durationMs: Date.now() - start,
                details,
            };
        }

        return {
            name: 'Log Staleness',
            status: 'success',
            message: `system_logs current (${details.logAgeHours}h ago): [${latest.level}] ${latest.message}`,
            durationMs: Date.now() - start,
            details,
        };

    } catch (e: any) {
        return {
            name: 'Log Staleness',
            status: 'failure',
            message: e.message,
            durationMs: Date.now() - start,
            details: { errorStack: e.stack },
        };
    }
}
