/**
 * @file frontend/src/components/cloudflare-chat/CFDocsFollowups.tsx
 * @description Follow-up prompt pill buttons rendered after each assistant reply.
 * Clicking a pill immediately submits it as the next user message.
 */

import { Sparkles } from 'lucide-react';

interface CFDocsFollowupsProps {
  prompts: string[];
  onSelect: (prompt: string) => void;
  disabled?: boolean;
}

export function CFDocsFollowups({ prompts, onSelect, disabled }: CFDocsFollowupsProps) {
  if (!prompts || prompts.length === 0) return null;

  return (
    <div className="mt-3 space-y-1.5">
      <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-widest text-muted-foreground/60">
        <Sparkles className="w-3 h-3" /> Suggested follow-ups
      </div>
      <div className="flex flex-wrap gap-2">
        {prompts.map((prompt, i) => (
          <button
            key={i}
            disabled={disabled}
            onClick={() => onSelect(prompt)}
            className="px-3 py-1.5 rounded-full border border-orange-500/25 bg-orange-500/5 text-xs text-orange-300/90
                       hover:bg-orange-500/15 hover:border-orange-500/50 hover:text-orange-200
                       disabled:opacity-40 disabled:cursor-not-allowed
                       transition-all duration-150 text-left"
          >
            {prompt}
          </button>
        ))}
      </div>
    </div>
  );
}
