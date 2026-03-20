import { toast } from "sonner";
import { AlertCircle, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Centralized Global Error Handler
 * Parses exceptions and renders a persistent Shadcn-styled toast with a 'Copy to AI' button.
 */
export function handleGlobalError(error: unknown) {
    let message = "An unknown error occurred";
    
    // Attempt to extract the closest literal error string
    if (error instanceof Error) {
        message = error.message;
    } else if (typeof error === "string") {
        message = error;
    } else if (error && typeof error === "object" && 'error' in error) {
        message = String((error as any).error);
    } else {
        try {
            message = JSON.stringify(error);
        } catch (e) {
            console.error("Failed to stringify error:", JSON.stringify(e));
        }
    }

    const handleCopy = () => {
        if (typeof navigator !== 'undefined' && navigator.clipboard) {
            navigator.clipboard.writeText(message);
            toast.success("Error copied to clipboard", { duration: 2000 });
        }
    };

    toast.custom((t) => (
        <div className="flex w-full flex-col gap-3 rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-destructive shadow-lg backdrop-blur-md">
            <div className="flex items-start gap-3">
                <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                <div className="flex-1 space-y-1 overflow-hidden">
                    <p className="font-semibold text-[15px] leading-none tracking-tight">System Error</p>
                    <div className="text-sm opacity-90 font-mono bg-destructive/5 p-2 rounded mt-2 max-h-32 overflow-y-auto whitespace-pre-wrap word-break-all">
                        {message}
                    </div>
                </div>
            </div>
            <div className="flex w-full justify-end gap-2">
                <Button 
                    variant="ghost" 
                    size="sm" 
                    className="h-8 text-xs text-destructive hover:bg-destructive/20 hover:text-destructive"
                    onClick={() => toast.dismiss(t)}
                >
                    Dismiss
                </Button>
                <Button 
                    variant="destructive" 
                    size="sm" 
                    className="h-8 text-xs gap-1.5 px-3 bg-red-500/20 hover:bg-red-500/30 text-red-500 border border-red-500/20 shadow-none dark:bg-red-500/20 dark:hover:bg-red-500/30 dark:text-red-400"
                    onClick={() => handleCopy()}
                >
                    <Copy className="h-3.5 w-3.5" />
                    Copy for AI
                </Button>
            </div>
        </div>
    ), {
        duration: Number.POSITIVE_INFINITY, // keep it open so user can copy
        id: "global-error-toast" // Prevents spamming exact same toasts
    });
}
