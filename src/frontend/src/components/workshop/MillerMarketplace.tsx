import React, { useEffect, useState } from 'react';
import { api } from '@/lib/api-client';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { handleGlobalError } from '@/lib/error-handler';

export const MillerMarketplace = () => {
    const [specialists, setSpecialists] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedId, setSelectedId] = useState<string | null>(null);

    useEffect(() => {
        const fetchAgents = async () => {
            try {
                const res = await api.frontend.workshop.specialists.$get();
                if (res.ok) {
                    const data = await res.json();
                    setSpecialists(data);
                } else {
                    handleGlobalError("Failed to load specialists.");
                }
            } catch (e: unknown) {
                const msg = e instanceof Error ? e.message : String(e);
                handleGlobalError(`Error fetching marketplace data. ${msg}`);
            } finally {
                setLoading(false);
            }
        };
        fetchAgents();
    }, []);

    const selectedAgent = specialists.find(s => s.id === selectedId);

    return (
        <div className="dark flex h-[600px] w-full max-w-5xl rounded-lg border border-zinc-800 bg-zinc-950 overflow-hidden text-zinc-50 shadow-2xl">
            {/* Column 1: List */}
            <div className="w-1/3 border-r border-zinc-800 flex flex-col bg-zinc-950">
                <div className="p-4 border-b border-zinc-800 bg-zinc-900/40">
                    <h2 className="font-bold tracking-tight text-lg text-zinc-100">Agent Marketplace</h2>
                </div>
                <ScrollArea className="flex-1 p-2">
                    {loading ? (
                        <div className="space-y-3 pt-2">
                            {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full bg-zinc-800 rounded-md" />)}
                        </div>
                    ) : (
                        <div className="space-y-1">
                            {specialists.map(agent => (
                                <button
                                    key={agent.id}
                                    onClick={() => setSelectedId(agent.id)}
                                    className={`w-full text-left p-3 rounded-md transition-all duration-200 ${selectedId === agent.id ? 'bg-blue-900/20 border border-blue-500/30 shadow-[inset_4px_0_0_0_rgba(59,130,246,0.5)]' : 'hover:bg-zinc-900/60 text-zinc-400 border border-transparent'}`}
                                >
                                    <div className={`font-semibold text-sm ${selectedId === agent.id ? 'text-blue-200' : 'text-zinc-200'}`}>{agent.name}</div>
                                    <div className="text-xs text-zinc-500 truncate mt-1">{agent.description}</div>
                                </button>
                            ))}
                        </div>
                    )}
                </ScrollArea>
            </div>

            {/* Column 2: Details */}
            <div className="w-2/3 bg-zinc-950 p-8 flex flex-col relative overflow-hidden">
                <div className="absolute top-0 right-0 w-64 h-64 bg-blue-900/5 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none" />
                
                {selectedAgent ? (
                    <div className="animate-in fade-in slide-in-from-right-4 duration-300 z-10 w-full max-w-xl">
                        <div className="flex items-center gap-5 mb-8">
                            <div className="h-16 w-16 rounded-xl bg-zinc-900 border border-zinc-700/50 shadow-lg flex items-center justify-center text-3xl">
                                {selectedAgent.icon === 'Database' ? '🗄️' : selectedAgent.icon === 'Palette' ? '🎨' : '⚙️'}
                            </div>
                            <div>
                                <h1 className="text-3xl font-bold tracking-tight text-white mb-1">{selectedAgent.name}</h1>
                                <p className="text-sm text-zinc-500 font-mono tracking-wider uppercase">{selectedAgent.id}</p>
                            </div>
                        </div>
                        
                        <Card className="bg-zinc-900/40 border-zinc-800/80 mb-8 shadow-md">
                            <CardHeader className="pb-3">
                                <CardTitle className="text-xs font-bold text-zinc-400 uppercase tracking-widest">About the Specialist</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <p className="text-sm text-zinc-300 leading-relaxed">{selectedAgent.description}</p>
                            </CardContent>
                        </Card>

                        <div className="space-y-4 pl-1">
                            <h3 className="font-bold text-zinc-400 text-xs uppercase tracking-widest">Core Capabilities</h3>
                            <div className="flex flex-wrap gap-2">
                                {selectedAgent.capabilities.map((cap: string, i: number) => (
                                    <span key={i} className="px-3 py-1.5 bg-zinc-900/80 border border-zinc-700/50 rounded-md text-xs font-medium text-zinc-200 shadow-sm transition-all hover:border-zinc-500 hover:bg-zinc-800 cursor-default">
                                        {cap}
                                    </span>
                                ))}
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="flex flex-col items-center justify-center h-full text-zinc-500 animate-in fade-in duration-500">
                        <div className="text-6xl mb-6 opacity-40 grayscale">🤖</div>
                        <p className="text-lg tracking-wide text-zinc-400">Select an agent to view capabilities</p>
                    </div>
                )}
            </div>
        </div>
    );
};
