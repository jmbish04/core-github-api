import React, { useEffect, useState } from 'react';
import { api } from '@/lib/api-client';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';

export const ConflictResolver = ({ projectId }: { projectId: string }) => {
    const [conflicts, setConflicts] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeIndex, setActiveIndex] = useState(0);
    const [editValue, setEditValue] = useState("");

    useEffect(() => {
        const fetchMemory = async () => {
            try {
                const res = await api.frontend.workshop.memory.$get({ query: { projectId } });
                if (res.ok) {
                    const data = await res.json();
                    const c = data.memory.filter((m: any) => m.conflictStatus !== 'resolved');
                    setConflicts(c);
                    if (c.length > 0) setEditValue(c[0].content);
                }
            } catch (e) {
                toast.error("Failed to load memory conflicts.");
            } finally {
                setLoading(false);
            }
        };
        fetchMemory();
    }, [projectId]);

    const activeConflict = conflicts[activeIndex];

    const handleResolve = async () => {
        if (!activeConflict) return;
        try {
            const res = await api.frontend.workshop['memory']['resolve'].$post({
                json: { memoryId: activeConflict.id, resolvedContent: editValue }
            });
            if (res.ok) {
                toast.success("Conflict resolved.");
                setConflicts(prev => prev.filter((_, i) => i !== activeIndex));
                setActiveIndex(0);
                if (conflicts.length > 1) {
                    setEditValue(conflicts[1].content);
                }
            } else {
                toast.error("Failed to resolve conflict.");
            }
        } catch (e) {
            toast.error("Error resolving conflict.");
        }
    };

    if (loading) return <div className="dark text-zinc-400 p-8 text-center animate-pulse">Scanning Neural Paths...</div>;
    
    if (conflicts.length === 0) {
        return (
            <Card className="dark w-full max-w-3xl mx-auto bg-zinc-950 border-zinc-800 text-zinc-50 border-dashed">
                <CardContent className="flex flex-col items-center justify-center h-64 text-zinc-500">
                    <div className="text-6xl mb-4 opacity-40">🧠</div>
                    <h2 className="text-lg font-bold text-zinc-300">Memory Integrity Optimal</h2>
                    <p className="text-sm mt-1">No conflicting knowledge chunks identified in the agent vector store.</p>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card className="dark w-full max-w-4xl mx-auto bg-zinc-950 text-zinc-50 border-zinc-800 shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-amber-600/10 rounded-full blur-3xl opacity-50 pointer-events-none" />
            <CardHeader className="border-b border-zinc-800 relative z-10 pb-4 bg-zinc-900/50">
                <div className="flex justify-between items-center">
                    <div>
                        <CardTitle className="text-xl font-bold flex items-center gap-2 text-zinc-100">
                            <span className="text-amber-500 animate-pulse text-2xl">⚡</span>
                            Knowledge Conflict Detected
                        </CardTitle>
                        <p className="text-xs text-zinc-400 mt-1.5 font-mono uppercase tracking-widest">{conflicts.length} unresolved memories remaining</p>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="p-6 space-y-6 relative z-10 bg-[#0a0a0a]">
                <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-3">
                        <label className="text-[10px] font-bold text-red-500/80 uppercase tracking-[0.2em] px-1 block">Original Semantic Chunk</label>
                        <div className="p-5 bg-zinc-900/80 border border-zinc-800/80 rounded-lg text-xs text-zinc-300 font-mono leading-relaxed h-[250px] overflow-y-auto shadow-inner">
                            {activeConflict.content}
                        </div>
                    </div>
                    <div className="space-y-3">
                        <label className="text-[10px] font-bold text-amber-500/80 uppercase tracking-[0.2em] px-1 block">Synthesized Resolution</label>
                        <Textarea 
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            className="w-full bg-zinc-900 border-zinc-700/80 text-xs font-mono text-zinc-200 h-[250px] resize-none focus:ring-amber-500/50 shadow-inner p-5 leading-relaxed"
                        />
                    </div>
                </div>
            </CardContent>
            <CardFooter className="flex justify-end gap-3 bg-zinc-900/80 p-5 border-t border-zinc-800 relative z-10">
                <Button variant="outline" onClick={() => setConflicts(prev => prev.filter((_, i) => i !== activeIndex))} className="border-zinc-700 text-zinc-400 hover:text-zinc-200 bg-transparent hover:bg-zinc-800 h-10 px-6">Dismiss</Button>
                <Button onClick={handleResolve} className="bg-amber-600 hover:bg-amber-700 text-white font-semibold shadow-md h-10 px-6 border-0">Commit Resolution</Button>
            </CardFooter>
        </Card>
    );
};
