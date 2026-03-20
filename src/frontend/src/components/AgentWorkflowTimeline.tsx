import { useEffect, useState } from 'react';
import { Timeline } from '@/components/ui/diceui/timeline';
import type { TimelineStep } from '@/components/ui/diceui/timeline';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { BrainCircuit } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';

interface Props {
    operationId: string;
}

export function AgentWorkflowTimeline({ operationId }: Props) {
    // Polling is efficiently handled by React Query
    const { data: steps = [] } = useQuery({
        queryKey: ['timeline', operationId],
        queryFn: async () => {
            if (!operationId) return [];
            const res = await axios.get(`/api/ops/${operationId}/timeline`);
            return res.data.timeline.map((item: any) => ({
                id: item.id,
                title: item.stepName,
                status: item.status,
                timestamp: item.timestamp,
                description: item.details
            }));
        },
        enabled: !!operationId,
        refetchInterval: (data) => {
            // Stop polling if last step is terminal? Or just keep generic poll
            // For now, poll every 2s
            return 2000;
        }
    });

    if (!operationId) {
        return (
            <Card className="h-[400px] border-zinc-800 bg-zinc-900/50 opacity-50">
                <CardHeader><CardTitle>Agent Brain</CardTitle></CardHeader>
                <CardContent className="flex items-center justify-center h-full">
                    <p className="text-zinc-500">Waiting for operation...</p>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card className="h-[400px] flex flex-col border-zinc-800 bg-zinc-900/50">
            <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                    <BrainCircuit className="w-4 h-4 text-purple-400" />
                    Agent Neural Timeline
                </CardTitle>
            </CardHeader>
            <CardContent className="flex-1 overflow-hidden p-0 px-4 pb-4">
                <Timeline steps={steps} />
            </CardContent>
        </Card>
    );
}
