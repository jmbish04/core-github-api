
import { Badge } from "@/components/ui/badge";
import { Loader2, CheckCircle2, XCircle, AlertTriangle } from "lucide-react";

interface StatusBadgeProps {
    status: 'idle' | 'running' | 'completed' | 'failed' | 'intervention_needed';
    runtime?: number;
}

export function ContainerStatusBadge({ status, runtime }: StatusBadgeProps) {
    if (status === 'idle') return <Badge variant="outline" className="text-zinc-500 border-zinc-700">Idle</Badge>;

    if (status === 'running') {
        return (
            <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-blue-400 border-blue-900 bg-blue-950/30 gap-1 animate-pulse">
                    <Loader2 className="w-3 h-3 animate-spin" /> Running
                </Badge>
                {runtime && <span className="text-xs font-mono text-zinc-400">{(runtime / 1000).toFixed(0)}s</span>}
            </div>
        );
    }

    if (status === 'completed') {
        return <Badge variant="outline" className="text-emerald-400 border-emerald-900 bg-emerald-950/30 gap-1"><CheckCircle2 className="w-3 h-3" /> Completed</Badge>;
    }

    if (status === 'intervention_needed') {
        return <Badge variant="destructive" className="gap-1"><AlertTriangle className="w-3 h-3" /> Intervention Needed</Badge>;
    }

    return <Badge variant="destructive" className="gap-1"><XCircle className="w-3 h-3" /> Failed</Badge>;
}
