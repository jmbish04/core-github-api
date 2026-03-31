import React, { useEffect, useState } from 'react';
import { api } from '@/lib/api-client';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';

export const ReviewSummary = ({ projectId }: { projectId: string }) => {
    const [draftData, setDraftData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [launching, setLaunching] = useState(false);

    useEffect(() => {
        const fetchDraft = async () => {
            try {
                const res = await api.frontend.workshop.draft.$get({ query: { projectId } });
                if (res.ok) {
                    const data = await res.json();
                    setDraftData(data.draftData);
                } else {
                    toast.error("Failed to load draft data.");
                }
            } catch (err) {
                toast.error("Error loading draft.");
            } finally {
                setLoading(false);
            }
        };
        fetchDraft();
    }, [projectId]);

    const handleLaunch = async () => {
        setLaunching(true);
        try {
            const res = await api.frontend.workshop.init.$post({
                json: { projectId }
            });
            if (res.ok) {
                toast.success("Project launched successfully!");
                // Trigger animation or navigation
                window.location.href = `/projects/default/default/workshop`;
            } else {
                toast.error("Failed to launch project.");
            }
        } catch (err) {
            toast.error("Error launching project.");
        } finally {
            setLaunching(false);
        }
    };

    return (
        <Card className="dark w-full max-w-2xl bg-zinc-950 text-zinc-50 border-zinc-800">
            <CardHeader>
                <CardTitle className="text-2xl font-bold tracking-tight">Review & Launch</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                {loading ? (
                    <div className="space-y-2">
                        <Skeleton className="h-4 w-[250px] bg-zinc-800" />
                        <Skeleton className="h-4 w-[200px] bg-zinc-800" />
                    </div>
                ) : (
                    <div className="p-4 bg-zinc-900 rounded-md border border-zinc-800">
                        <h3 className="font-semibold mb-2">Selected Agents Configuration</h3>
                        { draftData?.selectedAgents?.length > 0 ? (
                            <ul className="list-disc pl-5 space-y-1 text-sm text-zinc-300">
                                {draftData.selectedAgents.map((agent: string, idx: number) => (
                                    <li key={idx}>{agent}</li>
                                ))}
                            </ul>
                        ) : (
                            <p className="text-zinc-500 text-sm">No agents configured.</p>
                        )}
                        <div className="mt-4 pt-4 border-t border-zinc-800">
                            <p className="text-sm text-zinc-400">Estimated Cost: <span className="font-medium text-green-400">{draftData?.estimatedCost || "$0.00"}/mo</span></p>
                        </div>
                    </div>
                )}
            </CardContent>
            <CardFooter className="flex justify-end gap-3">
                <Button variant="outline" className="border-zinc-700 bg-transparent hover:bg-zinc-800 text-zinc-300">Back to Agents</Button>
                <Button onClick={handleLaunch} disabled={loading || launching} className="bg-blue-600 hover:bg-blue-700 text-white border-0">
                    {launching ? "Launching..." : "Launch Project"}
                </Button>
            </CardFooter>
        </Card>
    );
};
