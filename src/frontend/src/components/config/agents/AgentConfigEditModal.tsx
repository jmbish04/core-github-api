/**
 * @file components/config/agents/AgentConfigEditModal.tsx
 * @description Modal form for editing a single agent function AI config.
 *
 * On submit:
 *  1. Always POSTs to /api/agents/config (upserts the D1 row — runtime takes effect immediately).
 *  2. Optionally triggers a Jules coding session to enforce the change in the repository source.
 */
import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Loader2, GitBranch, Zap } from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface AgentFunctionConfig {
  id?: number;
  agentName: string;
  functionName: string;
  label?: string | null;
  primaryProvider?: string | null;
  primaryModel?: string | null;
  secondaryProvider?: string | null;
  secondaryModel?: string | null;
  systemInstructions?: string | null;
  promptTemplate?: string | null;
  notes?: string | null;
  isActive?: boolean;
}

interface AgentConfigEditModalProps {
  config: AgentFunctionConfig | null;
  open: boolean;
  onClose: () => void;
  onSaved: (updated: AgentFunctionConfig) => void;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const PROVIDERS = [
  { value: 'gemini', label: 'Gemini (Google AI Studio)' },
  { value: 'openai', label: 'OpenAI' },
  { value: 'worker-ai', label: 'Cloudflare Worker AI' },
  { value: 'cloudflare', label: 'Cloudflare AI Gateway' },
  { value: 'anthropic', label: 'Anthropic' },
];

const SUGGESTED_MODELS: Record<string, string[]> = {
  gemini: ['gemini-2.5-pro-exp', 'gemini-2.0-flash', 'gemini-1.5-pro'],
  openai: ['gpt-4o', 'gpt-4o-mini', 'o1', 'o3-mini'],
  'worker-ai': ['@cf/meta/llama-3.3-70b-instruct-fp8-fast', '@cf/meta/llama-3.1-8b-instruct', '@cf/mistral/mistral-7b-instruct-v0.1'],
  cloudflare: ['@cf/meta/llama-3.3-70b-instruct-fp8-fast'],
  anthropic: ['claude-opus-4-5', 'claude-sonnet-4-6', 'claude-haiku-3-5'],
};

// ── Component ─────────────────────────────────────────────────────────────────

export function AgentConfigEditModal({
  config,
  open,
  onClose,
  onSaved,
}: AgentConfigEditModalProps) {
  const [form, setForm] = useState<AgentFunctionConfig>(
    config ?? { agentName: '', functionName: '' },
  );
  const [submitToJules, setSubmitToJules] = useState(false);
  const [julesApproval, setJulesApproval] = useState(true);
  const [saving, setSaving] = useState(false);
  const [julesSessionId, setJulesSessionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Sync form when config changes (on open)
  React.useEffect(() => {
    if (config) setForm(config);
    setJulesSessionId(null);
    setError(null);
  }, [config]);

  const set = (field: keyof AgentFunctionConfig, value: string | boolean | null) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      // 1. Upsert the D1 config (runtime takes effect immediately)
      const res = await fetch('/api/agents/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Unknown error' })) as any;
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }

      const { config: saved } = await res.json() as { config: AgentFunctionConfig };
      onSaved(saved);

      // 2. Optionally kick off a Jules coding session
      if (submitToJules && saved.id) {
        const julesRes = await fetch(`/api/agents/config/${saved.id}/jules`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            requireApproval: julesApproval,
            autoPr: true,
          }),
        });

        if (julesRes.ok) {
          const julesData = await julesRes.json() as { sessionId: string };
          setJulesSessionId(julesData.sessionId);
        }
      } else {
        onClose();
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (!config && !open) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-zinc-950 border border-zinc-800 text-zinc-100">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl font-semibold">
            <Zap className="h-5 w-5 text-violet-400" />
            Edit Agent AI Config
          </DialogTitle>
          <div className="flex items-center gap-2 mt-1">
            <Badge variant="outline" className="text-zinc-400 border-zinc-700 font-mono text-xs">
              {form.agentName}
            </Badge>
            <span className="text-zinc-600">·</span>
            <Badge variant="outline" className="text-zinc-400 border-zinc-700 font-mono text-xs">
              {form.functionName}
            </Badge>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5 pt-2">
          {/* Label */}
          <Field label="Label">
            <Input
              id="label"
              value={form.label ?? ''}
              onChange={(e) => set('label', e.target.value)}
              placeholder="Human-readable name shown in the UI"
              className="bg-zinc-900 border-zinc-700 text-zinc-100"
            />
          </Field>

          {/* Primary Provider + Model */}
          <div className="grid grid-cols-2 gap-4">
            <Field label="Primary Provider">
              <ProviderSelect
                value={form.primaryProvider ?? 'gemini'}
                onChange={(v) => set('primaryProvider', v)}
              />
            </Field>
            <Field label="Primary Model">
              <ModelInput
                value={form.primaryModel ?? ''}
                provider={form.primaryProvider ?? 'gemini'}
                onChange={(v) => set('primaryModel', v)}
              />
            </Field>
          </div>

          {/* Secondary Provider + Model */}
          <div className="grid grid-cols-2 gap-4">
            <Field label="Secondary Provider (fallback)">
              <ProviderSelect
                value={form.secondaryProvider ?? 'worker-ai'}
                onChange={(v) => set('secondaryProvider', v)}
              />
            </Field>
            <Field label="Secondary Model (fallback)">
              <ModelInput
                value={form.secondaryModel ?? ''}
                provider={form.secondaryProvider ?? 'worker-ai'}
                onChange={(v) => set('secondaryModel', v)}
              />
            </Field>
          </div>

          {/* System Instructions */}
          <Field label="System Instructions">
            <Textarea
              id="system-instructions"
              value={form.systemInstructions ?? ''}
              onChange={(e) => set('systemInstructions', e.target.value)}
              placeholder="Override the agent's default system prompt…"
              rows={5}
              className="bg-zinc-900 border-zinc-700 text-zinc-100 font-mono text-sm resize-y"
            />
          </Field>

          {/* Prompt Template */}
          <Field label="Prompt Template (optional)" hint="Use {{variable}} placeholders">
            <Textarea
              id="prompt-template"
              value={form.promptTemplate ?? ''}
              onChange={(e) => set('promptTemplate', e.target.value)}
              placeholder="Custom prompt prefix — leave blank to use agent default."
              rows={3}
              className="bg-zinc-900 border-zinc-700 text-zinc-100 font-mono text-sm resize-y"
            />
          </Field>

          {/* Notes */}
          <Field label="Notes (operator)">
            <Input
              id="notes"
              value={form.notes ?? ''}
              onChange={(e) => set('notes', e.target.value)}
              placeholder="Reason for this change, ticket reference, etc."
              className="bg-zinc-900 border-zinc-700 text-zinc-100"
            />
          </Field>

          {/* Jules toggle */}
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-zinc-200 flex items-center gap-2">
                  <GitBranch className="h-4 w-4 text-violet-400" />
                  Enforce change in source code via Jules PR
                </p>
                <p className="text-xs text-zinc-500 mt-0.5">
                  Jules will open a PR updating the agent's method file to use the new config.
                </p>
              </div>
              <Switch
                checked={submitToJules}
                onCheckedChange={setSubmitToJules}
                id="jules-toggle"
              />
            </div>

            {submitToJules && (
              <div className="flex items-center justify-between pl-6 border-l border-zinc-700">
                <div>
                  <p className="text-sm text-zinc-300">Require plan approval</p>
                  <p className="text-xs text-zinc-500">Jules pauses before coding — you approve the plan first.</p>
                </div>
                <Switch
                  checked={julesApproval}
                  onCheckedChange={setJulesApproval}
                  id="jules-approval"
                />
              </div>
            )}
          </div>

          {/* Jules success banner */}
          {julesSessionId && (
            <div className="rounded-lg border border-emerald-800 bg-emerald-950/40 px-4 py-3 text-sm text-emerald-300">
              ✓ Jules session started:{' '}
              <a
                href={`/jules?session=${julesSessionId}`}
                className="underline hover:text-emerald-200"
              >
                {julesSessionId}
              </a>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="ml-2 text-emerald-400"
                onClick={onClose}
              >
                Close
              </Button>
            </div>
          )}

          {error && (
            <p className="text-sm text-red-400 rounded-md bg-red-950/30 border border-red-900 px-3 py-2">
              {error}
            </p>
          )}

          <DialogFooter className="gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={onClose} className="text-zinc-400">
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={saving}
              className="bg-violet-600 hover:bg-violet-500 text-white"
            >
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  {submitToJules ? 'Saving & submitting to Jules…' : 'Saving…'}
                </>
              ) : submitToJules ? (
                'Save + Submit Jules PR'
              ) : (
                'Save Config'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-zinc-300 text-sm font-medium">
        {label}
        {hint && <span className="ml-2 text-xs text-zinc-500 font-normal">{hint}</span>}
      </Label>
      {children}
    </div>
  );
}

function ProviderSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="bg-zinc-900 border-zinc-700 text-zinc-100">
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="bg-zinc-900 border-zinc-700">
        {PROVIDERS.map((p) => (
          <SelectItem key={p.value} value={p.value} className="text-zinc-200 focus:bg-zinc-800">
            {p.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function ModelInput({
  value,
  provider,
  onChange,
}: {
  value: string;
  provider: string;
  onChange: (v: string) => void;
}) {
  const suggestions = SUGGESTED_MODELS[provider] ?? [];
  return (
    <div className="space-y-1">
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="e.g. gemini-2.0-flash"
        className="bg-zinc-900 border-zinc-700 text-zinc-100 font-mono text-sm"
        list={`model-suggestions-${provider}`}
      />
      <datalist id={`model-suggestions-${provider}`}>
        {suggestions.map((m) => (
          <option key={m} value={m} />
        ))}
      </datalist>
      {suggestions.length > 0 && (
        <div className="flex flex-wrap gap-1 pt-1">
          {suggestions.slice(0, 3).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => onChange(m)}
              className="text-xs px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 font-mono transition-colors"
            >
              {m.split('/').pop()}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
