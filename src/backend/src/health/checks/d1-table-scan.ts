/**
 * @file health/checks/d1-table-scan.ts
 *
 * Scans ALL tables across both D1 instances (DB + DB_WEBHOOKS) and flags:
 *   - EMPTY: tables with zero rows (might be misconfigured ingestion)
 *   - STALE: tables whose most recent timestamped row is >30 days old
 *   - HEALTHY: tables with recent data
 *   - SYSTEM: internal D1/sqlite system tables (skipped)
 *
 * Tables known to be intentionally empty are whitelisted and not flagged.
 */

import { getDb, getWebhooksDb } from '@db';
import { sql } from 'drizzle-orm';
import { HealthStepResult } from '@/health/types';

/** Tables that are expected to be empty — do not flag these. */
const EXPECTED_EMPTY_TABLES = new Set([
    '_cf_KV',
    'd1_migrations',
    'sqlite_stat1',
    // Add table names here if they are intentionally write-once or seeded only
]);

/** Age threshold (days) after which a table is considered stale. */
const STALE_THRESHOLD_DAYS = 30;

/**
 * Common timestamp column names to try when checking staleness.
 * The check will try each one until a valid column is found.
 */
const TIMESTAMP_COLUMNS = ['created_at', 'timestamp', 'updated_at', 'date', 'occurred_at'];

interface TableScanResult {
    table: string;
    rowCount: number;
    latestTimestamp: string | null;
    ageDays: number | null;
    status: 'healthy' | 'empty' | 'stale' | 'no_timestamp';
}

async function scanInstance(
    drizzle: ReturnType<typeof getDb> | ReturnType<typeof getWebhooksDb>,
    bindingName: string
): Promise<{ results: TableScanResult[]; empty: number; stale: number; healthy: number }> {
    // Get all user tables
    const tableRows = await drizzle.all<{ name: string }>(
        sql`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name`
    );

    const results: TableScanResult[] = [];
    let empty = 0, stale = 0, healthy = 0;

    for (const { name: table } of tableRows) {
        if (EXPECTED_EMPTY_TABLES.has(table)) continue;

        // Row count
        const countRow = await drizzle.get<{ c: number }>(sql.raw(`SELECT count(*) as c FROM "${table}"`));
        const rowCount = countRow?.c ?? 0;

        if (rowCount === 0) {
            empty++;
            results.push({ table, rowCount, latestTimestamp: null, ageDays: null, status: 'empty' });
            continue;
        }

        // Try to find a timestamp column
        let latestTimestamp: string | null = null;
        for (const col of TIMESTAMP_COLUMNS) {
            try {
                const row = await drizzle.get<{ ts: string }>(
                    sql.raw(`SELECT "${col}" as ts FROM "${table}" ORDER BY "${col}" DESC LIMIT 1`)
                );
                if (row?.ts) {
                    latestTimestamp = row.ts;
                    break;
                }
            } catch(error) {
                // Column doesn't exist on this table — try next
                console.error(`[D1 Table Scan] Column ${col} does not exist on table ${table}:`, error);
            }
        }

        if (!latestTimestamp) {
            healthy++;
            results.push({ table, rowCount, latestTimestamp: null, ageDays: null, status: 'no_timestamp' });
            continue;
        }

        const ageDays = (Date.now() - new Date(latestTimestamp).getTime()) / (1000 * 3600 * 24);
        const status: TableScanResult['status'] = ageDays > STALE_THRESHOLD_DAYS ? 'stale' : 'healthy';

        if (status === 'stale') stale++;
        else healthy++;

        results.push({
            table,
            rowCount,
            latestTimestamp,
            ageDays: Math.round(ageDays),
            status,
        });
    }

    return { results, empty, stale, healthy };
}

export async function checkD1TableScan(env: Env): Promise<HealthStepResult> {
    const start = Date.now();

    try {
        const [coreResults, webhooksResults] = await Promise.all([
            scanInstance(getDb(env.DB), 'DB'),
            scanInstance(getWebhooksDb(env.DB_WEBHOOKS), 'DB_WEBHOOKS'),
        ]);

        const totalEmpty = coreResults.empty + webhooksResults.empty;
        const totalStale = coreResults.stale + webhooksResults.stale;
        const totalTables = (coreResults.results.length) + (webhooksResults.results.length);
        const hasIssues = totalEmpty > 0 || totalStale > 0;

        const details = {
            summary: {
                totalTables,
                empty: totalEmpty,
                stale: totalStale,
                healthy: coreResults.healthy + webhooksResults.healthy,
            },
            DB: {
                tableCount: coreResults.results.length,
                empty: coreResults.empty,
                stale: coreResults.stale,
                emptyTables: coreResults.results.filter(r => r.status === 'empty').map(r => r.table),
                staleTables: coreResults.results.filter(r => r.status === 'stale').map(r => ({
                    table: r.table, ageDays: r.ageDays, rowCount: r.rowCount
                })),
            },
            DB_WEBHOOKS: {
                tableCount: webhooksResults.results.length,
                empty: webhooksResults.empty,
                stale: webhooksResults.stale,
                emptyTables: webhooksResults.results.filter(r => r.status === 'empty').map(r => r.table),
                staleTables: webhooksResults.results.filter(r => r.status === 'stale').map(r => ({
                    table: r.table, ageDays: r.ageDays, rowCount: r.rowCount
                })),
            },
        };

        return {
            name: 'D1 Table Scan',
            status: totalStale > 0 ? 'failure' : 'success',
            message: hasIssues
                ? `D1 scan: ${totalEmpty} empty tables, ${totalStale} stale tables (>${STALE_THRESHOLD_DAYS}d) across ${totalTables} tables`
                : `D1 scan: All ${totalTables} tables healthy`,
            durationMs: Date.now() - start,
            details,
        };

    } catch (e: any) {
        return {
            name: 'D1 Table Scan',
            status: 'failure',
            message: e.message,
            durationMs: Date.now() - start,
            details: { errorStack: e.stack },
        };
    }
}
