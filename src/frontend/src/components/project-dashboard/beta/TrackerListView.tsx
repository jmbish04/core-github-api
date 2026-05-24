/**
 * @file TrackerListView.tsx
 * @description Hierarchical list view with checkboxes, on-the-fly tagging,
 * and floating bulk action bar with canned responses.
 */

import React, { useState, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  CheckSquare,
  Square,
  ChevronRight,
  ChevronDown,
  MoreHorizontal,
  Tag,
  ArrowUpRight,
  Trash2,
  Circle,
  Clock,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
} from 'lucide-react';
import type { TrackerTask } from './TrackerLayout';

interface TrackerListViewProps {
  tasks: TrackerTask[];
  isLoading: boolean;
  onTaskUpdate: (id: string, updates: Partial<TrackerTask>) => void;
  onTaskDelete: (id: string) => void;
}

const STATUS_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  backlog: Circle,
  todo: Circle,
  in_progress: Clock,
  review: Loader2,
  done: CheckCircle2,
};

const STATUS_COLORS: Record<string, string> = {
  backlog: 'text-zinc-500',
  todo: 'text-blue-400',
  in_progress: 'text-amber-400',
  review: 'text-purple-400',
  done: 'text-emerald-400',
};

const PRIORITY_COLORS: Record<string, string> = {
  low: 'bg-zinc-700 text-zinc-300',
  medium: 'bg-blue-900/50 text-blue-300',
  high: 'bg-amber-900/50 text-amber-300',
  critical: 'bg-red-900/50 text-red-300',
};

const STATUSES = ['backlog', 'todo', 'in_progress', 'review', 'done'] as const;

const BULK_ACTIONS = [
  { label: 'Move to In Progress', status: 'in_progress' },
  { label: 'Move to Done', status: 'done' },
  { label: 'Move to Backlog', status: 'backlog' },
];

export function TrackerListView({ tasks, isLoading, onTaskUpdate, onTaskDelete }: TrackerListViewProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(STATUSES as unknown as string[]));
  const [editingTag, setEditingTag] = useState<string | null>(null);
  const [tagInput, setTagInput] = useState('');

  // Group tasks by status
  const groupedTasks = useMemo(() => {
    const groups: Record<string, TrackerTask[]> = {};
    for (const status of STATUSES) {
      groups[status] = tasks.filter((t) => t.status === status);
    }
    return groups;
  }, [tasks]);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === tasks.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(tasks.map((t) => t.id)));
    }
  };

  const toggleGroup = (status: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(status)) next.delete(status);
      else next.add(status);
      return next;
    });
  };

  const handleBulkAction = (status: string) => {
    selectedIds.forEach((id) => {
      onTaskUpdate(id, { status: status as TrackerTask['status'] });
    });
    setSelectedIds(new Set());
  };

  const handleAddTag = (taskId: string) => {
    if (!tagInput.trim()) return;
    const task = tasks.find((t) => t.id === taskId);
    if (task) {
      onTaskUpdate(taskId, { tags: [...(task.tags || []), tagInput.trim()] });
    }
    setTagInput('');
    setEditingTag(null);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Header Row */}
      <div className="sticky top-0 z-10 bg-background border-b">
        <div className="flex items-center gap-3 px-4 py-2 text-xs text-muted-foreground">
          <button
            onClick={toggleSelectAll}
            className="shrink-0"
            aria-label="Select all tasks"
            title="Select all tasks"
          >
            {selectedIds.size === tasks.length && tasks.length > 0 ? (
              <CheckSquare className="w-4 h-4 text-primary" />
            ) : (
              <Square className="w-4 h-4" />
            )}
          </button>
          <span className="w-8 text-center">#</span>
          <span className="flex-1">Title</span>
          <span className="w-20 text-center">Priority</span>
          <span className="w-24 text-center">Assignee</span>
          <span className="w-28 text-center">Updated</span>
          <span className="w-8" />
        </div>
      </div>

      {/* Grouped Task List */}
      <div className="divide-y divide-border/30">
        {STATUSES.map((status) => {
          const group = groupedTasks[status] || [];
          const isExpanded = expandedGroups.has(status);
          const StatusIcon = STATUS_ICONS[status] || Circle;

          return (
            <div key={status}>
              {/* Group Header */}
              <button
                onClick={() => toggleGroup(status)}
                className="w-full flex items-center gap-2 px-4 py-2 text-sm font-medium hover:bg-accent/30 transition-colors"
              >
                {isExpanded ? (
                  <ChevronDown className="w-4 h-4 text-muted-foreground" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                )}
                <StatusIcon className={cn('w-4 h-4', STATUS_COLORS[status])} />
                <span className="capitalize">{status.replace('_', ' ')}</span>
                <Badge variant="secondary" className="text-[10px] h-5 ml-1">
                  {group.length}
                </Badge>
              </button>

              {/* Task Rows */}
              {isExpanded && (
                <div className="divide-y divide-border/20">
                  {group.map((task, idx) => (
                    <div
                      key={task.id}
                      className={cn(
                        'flex items-center gap-3 px-4 py-2 text-sm hover:bg-accent/20 transition-colors group',
                        selectedIds.has(task.id) && 'bg-accent/10'
                      )}
                    >
                      <button
                        onClick={() => toggleSelect(task.id)}
                        className="shrink-0"
                        aria-label={`Select task: ${task.title}`}
                        title={`Select task: ${task.title}`}
                      >
                        {selectedIds.has(task.id) ? (
                          <CheckSquare className="w-4 h-4 text-primary" />
                        ) : (
                          <Square className="w-4 h-4 text-muted-foreground" />
                        )}
                      </button>

                      <span className="w-8 text-center text-xs text-muted-foreground font-mono">
                        {idx + 1}
                      </span>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="truncate font-medium">{task.title}</span>
                          {task.githubHtmlUrl && (
                            <a
                              href={task.githubHtmlUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              <ExternalLink className="w-3 h-3 text-muted-foreground hover:text-foreground" />
                            </a>
                          )}
                        </div>
                        {/* Tags */}
                        <div className="flex items-center gap-1 mt-0.5">
                          {task.epicTitle && (
                            <Badge variant="outline" className="text-[10px] h-4 px-1 font-normal">
                              {task.epicTitle}
                            </Badge>
                          )}
                          {task.tags?.map((tag) => (
                            <Badge
                              key={tag}
                              variant="secondary"
                              className="text-[10px] h-4 px-1 font-normal"
                            >
                              {tag}
                            </Badge>
                          ))}
                          {editingTag === task.id ? (
                            <Input
                              value={tagInput}
                              onChange={(e) => setTagInput(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleAddTag(task.id);
                                if (e.key === 'Escape') setEditingTag(null);
                              }}
                              onBlur={() => setEditingTag(null)}
                              autoFocus
                              className="h-4 w-20 text-[10px] px-1 py-0"
                              placeholder="tag..."
                            />
                          ) : (
                            <button
                              onClick={() => setEditingTag(task.id)}
                              className="opacity-0 group-hover:opacity-100 transition-opacity"
                              aria-label="Add tag"
                              title="Add tag"
                            >
                              <Tag className="w-3 h-3 text-muted-foreground hover:text-foreground" />
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="w-20 text-center">
                        {task.priority && (
                          <Badge className={cn('text-[10px] h-5', PRIORITY_COLORS[task.priority])}>
                            {task.priority}
                          </Badge>
                        )}
                      </div>

                      <div className="w-24 text-center text-xs text-muted-foreground truncate">
                        {task.assignee || '—'}
                      </div>

                      <div className="w-28 text-center text-xs text-muted-foreground">
                        {task.updatedAt
                          ? new Date(task.updatedAt).toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                            })
                          : '—'}
                      </div>

                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100"
                          >
                            <MoreHorizontal className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48">
                          {STATUSES.filter((s) => s !== task.status).map((s) => (
                            <DropdownMenuItem
                              key={s}
                              onClick={() => onTaskUpdate(task.id, { status: s })}
                            >
                              <ArrowUpRight className="w-3.5 h-3.5 mr-2" />
                              Move to {s.replace('_', ' ')}
                            </DropdownMenuItem>
                          ))}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => onTaskDelete(task.id)}
                            className="text-red-400"
                          >
                            <Trash2 className="w-3.5 h-3.5 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  ))}

                  {group.length === 0 && (
                    <div className="px-4 py-3 text-xs text-muted-foreground italic pl-12">
                      No tasks
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Floating Bulk Action Bar */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-zinc-900 border border-zinc-700 rounded-lg shadow-2xl px-4 py-2 flex items-center gap-3">
          <span className="text-sm text-muted-foreground">
            <Badge variant="secondary" className="mr-2">
              {selectedIds.size}
            </Badge>
            selected
          </span>
          <div className="h-4 w-px bg-zinc-700" />
          {BULK_ACTIONS.map(({ label, status }) => (
            <Button
              key={status}
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() => handleBulkAction(status)}
            >
              {label}
            </Button>
          ))}
          <div className="h-4 w-px bg-zinc-700" />
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs text-red-400 hover:text-red-300"
            onClick={() => setSelectedIds(new Set())}
          >
            Clear
          </Button>
        </div>
      )}
    </div>
  );
}
