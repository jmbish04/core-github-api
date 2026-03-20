/**
 * @file frontend/src/components/cloudflare-chat/CFDocsThinkingBar.tsx
 * @description Animated collapsible thinking/progress steps bar.
 * Shows each { type: "progress" } event as it arrives from the agent WebSocket.
 * Collapses to a single pill once the result is received.
 */

import { useState } from 'react';
import { ChevronDown, ChevronRight, Loader2, Cpu } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ThinkingStep } from './useCFDocsRuntime';

const STEP_LABELS: Record<string, string> = {
  searching_docs: 'Searching Cloudflare docs',
  mcp_done:       'Found documentation context',
  querying_ai:    'Querying AI model',
  ai_done:        'Response generated',
  fallback:       'Switching to Workers AI fallback',
};

interface CFDocsThinkingBarProps {
  steps: ThinkingStep[];
  isRunning: boolean;
}

export function CFDocsThinkingBar({ steps, isRunning }: CFDocsThinkingBarProps) {
  const [expanded, setExpanded] = useState(true);

  if (steps.length === 0 && !isRunning) return null;

  const lastStep = steps[steps.length - 1];

  return (
    <div className="rounded-lg border border-orange-500/20 bg-orange-500/5 overflow-hidden text-xs">
      {/* Collapsed header */}
      <button
        onClick={() => setExpanded((e) => !e)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-orange-500/5 transition-colors"
      >
        <Cpu className="w-3.5 h-3.5 text-orange-400 shrink-0" />
        <span className="flex-1 text-orange-300/90 font-medium truncate">
          {isRunning && lastStep
            ? (STEP_LABELS[lastStep.step] ?? lastStep.text)
            : isRunning
              ? 'Thinking…'
              : `Done (${steps.length} steps)`}
        </span>
        {isRunning && <Loader2 className="w-3 h-3 text-orange-400 animate-spin shrink-0" />}
        {expanded ? (
          <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        )}
      </button>

      {/* Steps list */}
      {expanded && steps.length > 0 && (
        <div className="px-3 pb-3 space-y-1.5 border-t border-orange-500/10">
          {steps.map((s, i) => {
            const isLast = i === steps.length - 1;
            return (
              <div key={i} className={cn('flex items-start gap-2 pt-1.5', isLast && isRunning ? 'opacity-100' : 'opacity-60')}>
                {isLast && isRunning
                  ? <Loader2 className="w-3 h-3 text-orange-400 animate-spin shrink-0 mt-0.5" />
                  : <span className="w-3 h-3 text-orange-400 shrink-0 mt-0.5 flex items-center justify-center">✓</span>}
                <span className="text-muted-foreground leading-tight">{s.text}</span>
              </div>
            );
          })}
          {isRunning && steps.length === 0 && (
            <div className="flex items-center gap-2 pt-1.5 opacity-60">
              <Loader2 className="w-3 h-3 text-orange-400 animate-spin shrink-0" />
              <span className="text-muted-foreground">Connecting…</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
