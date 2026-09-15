import React from 'react';
import { WorkItem, WorkItemRow } from '@/components/jules/WorkItemRow';

interface WorkItemGridProps {
  items: WorkItem[];
  expandedIds: Set<string>;
  selectedIds: Set<string>;
  onToggleExpand: (id: string) => void;
  onToggleSelect: (id: string) => void;
}

function flattenItems(items: WorkItem[], expandedIds: Set<string>): WorkItem[] {
  const result: WorkItem[] = [];
  for (const item of items) {
    result.push(item);
    if (item.children && item.children.length > 0 && expandedIds.has(item.id)) {
      result.push(...flattenItems(item.children, expandedIds));
    }
  }
  return result;
}

export function WorkItemGrid({
  items,
  expandedIds,
  selectedIds,
  onToggleExpand,
  onToggleSelect,
}: WorkItemGridProps) {
  const flatItems = flattenItems(items, expandedIds);

  return (
    <div className="overflow-x-auto rounded-lg border border-zinc-800">
      <table className="w-full">
        <thead>
          <tr className="border-b border-zinc-800 bg-zinc-900/50">
            <th className="px-3 py-3 w-10" />
            <th className="px-2 py-3 w-8 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider">Pri</th>
            <th className="px-3 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider">Title</th>
            <th className="px-3 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider">Status</th>
            <th className="px-3 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider">Estimate</th>
            <th className="px-3 py-3 text-right text-xs font-medium text-zinc-500 uppercase tracking-wider">Due Date</th>
          </tr>
        </thead>
        <tbody>
          {flatItems.map((item) => (
            <WorkItemRow
              key={item.id}
              item={item}
              isExpanded={expandedIds.has(item.id)}
              isSelected={selectedIds.has(item.id)}
              onToggleExpand={onToggleExpand}
              onToggleSelect={onToggleSelect}
              hasChildren={!!(item.children && item.children.length > 0)}
            />
          ))}
          {flatItems.length === 0 && (
            <tr>
              <td colSpan={6} className="px-3 py-12 text-center text-zinc-500">
                No work items match your filters.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
