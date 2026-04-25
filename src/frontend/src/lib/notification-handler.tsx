/**
 * @file frontend/src/lib/notification-handler.tsx
 *
 * Centralized notification handlers for warning, info, loading, and promise patterns.
 * Complements error-handler.tsx and success-handler.tsx to eliminate ALL direct
 * sonner imports across the codebase.
 *
 * Usage:
 *   import { handleGlobalWarning } from '@/lib/notification-handler';
 *   import { handleGlobalInfo } from '@/lib/notification-handler';
 *   import { handleGlobalLoading } from '@/lib/notification-handler';
 *   import { handleGlobalPromise } from '@/lib/notification-handler';
 */

import { toast } from "sonner";
import { AlertTriangle, Info, Loader2, CheckCircle2, AlertCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";

// ── Warning Handler ──────────────────────────────────────────────────────────

/**
 * Renders a styled amber warning toast with optional description.
 */
export function handleGlobalWarning(title: string, message?: string | React.ReactNode, duration: number = 6000) {
    const toastId = `warning-${title.substring(0, 50)}`;

    toast.custom((t) => (
        <div className="flex w-full flex-col gap-3 rounded-lg border border-amber-500/50 bg-amber-500/10 p-4 text-amber-500 shadow-lg backdrop-blur-md dark:text-amber-400">
            <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500 dark:text-amber-400" />
                <div className="flex-1 space-y-1 overflow-hidden">
                    <p className="font-semibold text-[15px] leading-none tracking-tight">{title}</p>
                    {message && (
                        <div className="text-sm opacity-90 p-1 rounded mt-1 overflow-y-auto whitespace-pre-wrap word-break-all text-amber-600 dark:text-amber-300">
                            {message}
                        </div>
                    )}
                </div>
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 shrink-0 rounded-md text-amber-500 hover:bg-amber-500/20 hover:text-amber-600 dark:text-amber-400 dark:hover:text-amber-300"
                    onClick={() => toast.dismiss(t)}
                >
                    <X className="h-4 w-4" />
                    <span className="sr-only">Close</span>
                </Button>
            </div>
        </div>
    ), {
        duration,
        id: toastId,
    });
}

// ── Info Handler ─────────────────────────────────────────────────────────────

/**
 * Renders a styled blue info toast with optional description.
 */
export function handleGlobalInfo(title: string, message?: string | React.ReactNode, duration: number = 4000) {
    const toastId = `info-${title.substring(0, 50)}`;

    toast.custom((t) => (
        <div className="flex w-full flex-col gap-3 rounded-lg border border-blue-500/50 bg-blue-500/10 p-4 text-blue-500 shadow-lg backdrop-blur-md dark:text-blue-400">
            <div className="flex items-start gap-3">
                <Info className="mt-0.5 h-5 w-5 shrink-0 text-blue-500 dark:text-blue-400" />
                <div className="flex-1 space-y-1 overflow-hidden">
                    <p className="font-semibold text-[15px] leading-none tracking-tight">{title}</p>
                    {message && (
                        <div className="text-sm opacity-90 p-1 rounded mt-1 overflow-y-auto whitespace-pre-wrap word-break-all text-blue-600 dark:text-blue-300">
                            {message}
                        </div>
                    )}
                </div>
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 shrink-0 rounded-md text-blue-500 hover:bg-blue-500/20 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300"
                    onClick={() => toast.dismiss(t)}
                >
                    <X className="h-4 w-4" />
                    <span className="sr-only">Close</span>
                </Button>
            </div>
        </div>
    ), {
        duration,
        id: toastId,
    });
}

// ── Loading Handler ──────────────────────────────────────────────────────────

/**
 * Renders a styled loading toast with spinner. Returns a handle with `.dismiss()`.
 *
 * Usage:
 *   const loader = handleGlobalLoading("Dispatching to Jules...");
 *   // ... async work ...
 *   loader.dismiss();
 *   handleGlobalSuccess("Dispatched", "Session created");
 */
export function handleGlobalLoading(title: string, message?: string): { dismiss: () => void; id: string } {
    const toastId = `loading-${title.substring(0, 50)}-${Date.now()}`;

    toast.custom(() => (
        <div className="flex w-full flex-col gap-3 rounded-lg border border-zinc-500/50 bg-zinc-500/10 p-4 text-zinc-300 shadow-lg backdrop-blur-md">
            <div className="flex items-start gap-3">
                <Loader2 className="mt-0.5 h-5 w-5 shrink-0 text-zinc-400 animate-spin" />
                <div className="flex-1 space-y-1 overflow-hidden">
                    <p className="font-semibold text-[15px] leading-none tracking-tight">{title}</p>
                    {message && (
                        <div className="text-sm opacity-90 p-1 rounded mt-1 text-zinc-400">
                            {message}
                        </div>
                    )}
                </div>
            </div>
        </div>
    ), {
        duration: Number.POSITIVE_INFINITY,
        id: toastId,
    });

    return {
        dismiss: () => toast.dismiss(toastId),
        id: toastId,
    };
}

// ── Promise Handler ──────────────────────────────────────────────────────────

interface PromiseMessages {
    loading: string;
    success: string;
    error: string;
}

/**
 * Wraps a promise with loading→success/error toast transitions.
 * Replaces `toast.promise(...)` with centralized, styled toasts.
 *
 * Usage:
 *   await handleGlobalPromise(
 *     fetch('/api/sync'),
 *     { loading: "Syncing...", success: "Sync complete", error: "Sync failed" }
 *   );
 */
export async function handleGlobalPromise<T>(
    promise: Promise<T>,
    messages: PromiseMessages,
): Promise<T> {
    const toastId = `promise-${messages.loading.substring(0, 40)}-${Date.now()}`;

    // Show loading state
    toast.custom(() => (
        <div className="flex w-full flex-col gap-3 rounded-lg border border-zinc-500/50 bg-zinc-500/10 p-4 text-zinc-300 shadow-lg backdrop-blur-md">
            <div className="flex items-start gap-3">
                <Loader2 className="mt-0.5 h-5 w-5 shrink-0 text-zinc-400 animate-spin" />
                <div className="flex-1 space-y-1 overflow-hidden">
                    <p className="font-semibold text-[15px] leading-none tracking-tight">{messages.loading}</p>
                </div>
            </div>
        </div>
    ), {
        duration: Number.POSITIVE_INFINITY,
        id: toastId,
    });

    try {
        const result = await promise;

        // Replace loading with success
        toast.custom((t) => (
            <div className="flex w-full flex-col gap-3 rounded-lg border border-emerald-500/50 bg-emerald-500/10 p-4 text-emerald-500 shadow-lg backdrop-blur-md dark:text-emerald-400">
                <div className="flex items-start gap-3">
                    <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500 dark:text-emerald-400" />
                    <div className="flex-1 space-y-1 overflow-hidden">
                        <p className="font-semibold text-[15px] leading-none tracking-tight">{messages.success}</p>
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
            duration: 3000,
            id: toastId,
        });

        return result;
    } catch (err) {
        // Replace loading with error
        toast.custom((t) => (
            <div className="flex w-full flex-col gap-3 rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-destructive shadow-lg backdrop-blur-md">
                <div className="flex items-start gap-3">
                    <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                    <div className="flex-1 space-y-1 overflow-hidden">
                        <p className="font-semibold text-[15px] leading-none tracking-tight">{messages.error}</p>
                    </div>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 shrink-0 rounded-md text-destructive hover:bg-destructive/20 hover:text-destructive"
                        onClick={() => toast.dismiss(t)}
                    >
                        <X className="h-4 w-4" />
                        <span className="sr-only">Close</span>
                    </Button>
                </div>
            </div>
        ), {
            duration: 5000,
            id: toastId,
        });

        throw err;
    }
}
