import React, { useState } from 'react';
import { ChatInterface } from '@/components/chat/chat-interface';
import { useAuth } from '@/context/auth-context';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { BookOpen } from "lucide-react";

export default function CloudflareChat() {
    const { apiKey } = useAuth();
    const [selectedRepo, setSelectedRepo] = useState<string>("jmbish04/core-github-api");

    if (!apiKey) return <div>Error: Authentication required</div>;

    // Hardcoded repos for now, could fetch from API
    const repos = [
        "jmbish04/core-github-api",
        "jmbish04/core-repo-templates",
        "jmbish04/workers-chat-demo"
    ];

    return (
        <div className="container mx-auto py-6 max-w-6xl space-y-6 h-[calc(100vh-4rem)] flex flex-col">
            <Card className="shrink-0 bg-gradient-to-r from-orange-50 to-amber-50 dark:from-orange-950/20 dark:to-amber-950/20 border-orange-200 dark:border-orange-800">
                <CardHeader className="pb-4">
                    <div className="flex items-center justify-between">
                        <div className="space-y-1">
                            <CardTitle className="flex items-center gap-2 text-orange-700 dark:text-orange-400">
                                <BookOpen className="w-5 h-5" />
                                Cloudflare Docs Agent
                            </CardTitle>
                            <CardDescription>
                                Ask questions about Cloudflare Workers, D1, R2, and more. 
                                The agent has access to the official docs and your code context.
                            </CardDescription>
                        </div>
                        <div className="flex items-center gap-2">
                             <Select value={selectedRepo} onValueChange={setSelectedRepo}>
                                <SelectTrigger className="w-[280px] bg-background">
                                    <SelectValue placeholder="Select Context Repository" />
                                </SelectTrigger>
                                <SelectContent>
                                    {repos.map(repo => (
                                        <SelectItem key={repo} value={repo}>{repo}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                </CardHeader>
            </Card>

            <div className="flex-1 min-h-0">
                <ChatInterface 
                    apiKey={apiKey} 
                    agentId="cloudflare-docs" 
                    repoId={selectedRepo}
                />
            </div>
        </div>
    );
}
