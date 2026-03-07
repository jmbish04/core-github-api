/**
 * @file frontend/src/views/control/global/Alerts.tsx
 * @description Full-page Alerts center at /alerts.
 * Shows all active alerts with filtering by type/severity, and dismissed history.
 */

import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  Bell, CheckCircle2, XCircle, AlertCircle, Info,
  Zap, Server, Brain, Shield, Filter, Clock,
  RefreshCcw, ExternalLink, X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useAlerts, Alert, AlertType, AlertSeverity } from '@/context/alerts-context';
import { useAuth } from '@/context/auth-context';

// ─── Type meta ────────────────────────────────────────────────────────────────

const TYPE_META: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  health:     { label: 'Health',      icon: <CheckCircle2 className="w-4 h-4" />, color: 'text-emerald-400' },
  webhook:    { label: 'Webhooks',    icon: <Zap className="w-4 h-4" />,          color: 'text-yellow-400' },
  security:   { label: 'Security',   icon: <Shield className="w-4 h-4" />,       color: 'text-red-400' },
  deployment: { label: 'Deployment', icon: <Server className="w-4 h-4" />,       color: 'text-blue-400' },
  agent:      { label: 'Agents',     icon: <Brain className="w-4 h-4" />,        color: 'text-purple-400' },
  info:       { label: 'Info',       icon: <Info className="w-4 h-4" />,         color: 'text-muted-foreground' },
};

const SEV_BADGE: Record<AlertSeverity, string> = {
  critical: 'bg-red-500/20 text-red-400 border-red-500/30',
  error:    'bg-orange-500/20 text-orange-400 border-orange-500/30',
  warning:  'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  info:     'bg-blue-500/20 text-blue-400 border-blue-500/30',
};

// ─── AlertCard ────────────────────────────────────────────────────────────────

function AlertCard({ alert, onDismiss }: { alert: Alert; onDismiss?: () => void }) {
  const meta = TYPE_META[alert.type] ?? { label: alert.type, icon: <Info className="w-4 h-4" />, color: 'text-muted-foreground' };
  const dismissed = !!alert.dismissed_at;

  return (
    <div className={cn(
      'flex items-start gap-4 p-4 rounded-lg border transition-all',
      dismissed ? 'opacity-50 bg-muted/10 border-border/30' : 'bg-card/50 border-border/50 hover:border-border',
    )}>
      {/* Type icon */}
      <div className={cn('p-2 rounded-full bg-muted/40 shrink-0 mt-0.5', meta.color)}>
        {meta.icon}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-0.5 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              {alert.link_url ? (
                <Link to={alert.link_url} className="text-sm font-semibold hover:underline flex items-center gap-1">
                  {alert.title}
                  <ExternalLink className="w-3 h-3 opacity-60" />
                </Link>
              ) : (
                <span className="text-sm font-semibold">{alert.title}</span>
              )}
              <span className={cn('text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded border', SEV_BADGE[alert.severity])}>
                {alert.severity}
              </span>
              <Badge variant="outline" className={cn('text-[10px] h-4 px-1', meta.color)}>
                {meta.label}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">{alert.description}</p>
          </div>
          {!dismissed && onDismiss && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 shrink-0 text-muted-foreground hover:text-foreground"
              onClick={onDismiss}
              aria-label="Dismiss"
            >
              <X className="w-3.5 h-3.5" />
            </Button>
          )}
        </div>

        <div className="flex items-center gap-3 text-xs text-muted-foreground/70 pt-1">
          <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{new Date(alert.created_at).toLocaleString()}</span>
          <span>via {alert.process_origin}</span>
          {alert.repo_origin && <span>· {alert.repo_origin}</span>}
          {dismissed && alert.dismissed_at && (
            <span className="ml-auto">Dismissed {new Date(alert.dismissed_at).toLocaleString()}</span>
          )}
        </div>

        {alert.is_action_needed && alert.action_required && (
          <div className="mt-2 px-3 py-2 rounded bg-orange-500/10 border border-orange-500/20 text-xs text-orange-300">
            ⚡ Action required: {alert.action_required}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AlertsPage() {
  const { grouped, total, isLoading, refresh, dismissOne, dismissByType, dismissAll } = useAlerts();
  const { apiKey } = useAuth();

  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [severityFilter, setSeverityFilter] = useState<string>('all');
  const [historyAlerts, setHistoryAlerts] = useState<Alert[]>([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);

  // Flatten active alerts for filtering
  const activeAlerts = useMemo(() => {
    const all: Alert[] = [];
    for (const arr of Object.values(grouped)) all.push(...arr);
    return all
      .filter((a) => typeFilter === 'all' || a.type === typeFilter)
      .filter((a) => severityFilter === 'all' || a.severity === severityFilter)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [grouped, typeFilter, severityFilter]);

  // Load history on tab switch
  const loadHistory = async () => {
    if (historyLoaded) return;
    try {
      const h: Record<string, string> = {};
      if (apiKey) h['x-api-key'] = apiKey;
      const res = await fetch('/api/alerts/history?limit=100', { headers: h, credentials: 'include' });
      if (res.ok) {
        const data = (await res.json()) as { alerts: Alert[] };
        setHistoryAlerts(data.alerts ?? []);
        setHistoryLoaded(true);
      }
    } catch { /* ignore */ }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto p-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Bell className="w-8 h-8" /> Alerts
          </h1>
          <p className="text-muted-foreground">Monitor system events across all platform domains.</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={refresh} className="gap-1.5">
            <RefreshCcw className={cn('w-3.5 h-3.5', isLoading && 'animate-spin')} />
            Refresh
          </Button>
          {total > 0 && (
            <Button variant="outline" size="sm" onClick={dismissAll} className="gap-1.5 text-muted-foreground">
              <X className="w-3.5 h-3.5" /> Dismiss all
            </Button>
          )}
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {(['health', 'security', 'deployment', 'agent'] as AlertType[]).map((t) => {
          const meta = TYPE_META[t];
          const count = (grouped[t] ?? []).length;
          return (
            <Card key={t} className="bg-card/50 border-border/50">
              <CardContent className="p-4 flex items-center gap-3">
                <div className={cn('p-2 rounded-full bg-muted/40', meta.color)}>{meta.icon}</div>
                <div>
                  <div className="text-xl font-bold">{count}</div>
                  <div className="text-xs text-muted-foreground">{meta.label}</div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Tabs defaultValue="active">
        <TabsList>
          <TabsTrigger value="active">
            Active <span className="ml-1.5 rounded-full bg-primary/20 text-primary text-[10px] px-1.5 py-0.5">{total}</span>
          </TabsTrigger>
          <TabsTrigger value="history" onClick={loadHistory}>History</TabsTrigger>
        </TabsList>

        <TabsContent value="active" className="mt-4 space-y-4">
          {/* Filter bar */}
          <div className="flex items-center gap-2 flex-wrap">
            <Filter className="w-3.5 h-3.5 text-muted-foreground" />
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-[150px] bg-card/50 border-border/50 h-8 text-xs">
                <SelectValue placeholder="All types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                {Object.keys(TYPE_META).map((t) => (
                  <SelectItem key={t} value={t}>{TYPE_META[t].label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={severityFilter} onValueChange={setSeverityFilter}>
              <SelectTrigger className="w-[150px] bg-card/50 border-border/50 h-8 text-xs">
                <SelectValue placeholder="All severities" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All severities</SelectItem>
                {(['critical','error','warning','info'] as AlertSeverity[]).map((s) => (
                  <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {(typeFilter !== 'all' || severityFilter !== 'all') && (
              <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => { setTypeFilter('all'); setSeverityFilter('all'); }}>
                Clear filters
              </Button>
            )}
          </div>

          {/* Alert list */}
          {isLoading && activeAlerts.length === 0 ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="p-4 rounded-lg border border-border/50 flex gap-4">
                  <Skeleton className="h-10 w-10 rounded-full shrink-0" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-48" />
                    <Skeleton className="h-3 w-full" />
                    <Skeleton className="h-3 w-32" />
                  </div>
                </div>
              ))}
            </div>
          ) : activeAlerts.length === 0 ? (
            <div className="py-16 flex flex-col items-center gap-3 text-muted-foreground">
              <CheckCircle2 className="w-10 h-10 opacity-30" />
              <p className="text-sm">All clear — no active alerts</p>
            </div>
          ) : (
            <div className="space-y-2">
              {activeAlerts.map((alert) => (
                <AlertCard
                  key={alert.id}
                  alert={alert}
                  onDismiss={() => dismissOne(alert.id)}
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          {historyAlerts.length === 0 ? (
            <div className="py-16 flex flex-col items-center gap-3 text-muted-foreground">
              <Clock className="w-10 h-10 opacity-30" />
              <p className="text-sm">No dismissed alerts found</p>
            </div>
          ) : (
            <div className="space-y-2">
              {historyAlerts.map((alert) => (
                <AlertCard key={alert.id} alert={alert} />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
