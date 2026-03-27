/* eslint-disable react-hooks/set-state-in-effect */
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowLeft,
  Bot,
  Download,
  ExternalLink,
  Loader2,
  LockKeyhole,
  RefreshCcw,
  Sparkles,
  Workflow,
} from 'lucide-react';
import { toast } from 'sonner';
import { AuthEditor } from '@/components/reverse-engineering/AuthEditor';
import { ConsultantPanel } from '@/components/reverse-engineering/ConsultantPanel';
import {
  getReverseEngineeringSnapshot,
  getReverseEngineeringWebSocketUrl,
  resumeReverseEngineeringSnapshot,
  type ReverseEngineeringAuth,
  type ReverseEngineeringEvent,
} from '@/components/reverse-engineering/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';

type MonitorSnapshot = {
  requestId?: string;
  snapshotId?: string;
  status?: string;
  updatedAt?: string;
  latestMessage?: string;
  screenshotUrls?: string[];
  resolvedPreviewUrl?: string;
  recentEvents?: ReverseEngineeringEvent[];
};

function statusTone(status?: string) {
  switch (status) {
    case 'complete':
      return 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300';
    case 'running':
      return 'border-sky-500/40 bg-sky-500/10 text-sky-300';
    case 'awaiting_auth':
      return 'border-amber-500/40 bg-amber-500/10 text-amber-300';
    case 'failed':
      return 'border-rose-500/40 bg-rose-500/10 text-rose-300';
    default:
      return 'border-zinc-700 bg-zinc-800/80 text-zinc-300';
  }
}

function formatTimestamp(value?: string | null) {
  if (!value) return 'Unknown';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Unknown' : date.toLocaleString();
}

function JsonBlock({ value }: { value: unknown }) {
  return (
    <pre className="overflow-auto rounded-lg border border-zinc-800 bg-zinc-950/70 p-4 text-xs text-zinc-300">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

export default function ReverseEngineeringSnapshotPage() {
  const { snapshotId = '' } = useParams();
  const navigate = useNavigate();
  const [resumeAuth, setResumeAuth] = useState<ReverseEngineeringAuth | undefined>(undefined);
  const [resumeFrontendUrl, setResumeFrontendUrl] = useState('');
  const [liveSnapshot, setLiveSnapshot] = useState<MonitorSnapshot | null>(null);
  const [socketState, setSocketState] = useState<'connecting' | 'open' | 'closed'>('connecting');

  const snapshotQuery = useQuery({
    queryKey: ['reverse-engineering', 'snapshot', snapshotId],
    queryFn: () => getReverseEngineeringSnapshot(snapshotId),
    enabled: Boolean(snapshotId),
    refetchInterval: 7000,
  });

  useEffect(() => {
    if (!snapshotId) {
      return;
    }

    const ws = new WebSocket(getReverseEngineeringWebSocketUrl(snapshotId));
    setSocketState('connecting');

    ws.onopen = () => setSocketState('open');
    ws.onclose = () => setSocketState('closed');
    ws.onerror = () => setSocketState('closed');
    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.type === 'SNAPSHOT' && payload.snapshot) {
          setLiveSnapshot(payload.snapshot as MonitorSnapshot);
          return;
        }

        setLiveSnapshot((current) => {
          const nextEvents = [...(current?.recentEvents || []), payload].slice(-50);
          return {
            ...(current || {}),
            snapshotId,
            status: payload.status || current?.status,
            latestMessage: payload.message || current?.latestMessage,
            updatedAt: payload.ts || new Date().toISOString(),
            recentEvents: nextEvents,
          };
        });
      } catch {
        // Ignore malformed websocket frames.
      }
    };

    return () => ws.close();
  }, [snapshotId]);

  const resumeMutation = useMutation({
    mutationFn: () => {
      if (!resumeAuth) {
        throw new Error('Provide a frontend authentication method before resuming the snapshot.');
      }

      return resumeReverseEngineeringSnapshot(snapshotId, {
        auth: resumeAuth,
        frontendUrl: resumeFrontendUrl.trim() || undefined,
      });
    },
    onSuccess: () => {
      toast.success('Reverse-engineering snapshot resumed.');
      void snapshotQuery.refetch();
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to resume snapshot.');
    },
  });

  const snapshot = snapshotQuery.data;
  const effectiveStatus = liveSnapshot?.status || snapshot?.status;
  const mergedEvents = useMemo(() => {
    const dbEvents = snapshot?.events || [];
    const wsEvents = liveSnapshot?.recentEvents || [];
    const combined = [...wsEvents, ...dbEvents];
    const seen = new Set<string>();
    return combined.filter((event, index) => {
      const key = `${event.id || event.ts || event.createdAt || index}:${event.title || event.type || event.eventType}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [liveSnapshot?.recentEvents, snapshot?.events]);

  if (snapshotQuery.isLoading) {
    return (
      <div className="flex h-full items-center justify-center bg-zinc-950 text-zinc-300">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Loading reverse-engineering snapshot…
      </div>
    );
  }

  if (!snapshot) {
    return (
      <div className="flex h-full items-center justify-center bg-zinc-950 text-zinc-300">
        Snapshot not found.
      </div>
    );
  }

  const screenshotGallery = snapshot.ux?.screenshotGallery || [];
  const pageAnalyses = snapshot.ux?.pageAnalyses || [];
  const endpointInventory = snapshot.backend?.endpointInventory || [];

  return (
    <div className="h-full overflow-auto bg-zinc-950 text-zinc-50">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 md:px-6">
        <div className="flex flex-col gap-4 rounded-2xl border border-zinc-800 bg-zinc-950/70 p-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-3">
            <Button variant="ghost" size="sm" className="w-fit gap-2 px-0 text-zinc-400" onClick={() => navigate('/reverse-engineering')}>
              <ArrowLeft className="h-4 w-4" />
              Back to snapshots
            </Button>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-3xl font-semibold tracking-tight">
                {snapshot.githubOwner}/{snapshot.githubRepo}
              </h1>
              <Badge className={cn('border', statusTone(effectiveStatus))}>{effectiveStatus}</Badge>
              <Badge variant="outline" className="border-zinc-700 text-zinc-300">
                {snapshot.branch}
              </Badge>
            </div>
            <p className="max-w-3xl text-sm text-zinc-400">
              Snapshot {snapshot.id} · created {formatTimestamp(snapshot.createdAt)} · updated{' '}
              {formatTimestamp(liveSnapshot?.updatedAt || snapshot.updatedAt)}
            </p>
            <div className="flex flex-wrap gap-2">
              {snapshot.resolvedPreviewUrl && (
                <Button asChild variant="outline" size="sm" className="gap-2 border-zinc-700">
                  <a href={snapshot.resolvedPreviewUrl} target="_blank" rel="noreferrer">
                    <ExternalLink className="h-4 w-4" />
                    Open preview
                  </a>
                </Button>
              )}
              <Button asChild variant="outline" size="sm" className="gap-2 border-zinc-700">
                <a href={`/api/reverse-engineering/snapshots/${snapshot.id}/plan`} target="_blank" rel="noreferrer">
                  <Sparkles className="h-4 w-4" />
                  View PRD
                </a>
              </Button>
              <Button asChild variant="outline" size="sm" className="gap-2 border-zinc-700">
                <a href={`/api/reverse-engineering/snapshots/${snapshot.id}/download`} target="_blank" rel="noreferrer">
                  <Download className="h-4 w-4" />
                  Download markdown
                </a>
              </Button>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <Card className="border-zinc-800 bg-zinc-900/50">
              <CardHeader className="pb-2">
                <CardDescription>WebSocket</CardDescription>
                <CardTitle className="text-base capitalize">{socketState}</CardTitle>
              </CardHeader>
            </Card>
            <Card className="border-zinc-800 bg-zinc-900/50">
              <CardHeader className="pb-2">
                <CardDescription>Epics</CardDescription>
                <CardTitle className="text-base">{snapshot.epics?.length || 0}</CardTitle>
              </CardHeader>
            </Card>
            <Card className="border-zinc-800 bg-zinc-900/50">
              <CardHeader className="pb-2">
                <CardDescription>Pages analyzed</CardDescription>
                <CardTitle className="text-base">{pageAnalyses.length}</CardTitle>
              </CardHeader>
            </Card>
          </div>
        </div>

        {effectiveStatus === 'awaiting_auth' && (
          <Card className="border-amber-500/30 bg-amber-500/10">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg text-amber-100">
                <LockKeyhole className="h-4 w-4" />
                Frontend authentication required
              </CardTitle>
              <CardDescription className="text-amber-200/80">
                The orchestrator found frontend authentication requirements in the repo before screenshot capture. Provide
                the auth method below and resume the snapshot.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg border border-amber-500/20 bg-zinc-950/50 p-4 text-sm text-zinc-200">
                {snapshot.frontendAuth ? (
                  <JsonBlock value={snapshot.frontendAuth} />
                ) : (
                  'No auth metadata was captured.'
                )}
              </div>
              <div className="space-y-2">
                <Label>Optional frontend URL override</Label>
                <Input
                  value={resumeFrontendUrl}
                  onChange={(event) => setResumeFrontendUrl(event.target.value)}
                  placeholder="https://app.example.com"
                />
              </div>
              <AuthEditor value={resumeAuth} onChange={setResumeAuth} />
              <div className="flex justify-end">
                <Button
                  className="gap-2"
                  onClick={() => resumeMutation.mutate()}
                  disabled={resumeMutation.isPending || !resumeAuth}
                >
                  {resumeMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
                  Resume snapshot
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-6">
            <Tabs defaultValue="overview" className="space-y-4">
              <TabsList className="grid w-full grid-cols-5">
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="prd">PRD</TabsTrigger>
                <TabsTrigger value="ux">UX</TabsTrigger>
                <TabsTrigger value="backend">Backend</TabsTrigger>
                <TabsTrigger value="journeys">Journeys</TabsTrigger>
              </TabsList>

              <TabsContent value="overview">
                <Card className="border-zinc-800 bg-zinc-950/70">
                  <CardHeader>
                    <CardTitle>Live execution timeline</CardTitle>
                    <CardDescription>
                      Request-local monitor updates from the Durable Object combined with persisted D1 events.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {mergedEvents.map((event, index) => (
                        <div key={`${event.id || event.ts || index}`} className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-3">
                          <div className="mb-1 flex items-center justify-between gap-3">
                            <div className="font-medium text-zinc-100">
                              {event.title || event.type || event.eventType || 'Event'}
                            </div>
                            <div className="text-[11px] text-zinc-500">
                              {formatTimestamp(event.createdAt || event.ts || undefined)}
                            </div>
                          </div>
                          <div className="text-sm text-zinc-400">{event.message || 'No message recorded.'}</div>
                        </div>
                      ))}
                      {mergedEvents.length === 0 && (
                        <div className="rounded-lg border border-dashed border-zinc-700 p-4 text-sm text-zinc-500">
                          No events recorded yet.
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="prd">
                <Card className="border-zinc-800 bg-zinc-950/70">
                  <CardHeader>
                    <CardTitle>Overall PRD</CardTitle>
                    <CardDescription>Canonical markdown synthesis from the final Jules stage.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <pre className="overflow-auto rounded-lg border border-zinc-800 bg-zinc-950/80 p-4 text-sm text-zinc-200">
                      {snapshot.prdMarkdown || 'PRD markdown is not available yet.'}
                    </pre>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="ux">
                <div className="space-y-6">
                  <Card className="border-zinc-800 bg-zinc-950/70">
                    <CardHeader>
                      <CardTitle>Screenshot gallery</CardTitle>
                      <CardDescription>Browser Rendering captures and synthesized route-level analysis.</CardDescription>
                    </CardHeader>
                    <CardContent className="grid gap-4 md:grid-cols-2">
                      {screenshotGallery.map((entry) => (
                        <Card key={`${entry.route}:${entry.resolvedUrl}`} className="border-zinc-800 bg-zinc-900/40">
                          <CardHeader className="pb-3">
                            <CardTitle className="text-base">{entry.route}</CardTitle>
                            <CardDescription>{entry.resolvedUrl}</CardDescription>
                          </CardHeader>
                          <CardContent className="space-y-3">
                            {entry.screenshotUrls?.[0] ? (
                              <img
                                src={entry.screenshotUrls[0]}
                                alt={`Screenshot for ${entry.route}`}
                                className="w-full rounded-lg border border-zinc-800 object-cover"
                              />
                            ) : (
                              <div className="rounded-lg border border-dashed border-zinc-700 p-6 text-sm text-zinc-500">
                                No screenshot image URL stored.
                              </div>
                            )}
                            <div className="text-sm text-zinc-400">{entry.visionDescription || 'No vision summary stored.'}</div>
                          </CardContent>
                        </Card>
                      ))}
                      {screenshotGallery.length === 0 && (
                        <div className="rounded-lg border border-dashed border-zinc-700 p-6 text-sm text-zinc-500">
                          No screenshot gallery has been generated yet.
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  <Card className="border-zinc-800 bg-zinc-950/70">
                    <CardHeader>
                      <CardTitle>Page analyses</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {pageAnalyses.map((analysis) => (
                        <div key={`${analysis.route}:${analysis.filePath || ''}`} className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
                          <div className="mb-2 flex items-center justify-between gap-3">
                            <div>
                              <div className="text-base font-medium text-zinc-100">{analysis.route}</div>
                              <div className="text-xs text-zinc-500">{analysis.filePath || 'No source file recorded'}</div>
                            </div>
                          </div>
                          <p className="text-sm text-zinc-300">{analysis.description || 'No description stored.'}</p>
                          {analysis.perceivedFunctionality?.length ? (
                            <div className="mt-3 flex flex-wrap gap-2">
                              {analysis.perceivedFunctionality.map((item) => (
                                <Badge key={item} variant="outline" className="border-zinc-700 text-zinc-300">
                                  {item}
                                </Badge>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              <TabsContent value="backend">
                <div className="space-y-6">
                  <Card className="border-zinc-800 bg-zinc-950/70">
                    <CardHeader>
                      <CardTitle>Architecture markdown</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <pre className="overflow-auto rounded-lg border border-zinc-800 bg-zinc-950/80 p-4 text-sm text-zinc-200">
                        {snapshot.backend?.architectureMarkdown || 'No backend architecture markdown available yet.'}
                      </pre>
                    </CardContent>
                  </Card>
                  <Card className="border-zinc-800 bg-zinc-950/70">
                    <CardHeader>
                      <CardTitle>Endpoint inventory</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {endpointInventory.map((endpoint) => (
                        <div
                          key={`${endpoint.method}:${endpoint.path}:${endpoint.filePath}`}
                          className="flex items-start justify-between rounded-lg border border-zinc-800 bg-zinc-900/40 px-3 py-2"
                        >
                          <div>
                            <div className="font-mono text-sm text-zinc-100">
                              {endpoint.method} {endpoint.path}
                            </div>
                            <div className="text-xs text-zinc-500">{endpoint.filePath}</div>
                          </div>
                        </div>
                      ))}
                      {endpointInventory.length === 0 && (
                        <div className="rounded-lg border border-dashed border-zinc-700 p-4 text-sm text-zinc-500">
                          No endpoint inventory stored.
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              <TabsContent value="journeys">
                <div className="grid gap-4 md:grid-cols-2">
                  <Card className="border-zinc-800 bg-zinc-950/70">
                    <CardHeader>
                      <CardTitle>Epics</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {snapshot.epics?.map((epic) => (
                        <div key={epic.title} className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
                          <div className="font-medium text-zinc-100">{epic.title}</div>
                          <p className="mt-1 text-sm text-zinc-400">{epic.description}</p>
                          <Separator className="my-3 bg-zinc-800" />
                          <div className="space-y-2">
                            {epic.userStories?.map((story) => (
                              <div key={story.title} className="rounded-md border border-zinc-800 bg-zinc-950/70 p-3">
                                <div className="text-sm font-medium text-zinc-200">{story.title}</div>
                                <div className="text-sm text-zinc-400">{story.description}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </CardContent>
                  </Card>

                  <Card className="border-zinc-800 bg-zinc-950/70">
                    <CardHeader>
                      <CardTitle>User journeys</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {snapshot.userJourneys?.map((journey) => (
                        <div key={journey.name} className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
                          <div className="flex items-center gap-2">
                            <Workflow className="h-4 w-4 text-cyan-400" />
                            <div className="font-medium text-zinc-100">{journey.name}</div>
                          </div>
                          <div className="mt-1 text-sm text-zinc-400">Actor: {journey.actor}</div>
                          <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-zinc-300">
                            {journey.steps?.map((step) => <li key={step}>{step}</li>)}
                          </ol>
                          {journey.outcome ? (
                            <div className="mt-3 rounded-md border border-zinc-800 bg-zinc-950/70 p-3 text-sm text-zinc-300">
                              Outcome: {journey.outcome}
                            </div>
                          ) : null}
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>
            </Tabs>
          </div>

          <div className="space-y-6">
            <Card className="border-zinc-800 bg-zinc-950/70">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Bot className="h-4 w-4 text-cyan-400" />
                  Snapshot summary
                </CardTitle>
                <CardDescription>Current repository, auth, preview, and orchestration metadata.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 text-sm">
                <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3">
                  <div className="font-medium text-zinc-100">Repository URL</div>
                  <div className="mt-1 break-all text-zinc-400">{snapshot.repoUrl}</div>
                </div>
                <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3">
                  <div className="font-medium text-zinc-100">Resolved preview URL</div>
                  <div className="mt-1 break-all text-zinc-400">{snapshot.resolvedPreviewUrl || 'Not resolved'}</div>
                </div>
                {snapshot.errorMessage && (
                  <div className="rounded-lg border border-rose-500/20 bg-rose-500/10 p-3 text-rose-200">
                    <AlertTriangle className="mr-2 inline-block h-4 w-4" />
                    {snapshot.errorMessage}
                  </div>
                )}
                {snapshot.detectedStack && <JsonBlock value={snapshot.detectedStack} />}
              </CardContent>
            </Card>

            <ConsultantPanel snapshotId={snapshot.id} />

            <Card className="border-zinc-800 bg-zinc-950/70">
              <CardHeader>
                <CardTitle>Need a fresh run?</CardTitle>
                <CardDescription>Create another snapshot from the queue page for a different branch or auth method.</CardDescription>
              </CardHeader>
              <CardContent>
                <Button asChild variant="outline" className="w-full border-zinc-700">
                  <Link to="/reverse-engineering">Open reverse-engineering queue</Link>
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
