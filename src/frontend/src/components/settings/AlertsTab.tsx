/**
 * @file frontend/src/components/settings/AlertsTab.tsx
 * @description Settings tab for configuring the Alerts module.
 * Allows toggling per-type alerts, setting Sonner duration, and the fresh alert window.
 * Changes are saved to /api/alerts/config (KV-backed).
 */

import { useState, useEffect } from 'react';
import { Bell, Save, Loader2, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { useAlerts } from '@/context/alerts-context';
import type { AlertType, AlertsConfig } from '@/context/alerts-context';
import { cn } from '@/lib/utils';

const ALERT_TYPES: Array<{ type: AlertType; label: string; description: string }> = [
  { type: 'health',     label: 'Health',      description: 'Health check failures and degraded states' },
  { type: 'webhook',    label: 'Webhooks',     description: 'Notable webhook delivery events' },
  { type: 'security',   label: 'Security',    description: 'Secret leaks, unauthorized access attempts' },
  { type: 'deployment', label: 'Deployment',  description: 'Deploy successes, failures, and rollbacks' },
  { type: 'agent',      label: 'Agents',      description: 'AI agent completions and errors' },
  { type: 'info',       label: 'Info',        description: 'General informational system messages' },
];

export function AlertsTab() {
  const { config, updateConfig } = useAlerts();
  const [local, setLocal] = useState<AlertsConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (config && !local) setLocal(config);
  }, [config, local]);

  if (!local) {
    return <div className="text-sm text-muted-foreground">Loading alert configuration…</div>;
  }

  const handleToggleType = (type: AlertType, val: boolean) => {
    setLocal((prev) => prev ? { ...prev, types: { ...prev.types, [type]: val } } : prev);
    setSaved(false);
  };

  const handleMasterToggle = (val: boolean) => {
    setLocal((prev) => prev ? { ...prev, enabled: val } : prev);
    setSaved(false);
  };

  const handleSave = async () => {
    if (!local) return;
    setSaving(true);
    try {
      await updateConfig(local);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Master toggle */}
      <Card className="bg-card/50 border-border/50">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <CardTitle className="text-base flex items-center gap-2">
                <Bell className="w-4 h-4" /> Alerts System
              </CardTitle>
              <CardDescription>Master switch for all alert types and Sonner notifications.</CardDescription>
            </div>
            <Switch checked={local.enabled} onCheckedChange={handleMasterToggle} />
          </div>
        </CardHeader>
      </Card>

      {/* Per-type toggles */}
      <Card className={cn('bg-card/50 border-border/50 transition-opacity', !local.enabled && 'opacity-50 pointer-events-none')}>
        <CardHeader>
          <CardTitle className="text-base">Alert Types</CardTitle>
          <CardDescription>Choose which categories of events trigger alerts and Sonner notifications.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {ALERT_TYPES.map(({ type, label, description }) => (
            <div key={type} className="flex items-center justify-between py-2 border-b border-border/30 last:border-0">
              <div className="space-y-0.5">
                <Label htmlFor={`type-${type}`} className="text-sm font-medium cursor-pointer">{label}</Label>
                <p className="text-xs text-muted-foreground">{description}</p>
              </div>
              <Switch
                id={`type-${type}`}
                checked={local.types[type] ?? true}
                onCheckedChange={(val) => handleToggleType(type, val)}
              />
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Sonner duration */}
      <Card className={cn('bg-card/50 border-border/50 transition-opacity', !local.enabled && 'opacity-50 pointer-events-none')}>
        <CardHeader>
          <CardTitle className="text-base">Toast Notification Settings</CardTitle>
          <CardDescription>Configure how Sonner toast notifications behave.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm">Auto-dismiss duration</Label>
              <span className="text-sm font-mono text-muted-foreground">
                {(local.sonner_duration_ms / 1000).toFixed(0)}s
              </span>
            </div>
            <Slider
              min={3000}
              max={60000}
              step={1000}
              value={[local.sonner_duration_ms]}
              onValueChange={([val]) => { setLocal((p) => p ? { ...p, sonner_duration_ms: val } : p); setSaved(false); }}
              className="w-full"
            />
            <p className="text-xs text-muted-foreground">Time before Sonner toasts auto-dismiss if not interacted with. Default: 15s.</p>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm">Fresh alert window</Label>
              <span className="text-sm font-mono text-muted-foreground">
                {local.fresh_alert_window_seconds}s
              </span>
            </div>
            <Slider
              min={10}
              max={3600}
              step={10}
              value={[local.fresh_alert_window_seconds]}
              onValueChange={([val]) => { setLocal((p) => p ? { ...p, fresh_alert_window_seconds: val } : p); setSaved(false); }}
              className="w-full"
            />
            <p className="text-xs text-muted-foreground">Alerts created within this window will show as toasts on page load. Default: 60s.</p>
          </div>
        </CardContent>
      </Card>

      {/* Save */}
      <div className="flex items-center justify-end gap-2">
        {saved && (
          <span className="text-sm text-emerald-400 flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5" /> Saved
          </span>
        )}
        <Button onClick={handleSave} disabled={saving} className="gap-1.5">
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          Save changes
        </Button>
      </div>
    </div>
  );
}
