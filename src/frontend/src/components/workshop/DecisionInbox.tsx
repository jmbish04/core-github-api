import React, { useEffect, useState } from 'react';
import { api } from '@/lib/api-client';
import { Card, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { handleGlobalError } from "@/lib/error-handler";

export const DecisionInbox = () => {
    const [events, setEvents] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [processingId, setProcessingId] = useState<string | null>(null);

    useEffect(() => {
        fetchInbox();
    }, []);

    const fetchInbox = async () => {
        setLoading(true);
        try {
            const res = await api.frontend.workshop.inbox.$get();
            if (res.ok) {
                const data = await res.json();
                setEvents(data.events);
            }
        } catch (err) {
            handleGlobalError(`Failed to load inbox: ${err}`);
        } finally {
            setLoading(false);
        }
    };

    const handleDecision = async (eventId: string, decision: 'approved' | 'rejected') => {
        setProcessingId(eventId);
        try {
            const res = await api.frontend.workshop.decision.$post({
                json: { eventId, decision }
            });
            if (res.ok) {
                toast.success(`Action ${decision} successfully.`);
                setEvents(events.filter(e => e.id !== eventId));
            } else {
                handleGlobalError(`Failed to apply decision. ${res}`);
            }
        } catch (err) {
            handleGlobalError(`Error applying decision: ${err}`);
            
        } finally {
            setProcessingId(null);
        }
    };

    return (
        <div className="dark w-full max-w-4xl mx-auto space-y-6">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-5">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-zinc-50">Decision Inbox</h1>
                    <p className="text-zinc-400 mt-1">Review blocked agent actions across workspaces.</p>
                </div>
                <Badge variant="secondary" className="bg-blue-900/40 text-blue-300 hover:bg-blue-900/60 transition-colors pointer-events-none text-sm px-3 py-1">
                    {events.length} Pending
                </Badge>
            </div>

            <ScrollArea className="h-[600px] w-full pr-4 pb-4">
                {loading ? (
                    <div className="space-y-4">
                        {[1, 2, 3].map(i => (
                            <Card key={i} className="bg-zinc-950 border-zinc-800 border-dashed animate-pulse w-full h-32" />
                        ))}
                    </div>
                ) : events.length > 0 ? (
                    <div className="space-y-4">
                        {events.map((event) => (
                            <Card key={event.id} className="bg-zinc-950 border-zinc-800 hover:border-blue-900/50 transition-colors group relative overflow-hidden">
                                <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-amber-500/50 to-orange-600/50" />
                                <CardHeader className="pb-3 pl-6">
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <CardTitle className="text-lg text-zinc-100 flex items-center gap-2">
                                                <span className="text-amber-500">⚠️</span>
                                                Action Required: {event.actor}
                                            </CardTitle>
                                            <CardDescription className="text-zinc-400 font-mono text-xs mt-1.5 line-clamp-2 pr-8 leading-relaxed">
                                                {typeof event.content === 'object' ? JSON.stringify(event.content) : String(event.content)}
                                            </CardDescription>
                                        </div>
                                        <Badge variant="outline" className="text-xs text-zinc-500 border-zinc-800 bg-zinc-900/50 uppercase tracking-wider tabular-nums">
                                            {new Date(event.createdAt).toLocaleDateString()}
                                        </Badge>
                                    </div>
                                </CardHeader>
                                <CardFooter className="flex justify-end gap-3 pt-2 pb-4 pl-6 border-t border-zinc-900/50 mt-2 bg-zinc-900/10">
                                    <Button 
                                        variant="outline" 
                                        onClick={() => handleDecision(event.id, 'rejected')}
                                        disabled={!!processingId}
                                        className="border-zinc-700 bg-zinc-900 text-red-400 hover:bg-red-950 hover:text-red-300 hover:border-red-900/50 w-24"
                                    >
                                        {processingId === event.id ? "Wait..." : "Reject"}
                                    </Button>
                                    <Button 
                                        onClick={() => handleDecision(event.id, 'approved')}
                                        disabled={!!processingId}
                                        className="bg-blue-600 text-white hover:bg-blue-500 border-0 shadow-md shadow-blue-900/20 w-24"
                                    >
                                        {processingId === event.id ? "Wait..." : "Approve"}
                                    </Button>
                                </CardFooter>
                            </Card>
                        ))}
                    </div>
                ) : (
                    <div className="flex flex-col items-center justify-center h-[500px] text-zinc-500 border border-dashed border-zinc-800 rounded-lg bg-zinc-950/50">
                        <div className="text-5xl mb-4 opacity-50 grayscale select-none">📭</div>
                        <h3 className="text-lg font-medium text-zinc-300">Inbox Zero</h3>
                        <p className="text-sm mt-1 text-zinc-500">No blocked actions require your attention.</p>
                    </div>
                )}
            </ScrollArea>
        </div>
    );
};
