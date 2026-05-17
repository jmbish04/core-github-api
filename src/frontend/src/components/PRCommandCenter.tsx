import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { GitPullRequest, Loader2, MessageSquare, Sparkles, ExternalLink, FileCode, ArrowLeft, Bot } from 'lucide-react';
import { PrCommentExtractor } from '@/components/tools/PrCommentExtractor';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface PR {
    number: number;
    title: string;
    state: string;
    draft: boolean;
    author: string;
    url: string;
    updatedAt: string;
}

interface PRReviewStatus {
    status: 'pending_review' | 'review_started' | 'review_provided' | 'comments_fixed';
    commentCount: number;
    reviewCount: number;
}

interface PROverview {
    pr: {
        number: number;
        title: string;
        state: string;
        draft: boolean;
        author: string;
        authorAvatar: string;
        description: string;
        headRef: string;
        baseRef: string;
        changedFiles: number;
        additions: number;
        deletions: number;
        merged: boolean;
        createdAt: string;
        updatedAt: string;
    };
    aiSummary: string;
    comments: Array<{
        id: number;
        author: string;
        avatar: string;
        body: string;
        createdAt: string;
        htmlUrl: string;
    }>;
}

interface PRCommandCenterProps {
    repoOwner: string;
    repoName: string;
    initialPrs: PR[];
}

const STATUS_LABELS: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
    pending_review: { label: 'Pending Review', variant: 'outline' },
    review_started: { label: 'Review Started', variant: 'secondary' },
    review_provided: { label: 'Review Provided', variant: 'default' },
    comments_fixed: { label: 'Comments Fixed', variant: 'default' },
};

const AGENT_BADGE_COLORS: Record<string, string> = {
    copilot: 'text-green-400 border-green-900 bg-green-950/20',
    claude: 'text-amber-400 border-amber-900 bg-amber-950/20',
    jules: 'text-blue-400 border-blue-900 bg-blue-950/20',
    codex: 'text-violet-400 border-violet-900 bg-violet-950/20',
    devin: 'text-teal-400 border-teal-900 bg-teal-950/20',
    detected: 'text-cyan-400 border-cyan-900 bg-cyan-950/20',
    unknown: 'text-zinc-400 border-zinc-700 bg-zinc-900/20',
};

function getAgentBadgeClasses(agent: string): string {
    return AGENT_BADGE_COLORS[agent] || AGENT_BADGE_COLORS.unknown;
}

export function PRCommandCenter({ repoOwner, repoName, initialPrs }: PRCommandCenterProps) {
    const [selectedPrNumber, setSelectedPrNumber] = useState<number | null>(() => {
        const match = window.location.pathname.match(/\/pr-command\/(\d+)/);
        return match ? parseInt(match[1], 10) : null;
    });
    const [activeTab, setActiveTab] = useState('overview');
    const [reviewStatuses, setReviewStatuses] = useState<Record<number, PRReviewStatus>>({});
    const [overview, setOverview] = useState<PROverview | null>(null);
    const [loadingOverview, setLoadingOverview] = useState(false);
    const [assignedAgent, setAssignedAgent] = useState<{ agent: string; tag: string } | null>(null);

    // Sync URL when selected PR changes
    useEffect(() => {
        const basePath = `/project/${repoOwner}/${repoName}/pr-command`;
        if (selectedPrNumber) {
            window.history.pushState({}, '', `${basePath}/${selectedPrNumber}`);
        } else {
            window.history.pushState({}, '', basePath);
        }
    }, [selectedPrNumber, repoOwner, repoName]);

    // Fetch review statuses for all PRs on mount
    useEffect(() => {
        const fetchStatuses = async () => {
            const statusMap: Record<number, PRReviewStatus> = {};
            await Promise.all(
                initialPrs.map(async (pr) => {
                    try {
                        const res = await fetch(`/api/pr/${repoOwner}/${repoName}/${pr.number}/review-status`, { credentials: 'include' });
                        if (res.ok) {
                            const data = ((await res.json()) as any) as any;
                            statusMap[pr.number] = {
                                status: data.status,
                                commentCount: data.commentCount,
                                reviewCount: data.reviewCount,
                            };
                        }
                    } catch {
                        statusMap[pr.number] = { status: 'pending_review', commentCount: 0, reviewCount: 0 };
                    }
                })
            );
            setReviewStatuses(statusMap);
        };
        if (initialPrs.length > 0) fetchStatuses();
    }, [initialPrs, repoOwner, repoName]);

    // Fetch overview and assigned agent when a PR is selected
    useEffect(() => {
        if (!selectedPrNumber) return;
        let cancelled = false;

        const fetchOverview = async () => {
            setLoadingOverview(true);
            setOverview(null);
            try {
                const res = await fetch(`/api/pr/${repoOwner}/${repoName}/${selectedPrNumber}/overview`, { credentials: 'include' });
                if (!res.ok) throw new Error('Failed to fetch overview');
                const data = await res.json();
                if (!cancelled) setOverview(data as any);
            } catch (err) {
                console.error('[PRCommandCenter] Overview fetch failed:', err);
            } finally {
                if (!cancelled) setLoadingOverview(false);
            }
        };

        const fetchAgent = async () => {
            setAssignedAgent(null);
            try {
                const res = await fetch(`/api/pr/${repoOwner}/${repoName}/${selectedPrNumber}/assigned-agent`, { credentials: 'include' });
                if (res.ok) {
                    const data = await res.json() as { agent: string; tag: string };
                    if (!cancelled) setAssignedAgent(data);
                }
            } catch (err) {
                console.error('[PRCommandCenter] Agent detection failed:', err);
            }
        };

        void fetchOverview();
        void fetchAgent();
        return () => { cancelled = true; };
    }, [selectedPrNumber, repoOwner, repoName]);

    // PR List View
    if (!selectedPrNumber) {
        return (
            <div className="h-[calc(100vh-100px)] flex flex-col gap-4">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <h2 className="text-2xl font-bold flex items-center gap-2">
                        <GitPullRequest className="w-6 h-6 text-purple-400" />
                        PR Command Center
                    </h2>
                    <Badge variant="outline" className="text-muted-foreground">
                        {repoOwner}/{repoName}
                    </Badge>
                </div>

                {initialPrs.length === 0 ? (
                    <div className="h-64 flex flex-col items-center justify-center text-muted-foreground border border-dashed rounded-lg bg-zinc-950/30">
                        <GitPullRequest className="w-8 h-8 mb-4 opacity-50" />
                        <p>No open pull requests found.</p>
                    </div>
                ) : (
                    <div className="border rounded-lg overflow-x-auto">
                        <div className="bg-muted/30 px-4 py-2.5 border-b text-xs font-medium text-muted-foreground grid grid-cols-12 min-w-[800px] items-center gap-3">
                            <div className="col-span-1">#</div>
                            <div className="col-span-5">Title</div>
                            <div className="col-span-2">Author</div>
                            <div className="col-span-2">Status</div>
                            <div className="col-span-1">Comments</div>
                            <div className="col-span-1">Updated</div>
                        </div>
                        <ScrollArea className="max-h-[600px]">
                            {initialPrs.map(pr => {
                                const status = reviewStatuses[pr.number];
                                const statusInfo = STATUS_LABELS[status?.status || 'pending_review'];
                                return (
                                    <div
                                        key={pr.number}
                                        onClick={() => setSelectedPrNumber(pr.number)}
                                        className="px-4 py-3 border-b hover:bg-muted/20 cursor-pointer transition-colors grid grid-cols-12 min-w-[800px] items-center gap-3"
                                    >
                                        <div className="col-span-1 font-mono text-sm text-muted-foreground">
                                            #{pr.number}
                                        </div>
                                        <div className="col-span-5 flex items-center gap-2">
                                            <span className="font-medium text-sm truncate">{pr.title}</span>
                                            {pr.draft && <Badge variant="secondary" className="text-xs">Draft</Badge>}
                                        </div>
                                        <div className="col-span-2 text-sm text-muted-foreground truncate">
                                            {pr.author}
                                        </div>
                                        <div className="col-span-2">
                                            <Badge variant={statusInfo.variant} className="text-xs whitespace-nowrap">
                                                {statusInfo.label}
                                            </Badge>
                                        </div>
                                        <div className="col-span-1 text-sm text-muted-foreground">
                                            <div className="flex items-center gap-1">
                                                <MessageSquare className="w-3.5 h-3.5" />
                                                {status?.commentCount ?? '—'}
                                            </div>
                                        </div>
                                        <div className="col-span-1 text-xs text-muted-foreground">
                                            {new Date(pr.updatedAt).toLocaleDateString()}
                                        </div>
                                    </div>
                                );
                            })}
                        </ScrollArea>
                    </div>
                )}
            </div>
        );
    }

    // PR Detail View
    const selectedPr = initialPrs.find(pr => pr.number === selectedPrNumber);

    return (
        <div className="h-[calc(100vh-100px)] flex flex-col gap-4">
            <div className="flex flex-col xl:flex-row items-start xl:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <Button variant="ghost" size="icon" onClick={() => setSelectedPrNumber(null)} aria-label="Back to PR list" title="Back to PR list">
                        <ArrowLeft className="w-4 h-4" />
                    </Button>
                    <div>
                        <h2 className="text-2xl font-bold flex items-center gap-2">
                            <GitPullRequest className="w-6 h-6 text-purple-400" />
                            #{selectedPrNumber}: {selectedPr?.title || 'Loading...'}
                        </h2>
                        <p className="text-sm text-muted-foreground mt-0.5">
                            {selectedPr?.author} · Last updated: {selectedPr?.updatedAt ? new Date(selectedPr.updatedAt).toLocaleDateString() : '—'}
                        </p>
                    </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    {selectedPr && (
                        <>
                            <Badge variant="outline" className="text-emerald-400 border-emerald-900 bg-emerald-950/20">
                                {selectedPr.state}
                            </Badge>
                            {selectedPr.draft && <Badge variant="secondary">Draft</Badge>}
                            {assignedAgent && assignedAgent.agent !== 'unassigned' && (
                                <Badge variant="outline" className={getAgentBadgeClasses(assignedAgent.agent)}>
                                    <Bot className="w-3 h-3 mr-1" />
                                    {assignedAgent.tag}
                                </Badge>
                            )}
                            <Button 
                                variant="secondary" 
                                size="sm" 
                                onClick={() => setActiveTab('comments')}
                                className="bg-primary/20 text-primary hover:bg-primary/30"
                            >
                                <MessageSquare className="w-3.5 h-3.5 mr-1" /> Extract Comments
                            </Button>
                            <Button variant="outline" size="sm" asChild>
                                <a href={selectedPr.url} target="_blank" rel="noreferrer">
                                    <ExternalLink className="w-3.5 h-3.5 mr-1" /> GitHub
                                </a>
                            </Button>
                        </>
                    )}
                </div>
            </div>

            <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
                <TabsList className="bg-zinc-900 border border-zinc-800 w-full justify-start overflow-x-auto h-auto flex-wrap">
                    <TabsTrigger value="overview">
                        <Sparkles className="w-3.5 h-3.5 mr-1.5" /> Overview
                    </TabsTrigger>
                    <TabsTrigger value="comments">
                        <MessageSquare className="w-3.5 h-3.5 mr-1.5" /> Comments
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="overview" className="flex-1 mt-4 overflow-auto">
                    {loadingOverview ? (
                        <div className="flex items-center justify-center h-40">
                            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                        </div>
                    ) : overview ? (
                        <div className="space-y-6">
                            {/* AI Summary */}
                            <Card className="border-primary/20">
                                <CardHeader className="pb-3">
                                    <CardTitle className="text-base flex items-center gap-2">
                                        <Sparkles className="w-4 h-4 text-primary" />
                                        AI Summary
                                    </CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">
                                        {overview.aiSummary}
                                    </p>
                                </CardContent>
                            </Card>

                            {/* PR Stats */}
                            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                                <Card>
                                    <CardContent className="pt-4 pb-3 px-4 text-center">
                                        <div className="text-2xl font-bold text-foreground">{overview.pr.changedFiles}</div>
                                        <div className="text-xs text-muted-foreground">Changed Files</div>
                                    </CardContent>
                                </Card>
                                <Card>
                                    <CardContent className="pt-4 pb-3 px-4 text-center">
                                        <div className="text-2xl font-bold text-green-400">+{overview.pr.additions}</div>
                                        <div className="text-xs text-muted-foreground">Additions</div>
                                    </CardContent>
                                </Card>
                                <Card>
                                    <CardContent className="pt-4 pb-3 px-4 text-center">
                                        <div className="text-2xl font-bold text-red-400">-{overview.pr.deletions}</div>
                                        <div className="text-xs text-muted-foreground">Deletions</div>
                                    </CardContent>
                                </Card>
                                <Card>
                                    <CardContent className="pt-4 pb-3 px-4 text-center">
                                        <div className="text-2xl font-bold">{overview.pr.headRef}</div>
                                        <div className="text-xs text-muted-foreground">→ {overview.pr.baseRef}</div>
                                    </CardContent>
                                </Card>
                            </div>

                            {/* PR Description */}
                            {overview.pr.description && (
                                <Card>
                                    <CardHeader className="pb-3">
                                        <CardTitle className="text-base flex items-center gap-2">
                                            <FileCode className="w-4 h-4" /> Description
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="prose prose-sm dark:prose-invert max-w-none break-words">
                                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                                {overview.pr.description}
                                            </ReactMarkdown>
                                        </div>
                                    </CardContent>
                                </Card>
                            )}

                            {/* High-Level Comments */}
                            {overview.comments.length > 0 && (
                                <Card>
                                    <CardHeader className="pb-3">
                                        <CardTitle className="text-base flex items-center gap-2">
                                            <MessageSquare className="w-4 h-4" />
                                            Discussion ({overview.comments.length})
                                        </CardTitle>
                                        <CardDescription>
                                            Top-level PR comments (not code review)
                                        </CardDescription>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="space-y-4">
                                            {overview.comments.map(comment => (
                                                <div key={comment.id} className="flex gap-3">
                                                    <img 
                                                        src={comment.avatar} 
                                                        alt={comment.author}
                                                        className="w-8 h-8 rounded-full mt-0.5"
                                                    />
                                                    <div className="flex-1 space-y-1">
                                                        <div className="flex items-center gap-2 text-xs">
                                                            <span className="font-medium text-foreground">{comment.author}</span>
                                                            <span className="text-muted-foreground">
                                                                {new Date(comment.createdAt).toLocaleDateString()}
                                                            </span>
                                                            <a href={comment.htmlUrl} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-foreground">
                                                                <ExternalLink className="w-3 h-3" />
                                                            </a>
                                                        </div>
                                                        <div className="text-sm text-muted-foreground prose prose-sm dark:prose-invert break-words">
                                                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                                                {comment.body}
                                                            </ReactMarkdown>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </CardContent>
                                </Card>
                            )}
                        </div>
                    ) : (
                        <div className="flex items-center justify-center h-40 text-muted-foreground">
                            Failed to load overview.
                        </div>
                    )}
                </TabsContent>

                <TabsContent value="comments" className="flex-1 mt-4 overflow-auto">
                    <PrCommentExtractor
                        defaultOwner={repoOwner}
                        defaultRepo={repoName}
                        defaultPrNumber={selectedPrNumber}
                    />
                </TabsContent>
            </Tabs>
        </div>
    );
}
