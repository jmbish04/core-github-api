/* eslint-disable react-hooks/set-state-in-effect */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  Activity,
  Loader2,
  LockKeyhole,
  PlayCircle,
  Search,
  Sparkles,
  Telescope,
} from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AuthEditor } from '@/components/reverse-engineering/AuthEditor';
import {
  createReverseEngineeringSnapshot,
  listReverseEngineeringEvents,
  listReverseEngineeringSnapshots,
  type ReverseEngineeringAuth,
  type ReverseEngineeringListItem,
  type ReverseEngineeringStatus,
} from '@/components/reverse-engineering/api';
import { cn } from '@/lib/utils';

function statusTone(status: ReverseEngineeringStatus) {
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

function extractStackSummary(snapshot: ReverseEngineeringListItem) {
  const frameworks = Array.isArray(snapshot.detectedStack?.frameworks)
    ? (snapshot.detectedStack?.frameworks as string[])
    : [];
  return frameworks.slice(0, 4);
}

export default function ReverseEngineeringPage() {
  const navigate = useNavigate();
  const { owner, repo, username, repo_name } = useParams();
  const [searchParams] = useSearchParams();
  const inferredRepo = owner && repo ? `${owner}/${repo}` : username && repo_name ? `${username}/${repo_name}` : '';
  const [repoInput, setRepoInput] = useState(searchParams.get('repo') || inferredRepo);
  const [branch, setBranch] = useState('main');
  const [frontendUrl, setFrontendUrl] = useState('');
  const [title, setTitle] = useState('');
  const [useSandboxPreview, setUseSandboxPreview] = useState(true);
  const [authEnabled, setAuthEnabled] = useState(false);
  const [auth, setAuth] = useState<ReverseEngineeringAuth | undefined>(undefined);
  const [search, setSearch] = useState(searchParams.get('repo') || '');
  const [selectedSnapshotId, setSelectedSnapshotId] = useState<string | null>(null);

  const snapshotsQuery = useQuery({
    queryKey: ['reverse-engineering', 'snapshots', search],
    queryFn: () => listReverseEngineeringSnapshots({ q: search || undefined, limit: 50 }),
    refetchInterval: 10_000,
  });

  useEffect(() => {
    if (!repoInput && inferredRepo) {
      setRepoInput(inferredRepo);
      setSearch(inferredRepo);
    }
  }, [inferredRepo, repoInput]);

  useEffect(() => {
    if (!selectedSnapshotId && snapshotsQuery.data?.[0]?.id) {
      setSelectedSnapshotId(snapshotsQuery.data[0].id);
    }
  }, [selectedSnapshotId, snapshotsQuery.data]);

  const selectedSnapshot = useMemo(
    () => snapshotsQuery.data?.find((entry) => entry.id === selectedSnapshotId) || snapshotsQuery.data?.[0] || null,
    [selectedSnapshotId, snapshotsQuery.data],
  );

  const eventsQuery = useQuery({
    queryKey: ['reverse-engineering', 'events', selectedSnapshot?.id],
    queryFn: () => listReverseEngineeringEvents(selectedSnapshot!.id),
    enabled: Boolean(selectedSnapshot?.id),
    refetchInterval: 5000,
  });

  const analyzeMutation = useMutation({
    mutationFn: async () => {
      return createReverseEngineeringSnapshot({
        repoInput: repoInput.trim(),
        branch,
        frontendUrl: frontendUrl.trim() || undefined,
        auth: authEnabled ? auth : undefined,
        useSandboxPreview,
        title: title.trim() || undefined,
      });
    },
    onSuccess: ({ snapshotId }) => {
      toast.success('Reverse-engineering snapshot queued.');
      navigate(`/reverse-engineering/${snapshotId}`);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to queue reverse-engineering snapshot.');
    },
  });

  const stats = useMemo(() => {
    const snapshots = snapshotsQuery.data || [];
    return {
      total: snapshots.length,
      running: snapshots.filter((entry) => entry.status === 'running').length,
      awaitingAuth: snapshots.filter((entry) => entry.status === 'awaiting_auth').length,
      complete: snapshots.filter((entry) => entry.status === 'complete').length,
    };
  }, [snapshotsQuery.data]);

  return (
    <div className="h-full overflow-auto bg-zinc-950 text-zinc-50">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 md:px-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-[0.22em] text-cyan-400">
              <Telescope className="h-3.5 w-3.5" />
              Reverse Engineering
            </div>
            <h1 className="text-3xl font-semibold tracking-tight">Repository reverse-engineering control center</h1>
            <p className="mt-2 max-w-3xl text-sm text-zinc-400">
              Launch a staged repository analysis, resolve frontend auth before screenshots, and inspect the resulting
              PRD, epics, journeys, UX evidence, and backend architecture from one place.
            </p>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Card className="border-zinc-800 bg-zinc-950/70">
            <CardHeader className="pb-3">
              <CardDescription>Total snapshots</CardDescription>
              <CardTitle className="text-3xl">{stats.total}</CardTitle>
            </CardHeader>
          </Card>
          <Card className="border-zinc-800 bg-zinc-950/70">
            <CardHeader className="pb-3">
              <CardDescription>Running now</CardDescription>
              <CardTitle className="text-3xl text-sky-300">{stats.running}</CardTitle>
            </CardHeader>
          </Card>
          <Card className="border-zinc-800 bg-zinc-950/70">
            <CardHeader className="pb-3">
              <CardDescription>Awaiting auth</CardDescription>
              <CardTitle className="text-3xl text-amber-300">{stats.awaitingAuth}</CardTitle>
            </CardHeader>
          </Card>
          <Card className="border-zinc-800 bg-zinc-950/70">
            <CardHeader className="pb-3">
              <CardDescription>Completed</CardDescription>
              <CardTitle className="text-3xl text-emerald-300">{stats.complete}</CardTitle>
            </CardHeader>
          </Card>
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.4fr_0.9fr]">
          <Card className="border-zinc-800 bg-zinc-950/70">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Sparkles className="h-4 w-4 text-cyan-400" />
                Analyze repository
              </CardTitle>
              <CardDescription>
                The orchestrator will research the repo, detect frontend auth, resolve a preview URL, capture
                screenshots through Browser Rendering, run parallel Jules analysis, then synthesize the PRD and journeys.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2 md:col-span-2">
                  <Label>GitHub repo URL or owner/repo</Label>
                  <Input
                    value={repoInput}
                    onChange={(event) => setRepoInput(event.target.value)}
                    placeholder="https://github.com/owner/repo or owner/repo"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Branch</Label>
                  <Input value={branch} onChange={(event) => setBranch(event.target.value)} placeholder="main" />
                </div>
                <div className="space-y-2">
                  <Label>Optional analysis title</Label>
                  <Input
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    placeholder="Frontend modernization audit"
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>Optional deployed frontend URL</Label>
                  <Input
                    value={frontendUrl}
                    onChange={(event) => setFrontendUrl(event.target.value)}
                    placeholder="https://app.example.com"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900/40 p-3">
                <div>
                  <div className="text-sm font-medium">Allow sandbox preview fallback</div>
                  <div className="text-xs text-zinc-400">
                    If no Worker custom domain or user URL is available, use sandbox preview on
                    core-github-api.hacolby.workers.dev.
                  </div>
                </div>
                <Switch checked={useSandboxPreview} onCheckedChange={setUseSandboxPreview} />
              </div>

              <div className="space-y-3 rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <LockKeyhole className="h-4 w-4 text-amber-300" />
                      Frontend auth override
                    </div>
                    <p className="text-xs text-zinc-400">
                      Optional. If the frontend requires auth for screenshots, provide it here instead of waiting for the
                      orchestrator to pause.
                    </p>
                  </div>
                  <Switch checked={authEnabled} onCheckedChange={setAuthEnabled} />
                </div>
                {authEnabled && <AuthEditor value={auth} onChange={setAuth} />}
              </div>

              <div className="flex items-center justify-end">
                <Button
                  className="gap-2"
                  onClick={() => analyzeMutation.mutate()}
                  disabled={analyzeMutation.isPending || !repoInput.trim()}
                >
                  {analyzeMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <PlayCircle className="h-4 w-4" />
                  )}
                  Start analysis
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="border-zinc-800 bg-zinc-950/70">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Activity className="h-4 w-4 text-cyan-400" />
                Activity rail
              </CardTitle>
              <CardDescription>
                Live event stream for the currently selected snapshot from the monitor Durable Object + D1 event log.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[28rem] pr-4">
                <div className="space-y-3">
                  {!selectedSnapshot && (
                    <div className="rounded-lg border border-dashed border-zinc-700 p-4 text-sm text-zinc-400">
                      Select a snapshot from the table to inspect its event stream.
                    </div>
                  )}
                  {eventsQuery.data?.map((event, index) => (
                    <div key={`${event.id || event.ts || index}`} className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-3">
                      <div className="mb-1 flex items-center justify-between gap-3">
                        <div className="text-sm font-medium text-zinc-200">{event.title || event.type || event.eventType}</div>
                        <div className="text-[11px] text-zinc-500">
                          {formatTimestamp(event.createdAt || event.ts || undefined)}
                        </div>
                      </div>
                      <div className="text-sm text-zinc-400">{event.message || 'No detail provided.'}</div>
                    </div>
                  ))}
                  {eventsQuery.isLoading && (
                    <div className="text-sm text-zinc-400">
                      <Loader2 className="mr-2 inline-block h-4 w-4 animate-spin" />
                      Loading events…
                    </div>
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </div>

        <Card className="border-zinc-800 bg-zinc-950/70">
          <CardHeader>
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <CardTitle className="text-lg">Snapshot queue</CardTitle>
                <CardDescription>Search and inspect reverse-engineering runs across repositories and projects.</CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Search className="h-4 w-4 text-zinc-500" />
                <Input
                  className="w-72"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search repo, owner, or title"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-zinc-800">
                    <TableHead>Repository</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Stack</TableHead>
                    <TableHead>Updated</TableHead>
                    <TableHead>Preview</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {snapshotsQuery.data?.map((snapshot) => (
                    <TableRow
                      key={snapshot.id}
                      className={cn(
                        'cursor-pointer border-zinc-800',
                        snapshot.id === selectedSnapshotId && 'bg-zinc-900/60',
                      )}
                      onClick={() => {
                        setSelectedSnapshotId(snapshot.id);
                        navigate(`/reverse-engineering/${snapshot.id}`);
                      }}
                    >
                      <TableCell className="align-top">
                        <div className="font-medium text-zinc-100">
                          {snapshot.githubOwner}/{snapshot.githubRepo}
                        </div>
                        <div className="text-xs text-zinc-500">{snapshot.title || snapshot.repoUrl}</div>
                      </TableCell>
                      <TableCell className="align-top">
                        <Badge className={cn('border', statusTone(snapshot.status))}>{snapshot.status}</Badge>
                      </TableCell>
                      <TableCell className="align-top">
                        <div className="flex flex-wrap gap-1">
                          {extractStackSummary(snapshot).map((framework) => (
                            <Badge key={framework} variant="outline" className="border-zinc-700 text-zinc-300">
                              {framework}
                            </Badge>
                          ))}
                          {extractStackSummary(snapshot).length === 0 && (
                            <span className="text-xs text-zinc-500">No stack metadata yet</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="align-top text-sm text-zinc-400">
                        {formatTimestamp(snapshot.updatedAt)}
                      </TableCell>
                      <TableCell className="align-top text-sm text-zinc-400">
                        {snapshot.resolvedPreviewUrl ? (
                          <a
                            href={snapshot.resolvedPreviewUrl}
                            className="text-cyan-300 underline underline-offset-4"
                            target="_blank"
                            rel="noreferrer"
                            onClick={(event) => event.stopPropagation()}
                          >
                            Open preview
                          </a>
                        ) : (
                          'Not resolved'
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {!snapshotsQuery.isLoading && (snapshotsQuery.data?.length || 0) === 0 && (
                    <TableRow className="border-zinc-800">
                      <TableCell colSpan={5} className="py-12 text-center text-sm text-zinc-500">
                        No snapshots found.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
            {snapshotsQuery.isLoading && (
              <div className="mt-4 text-sm text-zinc-400">
                <Loader2 className="mr-2 inline-block h-4 w-4 animate-spin" />
                Loading snapshots…
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
