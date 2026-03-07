
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Activity } from "lucide-react";
import { useState, useEffect } from "react";
import { useAuth } from "@/context/auth-context";

interface HealthWidgetProps extends React.HTMLAttributes<HTMLDivElement> {
    status?: "healthy" | "degraded" | "unhealthy" | "unknown";
}

export function HealthWidget({ className, status: initialStatus = "unknown" }: HealthWidgetProps) {
    const [status, setStatus] = useState<HealthWidgetProps["status"]>(initialStatus);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const { apiKey } = useAuth();

    useEffect(() => {
        const fetchHealth = async () => {
            if (!apiKey) return; // Prevent 401s when not logged in
            try {
                const res = await fetch(`/api/health/latest?t=${Date.now()}`, {
                    method: "GET",
                    cache: "no-store",
                    credentials: "include",
                    headers: {
                        'x-api-key': apiKey
                    }
                });
                if (res.ok) {
                    const data = (await res.json()) as any;
                    // API returns { run: { status: 'healthy|degraded|unhealthy' }, results: [...] }
                    setStatus(data.run?.status || "unknown");
                    setErrorMsg(null);
                } else {
                    const data = (await res.json().catch(() => ({}))) as any;
                    setStatus("unhealthy");
                    setErrorMsg(data.error || res.statusText);
                }
            } catch (e: any) {
                setStatus("unhealthy");
                setErrorMsg(e.message || "Network Error");
            }
        };
        fetchHealth();
        const interval = setInterval(fetchHealth, 30000); // Poll every 30s
        return () => clearInterval(interval);
    }, [apiKey]);

    const statusColors = {
        healthy: "bg-emerald-500",
        degraded: "bg-yellow-500",
        unhealthy: "bg-red-500",
        unknown: "bg-gray-500",
    };

    return (
        <Link 
          to="/health" 
          className={cn("hover:opacity-80 transition-opacity", className)}
          title={errorMsg ? `Error: ${errorMsg}` : undefined}
        >
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full border bg-background/50 backdrop-blur-sm shadow-sm">
                <div className="relative flex h-2.5 w-2.5">
                    <span className={cn("animate-ping absolute inline-flex h-full w-full rounded-full opacity-75", statusColors[status || "unknown"])}></span>
                    <span className={cn("relative inline-flex rounded-full h-2.5 w-2.5", statusColors[status || "unknown"])}></span>
                </div>
                <span className="text-xs font-medium text-foreground">
                    System: <span className="uppercase">{status}</span>
                </span>
                <Activity className="h-3.5 w-3.5 text-muted-foreground ml-1" />
            </div>
        </Link>
    );
}
