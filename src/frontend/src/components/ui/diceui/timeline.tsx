import React from 'react';
import { cn } from '@/lib/utils';
import { CheckCircle2, Circle, Clock, XCircle } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';

export interface TimelineStep {
    id: string;
    title: string;
    status: 'pending' | 'active' | 'completed' | 'failed';
    timestamp?: string;
    description?: string;
}

interface TimelineProps {
    steps: TimelineStep[];
    className?: string;
}

export function Timeline({ steps, className }: TimelineProps) {
    return (
        <ScrollArea className={cn("h-full", className)}>
            <div className="relative pl-6 space-y-6 py-2">
                {/* Vertical Line */}
                <div className="absolute left-[11px] top-2 bottom-2 w-px bg-zinc-800" />

                {steps.map((step, i) => (
                    <div key={step.id || i} className="relative group">
                        {/* Icon Indicator */}
                        <div className={cn(
                            "absolute -left-[29px] w-6 h-6 rounded-full border-4 border-zinc-950 flex items-center justify-center z-10",
                            {
                                "bg-zinc-800 text-zinc-500": step.status === 'pending',
                                "bg-blue-600 text-white animate-pulse": step.status === 'active',
                                "bg-emerald-600 text-white": step.status === 'completed',
                                "bg-red-600 text-white": step.status === 'failed',
                            }
                        )}>
                            {step.status === 'pending' && <Circle className="w-3 h-3" />}
                            {step.status === 'active' && <Clock className="w-3 h-3" />}
                            {step.status === 'completed' && <CheckCircle2 className="w-3 h-3" />}
                            {step.status === 'failed' && <XCircle className="w-3 h-3" />}
                        </div>

                        {/* Content */}
                        <div className="flex flex-col gap-1">
                            <div className="flex items-center justify-between">
                                <span className={cn(
                                    "text-sm font-medium",
                                    step.status === 'active' ? 'text-blue-400' : 'text-zinc-200'
                                )}>
                                    {step.title}
                                </span>
                                {step.timestamp && (
                                    <span className="text-[10px] text-zinc-500 font-mono">
                                        {new Date(step.timestamp).toLocaleTimeString([], { hour12: false })}
                                    </span>
                                )}
                            </div>
                            {step.description && (
                                <p className="text-xs text-zinc-500">{step.description}</p>
                            )}
                            {step.status === 'failed' && (
                                <div className="mt-2 p-2 bg-red-950/20 border border-red-900/30 rounded text-xs text-red-300 font-mono">
                                    Step failed. Check logs for details.
                                </div>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </ScrollArea>
    );
}
