
import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/context/auth-context';
import { Loader2, CheckCircle2, XCircle, AlertCircle, Play, Activity, Server, Cpu, Brain } from 'lucide-react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

interface HealthResult {
    id: string;
    run_id: string;
    category: 'github' | 'ai' | 'api';
    name: string;
    status: 'success' | 'failure' | 'pending' | 'skipped';
    message: string;
    details?: any;
    duration_ms: number;
    timestamp: string;
}

interface RunStats {
    total: number;
    passed: number;
    failed: number;
    duration: number;
    lastRunAt: string;
}

export default function HealthPage() {
    const { apiKey } = useAuth();
    const [isLoading, setIsLoading] = useState(false);
    const [isAnalyzing, setIsAnalyzing] = useState<string | null>(null); // ID of failing step being analyzed
    const [analysisResult, setAnalysisResult] = useState<Record<string, any>>({});
    const [lastRun, setLastRun] = useState<{ id: string, status: string, results: HealthResult[], created_at: string } | null>(null);
    const [error, setError] = useState<string | null>(null);

    // Fetch latest on mount
    useEffect(() => {
        fetchLatest();
    }, [apiKey]);

    const fetchLatest = async () => {
        try {
            setError(null);
            const headers: Record<string, string> = {};
            if (apiKey) headers['x-api-key'] = apiKey;

            const res = await fetch('/api/health/latest', {
                headers,
                credentials: 'include'
            });
            if (res.ok) {
                const data = await res.json();
                if (data.run) {
                    setLastRun({ ...data.run, results: data.results });
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

    const runTests = async () => {
        setIsLoading(true);
        setAnalysisResult({});
        setError(null);
        try {
            const headers: Record<string, string> = { 'Content-Type': 'application/json' };
            if (apiKey) headers['x-api-key'] = apiKey;

            const res = await fetch('/api/health/run', {
                method: 'POST',
                headers,
                credentials: 'include',
                body: JSON.stringify({ trigger: 'web' }) // Explicit manual trigger
            });

            if (!res.ok) {
                const details = await res.text();
                throw new Error(details || 'Run failed');
            }

            const data = await res.json();
            setLastRun({ id: data.runId, status: data.status, results: data.results, created_at: new Date().toISOString() });
        } catch (e: any) {
            console.error(e);
            setError(e.message || 'Failed to run health checks.');
        } finally {
            setIsLoading(false);
        }
    };

    const analyzeFailure = async (result: HealthResult) => {
        setIsAnalyzing(result.id);
        try {
            const headers: Record<string, string> = { 'Content-Type': 'application/json' };
            if (apiKey) headers['x-api-key'] = apiKey;

            const res = await fetch('/api/health/analyze', {
                method: 'POST',
                headers,
                credentials: 'include',
                body: JSON.stringify({
                    failureDetails: result,
                    context: `Category: ${result.category}, Step: ${result.name}`
                })
            });

            if (res.ok) {
                const data = await res.json();
                console.log("Analysis Data:", data);
                // Handle different response formats (string vs object)
                const analysis = typeof data === 'string' ? { analysis: data, fixes: [] } : data;
                setAnalysisResult(prev => ({ ...prev, [result.id]: analysis }));
            } else {
                const details = await res.text();
                setError(details || `Analysis failed with status ${res.status}`);
            }
        } catch (e) {
            console.error(e);
            setError('Failed to run AI analysis.');
        } finally {
            setIsAnalyzing(null);
        }
    };

    const stats: RunStats = lastRun ? {
        total: lastRun.results.length,
        passed: lastRun.results.filter(r => r.status === 'success').length,
        failed: lastRun.results.filter(r => r.status === 'failure').length,
        duration: lastRun.results.reduce((acc, r) => acc + (r.duration_ms || 0), 0),
        lastRunAt: lastRun.created_at
    } : { total: 0, passed: 0, failed: 0, duration: 0, lastRunAt: '-' };

    const groupedResults = lastRun?.results.reduce((acc, r) => {
        if (!acc[r.category]) acc[r.category] = [];
        acc[r.category].push(r);
        return acc;
    }, {} as Record<string, HealthResult[]>) || {};

    const categoryIcons = {
        github: <Activity className="w-5 h-5" />,
        ai: <Brain className="w-5 h-5" />,
        api: <Server className="w-5 h-5" />
    };

    const categoryLabels = {
        github: "GitHub Integration",
        ai: "AI Agents System",
        api: "API & Infrastructure"
    };

    return (
        <div className="space-y-6 max-w-5xl mx-auto p-6">
            {/* Header */}
            <div className="flex justify-between items-center">
                <div className="space-y-1">
                    <h1 className="text-3xl font-bold tracking-tight">System Health</h1>
                    <p className="text-muted-foreground">Comprehensive system diagnostics and automated recovery analysis.</p>
                </div>
                <div className="flex items-center gap-4">
                    <div className="text-right text-sm text-muted-foreground hidden sm:block">
                        Last checked: {stats.lastRunAt !== '-' ? new Date(stats.lastRunAt).toLocaleString() : 'Never'}
                    </div>
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

            {error && (
                <Card className="border-red-200 bg-red-50/40">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-base text-red-800">Health Service Error</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <CardDescription className="text-red-700">{error}</CardDescription>
                    </CardContent>
                </Card>
            )}

            {/* Stats Overview */}
            <div className="grid gap-4 md:grid-cols-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Overall Status</CardTitle>
                        <Activity className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold capitalize flex items-center gap-2">
                            {lastRun?.status === 'healthy' && <CheckCircle2 className="text-green-500" />}
                            {lastRun?.status === 'unhealthy' && <XCircle className="text-red-500" />}
                            {(!lastRun || lastRun.status === 'unknown') && <AlertCircle className="text-gray-400" />}
                            {lastRun?.status || 'Unknown'}
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Tests Passed</CardTitle>
                        <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-green-600">{stats.passed}/{stats.total}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Critical Failures</CardTitle>
                        <XCircle className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className={`text-2xl font-bold ${stats.failed > 0 ? 'text-red-600' : 'text-muted-foreground'}`}>
                            {stats.failed}
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Duration</CardTitle>
                        <Cpu className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats.duration}ms</div>
                    </CardContent>
                </Card>
            </div>

            {/* Detailed Results */}
            <Accordion type="multiple" defaultValue={['github', 'ai', 'api']} className="space-y-4">
                {['github', 'ai', 'api'].map((cat) => {
                    const items = groupedResults[cat] || [];
                    const hasFailure = items.some(i => i.status === 'failure');

                    return (
                        <AccordionItem value={cat} key={cat} className="border rounded-lg bg-card px-4">
                            <AccordionTrigger className="hover:no-underline py-4">
                                <div className="flex items-center gap-3">
                                    <div className={`p-2 rounded-full ${hasFailure ? 'bg-red-100 text-red-600' : 'bg-blue-50 text-blue-600'}`}>
                                        {categoryIcons[cat as keyof typeof categoryIcons]}
                                    </div>
                                    <div className="flex flex-col items-start">
                                        <span className="font-semibold text-lg">{categoryLabels[cat as keyof typeof categoryLabels]}</span>
                                        <span className="text-xs text-muted-foreground font-normal">
                                            {items.length} checks • {hasFailure ? 'Issues Detected' : 'All Systems Operational'}
                                        </span>
                                    </div>
                                </div>
                            </AccordionTrigger>
                            <AccordionContent className="pt-2 pb-4 space-y-2">
                                {items.length === 0 ? (
                                    <div className="text-sm text-muted-foreground italic px-2">No checks run for this category.</div>
                                ) : (
                                    items.map((item) => (
                                        <div key={item.id} className="border rounded-md p-3 flex flex-col gap-2 bg-background/50">
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-3">
                                                    {item.status === 'success' && <CheckCircle2 className="w-5 h-5 text-green-500" />}
                                                    {item.status === 'failure' && <XCircle className="w-5 h-5 text-red-500" />}
                                                    {item.status === 'pending' && <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />}

                                                    <span className="font-medium">{item.name}</span>
                                                </div>
                                                <span className="text-xs font-mono text-muted-foreground">{item.duration_ms}ms</span>
                                            </div>

                                            {item.message && (
                                                <div className="ml-8 text-sm text-muted-foreground">
                                                    {item.message}
                                                </div>
                                            )}

                                            {/* Failure Analysis */}
                                            {item.status === 'failure' && (
                                                <div className="ml-8 mt-2 p-3 bg-red-50/50 rounded-md border border-red-100">
                                                    {!analysisResult[item.id] ? (
                                                        <Button
                                                            variant="outline"
                                                            size="sm"
                                                            onClick={() => analyzeFailure(item)}
                                                            disabled={isAnalyzing === item.id}
                                                            className="text-red-700 hover:text-red-800 hover:bg-red-100 bg-white"
                                                        >
                                                            {isAnalyzing === item.id ? <Loader2 className="mr-2 h-3 w-3 animate-spin" /> : <Brain className="mr-2 h-3 w-3" />}
                                                            Analyze with AI Agent
                                                        </Button>
                                                    ) : (
                                                        <div className="space-y-2 animate-in fade-in duration-300">
                                                            <div className="flex items-center gap-2 font-semibold text-red-800">
                                                                <Brain className="w-4 h-4" />
                                                                AI Diagnosis
                                                            </div>
                                                            <div className="text-sm text-gray-800 font-medium">
                                                                {analysisResult[item.id].analysis}
                                                            </div>
                                                            {analysisResult[item.id].fixes?.length > 0 && (
                                                                <ul className="text-sm text-gray-700 list-disc list-inside mt-2 space-y-1">
                                                                    {analysisResult[item.id].fixes.map((fix: string, i: number) => (
                                                                        <li key={i}>{fix}</li>
                                                                    ))}
                                                                </ul>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    ))
                                )}
                            </AccordionContent>
                        </AccordionItem>
                    );
                })}
            </Accordion>
        </div>
    );
}
