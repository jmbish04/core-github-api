import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { GitPullRequest, GitMerge, ShieldAlert, Sparkles, Play } from 'lucide-react';
import { useColbySocket } from '@/hooks/useColbySocket';

interface PR {
    number: number;
    title: string;
    state: string;
    draft: boolean;
    author: string;
    url: string;
    updatedAt: string;
}

interface PRCommandCenterProps {
    repoOwner: string;
    repoName: string;
    initialPrs: PR[];
}

export function PRCommandCenter({ repoOwner, repoName, initialPrs }: PRCommandCenterProps) {
    const [activeTab, setActiveTab] = useState("overview");
    const [selectedPrId, setSelectedPrId] = useState<number | null>(initialPrs.length > 0 ? initialPrs[0].number : null);

    const selectedPr = initialPrs.find(pr => pr.number === selectedPrId);

    const handleAction = (action: string) => {
        console.log("Triggering PR Action:", action);
        // TODO: Call API
    };

    if (initialPrs.length === 0) {
        return (
            <div className="h-64 flex flex-col items-center justify-center text-muted-foreground border border-dashed rounded-lg bg-zinc-950/30">
                <GitPullRequest className="w-8 h-8 mb-4 opacity-50" />
                <p>No open pull requests found.</p>
                <Button variant="outline" size="sm" className="mt-4">Refresh</Button>
            </div>
        )
    }

    return (
        <div className="h-[calc(100vh-100px)] flex flex-col gap-4">
            {/* PR Selector if multiple */}
            <div className="flex gap-2 overflow-x-auto pb-2">
                {initialPrs.map(pr => (
                    <Button 
                        key={pr.number} 
                        variant={selectedPrId === pr.number ? "default" : "outline"}
                        size="sm"
                        onClick={() => setSelectedPrId(pr.number)}
                        className="whitespace-nowrap"
                    >
                        #{pr.number}
                    </Button>
                ))}
            </div>

            {selectedPr && (
                <>
                <div className="flex items-center justify-between">
                    <div>
                        <h2 className="text-2xl font-bold flex items-center gap-2">
                            <GitPullRequest className="w-6 h-6 text-purple-400" />
                            #{selectedPr.number}: {selectedPr.title}
                        </h2>
                        <p className="text-zinc-500">Author: {selectedPr.author} · Last updated: {new Date(selectedPr.updatedAt).toLocaleDateString()}</p>
                    </div>
                    <div className="flex gap-2">
                        <Badge variant="outline" className="text-emerald-400 border-emerald-900 bg-emerald-950/20">{selectedPr.state}</Badge>
                         {selectedPr.draft && <Badge variant="secondary">Draft</Badge>}
                    </div>
                </div>

                <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
                    <TabsList className="bg-zinc-900 border border-zinc-800 w-full justify-start">
                        <TabsTrigger value="overview">Overview</TabsTrigger>
                        <TabsTrigger value="comments">Comments</TabsTrigger>
                        <TabsTrigger value="context">Colby Context</TabsTrigger>
                    </TabsList>

                    <TabsContent value="overview" className="flex-1 flex gap-6 mt-4 overflow-hidden">
                         <div className="flex items-center justify-center h-40 text-zinc-500 border border-dashed rounded w-full">
                            PR Overview Placeholder for {repoOwner}/{repoName}#{selectedPr.number}
                         </div>
                    </TabsContent>

                    <TabsContent value="comments" className="flex-1 flex gap-6 mt-4 overflow-hidden">
                         <div className="w-full flex flex-col items-center gap-4">
                            <p className="text-muted-foreground">Manage and view extracted comments.</p>
                            <Button variant="default" asChild>
                                <a href={`/view-comments/${repoOwner}/${repoName}/pull/${selectedPr.number}`} target="_blank" rel="noreferrer">
                                    <Sparkles className="w-4 h-4 mr-2" />
                                    Launch Comments Viewer
                                </a>
                            </Button>
                         </div>
                    </TabsContent>

                    <TabsContent value="context" className="flex-1 flex gap-6 mt-4 overflow-hidden">
                        {/* Reuse previous mock layout for context as placeholder */}
                         <div className="flex items-center justify-center h-40 text-zinc-500 border border-dashed rounded w-full">
                            Context Visualization for {repoOwner}/{repoName}
                         </div>
                    </TabsContent>
                </Tabs>
                </>
            )}
        </div>
    );
}
