import React, { useEffect, useState } from 'react';
import { api } from '@/lib/api-client';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

export const FloatingCart = ({ projectId }: { projectId: string }) => {
    const [cartItems, setCartItems] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchDraft = async () => {
            try {
                const res = await api.frontend.workshop.draft.$get({ query: { projectId } });
                if (res.ok) {
                    const data = await res.json();
                    setCartItems(data.draftData?.selectedAgents || []);
                }
            } catch (err) {
                console.error("Cart error", err);
            } finally {
                setLoading(false);
            }
        };
        fetchDraft();
    }, [projectId]);

    return (
        <div className="dark fixed bottom-6 right-6 z-50 animate-in slide-in-from-bottom-5 duration-500 w-80 shadow-2xl">
            <Card className="bg-zinc-950 border border-zinc-800 backdrop-blur-sm bg-opacity-95 text-zinc-50 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-24 h-24 bg-blue-900/10 rounded-full blur-2xl -mr-10 -mt-10 pointer-events-none" />
                <CardHeader className="p-4 pb-2">
                    <CardTitle className="text-xs font-bold uppercase tracking-widest text-zinc-400 flex justify-between items-center">
                        <span>Cart</span>
                        <span className="bg-blue-600/20 text-blue-400 py-0.5 px-2 rounded-full text-[10px] uppercase font-bold tracking-widest">{cartItems.length} Agents</span>
                    </CardTitle>
                </CardHeader>
                <CardContent className="p-4 pt-1 space-y-4">
                    {loading ? (
                        <div className="space-y-2">
                            <Skeleton className="h-8 w-full bg-zinc-800/80 rounded" />
                            <Skeleton className="h-8 w-full bg-zinc-800/80 rounded" />
                        </div>
                    ) : cartItems.length > 0 ? (
                        <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                            {cartItems.map((item, idx) => (
                                <div key={idx} className="flex justify-between items-center bg-zinc-900/50 p-2.5 rounded-md border border-zinc-800/60 transition-colors hover:bg-zinc-800/50">
                                    <span className="text-sm font-medium text-zinc-200">{item}</span>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className="text-xs text-zinc-500 text-center py-6">No agents selected</p>
                    )}
                    <Button 
                        disabled={cartItems.length === 0} 
                        className="w-full bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-900/20 transition-all font-semibold rounded-md border-0"
                    >
                        Review Configuration
                    </Button>
                </CardContent>
            </Card>
        </div>
    );
};
