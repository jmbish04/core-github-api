
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Activity } from "lucide-react";
import { useState, useEffect } from "react";

interface HealthWidgetProps extends React.HTMLAttributes<HTMLDivElement> {
    status?: "healthy" | "degraded" | "down" | "unknown";
}

export function HealthWidget({ className, status: initialStatus = "unknown" }: HealthWidgetProps) {
    const [status, setStatus] = useState<HealthWidgetProps["status"]>(initialStatus);

    useEffect(() => {
        const fetchHealth = async () => {
            try {
                const res = await fetch("/health");
                if (res.ok) {
                    const data = await res.json();
                    setStatus(data.status || "healthy");
                } else {
                    setStatus("down");
                }
            } catch (e) {
                setStatus("down");
            }
        };
        fetchHealth();
        const interval = setInterval(fetchHealth, 30000); // Poll every 30s
        return () => clearInterval(interval);
    }, []);

    const statusColors = {
        healthy: "bg-emerald-500",
        degraded: "bg-yellow-500",
        down: "bg-red-500",
        unknown: "bg-gray-500",
    };

    return (
        <Link to="/health" className={cn("hover:opacity-80 transition-opacity", className)}>
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
