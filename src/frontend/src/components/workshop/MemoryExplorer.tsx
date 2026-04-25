import React, { useEffect, useState } from 'react';
import { api } from '@/lib/api-client';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { handleGlobalError } from '@/lib/error-handler';

export const MemoryExplorer = ({ projectId }: { projectId: string }) => {
    const [memory, setMemory] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");

    useEffect(() => {
        const fetchMemory = async () => {
            try {
                const res = await api.frontend.workshop.memory.$get({ query: { projectId } });
                if (res.ok) {
                    const data = await res.json();
                    setMemory(data.memory);
                }
            } catch (e: unknown) {
                const msg = e instanceof Error ? e.message : String(e);
                handleGlobalError(`Failed to load memory. ${msg}`);
            } finally {
                setLoading(false);
            }
        };
        fetchMemory();
    }, [projectId]);

    const filtered = memory.filter(m => m.content.toLowerCase().includes(search.toLowerCase()));

    return (
        <Card className="dark w-full h-[650px] flex flex-col bg-[#0a0a0a] text-zinc-50 border-zinc-800 shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-[150px] bg-gradient-to-b from-blue-900/10 to-transparent pointer-events-none" />
            <CardHeader className="border-b border-zinc-800 p-6 bg-zinc-950/80 z-10">
                <div className="flex justify-between items-center gap-4">
                    <CardTitle className="text-2xl font-extrabold tracking-tight text-white">Agent Memory Explorer</CardTitle>
                    <div className="relative w-72">
                        <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-zinc-500 opacity-60">🔍</div>
                        <Input 
                            value={search} onChange={(e) => setSearch(e.target.value)}
                            className="bg-zinc-900/80 border-zinc-700/80 pl-10 text-zinc-200 focus:ring-blue-500 placeholder:text-zinc-600 shadow-inner h-10" 
                            placeholder="Query vector space..." 
                        />
                    </div>
                </div>
            </CardHeader>
            <CardContent className="flex-1 p-0 overflow-hidden z-10 bg-transparent">
                <ScrollArea className="h-full">
                    {loading ? (
                        <div className="p-8 space-y-4">
                            {[1, 2, 3].map(i => <div key={i} className="h-24 w-full bg-zinc-900/50 animate-pulse rounded-lg border border-zinc-800/50" />)}
                        </div>
                    ) : filtered.length > 0 ? (
                        <div className="p-6 space-y-4">
                            {filtered.map((m) => (
                                <div key={m.id} className="p-5 bg-zinc-900/60 hover:bg-zinc-900 transition-colors border border-zinc-800/80 rounded-xl group flex flex-col shadow-sm">
                                    <div className="flex justify-between items-center mb-3">
                                        <Badge variant="outline" className="text-[10px] text-zinc-500 border-zinc-700/80 font-mono tracking-[0.15em] bg-zinc-950 px-2 py-0.5">
                                            ID: {m.id.split('-')[0]}
                                        </Badge>
                                        <Badge className={`text-[9px] font-bold tracking-[0.2em] uppercase px-2.5 py-0.5 rounded-full border-0 ${m.conflictStatus === 'resolved' ? 'bg-green-900/40 text-green-400' : m.conflictStatus === 'conflict' ? 'bg-amber-900/40 text-amber-400' : 'bg-blue-900/20 text-blue-400'}`}>
                                            {m.conflictStatus || 'stored'}
                                        </Badge>
                                    </div>
                                    <div className="text-zinc-300 leading-relaxed text-sm font-mono">
                                        {m.content}
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center p-16 h-full text-zinc-500">
                            <span className="text-4xl mb-4 opacity-30">🌌</span>
                            <span className="text-sm tracking-wide">Semantic search yielded no matching dimensions.</span>
                        </div>
                    )}
                </ScrollArea>
            </CardContent>
        </Card>
    );
};
