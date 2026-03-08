/**
 * @file frontend/src/components/alerts/AlertTray.tsx
 * @description Popover content for the alert bell. Shows all active alerts
 * grouped by type with dismiss controls.
 *
 * Features:
 * - "Dismiss All" button in header
 * - Per-group "Dismiss group" button
 * - Per-alert dismiss (✕) and optional hyperlink
 * - Empty state when no active alerts
 * - Link to /alerts full page
 */

import { Link } from 'react-router-dom';
import {
  CheckCircle2, XCircle, AlertCircle, Info, Zap,
  GitBranch, Brain, Server, Shield, X, ArrowRight,
  Bell, ExternalLink,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { useAlerts, Alert, AlertType, AlertSeverity } from '@/context/alerts-context';

// ─── Meta ─────────────────────────────────────────────────────────────────────

const TYPE_META: Record<AlertType, { label: string; icon: React.ReactNode; color: string }> = {
  health:     { label: 'Health',      icon: <CheckCircle2 className="w-3.5 h-3.5" />, color: 'text-emerald-400' },
  webhook:    { label: 'Webhooks',    icon: <Zap className="w-3.5 h-3.5" />,          color: 'text-yellow-400' },
  security:   { label: 'Security',   icon: <Shield className="w-3.5 h-3.5" />,       color: 'text-red-400' },
  deployment: { label: 'Deployment', icon: <Server className="w-3.5 h-3.5" />,       color: 'text-blue-400' },
  agent:      { label: 'Agents',     icon: <Brain className="w-3.5 h-3.5" />,        color: 'text-purple-400' },
  info:       { label: 'Info',       icon: <Info className="w-3.5 h-3.5" />,         color: 'text-muted-foreground' },
};

const SEVERITY_BADGE: Record<AlertSeverity, string> = {
  critical: 'bg-red-500/20 text-red-400 border-red-500/30',
  error:    'bg-orange-500/20 text-orange-400 border-orange-500/30',
  warning:  'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  info:     'bg-blue-500/20 text-blue-400 border-blue-500/30',
};

function SeverityIcon({ severity }: { severity: AlertSeverity }) {
  if (severity === 'critical' || severity === 'error') return <XCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />;
  if (severity === 'warning') return <AlertCircle className="w-3.5 h-3.5 text-yellow-400 shrink-0" />;
  return <Info className="w-3.5 h-3.5 text-blue-400 shrink-0" />;
}

// ─── AlertRow ─────────────────────────────────────────────────────────────────

function AlertRow({ alert, onDismiss }: { alert: Alert; onDismiss: () => void }) {
  const content = (
    <div className="flex items-start gap-2 flex-1 min-w-0">
      <SeverityIcon severity={alert.severity} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs font-medium text-foreground truncate">{alert.title}</span>
          <span className={cn('text-[9px] font-semibold uppercase tracking-wide px-1 py-0.5 rounded border', SEVERITY_BADGE[alert.severity])}>
            {alert.severity}
          </span>
        </div>
        <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{alert.description}</p>
        <p className="text-[10px] text-muted-foreground/60 mt-0.5">
          {new Date(alert.created_at).toLocaleString()} · {alert.process_origin}
        </p>
      </div>
    </div>
  );

  return (
    <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg hover:bg-muted/30 transition-colors group">
      {alert.link_url ? (
        <Link to={alert.link_url} className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            {content}
            <ExternalLink className="w-3 h-3 text-muted-foreground/50 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
        </Link>
      ) : content}
      <button
        onClick={onDismiss}
        aria-label="Dismiss alert"
        className="shrink-0 mt-0.5 p-0.5 rounded text-muted-foreground/50 hover:text-foreground hover:bg-muted transition-colors opacity-0 group-hover:opacity-100"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

// ─── AlertTray ────────────────────────────────────────────────────────────────

export function AlertTray({ onClose }: { onClose?: () => void }) {
  const { grouped, total, isLoading, dismissOne, dismissByType, dismissAll } = useAlerts();
  const types = Object.keys(grouped) as AlertType[];

  return (
    <div className="flex flex-col max-h-[520px]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
        <div className="flex items-center gap-2">
          <Bell className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-semibold">Alerts</span>
          {total > 0 && (
            <span className="text-xs font-mono text-muted-foreground">({total})</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {total > 0 && (
            <Button variant="ghost" size="sm" className="h-6 text-xs text-muted-foreground hover:text-foreground" onClick={() => dismissAll()}>
              Dismiss all
            </Button>
          )}
          <Link to="/alerts" onClick={onClose}>
            <Button variant="ghost" size="sm" className="h-6 text-xs gap-1">
              View all <ArrowRight className="w-3 h-3" />
            </Button>
          </Link>
        </div>
      </div>

      {/* Body */}
      <ScrollArea className="flex-1">
        {isLoading && total === 0 ? (
          <div className="py-8 text-center text-xs text-muted-foreground">Loading…</div>
        ) : total === 0 ? (
          <div className="py-10 flex flex-col items-center gap-2 text-muted-foreground">
            <CheckCircle2 className="w-8 h-8 opacity-30" />
            <p className="text-xs">All clear — no active alerts</p>
          </div>
        ) : (
          <div className="py-1">
            {types.map((type) => {
              const meta = TYPE_META[type] ?? { label: type, icon: <Info className="w-3.5 h-3.5" />, color: 'text-muted-foreground' };
              const items = grouped[type] ?? [];
              return (
                <div key={type} className="mb-1">
                  {/* Group header */}
                  <div className="flex items-center justify-between px-4 py-1.5">
                    <div className={cn('flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide', meta.color)}>
                      {meta.icon} {meta.label}
                      <span className="text-muted-foreground/60 font-normal normal-case tracking-normal ml-1">({items.length})</span>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-5 text-[10px] text-muted-foreground hover:text-foreground px-1.5"
                      onClick={() => dismissByType(type)}
                    >
                      Dismiss group
                    </Button>
                  </div>
                  {/* Alert rows */}
                  <div className="px-1">
                    {items.map((alert) => (
                      <AlertRow
                        key={alert.id}
                        alert={alert}
                        onDismiss={() => dismissOne(alert.id)}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
