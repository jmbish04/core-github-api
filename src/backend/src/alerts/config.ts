/**
 * @file backend/src/alerts/config.ts
 * @description Zod schema for `ALERTS_CONFIG` KV key.
 *
 * The frontend Settings "Alerts" tab writes this to `/api/alerts/config`
 * which persists it via ConfigManager to KV_CONFIGS under the key `ALERTS_CONFIG`.
 *
 * `createAlert()` reads this config at emit time to gate each alert type.
 */

import { z } from 'zod';
import { ALERT_TYPES } from '@db/schemas/app/alerts';

// Per-type enabled flags keyed by AlertType
const AlertTypeFlags = z.object({
  health:     z.boolean().default(true),
  webhook:    z.boolean().default(true),
  security:   z.boolean().default(true),
  deployment: z.boolean().default(true),
  agent:      z.boolean().default(true),
  info:       z.boolean().default(true),
});

export const AlertsConfigSchema = z.object({
  /** Master on/off switch — when false, no alerts are emitted at all */
  enabled: z.boolean().default(true),

  /** Duration in milliseconds that Sonner toasts stay visible before auto-dismiss */
  sonner_duration_ms: z.number().int().min(1000).max(60000).default(15000),

  /** How many seconds back to look for "fresh" alerts to show as toasts on page load */
  fresh_alert_window_seconds: z.number().int().min(10).max(3600).default(60),

  /** Per-type toggles — false means that type is never inserted or returned */
  types: AlertTypeFlags.default({
    health: true, webhook: true, security: true, deployment: true, agent: true, info: true,
  }),
});

export type AlertsConfig = z.infer<typeof AlertsConfigSchema>;

export const DEFAULT_ALERTS_CONFIG: AlertsConfig = AlertsConfigSchema.parse({});

/** The KV key where this config is stored */
export const ALERTS_CONFIG_KEY = 'ALERTS_CONFIG';
