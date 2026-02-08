import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { GitPullRequest, GitMerge, ShieldAlert, Sparkles, Play } from 'lucide-react';
import { useColbySocket } from '@/hooks/useColbySocket';

export function PRCommandCenter() {
    const [activeTab, setActiveTab] = useState("context");

    // Mock Data
    const contextItems = [
        { type: 'comment', file: 'src/worker.ts', line: 42, content: 'User requested rate limiting here.' },
        { type: 'rag', source: 'Cloudflare Docs', title: 'Rate Limiting', content: 'Use the leaky bucket algorithm...' },
    ];

    const handleAction = (action: string) => {
        console.log("Triggering PR Action:", action);
        // TODO: Call API
    };

    return (
        <div className="h-[calc(100vh-100px)] flex flex-col gap-4">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold flex items-center gap-2">
                        <GitPullRequest className="w-6 h-6 text-purple-400" />
                        PR #12: Feature/RateLimiting
                    </h2>
                    <p className="text-zinc-500">Integrating generic rate limiter middleware.</p>
                </div>
                <div className="flex gap-2">
                    <Badge variant="outline" className="text-emerald-400 border-emerald-900 bg-emerald-950/20">Open</Badge>
                    <Badge variant="secondary">Checks Passed</Badge>
                </div>
            </div>

            <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
                <TabsList className="bg-zinc-900 border border-zinc-800 w-full justify-start">
                    <TabsTrigger value="overview">Overview</TabsTrigger>
                    <TabsTrigger value="code">Code</TabsTrigger>
                    <TabsTrigger value="context">Colby Context</TabsTrigger>
                    <TabsTrigger value="workflows">Workflows</TabsTrigger>
                </TabsList>

                <TabsContent value="context" className="flex-1 flex gap-6 mt-4 overflow-hidden">
                    {/* Left: Context List */}
                    <Card className="flex-1 border-zinc-800 bg-zinc-950 flex flex-col">
                        <CardHeader>
                            <CardTitle className="text-sm">Extracted Context</CardTitle>
                        </CardHeader>
                        <CardContent className="flex-1 p-0">
                            <ScrollArea className="h-full px-6 pb-6">
                                <div className="space-y-6">
                                    {/* Comments Section */}
                                    <div>
                                        <h4 className="text-xs font-semibold text-zinc-400 uppercase mb-2">Code Comments</h4>
                                        {contextItems.filter(i => i.type === 'comment').map((item, i) => (
                                            <div key={i} className="bg-zinc-900/50 p-3 rounded border border-zinc-800 mb-2">
                                                <div className="flex justify-between text-xs text-zinc-500 mb-1">
                                                    <span>{item.file}:{item.line}</span>
                                                </div>
                                                <p className="text-sm text-zinc-300">{item.content}</p>
                                            </div>
                                        ))}
                                    </div>

                                    <Separator className="bg-zinc-800" />

                                    {/* RAG Section */}
                                    <div>
                                        <h4 className="text-xs font-semibold text-zinc-400 uppercase mb-2 mt-4">Relevant Documentation (RAG)</h4>
                                        {contextItems.filter(i => i.type === 'rag').map((item, i) => (
                                            <div key={i} className="bg-blue-950/20 p-3 rounded border border-blue-900/30 mb-2">
                                                <div className="flex items-center gap-2 text-xs text-blue-400 mb-1">
                                                    <Sparkles className="w-3 h-3" />
                                                    <span>{item.source} · {item.title}</span>
                                                </div>
                                                <p className="text-sm text-zinc-300">{item.content}</p>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </ScrollArea>
                        </CardContent>
                    </Card>

                    {/* Right: Actions */}
                    <Card className="w-80 border-zinc-800 bg-zinc-900/30 h-fit">
                        <CardHeader>
                            <CardTitle className="text-sm">Quick Actions</CardTitle>
                            <CardDescription>Automated interventions.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            <Button variant="secondary" className="w-full justify-start" onClick={() => handleAction('fix_all')}>
                                <Sparkles className="w-4 h-4 mr-2" />
                                Fix All Issues
                            </Button>
                            <Button variant="outline" className="w-full justify-start border-red-900/50 text-red-400 hover:bg-red-950/50" onClick={() => handleAction('resolve_conflicts')}>
                                <GitMerge className="w-4 h-4 mr-2" />
                                Resolve Conflicts
                            </Button>
                            <Button variant="outline" className="w-full justify-start" onClick={() => handleAction('deploy_preview')}>
                                <Play className="w-4 h-4 mr-2" />
                                Deploy Preview
                            </Button>

                            <Separator className="bg-zinc-800 my-2" />

                            <div className="p-3 bg-yellow-950/20 border border-yellow-900/30 rounded text-xs text-yellow-500">
                                <ShieldAlert className="w-4 h-4 inline mr-1" />
                                Wait for checks to complete before merging.
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="overview">
                    <div className="flex items-center justify-center h-40 text-zinc-500">Overview Placeholder</div>
                </TabsContent>
                <TabsContent value="code">
                    <div className="flex items-center justify-center h-40 text-zinc-500">Code Diff Placeholder</div>
                </TabsContent>
                <TabsContent value="workflows">
                    <div className="flex items-center justify-center h-40 text-zinc-500">Workflow Graph Placeholder</div>
                </TabsContent>
            </Tabs>
        </div>
    );
}
