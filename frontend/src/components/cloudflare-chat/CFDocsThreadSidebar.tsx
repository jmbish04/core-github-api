/**
 * @file frontend/src/components/cloudflare-chat/CFDocsThreadSidebar.tsx
 * @description Thread list sidebar for the Cloudflare Docs Chat.
 * Threads show title, relative time, repo badge, and CF binding badges.
 * Supports new chat creation and individual thread deletion.
 */

import { useState } from 'react';
import { MessageSquare, Plus, Trash2, Server } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { type CFDocsThread, deleteThread } from '@/lib/cf-docs-thread-store';

const MAX_BADGES_SHOWN = 3;

interface CFDocsThreadSidebarProps {
  threads: CFDocsThread[];
  activeThreadId: string | null;
  onSelectThread: (id: string) => void;
  onNewThread: () => void;
  onThreadDeleted: (id: string) => void;
}

function ThreadBadges({ thread }: { thread: CFDocsThread }) {
  const badges = thread.bindingBadges.slice(0, MAX_BADGES_SHOWN);
  const overflow = thread.bindingBadges.length - MAX_BADGES_SHOWN;

  return (
    <div className="flex flex-wrap gap-1 mt-1.5">
      {thread.repoBadge && (
        <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 border-orange-500/40 text-orange-400/90 bg-orange-500/5 font-mono">
          {thread.repoBadge}
        </Badge>
      )}
      {badges.map((b) => (
        <Badge key={b} variant="outline" className="text-[9px] px-1.5 py-0 h-4 border-blue-500/40 text-blue-400/90 bg-blue-500/5">
          {b}
        </Badge>
      ))}
      {overflow > 0 && (
        <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 border-border/50 text-muted-foreground">
          +{overflow}
        </Badge>
      )}
    </div>
  );
}

export function CFDocsThreadSidebar({
  threads, activeThreadId, onSelectThread, onNewThread, onThreadDeleted,
}: CFDocsThreadSidebarProps) {
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  const handleDelete = (id: string) => {
    deleteThread(id);
    onThreadDeleted(id);
    setConfirmingId(null);
  };

  return (
    <div className="w-72 border-r bg-muted/5 flex flex-col shrink-0">
      {/* Header */}
      <div className="px-4 py-3 border-b flex items-center justify-between bg-background/50 backdrop-blur shrink-0">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Server className="w-4 h-4 text-orange-400" />
          CF Docs Chats
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 hover:bg-orange-500/10 hover:text-orange-400"
          onClick={onNewThread}
          aria-label="New chat"
        >
          <Plus className="w-4 h-4" />
        </Button>
      </div>

      {/* Thread list */}
      <ScrollArea className="flex-1">
        {threads.length === 0 ? (
          <div className="p-6 text-center text-xs text-muted-foreground space-y-2">
            <MessageSquare className="w-8 h-8 mx-auto opacity-20" />
            <p>No chats yet.<br />Click + to start a conversation.</p>
          </div>
        ) : (
          <div className="p-2 space-y-0.5">
            {threads.map((thread) => (
              <div
                key={thread.id}
                className={cn(
                  'group relative flex flex-col p-3 rounded-lg cursor-pointer transition-all',
                  activeThreadId === thread.id
                    ? 'bg-orange-500/10 border border-orange-500/20'
                    : 'hover:bg-muted/40 border border-transparent'
                )}
                onClick={() => onSelectThread(thread.id)}
              >
                <div className="flex items-start gap-2 min-w-0">
                  <MessageSquare className={cn(
                    'w-3.5 h-3.5 mt-0.5 shrink-0',
                    activeThreadId === thread.id ? 'text-orange-400' : 'text-muted-foreground/50'
                  )} />
                  <div className="flex-1 min-w-0 overflow-hidden">
                    <p className={cn(
                      'text-xs font-medium truncate leading-tight w-full',
                      activeThreadId === thread.id ? 'text-foreground' : 'text-foreground/80'
                    )}>
                      {thread.title}
                    </p>
                    <p className="text-[10px] text-muted-foreground/60 mt-0.5">
                      {formatDistanceToNow(new Date(thread.updatedAt), { addSuffix: true })}
                      {' · '}
                      {thread.messages.length} msg{thread.messages.length !== 1 ? 's' : ''}
                    </p>
                    <ThreadBadges thread={thread} />
                  </div>
                </div>

                {/* Delete / Confirm buttons */}
                {confirmingId === thread.id ? (
                  <div className="absolute top-2 right-2 flex items-center gap-1">
                    <button
                      onClick={(e) => { e.stopPropagation(); setConfirmingId(null); }}
                      className="px-1.5 py-0.5 rounded text-[9px] text-muted-foreground hover:text-foreground border border-border/40 hover:bg-muted"
                    >Cancel</button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDelete(thread.id); }}
                      className="px-1.5 py-0.5 rounded text-[9px] text-red-400 border border-red-500/30 hover:bg-red-500/10"
                    >Delete</button>
                  </div>
                ) : (
                  <button
                    onClick={(e) => { e.stopPropagation(); setConfirmingId(thread.id); }}
                    className="absolute top-2 right-2 p-1 rounded text-muted-foreground/30 hover:text-red-400 hover:bg-red-500/10 opacity-0 group-hover:opacity-100 transition-all"
                    aria-label="Delete thread"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
