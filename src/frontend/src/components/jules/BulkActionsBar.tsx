import React from 'react';
import { Button } from '@/components/ui/button';
import { ArrowUpDown, Flag, Trash2, X } from 'lucide-react';

interface BulkActionsBarProps {
  selectedCount: number;
  onChangeStatus: () => void;
  onSetPriority: () => void;
  onDelete: () => void;
  onClearSelection: () => void;
}

export function BulkActionsBar({
  selectedCount,
  onChangeStatus,
  onSetPriority,
  onDelete,
  onClearSelection,
}: BulkActionsBarProps) {
  if (selectedCount === 0) return null;

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-5 py-3 bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl shadow-black/50">
      <span className="text-sm text-zinc-300 font-medium mr-2">
        {selectedCount} selected
      </span>
      <Button
        size="sm"
        variant="outline"
        onClick={onChangeStatus}
        className="border-zinc-700 hover:bg-zinc-800 text-zinc-300 text-xs"
      >
        <ArrowUpDown className="h-3 w-3 mr-1.5" />
        Change Status
      </Button>
      <Button
        size="sm"
        variant="outline"
        onClick={onSetPriority}
        className="border-zinc-700 hover:bg-zinc-800 text-zinc-300 text-xs"
      >
        <Flag className="h-3 w-3 mr-1.5" />
        Set Priority
      </Button>
      <Button
        size="sm"
        variant="outline"
        onClick={onDelete}
        className="border-zinc-700 hover:bg-red-950 text-zinc-400 hover:text-red-400 text-xs"
      >
        <Trash2 className="h-3 w-3 mr-1.5" />
        Delete
      </Button>
      <button
        onClick={onClearSelection}
        className="ml-1 p-1 hover:bg-zinc-800 rounded transition-colors"
      >
        <X className="h-4 w-4 text-zinc-500" />
      </button>
    </div>
  );
}
