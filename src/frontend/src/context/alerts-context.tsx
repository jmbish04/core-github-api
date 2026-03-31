/**
 * @file frontend/src/context/alerts-context.tsx
 * @description Global AlertsContext — provides alert data, badge count, and dismiss actions
 * to the entire frontend application.
 *
 * Usage:
 *   const { unreadCount, grouped, dismissOne, dismissByType, dismissAll } = useAlerts();
 *
 * Sonner toasts are fired here for "fresh" alerts (created within config.fresh_alert_window_seconds).
 */

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
} from 'react';
import { toast } from 'sonner';
import { useAuth } from '@/context/auth-context';

// ─── Types (mirroring backend schema) ───────────────────────────────────────

export type AlertType = 'health' | 'webhook' | 'security' | 'deployment' | 'agent' | 'info';
export type AlertSeverity = 'info' | 'warning' | 'error' | 'critical';

export interface Alert {
  id: string;
  type: AlertType;
  severity: AlertSeverity;
  title: string;
  description: string;
  link_url: string | null;
  process_origin: string;
  repo_origin: string | null;
  is_action_needed: boolean;
  action_required: string | null;
  created_at: string;
  dismissed_at: string | null;
}

export interface AlertsConfig {
  enabled: boolean;
  sonner_duration_ms: number;
  fresh_alert_window_seconds: number;
  types: Record<AlertType, boolean>;
}

interface GroupedAlerts {
  [type: string]: Alert[];
}

interface AlertsContextValue {
  grouped: GroupedAlerts;
  total: number;
  unreadCount: number;
  config: AlertsConfig | null;
  isLoading: boolean;
  refresh: () => Promise<void>;
  dismissOne: (id: string) => Promise<void>;
  dismissByType: (type: AlertType) => Promise<void>;
  dismissAll: () => Promise<void>;
  updateConfig: (patch: Partial<AlertsConfig>) => Promise<void>;
}

const AlertsContext = createContext<AlertsContextValue | null>(null);

// ─── Default config ───────────────────────────────────────────────────────────
const DEFAULT_CONFIG: AlertsConfig = {
  enabled: true,
  sonner_duration_ms: 15000,
  fresh_alert_window_seconds: 60,
  types: { health: true, webhook: true, security: true, deployment: true, agent: true, info: true },
};

// ─── Severity → Sonner type ───────────────────────────────────────────────────
function toSonnerType(severity: AlertSeverity): 'default' | 'success' | 'warning' | 'error' {
  switch (severity) {
    case 'critical':
    case 'error': return 'error';
    case 'warning': return 'warning';
    default: return 'default';
  }
}

// ─── Provider ────────────────────────────────────────────────────────────────

export function AlertsProvider({ children }: { children: React.ReactNode }) {
  const { apiKey } = useAuth();
  const [grouped, setGrouped] = useState<GroupedAlerts>({});
  const [total, setTotal] = useState(0);
  const [unreadCount, setUnreadCount] = useState(0);
  const [config, setConfig] = useState<AlertsConfig | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  // Track which IDs we've already toasted so we don't re-toast on re-fetch
  const toastedIds = useRef<Set<string>>(new Set());

  const headers = useCallback((): Record<string, string> => {
    const h: Record<string, string> = {};
    if (apiKey) h['x-api-key'] = apiKey;
    return h;
  }, [apiKey]);

  const refresh = useCallback(async () => {
    if (!apiKey) return;
    try {
      setIsLoading(true);
      const res = await fetch('/api/alerts', { headers: headers(), credentials: 'include' });
      if (!res.ok) return;
      const data = (await res.json()) as { grouped: GroupedAlerts; total: number; config: AlertsConfig };
      setGrouped(data.grouped ?? {});
      setTotal(data.total ?? 0);
      setConfig(data.config ?? DEFAULT_CONFIG);

      // Count unread for badge
      const cnt = Object.values(data.grouped ?? {}).reduce((n, arr) => n + arr.length, 0);
      setUnreadCount(cnt);

      // Fire Sonner toasts for fresh, un-toasted alerts
      const freshWindowMs = (data.config?.fresh_alert_window_seconds ?? 60) * 1000;
      const now = Date.now();
      for (const arr of Object.values(data.grouped ?? {})) {
        for (const alert of arr) {
          if (toastedIds.current.has(alert.id)) continue;
          const age = now - new Date(alert.created_at).getTime();
          if (age <= freshWindowMs) {
            toastedIds.current.add(alert.id);
            const duration = data.config?.sonner_duration_ms ?? 15000;
            toast[toSonnerType(alert.severity)](alert.title, {
              description: alert.description,
              duration,
              action: alert.link_url
                ? { label: 'View', onClick: () => window.location.href = alert.link_url! }
                : undefined,
            });
          }
        }
      }
    } catch (e) {
      console.error('[AlertsContext] Failed to fetch alerts', e);
    } finally {
      setIsLoading(false);
    }
  }, [apiKey, headers]);

  // Initial load + polling every 60s
  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 60_000);
    return () => clearInterval(timer);
  }, [refresh]);

  const dismissOne = useCallback(async (id: string) => {
    await fetch(`/api/alerts/${id}/dismiss`, { method: 'PATCH', headers: headers(), credentials: 'include' });
    toastedIds.current.add(id); // prevent re-toast
    await refresh();
  }, [headers, refresh]);

  const dismissByType = useCallback(async (type: AlertType) => {
    await fetch(`/api/alerts/dismiss/type/${type}`, { method: 'PATCH', headers: headers(), credentials: 'include' });
    await refresh();
  }, [headers, refresh]);

  const dismissAll = useCallback(async () => {
    await fetch('/api/alerts/dismiss/all', { method: 'PATCH', headers: headers(), credentials: 'include' });
    toastedIds.current.clear();
    await refresh();
  }, [headers, refresh]);

  const updateConfig = useCallback(async (patch: Partial<AlertsConfig>) => {
    await fetch('/api/alerts/config', {
      method: 'PATCH',
      headers: { ...headers(), 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(patch),
    });
    await refresh();
  }, [headers, refresh]);

  return (
    <AlertsContext.Provider value={{ grouped, total, unreadCount, config, isLoading, refresh, dismissOne, dismissByType, dismissAll, updateConfig }}>
      {children}
    </AlertsContext.Provider>
  );
}

// ─── Hook ────────────────────────────────────────────────────────────────────

// eslint-disable-next-line react-refresh/only-export-components
export function useAlerts(): AlertsContextValue {
  const ctx = useContext(AlertsContext);
  if (!ctx) throw new Error('useAlerts must be used inside <AlertsProvider>');
  return ctx;
}
