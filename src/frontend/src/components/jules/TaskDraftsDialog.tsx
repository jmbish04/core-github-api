import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useTaskDrafts, TaskDraft } from '@/hooks/jules/useTaskDrafts';
import { FileText, Trash2, ArrowRight } from 'lucide-react';

interface TaskDraftsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLoadDraft: (draft: TaskDraft) => void;
}

export function TaskDraftsDialog({ open, onOpenChange, onLoadDraft }: TaskDraftsDialogProps) {
  const { drafts, removeDraft } = useTaskDrafts();

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-zinc-950 border-zinc-800 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-zinc-100">Saved Drafts</DialogTitle>
          <DialogDescription className="text-zinc-400">
            Resume a previously saved task draft.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 max-h-80 overflow-y-auto">
          {drafts.length === 0 ? (
            <div className="text-center py-8 text-zinc-500">
              <FileText className="h-8 w-8 mx-auto mb-2 text-zinc-600" />
              <p className="text-sm">No saved drafts.</p>
            </div>
          ) : (
            drafts.map((draft) => (
              <div
                key={draft.id}
                className="flex items-start gap-3 p-3 rounded-lg bg-zinc-900 border border-zinc-800 hover:border-zinc-700 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-zinc-200 truncate">{draft.title}</p>
                  <p className="text-xs text-zinc-500 mt-1 line-clamp-2">
                    {draft.content.length > 100
                      ? `${draft.content.substring(0, 100)}...`
                      : draft.content}
                  </p>
                  <p className="text-xs text-zinc-600 mt-1.5">{formatDate(draft.createdAt)}</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      onLoadDraft(draft);
                      onOpenChange(false);
                    }}
                    className="border-zinc-700 hover:bg-zinc-800 text-zinc-300 text-xs h-7 px-2"
                  >
                    <ArrowRight className="h-3 w-3" />
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => removeDraft(draft.id)}
                    className="border-zinc-700 hover:bg-red-950 text-zinc-400 hover:text-red-400 text-xs h-7 px-2"
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
