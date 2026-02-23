
import React, { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/context/auth-context';
import {
    Loader2, CheckCircle2, XCircle, AlertCircle, Play, Activity,
    Server, Cpu, Brain, GitBranch, Globe, Settings2, History,
    ChevronDown, ChevronRight, Zap, Shield, Copy, Check,
} from 'lucide-react';
import { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

// ─── Utilities ──────────────────────────────────────────────────────────

function formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ${minutes % 60}m`;
    const days = Math.floor(hours / 24);
    return `${days}d ${hours % 24}h`;
}

// ─── Types ──────────────────────────────────────────────────────────────

type HealthCategory = 'github' | 'ai' | 'api' | 'webhooks' | 'mcp' | 'agents' | 'browser' | 'git' | 'sandbox';

interface HealthResult {
    id: string;
    run_id: string;
    category: HealthCategory;
    name: string;
    status: 'success' | 'failure' | 'pending' | 'skipped';
    message: string;
    details?: any;
    duration_ms: number;
    ai_suggestion?: string | null;
    timestamp: string;
}

interface HealthRun {
    id: string;
    status: string;
    trigger?: string;
    duration_ms?: number;
    created_at: string;
}

interface RunWithResults {
    run: HealthRun;
    results: HealthResult[];
}

interface RunStats {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
    duration: number;
    lastRunAt: string;
}

// ─── Category Registry ──────────────────────────────────────────────────

const CATEGORY_META: Record<HealthCategory, { icon: React.ReactNode; label: string; color: string }> = {
    github:   { icon: <GitBranch className="w-5 h-5" />,  label: 'GitHub Integration',     color: 'text-purple-400' },
    ai:       { icon: <Brain className="w-5 h-5" />,      label: 'AI Providers',            color: 'text-cyan-400' },
    api:      { icon: <Server className="w-5 h-5" />,     label: 'API & Database',          color: 'text-blue-400' },
    webhooks: { icon: <Zap className="w-5 h-5" />,        label: 'Webhooks',                color: 'text-yellow-400' },
    mcp:      { icon: <Globe className="w-5 h-5" />,      label: 'MCP Services',            color: 'text-green-400' },
    agents:   { icon: <Cpu className="w-5 h-5" />,        label: 'Agent Ecosystem',         color: 'text-orange-400' },
    browser:  { icon: <Globe className="w-5 h-5" />,      label: 'Browser Rendering',       color: 'text-teal-400' },
    git:      { icon: <GitBranch className="w-5 h-5" />,  label: 'Git & Sandbox',           color: 'text-emerald-400' },
    sandbox:  { icon: <Shield className="w-5 h-5" />,     label: 'Sandbox Container',       color: 'text-rose-400' },
};

// ─── Detail Viewer ──────────────────────────────────────────────────────

function DetailTree({ data }: { data: any }) {
    if (!data || typeof data !== 'object') return null;

    return (
        <div className="text-xs font-mono space-y-1 mt-2 p-3 rounded-lg bg-muted/30 border border-border/50 overflow-x-auto max-h-[300px] overflow-y-auto">
            {Object.entries(data).map(([key, value]) => (
                <div key={key} className="flex gap-2">
                    <span className="text-muted-foreground shrink-0">{key}:</span>
                    <span className="text-foreground break-all">
                        {typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value)}
                    </span>
                </div>
            ))}
        </div>
    );
}

// ─── HealthResult Card ──────────────────────────────────────────────────

function ResultCard({
    item,
    onAnalyze,
    isAnalyzing,
    analysisResult
}: {
    item: HealthResult;
    onAnalyze: (item: HealthResult) => void;
    isAnalyzing: boolean;
    analysisResult?: any;
}) {
    const [showDetails, setShowDetails] = useState(false);

    return (
        <div className="border border-border/50 rounded-lg p-4 bg-card/50 backdrop-blur-sm space-y-2 transition-all hover:border-border">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    {item.status === 'success' && <CheckCircle2 className="w-5 h-5 text-green-400 shrink-0" />}
                    {item.status === 'failure' && <XCircle className="w-5 h-5 text-red-400 shrink-0" />}
                    {item.status === 'pending' && <Loader2 className="w-5 h-5 text-blue-400 animate-spin shrink-0" />}
                    {item.status === 'skipped' && <AlertCircle className="w-5 h-5 text-muted-foreground shrink-0" />}
                    <span className="font-medium text-sm">{item.name}</span>
                </div>
                <div className="flex items-center gap-2">
                    <span className="text-xs font-mono text-muted-foreground">{item.duration_ms}ms</span>
                    {item.details && (
                        <button
                            onClick={() => setShowDetails(!showDetails)}
                            className="text-muted-foreground hover:text-foreground transition-colors"
                        >
                            {showDetails ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                        </button>
                    )}
                </div>
            </div>

            {item.message && (
                <p className="ml-8 text-sm text-muted-foreground">{item.message}</p>
            )}

            {/* AI Suggestion (stored from coordinator) */}
            {item.ai_suggestion && (
                <div className="ml-8 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                    <div className="flex items-center gap-2 text-amber-400 text-xs font-semibold mb-1">
                        <Brain className="w-3.5 h-3.5" />
                        AI Remediation
                    </div>
                    <p className="text-sm text-foreground/80">{item.ai_suggestion}</p>
                </div>
            )}

            {/* On-demand AI Analysis for failures without stored suggestions */}
            {item.status === 'failure' && !item.ai_suggestion && (
                <div className="ml-8 mt-1">
                    {!analysisResult ? (
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => onAnalyze(item)}
                            disabled={isAnalyzing}
                            className="text-red-400 hover:text-red-300 border-red-500/30 hover:bg-red-500/10"
                        >
                            {isAnalyzing ? <Loader2 className="mr-2 h-3 w-3 animate-spin" /> : <Brain className="mr-2 h-3 w-3" />}
                            Analyze with AI
                        </Button>
                    ) : (
                        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 space-y-2 animate-in fade-in duration-300">
                            <div className="flex items-center gap-2 text-red-400 text-xs font-semibold">
                                <Brain className="w-3.5 h-3.5" />
                                AI Diagnosis
                            </div>
                            <p className="text-sm text-foreground/80">{analysisResult.analysis}</p>
                            {analysisResult.fixes?.length > 0 && (
                                <ul className="text-sm text-foreground/70 list-disc list-inside space-y-0.5">
                                    {analysisResult.fixes.map((fix: string, i: number) => (
                                        <li key={i}>{fix}</li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* Expandable Details */}
            {showDetails && item.details && <DetailTree data={item.details} />}
        </div>
    );
}

// ─── History Timeline ───────────────────────────────────────────────────

function HistoryTimeline({ history }: { history: RunWithResults[] }) {
    if (!history.length) {
        return (
            <div className="text-center py-12 text-muted-foreground">
                <History className="w-8 h-8 mx-auto mb-3 opacity-50" />
                <p>No historical runs found.</p>
            </div>
        );
    }

    return (
        <div className="space-y-3">
            {history.map(({ run, results }) => {
                const passed = results.filter(r => r.status === 'success').length;
                const failed = results.filter(r => r.status === 'failure').length;
                const total = results.length;

                return (
                    <div key={run.id} className="border border-border/50 rounded-lg p-4 bg-card/30 hover:bg-card/50 transition-all">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                {run.status === 'healthy' && <CheckCircle2 className="w-5 h-5 text-green-400" />}
                                {run.status === 'unhealthy' && <XCircle className="w-5 h-5 text-red-400" />}
                                {run.status === 'degraded' && <AlertCircle className="w-5 h-5 text-yellow-400" />}
                                {(!run.status || run.status === 'unknown') && <AlertCircle className="w-5 h-5 text-muted-foreground" />}
                                <div>
                                    <div className="font-medium text-sm capitalize">{run.status || 'Unknown'}</div>
                                    <div className="text-xs text-muted-foreground">
                                        {new Date(run.created_at).toLocaleString()} · {run.trigger || 'manual'}
                                    </div>
                                </div>
                            </div>
                            <div className="flex items-center gap-4 text-xs">
                                <span className="text-green-400 font-mono">{passed}✓</span>
                                {failed > 0 && <span className="text-red-400 font-mono">{failed}✗</span>}
                                <span className="text-muted-foreground font-mono">{total} total</span>
                                {run.duration_ms && (
                                    <span className="text-muted-foreground font-mono">{formatDuration(run.duration_ms)}</span>
                                )}
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

// ─── Main Component ─────────────────────────────────────────────────────

export default function HealthPage() {
    const { apiKey } = useAuth();
    const [activeTab, setActiveTab] = useState<'current' | 'history'>('current');
    const [isLoading, setIsLoading] = useState(false);
    const [isAnalyzing, setIsAnalyzing] = useState<string | null>(null);
    const [analysisResults, setAnalysisResults] = useState<Record<string, any>>({});
    const [lastRun, setLastRun] = useState<RunWithResults | null>(null);
    const [history, setHistory] = useState<RunWithResults[]>([]);
    const [error, setError] = useState<string | null>(null);
    const { isCopied: reportCopied, copy: copyReport } = useCopyToClipboard();

    const headers = useMemo(() => {
        const h: Record<string, string> = {};
        if (apiKey) h['x-api-key'] = apiKey;
        return h;
    }, [apiKey]);

    // Fetch latest on mount
    useEffect(() => {
        fetchLatest();
    }, [apiKey]);

    const fetchLatest = async () => {
        try {
            setError(null);
            const res = await fetch('/api/health/latest', { headers, credentials: 'include' });
            if (res.ok) {
                const data = await res.json();
                if (data.run) {
                    setLastRun({ run: data.run, results: data.results || [] });
                }
            } else {
                const details = await res.text();
                setError(details || `Health service returned ${res.status}`);
            }
        } catch (e) {
            console.error("Failed to fetch latest health", e);
            setError('Failed to reach health service.');
        }
    };

    const fetchHistory = async () => {
        try {
            const res = await fetch('/api/health/history?limit=20', { headers, credentials: 'include' });
            if (res.ok) {
                const data = await res.json();
                setHistory(data.runs || []);
            }
        } catch (e) {
            console.error("Failed to fetch health history", e);
        }
    };

    const runTests = async () => {
        setIsLoading(true);
        setAnalysisResults({});
        setError(null);
        try {
            const res = await fetch('/api/health/run', {
                method: 'POST',
                headers: { ...headers, 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ trigger: 'web' })
            });

            if (!res.ok) {
                throw new Error(await res.text() || 'Run failed');
            }

            const data = await res.json();
            setLastRun({
                run: { id: data.runId, status: data.status, created_at: new Date().toISOString() },
                results: data.results || []
            });
        } catch (e: any) {
            setError(e.message || 'Failed to run health checks.');
        } finally {
            setIsLoading(false);
        }
    };

    const analyzeFailure = async (result: HealthResult) => {
        setIsAnalyzing(result.id);
        try {
            const res = await fetch('/api/health/analyze', {
                method: 'POST',
                headers: { ...headers, 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    failureDetails: result,
                    context: `Category: ${result.category}, Step: ${result.name}`
                })
            });

            if (res.ok) {
                const data = await res.json();
                const analysis = typeof data === 'string' ? { analysis: data, fixes: [] } : data;
                setAnalysisResults(prev => ({ ...prev, [result.id]: analysis }));
            } else {
                setError(await res.text() || `Analysis failed with status ${res.status}`);
            }
        } catch {
            setError('Failed to run AI analysis.');
        } finally {
            setIsAnalyzing(null);
        }
    };

    // Compute stats
    const stats: RunStats = lastRun ? {
        total: lastRun.results.length,
        passed: lastRun.results.filter(r => r.status === 'success').length,
        failed: lastRun.results.filter(r => r.status === 'failure').length,
        skipped: lastRun.results.filter(r => r.status === 'skipped').length,
        duration: lastRun.results.reduce((acc, r) => acc + (r.duration_ms || 0), 0),
        lastRunAt: lastRun.run.created_at
    } : { total: 0, passed: 0, failed: 0, skipped: 0, duration: 0, lastRunAt: '-' };

    // Group results by category
    const groupedResults = lastRun?.results.reduce((acc, r) => {
        if (!acc[r.category]) acc[r.category] = [];
        acc[r.category].push(r);
        return acc;
    }, {} as Record<string, HealthResult[]>) || {};

    // Category order (show non-empty first, then empty)
    const allCategories = Object.keys(CATEGORY_META) as HealthCategory[];
    const sortedCategories = allCategories.filter(c => (groupedResults[c]?.length || 0) > 0)
        .concat(allCategories.filter(c => !groupedResults[c]?.length));

    return (
        <div className="space-y-6 max-w-5xl mx-auto p-6">
            {/* Header */}
            <div className="flex justify-between items-center">
                <div className="space-y-1">
                    <h1 className="text-3xl font-bold tracking-tight">System Health</h1>
                    <p className="text-muted-foreground">Comprehensive diagnostics across all platform domains.</p>
                </div>
                <div className="flex items-center gap-3">
                    <div className="text-right text-sm text-muted-foreground hidden sm:block">
                        {stats.lastRunAt !== '-' ? new Date(stats.lastRunAt).toLocaleString() : 'Never checked'}
                    </div>
                    {lastRun && (
                        <Button
                            variant="outline"
                            size="lg"
                            onClick={() => {
                                const report = [
                                    `# Health Report (${new Date().toLocaleString()})`,
                                    `Status: ${lastRun.run.status}`,
                                    `Stats: ${stats.passed} Passed, ${stats.failed} Failed, ${stats.total} Total`,
                                    `Duration: ${formatDuration(stats.duration)}`,
                                    '',
                                    '## Failures',
                                    ...lastRun.results
                                        .filter(r => r.status === 'failure')
                                        .map(r => `- [${r.category}] ${r.name}: ${r.message}`),
                                    '',
                                    '## All Results',
                                    ...lastRun.results.map(r => 
                                        `- [${r.status.toUpperCase()}] ${r.category}/${r.name}: ${r.message || 'OK'}`
                                    )
                                ].join('\n');
                                copyReport(report);
                            }}
                        >
                            {reportCopied ? <Check className="mr-2 h-4 w-4 text-green-500" /> : <Copy className="mr-2 h-4 w-4" />}
                            {reportCopied ? 'Copied!' : 'Copy Report'}
                        </Button>
                    )}
                    <Button
                        onClick={runTests}
                        disabled={isLoading}
                        size="lg"
                        className={`min-w-[140px] ${isLoading ? 'opacity-80' : ''}`}
                    >
                        {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
                        {isLoading ? 'Running...' : 'Run Checks'}
                    </Button>
                </div>
            </div>

            {/* Error Banner */}
            {error && (
                <Card className="border-red-500/30 bg-red-500/5">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-base text-red-400">Health Service Error</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <CardDescription className="text-red-400/80">{error}</CardDescription>
                    </CardContent>
                </Card>
            )}

            {/* Stats Overview */}
            <div className="grid gap-4 md:grid-cols-4">
                <Card className="bg-card/50 backdrop-blur-sm border-border/50">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Overall Status</CardTitle>
                        <Activity className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold capitalize flex items-center gap-2">
                            {lastRun?.run.status === 'healthy' && <CheckCircle2 className="text-green-400" />}
                            {lastRun?.run.status === 'unhealthy' && <XCircle className="text-red-400" />}
                            {lastRun?.run.status === 'degraded' && <AlertCircle className="text-yellow-400" />}
                            {(!lastRun || lastRun.run.status === 'unknown') && <AlertCircle className="text-muted-foreground" />}
                            {lastRun?.run.status || 'Unknown'}
                        </div>
                    </CardContent>
                </Card>
                <Card className="bg-card/50 backdrop-blur-sm border-border/50">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Tests Passed</CardTitle>
                        <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-green-400">{stats.passed}/{stats.total}</div>
                    </CardContent>
                </Card>
                <Card className="bg-card/50 backdrop-blur-sm border-border/50">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Critical Failures</CardTitle>
                        <XCircle className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className={`text-2xl font-bold ${stats.failed > 0 ? 'text-red-400' : 'text-muted-foreground'}`}>
                            {stats.failed}
                        </div>
                    </CardContent>
                </Card>
                <Card className="bg-card/50 backdrop-blur-sm border-border/50">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Duration</CardTitle>
                        <Cpu className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{formatDuration(stats.duration)}</div>
                    </CardContent>
                </Card>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 border-b border-border/50">
                <button
                    onClick={() => setActiveTab('current')}
                    className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
                        activeTab === 'current'
                            ? 'border-primary text-foreground'
                            : 'border-transparent text-muted-foreground hover:text-foreground'
                    }`}
                >
                    <Activity className="w-4 h-4 inline mr-2" />
                    Current Run
                </button>
                <button
                    onClick={() => {
                        setActiveTab('history');
                        if (history.length === 0) fetchHistory();
                    }}
                    className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
                        activeTab === 'history'
                            ? 'border-primary text-foreground'
                            : 'border-transparent text-muted-foreground hover:text-foreground'
                    }`}
                >
                    <History className="w-4 h-4 inline mr-2" />
                    History
                </button>
            </div>

            {/* Tab Content */}
            {activeTab === 'current' ? (
                <Accordion type="multiple" defaultValue={sortedCategories} className="space-y-3">
                    {sortedCategories.map((cat) => {
                        const items = groupedResults[cat] || [];
                        const meta = CATEGORY_META[cat];
                        const hasFailure = items.some(i => i.status === 'failure');
                        const hasAny = items.length > 0;

                        return (
                            <AccordionItem value={cat} key={cat} className="border border-border/50 rounded-lg bg-card/30 px-4">
                                <AccordionTrigger className="hover:no-underline py-4">
                                    <div className="flex items-center gap-3">
                                        <div className={`p-2 rounded-full ${
                                            hasFailure ? 'bg-red-500/10 text-red-400'
                                                : hasAny ? 'bg-primary/10 text-primary'
                                                : 'bg-muted/50 text-muted-foreground'
                                        }`}>
                                            {meta.icon}
                                        </div>
                                        <div className="flex flex-col items-start">
                                            <span className="font-semibold text-base">{meta.label}</span>
                                            <span className="text-xs text-muted-foreground font-normal">
                                                {hasAny
                                                    ? `${items.length} checks · ${hasFailure ? 'Issues Detected' : 'All Operational'}`
                                                    : 'No checks run'
                                                }
                                            </span>
                                        </div>
                                    </div>
                                </AccordionTrigger>
                                <AccordionContent className="pt-2 pb-4 space-y-2">
                                    {items.length === 0 ? (
                                        <div className="text-sm text-muted-foreground italic px-2">
                                            No checks configured for this category.
                                        </div>
                                    ) : (
                                        items.map((item) => (
                                            <ResultCard
                                                key={item.id}
                                                item={item}
                                                onAnalyze={analyzeFailure}
                                                isAnalyzing={isAnalyzing === item.id}
                                                analysisResult={analysisResults[item.id]}
                                            />
                                        ))
                                    )}
                                </AccordionContent>
                            </AccordionItem>
                        );
                    })}
                </Accordion>
            ) : (
                <HistoryTimeline history={history} />
            )}
        </div>
    );
}
