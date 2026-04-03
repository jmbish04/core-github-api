import React, { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { WorkItemGrid } from '@/components/jules/WorkItemGrid';
import { WorkItem } from '@/components/jules/WorkItemRow';
import { BulkActionsBar } from '@/components/jules/BulkActionsBar';
import { ListFilter } from 'lucide-react';

const mockWorkItems: WorkItem[] = [
  {
    id: 'wi-1',
    title: 'Authentication & Authorization Overhaul',
    status: 'in_progress',
    priority: 'critical',
    estimate: '8 pts',
    dueDate: 'Apr 10',
    depth: 0,
    children: [
      {
        id: 'wi-1a',
        title: 'Implement JWT refresh token rotation',
        status: 'done',
        priority: 'high',
        estimate: '3 pts',
        dueDate: 'Apr 5',
        depth: 1,
      },
      {
        id: 'wi-1b',
        title: 'Add OAuth2 provider support (GitHub, Google)',
        status: 'in_progress',
        priority: 'high',
        estimate: '5 pts',
        dueDate: 'Apr 8',
        depth: 1,
        children: [
          {
            id: 'wi-1b-i',
            title: 'GitHub OAuth callback handler',
            status: 'done',
            priority: 'medium',
            estimate: '2 pts',
            dueDate: 'Apr 6',
            depth: 2,
          },
          {
            id: 'wi-1b-ii',
            title: 'Google OAuth callback handler',
            status: 'todo',
            priority: 'medium',
            estimate: '2 pts',
            dueDate: 'Apr 8',
            depth: 2,
          },
        ],
      },
    ],
  },
  {
    id: 'wi-2',
    title: 'Database Migration to Drizzle ORM',
    status: 'todo',
    priority: 'high',
    estimate: '13 pts',
    dueDate: 'Apr 18',
    depth: 0,
    children: [
      {
        id: 'wi-2a',
        title: 'Define Drizzle schema from existing Prisma models',
        status: 'todo',
        priority: 'high',
        estimate: '5 pts',
        dueDate: 'Apr 12',
        depth: 1,
      },
      {
        id: 'wi-2b',
        title: 'Write migration scripts with data integrity checks',
        status: 'todo',
        priority: 'medium',
        estimate: '5 pts',
        dueDate: 'Apr 15',
        depth: 1,
      },
      {
        id: 'wi-2c',
        title: 'Update repository layer queries',
        status: 'todo',
        priority: 'medium',
        estimate: '3 pts',
        dueDate: 'Apr 18',
        depth: 1,
      },
    ],
  },
  {
    id: 'wi-3',
    title: 'Add end-to-end test coverage for onboarding',
    status: 'blocked',
    priority: 'medium',
    estimate: '5 pts',
    dueDate: 'Apr 14',
    depth: 0,
  },
  {
    id: 'wi-4',
    title: 'Performance optimization: reduce bundle size',
    status: 'todo',
    priority: 'low',
    estimate: '3 pts',
    dueDate: 'Apr 22',
    depth: 0,
    children: [
      {
        id: 'wi-4a',
        title: 'Audit and tree-shake unused dependencies',
        status: 'todo',
        priority: 'low',
        estimate: '1 pt',
        dueDate: 'Apr 20',
        depth: 1,
      },
      {
        id: 'wi-4b',
        title: 'Implement code-splitting for route-level chunks',
        status: 'todo',
        priority: 'low',
        estimate: '2 pts',
        dueDate: 'Apr 22',
        depth: 1,
      },
    ],
  },
  {
    id: 'wi-5',
    title: 'Set up error monitoring with Sentry integration',
    status: 'done',
    priority: 'medium',
    estimate: '2 pts',
    dueDate: 'Apr 2',
    depth: 0,
  },
];

type StatusFilter = 'all' | 'todo' | 'in_progress' | 'done' | 'blocked';
type PriorityFilter = 'all' | 'critical' | 'high' | 'medium' | 'low';

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
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>('all');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set(['wi-1', 'wi-2']));
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const filteredItems = useMemo(
    () => filterItems(mockWorkItems, statusFilter, priorityFilter),
    [statusFilter, priorityFilter]
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
          // Mock: set all selected to "in_progress"
          clearSelection();
        }}
        onSetPriority={() => {
          // Mock: set all selected to "high"
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
