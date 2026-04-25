/**
 * @file components/config/agents/AgentConfigManager.tsx
 * @description Tabbed UI for browsing and editing the centralized agent AI config.
 *
 * - Tabs: one per agent name.
 * - Table: all functions for the selected agent, showing provider/model and status.
 * - Click a row → opens AgentConfigEditModal.
 * - Toolbar: filter input + "Seed Defaults" button.
 */
import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, Pencil, Sprout, RefreshCw, Bot, CheckCircle2, XCircle } from 'lucide-react';
import { AgentConfigEditModal } from './AgentConfigEditModal';
import type { AgentFunctionConfig } from './AgentConfigEditModal';

// ── Types ──────────────────────────────────────────────────────────────────────

type GroupedConfigs = Record<string, AgentFunctionConfig[]>;

// ── Hooks ──────────────────────────────────────────────────────────────────────

function useAgentConfigs() {
  const [configs, setConfigs] = useState<AgentFunctionConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/agents/config');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as { configs: AgentFunctionConfig[] };
      setConfigs(data.configs);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  return { configs, setConfigs, loading, error, reload: load };
}

// ── Component ─────────────────────────────────────────────────────────────────

export function AgentConfigManager() {
  const { configs, setConfigs, loading, error, reload } = useAgentConfigs();
  const [search, setSearch] = useState('');
  const [editTarget, setEditTarget] = useState<AgentFunctionConfig | null>(null);
  const [seeding, setSeeding] = useState(false);
  const [seedResult, setSeedResult] = useState<string | null>(null);

  // ── Derived ──────────────────────────────────────────────────────────────────

  const filtered = configs.filter(
    (c) =>
      c.agentName.toLowerCase().includes(search.toLowerCase()) ||
      c.functionName.toLowerCase().includes(search.toLowerCase()) ||
      (c.label ?? '').toLowerCase().includes(search.toLowerCase()),
  );

  const grouped: GroupedConfigs = filtered.reduce<GroupedConfigs>((acc, cfg) => {
    if (!acc[cfg.agentName]) acc[cfg.agentName] = [];
    acc[cfg.agentName].push(cfg);
    return acc;
  }, {});

  const agentNames = Object.keys(grouped).sort();

  // ── Handlers ─────────────────────────────────────────────────────────────────

  async function handleSeed() {
    setSeeding(true);
    setSeedResult(null);
    try {
      const res = await fetch('/api/agents/config/seed', { method: 'POST' });
      const data = await res.json() as { seeded: number };
      setSeedResult(`✓ Seeded ${data.seeded} agent function configs`);
      void reload();
    } catch (err: any) {
      setSeedResult(`✗ Seed failed: ${err.message}`);
    } finally {
      setSeeding(false);
    }
  }

  function handleSaved(updated: AgentFunctionConfig) {
    setConfigs((prev) => {
      const idx = prev.findIndex(
        (c) => c.agentName === updated.agentName && c.functionName === updated.functionName,
      );
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = updated;
        return next;
      }
      return [...prev, updated];
    });
    setEditTarget(null);
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-zinc-100 flex items-center gap-2">
            <Bot className="h-6 w-6 text-violet-400" />
            Agent AI Config
          </h2>
          <p className="text-zinc-500 mt-1 text-sm">
            Configure the provider, model, and system instructions for each agent function.
            Changes take effect <strong className="text-zinc-300">immediately</strong> at runtime (read from D1).
            Optionally open a Jules PR to enforce the change in source code.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void reload()}
            disabled={loading}
            className="border-zinc-700 text-zinc-400 hover:text-zinc-200"
          >
            <RefreshCw className={`h-4 w-4 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => void handleSeed()}
            disabled={seeding}
            className="border-emerald-800 text-emerald-400 hover:text-emerald-200 hover:border-emerald-600"
          >
            {seeding ? (
              <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
            ) : (
              <Sprout className="h-4 w-4 mr-1.5" />
            )}
            Seed Defaults
          </Button>
        </div>
      </div>

      {/* Seed result */}
      {seedResult && (
        <p className="text-sm text-emerald-400 bg-emerald-950/30 border border-emerald-800 rounded-md px-3 py-2">
          {seedResult}
        </p>
      )}

      {/* Error */}
      {error && (
        <p className="text-sm text-red-400 bg-red-950/30 border border-red-900 rounded-md px-3 py-2">
          Failed to load configs: {error}
        </p>
      )}

      {/* Search */}
      <Input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Filter by agent, function, or label…"
        className="bg-zinc-900 border-zinc-700 text-zinc-100 max-w-sm"
        aria-label="Filter agent configs"
      />

      {/* Loading state */}
      {loading && configs.length === 0 && (
        <div className="flex items-center gap-2 text-zinc-500 py-8">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading agent configurations…
        </div>
      )}

      {/* Tabs per agent */}
      {!loading && agentNames.length === 0 && (
        <div className="text-center py-12 text-zinc-600">
          <Bot className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p>No agent configs found.</p>
          <p className="text-sm mt-1">
            Click <strong>Seed Defaults</strong> to populate the canonical configurations.
          </p>
        </div>
      )}

      {agentNames.length > 0 && (
        <Tabs defaultValue={agentNames[0]} className="space-y-4">
          <TabsList className="bg-zinc-900 border border-zinc-800 flex-wrap h-auto gap-1 p-1">
            {agentNames.map((agent) => (
              <TabsTrigger
                key={agent}
                value={agent}
                className="data-[state=active]:bg-violet-600 data-[state=active]:text-white text-zinc-400 text-xs"
              >
                {agent.replace('Agent', '')}
                <Badge
                  variant="secondary"
                  className="ml-1.5 h-4 min-w-[1.25rem] px-1 text-[10px] bg-zinc-800 text-zinc-400"
                >
                  {grouped[agent].length}
                </Badge>
              </TabsTrigger>
            ))}
          </TabsList>

          {agentNames.map((agent) => (
            <TabsContent key={agent} value={agent}>
              <AgentFunctionTable
                configs={grouped[agent]}
                onEdit={setEditTarget}
              />
            </TabsContent>
          ))}
        </Tabs>
      )}

      {/* Edit modal */}
      <AgentConfigEditModal
        config={editTarget}
        open={editTarget !== null}
        onClose={() => setEditTarget(null)}
        onSaved={handleSaved}
      />
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function AgentFunctionTable({
  configs,
  onEdit,
}: {
  configs: AgentFunctionConfig[];
  onEdit: (config: AgentFunctionConfig) => void;
}) {
  return (
    <div className="rounded-lg border border-zinc-800 overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="border-zinc-800 hover:bg-transparent">
            <TableHead className="text-zinc-500 w-[200px]">Function</TableHead>
            <TableHead className="text-zinc-500">Primary</TableHead>
            <TableHead className="text-zinc-500">Secondary</TableHead>
            <TableHead className="text-zinc-500 hidden lg:table-cell">Instructions</TableHead>
            <TableHead className="text-zinc-500 w-[80px]">Status</TableHead>
            <TableHead className="text-zinc-500 w-[60px]" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {configs.map((cfg) => (
            <TableRow
              key={`${cfg.agentName}-${cfg.functionName}`}
              className="border-zinc-800 hover:bg-zinc-900/60 cursor-pointer transition-colors"
              onClick={() => onEdit(cfg)}
            >
              <TableCell>
                <div>
                  <p className="text-zinc-200 font-medium text-sm">{cfg.label ?? cfg.functionName}</p>
                  {cfg.label && (
                    <p className="text-zinc-600 text-xs font-mono mt-0.5">{cfg.functionName}</p>
                  )}
                </div>
              </TableCell>

              <TableCell>
                <ProviderModelBadge
                  provider={cfg.primaryProvider}
                  model={cfg.primaryModel}
                />
              </TableCell>

              <TableCell>
                <ProviderModelBadge
                  provider={cfg.secondaryProvider}
                  model={cfg.secondaryModel}
                  muted
                />
              </TableCell>

              <TableCell className="hidden lg:table-cell">
                {cfg.systemInstructions ? (
                  <p className="text-zinc-500 text-xs line-clamp-2 max-w-xs">
                    {cfg.systemInstructions}
                  </p>
                ) : (
                  <span className="text-zinc-700 text-xs italic">Using agent default</span>
                )}
              </TableCell>

              <TableCell>
                {cfg.isActive !== false ? (
                  <span className="flex items-center gap-1 text-emerald-400 text-xs">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Active
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-zinc-600 text-xs">
                    <XCircle className="h-3.5 w-3.5" /> Inactive
                  </span>
                )}
              </TableCell>

              <TableCell>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-zinc-600 hover:text-zinc-200 hover:bg-zinc-800"
                  onClick={(e) => { e.stopPropagation(); onEdit(cfg); }}
                  aria-label={`Edit ${cfg.functionName}`}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function ProviderModelBadge({
  provider,
  model,
  muted = false,
}: {
  provider?: string | null;
  model?: string | null;
  muted?: boolean;
}) {
  if (!provider && !model) return <span className="text-zinc-700 text-xs">—</span>;

  const providerColors: Record<string, string> = {
    gemini: 'bg-blue-950/60 text-blue-300 border-blue-800',
    openai: 'bg-emerald-950/60 text-emerald-300 border-emerald-800',
    'worker-ai': 'bg-orange-950/60 text-orange-300 border-orange-800',
    cloudflare: 'bg-orange-950/60 text-orange-300 border-orange-800',
    anthropic: 'bg-amber-950/60 text-amber-300 border-amber-800',
  };

  const colorClass = muted
    ? 'bg-zinc-900/60 text-zinc-500 border-zinc-800'
    : (providerColors[provider ?? ''] ?? 'bg-zinc-900/60 text-zinc-400 border-zinc-700');

  const modelShort = model?.split('/').pop() ?? model;

  return (
    <div className="space-y-1">
      {provider && (
        <Badge
          variant="outline"
          className={`text-[10px] px-1.5 py-0 border ${colorClass} font-medium`}
        >
          {provider}
        </Badge>
      )}
      {modelShort && (
        <p className={`text-xs font-mono ${muted ? 'text-zinc-600' : 'text-zinc-400'}`}>
          {modelShort}
        </p>
      )}
    </div>
  );
}
