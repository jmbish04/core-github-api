/**
 * @file backend/src/alerts/index.ts
 * @description Global alert emission service — importable as `@alerts`
 *
 * Usage from any backend module:
 *
 *   import { createAlert } from '@alerts';
 *
 *   await createAlert(env, {
 *     type: 'health',
 *     severity: 'error',
 *     title: 'DB Connectivity Failed',
 *     description: 'The D1 binding returned no rows during health check.',
 *     link_url: '/health',
 *     process_origin: 'HealthCoordinator',
 *   });
 *
 * `createAlert` is a fire-and-forget safe: it catches all errors internally
 * so it never throws and never blocks the calling operation.
 */

import { getDb } from '@db';
import { alerts, AlertType, AlertSeverity } from '@db/schemas/app/alerts';
import { AlertsConfigSchema, DEFAULT_ALERTS_CONFIG, ALERTS_CONFIG_KEY } from './config';
import { v4 as uuidv4 } from 'uuid';

export interface CreateAlertPayload {
  type: AlertType;
  severity: AlertSeverity;
  title: string;
  description: string;
  link_url?: string;
  process_origin?: string;
  repo_origin?: string;
  worker_origin?: string;
  is_action_needed?: boolean;
  action_required?: string;
}

/**
 * Emit a new alert to D1. Checks ALERTS_CONFIG in KV before inserting.
 * Never throws — safe to call without try/catch.
 */
export async function createAlert(env: Env, payload: CreateAlertPayload): Promise<string | null> {
  try {
    // 1. Read config from KV (fall back to defaults if missing)
    let config = DEFAULT_ALERTS_CONFIG;
    try {
      const raw = await env.KV_CONFIGS.get(ALERTS_CONFIG_KEY, 'json');
      if (raw) {
        const parsed = AlertsConfigSchema.safeParse(raw);
        if (parsed.success) config = parsed.data;
      }
    } catch {
      // KV unavailable — proceed with defaults
    }

    // 2. Global kill switch
    if (!config.enabled) return null;

    // 3. Per-type kill switch
    if (!config.types[payload.type]) return null;

    // 4. Insert
    const db = getDb(env.DB);
    const id = uuidv4();
    await db.insert(alerts).values({
      id,
      type: payload.type,
      severity: payload.severity,
      title: payload.title,
      description: payload.description,
      link_url: payload.link_url ?? null,
      process_origin: payload.process_origin ?? 'system',
      repo_origin: payload.repo_origin ?? null,
      worker_origin: payload.worker_origin ?? null,
      is_action_needed: payload.is_action_needed ?? false,
      action_required: payload.action_required ?? null,
      created_at: new Date().toISOString(),
    });

    return id;
  } catch (e) {
    console.error('[createAlert] Failed to emit alert:', e);
    return null;
  }
}

export { AlertsConfigSchema, DEFAULT_ALERTS_CONFIG, ALERTS_CONFIG_KEY } from './config';
export type { AlertsConfig } from './config';
export type { AlertType, AlertSeverity } from '@db/schemas/app/alerts';
export { ALERT_TYPES, ALERT_SEVERITIES } from '@db/schemas/app/alerts';
