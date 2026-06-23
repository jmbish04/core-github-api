import { toast } from "sonner";
import { CheckCircle2, X } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Centralized Global Success Handler
 * Renders a persistent or auto-dismissing Shadcn-styled toast for successful actions.
 */
export function handleGlobalSuccess(title: string, message?: string | React.ReactNode, duration: number = 3000) {
    const toastId = `success-${title.substring(0, 50)}`; // Unique ID per title to replace previous similar toasts

    toast.custom((t) => (
        <div className="flex w-full flex-col gap-3 rounded-lg border border-emerald-500/50 bg-emerald-500/10 p-4 text-emerald-500 shadow-lg backdrop-blur-md dark:text-emerald-400">
            <div className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500 dark:text-emerald-400" />
                <div className="flex-1 space-y-1 overflow-hidden">
                    <p className="font-semibold text-[15px] leading-none tracking-tight">{title}</p>
                    {message && (
                        <div className="text-sm opacity-90 p-1 rounded mt-1 overflow-y-auto whitespace-pre-wrap word-break-all text-emerald-600 dark:text-emerald-300">
                            {message}
                        </div>
                    )}
                </div>
                <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-6 w-6 shrink-0 rounded-md text-emerald-500 hover:bg-emerald-500/20 hover:text-emerald-600 dark:text-emerald-400 dark:hover:text-emerald-300"
                    onClick={() => toast.dismiss(t)}
                >
                    <X className="h-4 w-4" />
                    <span className="sr-only">Close</span>
                </Button>
            </div>
        </div>
    ), {
        duration,
        id: toastId 
    });
}
