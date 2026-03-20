/**
 * @file UxWorkshopTab.tsx
 * @description Overhauled UX Design Agent pipeline UI panel.
 * Features: Launch panel, 4-phase stepper, page grid with thumbnails,
 * SSE-powered live activity feed, and mockup drawer viewer.
 */

import { useState, useCallback, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  Sparkles,
  Layers,
  Zap,
  Eye,
  GitPullRequest,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  ArrowRight,
  Image as ImageIcon,
  BookOpen,
  ExternalLink,
} from 'lucide-react';
import { useUxRunStream, type PhaseKey, type UxPageState } from '@/hooks/useUxRunStream';

// ─── Phase Config ─────────────────────────────────────────────────────────────

const PHASES: { key: PhaseKey; label: string; icon: React.ReactNode; description: string }[] = [
  { key: 'enhancing', label: 'Enhance Prompt', icon: <Sparkles className="w-3.5 h-3.5" />, description: 'Jules refines your UX brief' },
  { key: 'designing', label: 'Design-MD', icon: <Layers className="w-3.5 h-3.5" />, description: 'Pages spec generated' },
  { key: 'stitch_loop', label: 'Stitch Loop', icon: <Eye className="w-3.5 h-3.5" />, description: 'Mockups designed & reviewed' },
  { key: 'building', label: 'Jules Fleet', icon: <Zap className="w-3.5 h-3.5" />, description: 'Astro/Shadcn pages built' },
];

const PHASE_ORDER: PhaseKey[] = ['idle', 'enhancing', 'designing', 'stitch_loop', 'building', 'done'];

function getPhaseIndex(phase: PhaseKey): number {
  return PHASE_ORDER.indexOf(phase);
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function PhaseTracker({ currentPhase }: { currentPhase: PhaseKey }) {
  const currentIdx = getPhaseIndex(currentPhase);

  return (
    <div className="flex items-center gap-0">
      {PHASES.map((phase, i) => {
        const phaseIdx = getPhaseIndex(phase.key);
        const isDone = currentIdx > phaseIdx;
        const isActive = currentPhase === phase.key;
        const isPending = currentIdx < phaseIdx;

        return (
          <div key={phase.key} className="flex items-center">
            <div className="flex flex-col items-center gap-1">
              <div
                className={`w-9 h-9 rounded-full flex items-center justify-center border transition-all ${
                  isDone
                    ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400'
                    : isActive
                      ? 'bg-indigo-500/20 border-indigo-500/60 text-indigo-300 ring-2 ring-indigo-500/30'
                      : isPending
                        ? 'bg-zinc-800/50 border-zinc-700/50 text-zinc-600/50'
                        : 'bg-zinc-800 border-zinc-700 text-zinc-600'
                }`}
              >
                {isDone ? (
                  <CheckCircle2 className="w-4 h-4" />
                ) : isActive ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  phase.icon
                )}
              </div>
              <span className={`text-[10px] font-medium ${isActive ? 'text-zinc-100' : isDone ? 'text-emerald-400' : 'text-zinc-600'}`}>
                {phase.label}
              </span>
            </div>
            {i < PHASES.length - 1 && (
              <div className={`h-px w-12 mx-1 mb-4 transition-all ${isDone ? 'bg-emerald-500/40' : 'bg-zinc-800'}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function PageStatusBadge({ status }: { status: UxPageState['status'] }) {
  const config: Record<string, { label: string; className: string; icon?: React.ReactNode }> = {
    pending: { label: 'Pending', className: 'bg-zinc-800 text-zinc-400 border-zinc-700', icon: <Clock className="w-3 h-3" /> },
    designing: { label: 'Designing…', className: 'bg-blue-500/10 text-blue-400 border-blue-500/30', icon: <Loader2 className="w-3 h-3 animate-spin" /> },
    review: { label: 'Reviewing…', className: 'bg-amber-500/10 text-amber-400 border-amber-500/30', icon: <Loader2 className="w-3 h-3 animate-spin" /> },
    committed: { label: 'Committed', className: 'bg-violet-500/10 text-violet-400 border-violet-500/30', icon: <CheckCircle2 className="w-3 h-3" /> },
    building: { label: 'Building…', className: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30', icon: <Loader2 className="w-3 h-3 animate-spin" /> },
    done: { label: 'Done', className: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30', icon: <CheckCircle2 className="w-3 h-3" /> },
    error: { label: 'Error', className: 'bg-red-500/10 text-red-400 border-red-500/30', icon: <XCircle className="w-3 h-3" /> },
  };
  const c = config[status] ?? config.pending;
  return (
    <Badge variant="outline" className={`gap-1 text-[10px] px-2 py-0.5 ${c.className}`}>
      {c.icon}
      {c.label}
    </Badge>
  );
}

function PageCard({ page, onClick }: { page: UxPageState; onClick: () => void }) {
  return (
    <div
      className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3 space-y-2 cursor-pointer hover:border-zinc-700 transition-all group"
      onClick={onClick}
    >
      {/* Mockup thumbnail */}
      <div className="aspect-video bg-zinc-900 rounded-lg overflow-hidden relative flex items-center justify-center">
        {page.screenshotUrl ? (
          <img src={page.screenshotUrl} alt={page.pageTitle} className="w-full h-full object-cover" />
        ) : (
          <ImageIcon className="w-8 h-8 text-zinc-700" />
        )}
        {page.reviewIterations > 0 && (
          <div className="absolute bottom-1.5 right-1.5 bg-zinc-900/90 border border-zinc-700 rounded-full px-1.5 py-0.5 text-[9px] text-zinc-400">
            {page.reviewIterations} iter.{page.reviewScore ? ` · ${page.reviewScore}/10` : ''}
          </div>
        )}
        <div className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <Eye className="w-4 h-4 text-zinc-400" />
        </div>
      </div>

      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-zinc-200 leading-tight">{page.pageTitle}</p>
          <p className="text-[10px] text-zinc-500 mt-0.5">/{page.pageName}</p>
        </div>
        <PageStatusBadge status={page.status} />
      </div>

      {page.julesPrUrl && (
        <a
          href={page.julesPrUrl}
          target="_blank"
          rel="noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="flex items-center gap-1.5 text-[10px] text-indigo-400 hover:text-indigo-300 transition-colors"
        >
          <GitPullRequest className="w-3 h-3" />
          View PR
          <ExternalLink className="w-2.5 h-2.5" />
        </a>
      )}
    </div>
  );
}

function ActivityFeed({ logs }: { logs: { id: string; type: string; message: string; timestamp: string; pageName?: string }[] }) {
  const typeColor: Record<string, string> = {
    phase: 'text-indigo-400',
    page: 'text-violet-400',
    stitch: 'text-amber-400',
    jules: 'text-blue-400',
    error: 'text-red-400',
    system: 'text-zinc-400',
    info: 'text-zinc-300',
  };

  return (
    <ScrollArea className="h-48 w-full">
      <div className="space-y-1 p-1">
        {logs.length === 0 && (
          <p className="text-[11px] text-zinc-600 px-2 py-4 text-center">No activity yet…</p>
        )}
        {logs.map((log) => (
          <div key={log.id} className="flex gap-2 text-[11px] px-2 py-0.5">
            <span className="text-zinc-600 font-mono shrink-0">
              {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
            <span className={typeColor[log.type] ?? 'text-zinc-400'}>[{log.type}]</span>
            <span className="text-zinc-300">{log.message}</span>
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface UxWorkshopTabProps {
  projectId?: string;
  projectName?: string;
  repoOwner?: string;
  repoName?: string;
}

export function UxWorkshopTab({ projectId, projectName, repoOwner: initialRepoOwner = '', repoName: initialRepoName = '' }: UxWorkshopTabProps) {
  const [prompt, setPrompt] = useState('');
  const [repoOwner, setRepoOwner] = useState(initialRepoOwner);
  const [repoName, setRepoName] = useState(initialRepoName);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [previewPage, setPreviewPage] = useState<UxPageState | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const { phase, status, pages, activityLog, error, connected } = useUxRunStream(activeRunId);

  const startPipeline = useCallback(async () => {
    if (!prompt.trim() || !repoOwner.trim() || !repoName.trim()) {
      setFormError('Please fill in all fields.');
      return;
    }
    setFormError(null);
    setSubmitting(true);

    try {
      const res = await fetch('/api/ux/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, repoOwner, repoName, projectId, projectName }),
      });
      const data = (await res.json()) as { success: boolean; runId?: string; error?: string };
      if (!data.success || !data.runId) throw new Error(data.error ?? 'Failed to start run');
      setActiveRunId(data.runId);
    } catch (err: any) {
      setFormError(err.message);
    } finally {
      setSubmitting(false);
    }
  }, [prompt, repoOwner, repoName, projectId, projectName]);

  const isRunning = status === 'running';
  const isDone = status === 'done';
  const hasError = status === 'error';

  return (
    <div className="flex flex-col gap-6 p-6 max-w-5xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-zinc-100 flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-indigo-400" />
            UX Design Agent
          </h2>
          <p className="text-sm text-zinc-500 mt-0.5">
            From prompt → Stitch mockups → Astro/Shadcn pages — fully automated
          </p>
        </div>
        <a
          href="/docs/agents/ux-design-agent"
          className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
        >
          <BookOpen className="w-3.5 h-3.5" />
          Agent Docs
          <ExternalLink className="w-3 h-3" />
        </a>
      </div>

      {/* Launch Panel */}
      {!activeRunId && (
        <Card className="bg-zinc-900/50 border-zinc-800">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-zinc-300">
              Launch UX Pipeline {projectName ? `for ${projectName}` : ''}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form ref={formRef} onSubmit={(e) => { e.preventDefault(); startPipeline(); }} className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-xs text-zinc-400">UX Prompt</Label>
                <Textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="A dark-theme SaaS dashboard for a Cloudflare Workers monitoring tool with 3 pages: Overview, Logs, Settings"
                  className="h-28 resize-none bg-zinc-800/50 border-zinc-700 text-zinc-100 placeholder:text-zinc-600 text-sm"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs text-zinc-400">GitHub Owner</Label>
                  <Input
                    value={repoOwner}
                    onChange={(e) => setRepoOwner(e.target.value)}
                    placeholder="jmbish04"
                    className="bg-zinc-800/50 border-zinc-700 text-zinc-100 placeholder:text-zinc-600 text-sm h-9"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-zinc-400">GitHub Repo</Label>
                  <Input
                    value={repoName}
                    onChange={(e) => setRepoName(e.target.value)}
                    placeholder="core-github-api"
                    className="bg-zinc-800/50 border-zinc-700 text-zinc-100 placeholder:text-zinc-600 text-sm h-9"
                  />
                </div>
              </div>
              {formError && <p className="text-xs text-red-400">{formError}</p>}
              <Button
                type="submit"
                disabled={submitting}
                className="w-full bg-indigo-600 hover:bg-indigo-500 text-white gap-2"
              >
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                {submitting ? 'Starting…' : 'Run UX Pipeline'}
                <ArrowRight className="w-4 h-4 ml-auto" />
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Active Run UI */}
      {activeRunId && (
        <div className="space-y-5">
          {/* Status Bar */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${connected ? 'bg-emerald-500 animate-pulse' : 'bg-zinc-600'}`} />
              <span className="text-xs text-zinc-400">
                {connected ? `Run ${activeRunId.slice(0, 8)}… — streaming` : 'Connecting…'}
              </span>
            </div>
            {(isDone || hasError) && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-[10px] border-zinc-700 text-zinc-300"
                onClick={() => {
                  setActiveRunId(null);
                  setPrompt('');
                }}
              >
                Start New Run
              </Button>
            )}
          </div>

          {/* Phase Tracker */}
          <Card className="bg-zinc-900/50 border-zinc-800">
            <CardContent className="pt-5 pb-4">
              <PhaseTracker currentPhase={hasError ? 'error' : phase} />
              {hasError && error && (
                <p className="text-xs text-red-400 mt-3 flex items-center gap-1.5">
                  <XCircle className="w-3.5 h-3.5" />
                  {error}
                </p>
              )}
              {isDone && (
                <p className="text-xs text-emerald-400 mt-3 flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  All {pages.length} pages built and PRs created!
                </p>
              )}
            </CardContent>
          </Card>

          {/* Page Grid */}
          {pages.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-3">Pages ({pages.length})</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {pages.map((page) => (
                  <PageCard key={page.id} page={page} onClick={() => setPreviewPage(page)} />
                ))}
              </div>
            </div>
          )}

          {/* Live Activity Feed */}
          <Card className="bg-zinc-900/50 border-zinc-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-zinc-400 flex items-center gap-2">
                <div className={`w-1.5 h-1.5 rounded-full ${isRunning ? 'bg-indigo-500 animate-pulse' : 'bg-zinc-600'}`} />
                Live Activity
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Separator className="bg-zinc-800" />
              <ActivityFeed logs={activityLog} />
            </CardContent>
          </Card>
        </div>
      )}

      {/* Mockup Preview Dialog */}
      <Dialog open={!!previewPage} onOpenChange={(open) => !open && setPreviewPage(null)}>
        <DialogContent className="max-w-4xl h-[80vh] bg-zinc-950 border-zinc-800">
          <DialogHeader>
            <DialogTitle className="text-zinc-100 text-sm">
              {previewPage?.pageTitle} — Stitch Mockup
              {previewPage?.githubHtmlPath && (
                <a
                  href={`https://github.com/${repoOwner}/${repoName}/blob/main/${previewPage.githubHtmlPath}`}
                  target="_blank"
                  rel="noreferrer"
                  className="ml-3 text-[11px] text-indigo-400 hover:text-indigo-300 font-normal inline-flex items-center gap-1"
                >
                  View on GitHub <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </DialogTitle>
          </DialogHeader>
          <div className="flex gap-4 flex-1 min-h-0">
            {previewPage?.screenshotUrl && (
              <div className="w-1/2 rounded-lg overflow-hidden border border-zinc-800 bg-zinc-900">
                <img src={previewPage.screenshotUrl} alt="Screenshot" className="w-full h-full object-cover object-top" />
              </div>
            )}
            <div className="flex-1 rounded-lg overflow-hidden border border-zinc-800">
              <iframe
                src={`/api/ux/run/${activeRunId}/pages/${previewPage?.pageName}/preview`}
                className="w-full h-full bg-white"
                title={`${previewPage?.pageTitle} preview`}
                sandbox="allow-scripts"
              />
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
