/**
 * @file backend/src/routes/api/alerts.ts
 * @description REST API for the Alerts module.
 *
 * Mounted at /api/alerts (via sharedApi.route('/alerts', alertsApi))
 *
 * Endpoints:
 *   GET  /              – List active (non-dismissed) alerts, grouped by type
 *   GET  /count         – { unread: number } — for nav badge polling
 *   POST /              – Create alert (internal/test)
 *   PATCH /:id/dismiss  – Dismiss single alert
 *   PATCH /dismiss/type/:type – Dismiss all alerts of a type
 *   PATCH /dismiss/all  – Dismiss all active alerts
 *   GET  /config        – Read ALERTS_CONFIG from KV
 *   PATCH /config       – Write ALERTS_CONFIG to KV
 *   GET  /history       – List dismissed alerts (history)
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { getDb } from '@db';
import { alerts, ALERT_TYPES, ALERT_SEVERITIES, AlertType, CreateAlertSchema } from '@db/schemas/app/alerts';
import { AlertsConfigSchema, ALERTS_CONFIG_KEY, DEFAULT_ALERTS_CONFIG } from '@alerts/config';
import { createAlert } from '@alerts';
import { eq, isNull, isNotNull, and, desc } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';

const alertsApi = new Hono<{ Bindings: Env }>();

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function getAlertsConfig(env: Env) {
  try {
    const raw = await env.KV_CONFIGS.get(ALERTS_CONFIG_KEY, 'json');
    if (raw) {
      const parsed = AlertsConfigSchema.safeParse(raw);
      if (parsed.success) return parsed.data;
    }
  } catch { /* fall through */ }
  return DEFAULT_ALERTS_CONFIG;
}

// ─── GET / — Active alerts grouped by type ────────────────────────────────────

alertsApi.get('/', async (c) => {
  const db = getDb(c.env.DB);
  const config = await getAlertsConfig(c.env);

  const rows = await db
    .select()
    .from(alerts)
    .where(isNull(alerts.dismissed_at))
    .orderBy(desc(alerts.created_at))
    .limit(200);

  // Filter by enabled types and group
  const grouped: Record<string, typeof rows> = {};
  for (const row of rows) {
    if (!config.types[row.type as AlertType]) continue;
    if (!grouped[row.type]) grouped[row.type] = [];
    grouped[row.type].push(row);
  }

  const total = Object.values(grouped).reduce((n, arr) => n + arr.length, 0);

  return c.json({ success: true, grouped, total, config });
});

// ─── GET /count — Badge unread count ─────────────────────────────────────────

alertsApi.get('/count', async (c) => {
  const db = getDb(c.env.DB);
  const config = await getAlertsConfig(c.env);

  if (!config.enabled) return c.json({ unread: 0 });

  const rows = await db
    .select({ type: alerts.type })
    .from(alerts)
    .where(isNull(alerts.dismissed_at));

  const enabledTypes = new Set(
    ALERT_TYPES.filter((t) => config.types[t])
  );
  const unread = rows.filter((r) => enabledTypes.has(r.type as AlertType)).length;

  return c.json({ unread });
});

// ─── GET /history — Dismissed alerts ─────────────────────────────────────────

alertsApi.get('/history', async (c) => {
  const db = getDb(c.env.DB);
  const limit = Math.min(Number(c.req.query('limit') || 50), 200);

  const rows = await db
    .select()
    .from(alerts)
    .where(isNotNull(alerts.dismissed_at))
    .orderBy(desc(alerts.created_at))
    .limit(limit);

  return c.json({ success: true, alerts: rows, count: rows.length });
});

// ─── POST / — Create alert (internal use / test endpoint) ────────────────────
// CreateAlertSchema is derived from the Drizzle `alerts` table via drizzle-zod.
// See: backend/src/db/schemas/app/alerts.ts

alertsApi.post('/', zValidator('json', CreateAlertSchema), async (c) => {
  const body = c.req.valid('json');
  // drizzle-zod exposes nullable DB columns as `string | null | undefined`;
  // createAlert() expects `string | undefined` — strip nulls at the callsite.
  const id = await createAlert(c.env, {
    ...body,
    link_url: body.link_url ?? undefined,
    repo_origin: body.repo_origin ?? undefined,
    action_required: body.action_required ?? undefined,
  });
  if (!id) {
    return c.json({ success: false, message: 'Alert was gated by config (disabled type or master toggle off)' }, 200);
  }
  return c.json({ success: true, id }, 201);
});


// ─── PATCH /:id/dismiss — Dismiss single alert ────────────────────────────────

alertsApi.patch('/:id/dismiss', async (c) => {
  const id = c.req.param('id');
  const db = getDb(c.env.DB);

  await db
    .update(alerts)
    .set({ dismissed_at: new Date().toISOString(), dismissed_by: 'user' })
    .where(and(eq(alerts.id, id), isNull(alerts.dismissed_at)));

  return c.json({ success: true, id });
});

// ─── PATCH /dismiss/type/:type — Dismiss all alerts of a type ────────────────

alertsApi.patch('/dismiss/type/:type', async (c) => {
  const type = c.req.param('type') as AlertType;
  if (!ALERT_TYPES.includes(type)) {
    return c.json({ error: `Invalid alert type: ${type}` }, 400);
  }

  const db = getDb(c.env.DB);
  const now = new Date().toISOString();

  await db
    .update(alerts)
    .set({ dismissed_at: now, dismissed_by: 'user' })
    .where(and(eq(alerts.type, type), isNull(alerts.dismissed_at)));

  return c.json({ success: true, type });
});

// ─── PATCH /dismiss/all — Dismiss all active alerts ──────────────────────────

alertsApi.patch('/dismiss/all', async (c) => {
  const db = getDb(c.env.DB);
  const now = new Date().toISOString();

  await db
    .update(alerts)
    .set({ dismissed_at: now, dismissed_by: 'user' })
    .where(isNull(alerts.dismissed_at));

  return c.json({ success: true });
});

// ─── GET /config — Read alerts config from KV ────────────────────────────────

alertsApi.get('/config', async (c) => {
  const config = await getAlertsConfig(c.env);
  return c.json({ success: true, config });
});

// ─── PATCH /config — Write alerts config to KV ───────────────────────────────

alertsApi.patch('/config', zValidator('json', AlertsConfigSchema.partial()), async (c) => {
  const incoming = c.req.valid('json');

  // Merge with existing config
  const existing = await getAlertsConfig(c.env);
  const merged = AlertsConfigSchema.parse({ ...existing, ...incoming });

  await c.env.KV_CONFIGS.put(ALERTS_CONFIG_KEY, JSON.stringify(merged));

  return c.json({ success: true, config: merged });
});

export default alertsApi;
