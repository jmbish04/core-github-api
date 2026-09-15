import React from 'react';
import { Badge } from '@/components/ui/badge';
import { ChevronRight, ChevronDown, AlertTriangle, ArrowUp, ArrowDown, Minus } from 'lucide-react';

export interface WorkItem {
  id: string;
  title: string;
  status: 'todo' | 'in_progress' | 'done' | 'blocked';
  priority: 'critical' | 'high' | 'medium' | 'low';
  estimate?: string;
  dueDate?: string;
  depth: number;
  children?: WorkItem[];
}

interface WorkItemRowProps {
  item: WorkItem;
  isExpanded: boolean;
  isSelected: boolean;
  onToggleExpand: (id: string) => void;
  onToggleSelect: (id: string) => void;
  hasChildren: boolean;
}

const priorityIcons: Record<string, React.ReactNode> = {
  critical: <AlertTriangle className="h-3.5 w-3.5 text-red-400" />,
  high: <ArrowUp className="h-3.5 w-3.5 text-orange-400" />,
  medium: <Minus className="h-3.5 w-3.5 text-zinc-400" />,
  low: <ArrowDown className="h-3.5 w-3.5 text-zinc-500" />,
};

const statusVariants: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  todo: 'outline',
  in_progress: 'secondary',
  done: 'default',
  blocked: 'destructive',
};

const statusLabels: Record<string, string> = {
  todo: 'To Do',
  in_progress: 'In Progress',
  done: 'Done',
  blocked: 'Blocked',
};

export function WorkItemRow({
  item,
  isExpanded,
  isSelected,
  onToggleExpand,
  onToggleSelect,
  hasChildren,
}: WorkItemRowProps) {
  return (
    <tr className={`border-b border-zinc-800 hover:bg-zinc-900/50 transition-colors ${isSelected ? 'bg-zinc-900/80' : ''}`}>
      <td className="px-3 py-3 w-10">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={() => onToggleSelect(item.id)}
          className="rounded border-zinc-600 bg-zinc-800"
        />
      </td>
      <td className="px-2 py-3 w-8">
        {priorityIcons[item.priority]}
      </td>
      <td className="px-3 py-3">
        <div className="flex items-center gap-1" style={{ paddingLeft: `${item.depth * 24}px` }}>
          {hasChildren ? (
            <button
              onClick={() => onToggleExpand(item.id)}
              className="p-0.5 hover:bg-zinc-800 rounded transition-colors shrink-0"
            >
              {isExpanded ? (
                <ChevronDown className="h-4 w-4 text-zinc-400" />
              ) : (
                <ChevronRight className="h-4 w-4 text-zinc-400" />
              )}
            </button>
          ) : (
            <span className="w-5" />
          )}
          <span className="text-sm text-zinc-200">{item.title}</span>
        </div>
      </td>
      <td className="px-3 py-3">
        <Badge variant={statusVariants[item.status]} className="text-xs">
          {statusLabels[item.status]}
        </Badge>
      </td>
      <td className="px-3 py-3 text-sm text-zinc-400">{item.estimate || '-'}</td>
      <td className="px-3 py-3 text-sm text-zinc-400 text-right">{item.dueDate || '-'}</td>
    </tr>
  );
}
