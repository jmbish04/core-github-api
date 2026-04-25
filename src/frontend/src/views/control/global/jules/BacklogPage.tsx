import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { WorkItemGrid } from '@/components/jules/WorkItemGrid';
import type { WorkItem } from '@/components/jules/WorkItemRow';
import { BulkActionsBar } from '@/components/jules/BulkActionsBar';
import { ListFilter, Loader2 } from 'lucide-react';
import { useBacklogItems, useUpdateTask } from '@/hooks/jules/useBacklogItems';
import type { BacklogTask } from '@/hooks/jules/useBacklogItems';

/** Map flat BacklogTask tree to WorkItem tree with depth */
function toWorkItem(task: BacklogTask, depth: number = 0): WorkItem {
  return {
    id: task.id,
    title: task.title,
    status: (task.status === 'backlog' ? 'todo' : task.status) as WorkItem['status'],
    priority: (task.priority || 'medium') as WorkItem['priority'],
    estimate: undefined,
    dueDate: undefined,
    depth,
    children: task.children?.map((c) => toWorkItem(c, depth + 1)),
  };
}

type StatusFilter = 'all' | 'todo' | 'in_progress' | 'done' | 'blocked';
type PriorityFilter = 'all' | 'critical' | 'high' | 'medium' | 'low';

import { useParams } from 'react-router-dom';

function filterItems(items: WorkItem[], status: StatusFilter, priority: PriorityFilter): WorkItem[] {
  return items
    .map((item) => {
      const matchesStatus = status === 'all' || item.status === status;
      const matchesPriority = priority === 'all' || item.priority === priority;
      const filteredChildren = item.children
        ? filterItems(item.children, status, priority)
        : [];

      if (matchesStatus && matchesPriority) {
        return { ...item, children: filteredChildren.length > 0 ? filteredChildren : item.children };
      }
      if (filteredChildren.length > 0) {
        return { ...item, children: filteredChildren };
      }
      return null;
    })
    .filter(Boolean) as WorkItem[];
}

export function BacklogPage() {
  const { owner, repo } = useParams<{ owner?: string; repo?: string }>();
  const projectId = owner && repo ? `${owner}/${repo}` : undefined;
  
  const { items: rawItems, isLoading, error } = useBacklogItems(projectId);
  const updateTask = useUpdateTask();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>('all');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const workItems = useMemo(() => rawItems.map((t) => toWorkItem(t)), [rawItems]);

  const filteredItems = useMemo(
    () => filterItems(workItems, statusFilter, priorityFilter),
    [workItems, statusFilter, priorityFilter]
  );

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const clearSelection = () => setSelectedIds(new Set());

  return (
    <div className="container max-w-7xl mx-auto py-6 px-4 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-zinc-100">Backlog</h1>
        <p className="text-sm text-zinc-400 mt-1">
          Review and prioritize upcoming work items.
        </p>
      </div>

      {/* Loading / Error states */}
      {isLoading && (
        <div className="flex items-center justify-center py-12 text-zinc-500 gap-2">
          <Loader2 className="w-5 h-5 animate-spin" />
          Loading backlog...
        </div>
      )}
      {error ? (
        <div className="text-sm text-red-400 bg-red-950/30 border border-red-900 rounded-md p-3">
          Failed to load backlog: {error instanceof Error ? error.message : String(error)}
        </div>
      ) : null}

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <ListFilter className="h-4 w-4 text-zinc-500" />
          <span className="text-xs text-zinc-500 uppercase tracking-wider font-medium">Filters</span>
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
          className="text-sm bg-zinc-900 border border-zinc-800 text-zinc-300 rounded-md px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-zinc-700"
        >
          <option value="all">All Statuses</option>
          <option value="todo">To Do</option>
          <option value="in_progress">In Progress</option>
          <option value="done">Done</option>
          <option value="blocked">Blocked</option>
        </select>
        <select
          value={priorityFilter}
          onChange={(e) => setPriorityFilter(e.target.value as PriorityFilter)}
          className="text-sm bg-zinc-900 border border-zinc-800 text-zinc-300 rounded-md px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-zinc-700"
        >
          <option value="all">All Priorities</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        {selectedIds.size > 0 && (
          <Button
            size="sm"
            variant="outline"
            onClick={clearSelection}
            className="border-zinc-700 hover:bg-zinc-800 text-zinc-400 text-xs ml-auto"
          >
            Clear Selection
          </Button>
        )}
      </div>

      {/* Work item table */}
      <WorkItemGrid
        items={filteredItems}
        expandedIds={expandedIds}
        selectedIds={selectedIds}
        onToggleExpand={toggleExpand}
        onToggleSelect={toggleSelect}
      />

      {/* Bulk actions */}
      <BulkActionsBar
        selectedCount={selectedIds.size}
        onChangeStatus={() => {
          for (const id of selectedIds) {
            updateTask.mutate({ id, status: 'in_progress' });
          }
          clearSelection();
        }}
        onSetPriority={() => {
          for (const id of selectedIds) {
            updateTask.mutate({ id, priority: 'high' });
          }
          clearSelection();
        }}
        onDelete={() => {
          clearSelection();
        }}
        onClearSelection={clearSelection}
      />
    </div>
  );
}

export default BacklogPage;
