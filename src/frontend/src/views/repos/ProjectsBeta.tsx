/**
 * @file views/repos/Projects.tsx
 * Repo-scoped Advanced Project Tracker.
 * 
 * Replaces the traditional flat list with an infinite-depth hierarchical tracker
 * inspired by Linear, Asana, and ClickUp.
 * 
 * Features:
 * - Infinite N-Level Hierarchy (Phase -> Epic -> Story -> Bug/Task rolling up)
 * - M:M Relationships (Epics living across multiple phases, tasks in multiple stories)
 * - Native Drag & Drop Reparenting
 * - Real-time WebSocket Updates with CSS Flash Animations
 * - Floating Bulk Action Bar for Multi-select
 * - Agent Worklog and Pause/Resume Tracking
 */

import { useOutletContext, useNavigate } from "react-router-dom";
import React, { useMemo, useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Search,
  FolderGit2,
  ChevronRight,
  ChevronDown,
  Plus,
  MoreHorizontal,
  GripVertical,
  Check,
  AlertCircle,
  Play,
  Pause,
  Layers,
  Zap,
  Bookmark,
  CheckCircle,
  Bug,
  LayoutGrid,
  CheckCircle2,
  CircleDashed,
  Circle,
  Clock,
  XCircle,
  User
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

// ── Types & Configuration ──────────────────────────────────────────────────

export type ItemType = "phase" | "epic" | "story" | "task" | "bug";

export interface WorkItem {
  id: string;
  type: ItemType;
  title: string;
  status: string;
  priority?: string;
  assignee?: string;
  parentIds: string[]; // Array to support M:M phase spanning
  childrenIds: string[];
  worklog?: string;
  isPaused?: boolean;
}

const TYPE_ICONS: Record<ItemType, React.ElementType> = {
  phase: LayoutGrid,
  epic: Zap,
  story: Bookmark,
  task: CheckCircle2,
  bug: Bug,
};

const TYPE_COLORS: Record<ItemType, string> = {
  phase: "text-indigo-400",
  epic: "text-purple-400",
  story: "text-emerald-400",
  task: "text-blue-400",
  bug: "text-rose-400",
};

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  backlog: { label: "Backlog", color: "text-zinc-500", icon: CircleDashed },
  todo: { label: "To Do", color: "text-zinc-300", icon: Circle },
  in_progress: { label: "In Progress", color: "text-amber-500", icon: Clock },
  in_review: { label: "In Review", color: "text-violet-500", icon: AlertCircle },
  done: { label: "Done", color: "text-emerald-500", icon: CheckCircle },
  cancelled: { label: "Cancelled", color: "text-rose-500", icon: XCircle },
};

// ── Normalization Helper ───────────────────────────────────────────────────

function normalizeData(phases: any[], tasks: any[]): Record<string, WorkItem> {
  const map: Record<string, WorkItem> = {};

  phases.forEach((p) => {
    map[p.id] = {
      id: p.id,
      type: "phase",
      title: p.name || p.title || "Unnamed Phase",
      status: p.status || "todo",
      parentIds: [],
      childrenIds: [],
    };
  });

  tasks.forEach((t) => {
    let inferredType: ItemType = "task";
    if (t.type) {
      inferredType = t.type as ItemType;
    } else {
      const lowerTitle = t.title?.toLowerCase() || "";
      if (lowerTitle.includes("epic")) inferredType = "epic";
      else if (lowerTitle.includes("story")) inferredType = "story";
      else if (lowerTitle.includes("bug")) inferredType = "bug";
    }

    const parentIds = t.parentIds ? [...t.parentIds] : [];
    if (t.parentId && !parentIds.includes(t.parentId)) parentIds.push(t.parentId);
    if (t.phaseId && !parentIds.includes(t.phaseId)) parentIds.push(t.phaseId);

    let formattedWorklog = "0h 0m";
    if (typeof t.worklog === 'number') {
      formattedWorklog = `${Math.floor(t.worklog / 60)}h ${t.worklog % 60}m`;
    } else if (typeof t.worklog === 'string') {
      formattedWorklog = t.worklog;
    }

    map[t.id] = {
      id: t.id,
      type: inferredType,
      title: t.title || "Untitled",
      status: t.kanbanColumn || t.status || "backlog",
      priority: t.priority,
      assignee: t.assignee,
      parentIds,
      childrenIds: t.childrenIds || [],
      worklog: formattedWorklog,
      isPaused: t.isPaused !== undefined ? t.isPaused : true,
    };
  });

  // Reconstruct bidirectional relationships for M:M mapping
  Object.values(map).forEach((item) => {
    item.parentIds.forEach((pId) => {
      if (map[pId] && !map[pId].childrenIds.includes(item.id)) {
        map[pId].childrenIds.push(item.id);
      }
    });
  });

  return map;
}

// ── Main Component ─────────────────────────────────────────────────────────

export default function RepoProjectsTracker() {
  const navigate = useNavigate();
  const { repoOwner, repoName, basePath, projectDetails, taskQueryData } = useOutletContext<any>();

  const [searchQuery, setSearchQuery] = useState("");
  const [itemsMap, setItemsMap] = useState<Record<string, WorkItem>>({});
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [flashingIds, setFlashingIds] = useState<Set<string>>(new Set());
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);

  // ── Initialization ───────────────────────────────────────────────────────

  useEffect(() => {
    const normalized = normalizeData(projectDetails?.phases || [], taskQueryData?.tasks || []);
    setItemsMap(normalized);
    
    // Auto-expand root phases by default
    const roots = Object.values(normalized).filter(i => i.type === "phase").map(i => i.id);
    setExpandedIds(new Set(roots));
  }, [projectDetails?.phases, taskQueryData?.tasks]);

  // ── WebSocket Integration ────────────────────────────────────────────────

  const triggerFlash = useCallback((id: string) => {
    setFlashingIds(prev => new Set(prev).add(id));
    setTimeout(() => {
      setFlashingIds(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }, 2000);
  }, []);

  const handleRemoteUpdate = useCallback((id: string, partialUpdate: Partial<WorkItem>) => {
    setItemsMap(prev => {
      if (!prev[id]) return prev;
      return { ...prev, [id]: { ...prev[id], ...partialUpdate } };
    });
    triggerFlash(id);
  }, [triggerFlash]);

  useEffect(() => {
    const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${wsProtocol}//${window.location.host}/api/projects/sentinel/ws`;
    
    let ws: WebSocket;
    try {
      ws = new WebSocket(wsUrl);
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === "task_updated" || data.type === "task_claimed" || data.type === "task_worklog_updated") {
            const id = data.taskId || data.id;
            const changes: Partial<WorkItem> = {};
            
            if (data.changes) {
              if (data.changes.status) changes.status = data.changes.status.to || data.changes.status;
              if (data.changes.assignee) changes.assignee = data.changes.assignee.to || data.changes.assignee;
              if (data.changes.priority) changes.priority = data.changes.priority.to || data.changes.priority;
              if (data.changes.isPaused !== undefined) changes.isPaused = data.changes.isPaused.to;
            }
            if (data.assignee !== undefined) changes.assignee = data.assignee;
            if (data.status !== undefined) changes.status = data.status;

            if (Object.keys(changes).length > 0 && id) {
              handleRemoteUpdate(id, changes);
            }
          }
        } catch (e) {}
      };
    } catch (e) {
      console.warn("Failed to connect to WS:", e);
    }

    return () => {
      if (ws) ws.close();
    };
  }, [handleRemoteUpdate]);

  // ── Actions ──────────────────────────────────────────────────────────────

  const toggleExpand = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelection = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const togglePause = async (id: string) => {
    const item = itemsMap[id];
    if (!item) return;
    const isPaused = !item.isPaused;
    
    handleRemoteUpdate(id, { isPaused });

    try {
      await fetch(`/api/tasks/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isPaused })
      });
    } catch (e) {
      console.error("Failed to toggle pause state", e);
    }
  };

  const handleBulkUpdateStatus = (status: string) => {
    const ids = Array.from(selectedIds);
    const updates: Record<string, WorkItem> = {};
    
    ids.forEach(id => {
      if (itemsMap[id]) {
        updates[id] = { ...itemsMap[id], status };
        triggerFlash(id);
      }
    });

    setItemsMap(prev => ({ ...prev, ...updates }));
    setSelectedIds(new Set());

    ids.forEach(id => {
      fetch(`/api/tasks/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status })
      }).catch(console.error);
    });
  };

  // ── Drag & Drop ──────────────────────────────────────────────────────────

  const handleDropToRoot = (dragId: string) => {
    setItemsMap(prev => {
      const next = { ...prev };
      const dragged = { ...next[dragId] };

      // Remove from old parents
      dragged.parentIds.forEach(pId => {
        if (next[pId]) {
          next[pId] = {
            ...next[pId],
            childrenIds: next[pId].childrenIds.filter(id => id !== dragId)
          };
        }
      });

      // Assign to root (no parents)
      dragged.parentIds = [];
      next[dragId] = dragged;
      triggerFlash(dragId);

      fetch(`/api/tasks/${dragId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parentIds: [] })
      }).catch(console.error);

      return next;
    });
  };

  const handleDrop = (dragId: string, targetId: string) => {
    if (dragId === targetId) return;

    // Prevent cyclic drops (dropping a parent into its own descendant)
    const isDescendant = (childId: string, ancestorId: string, visited = new Set<string>()): boolean => {
      if (visited.has(childId)) return false;
      visited.add(childId);
      if (childId === ancestorId) return true;
      const child = itemsMap[childId];
      if (!child) return false;
      return child.childrenIds.some(cId => isDescendant(cId, ancestorId, visited));
    };

    if (isDescendant(targetId, dragId)) {
      console.warn("Cannot drop a parent into its own descendant");
      return;
    }

    setItemsMap(prev => {
      const next = { ...prev };
      const dragged = { ...next[dragId] };
      const target = { ...next[targetId] };

      // Move interaction: Remove from old parents entirely
      dragged.parentIds.forEach(pId => {
        if (next[pId]) {
          next[pId] = {
            ...next[pId],
            childrenIds: next[pId].childrenIds.filter(id => id !== dragId)
          };
        }
      });

      // Assign to new parent
      dragged.parentIds = [targetId];
      target.childrenIds = Array.from(new Set([...target.childrenIds, dragId]));

      next[dragId] = dragged;
      next[targetId] = target;

      triggerFlash(dragId);

      // Async API sync
      fetch(`/api/tasks/${dragId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parentIds: [targetId] })
      }).catch(console.error);

      return next;
    });

    setExpandedIds(prev => new Set(prev).add(targetId));
  };

  // ── Rendering ────────────────────────────────────────────────────────────

  const rootItems = useMemo(() => {
    return Object.values(itemsMap).filter(item => item.parentIds.length === 0);
  }, [itemsMap]);

  const renderRow = (itemId: string, depth: number, visited: Set<string>) => {
    if (visited.has(itemId)) return null; // Break cycles
    const newVisited = new Set(visited).add(itemId);
    
    const item = itemsMap[itemId];
    if (!item) return null;

    // Apply search filter (keep parents if children match)
    const isMatch = item.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                    (item.assignee && item.assignee.toLowerCase().includes(searchQuery.toLowerCase()));
    
    const hasMatchingChildren = item.childrenIds.some(childId => {
      const child = itemsMap[childId];
      return child && (child.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
             (child.assignee && child.assignee.toLowerCase().includes(searchQuery.toLowerCase())));
    });

    if (searchQuery && !isMatch && !hasMatchingChildren) return null;

    const isExpanded = expandedIds.has(itemId);
    const isSelected = selectedIds.has(itemId);
    const isFlashing = flashingIds.has(itemId);
    const isDropTarget = dropTargetId === itemId;

    const Icon = TYPE_ICONS[item.type] || CheckCircle;
    const typeColor = TYPE_COLORS[item.type] || "text-zinc-400";
    const statusDef = STATUS_CONFIG[item.status] || STATUS_CONFIG.backlog;
    const StatusIcon = statusDef.icon;

    return (
      <div key={`${itemId}-${depth}-${Array.from(newVisited).join('-')}`} className="flex flex-col">
        <div
          draggable
          onDragStart={(e) => {
            e.stopPropagation();
            e.dataTransfer.setData("text/plain", itemId);
            setDraggedId(itemId);
          }}
          onDragOver={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (draggedId !== itemId) setDropTargetId(itemId);
          }}
          onDragLeave={() => setDropTargetId(null)}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (draggedId) handleDrop(draggedId, itemId);
            setDraggedId(null);
            setDropTargetId(null);
          }}
          className={cn(
            "group flex items-center gap-3 border-b border-zinc-800/40 py-2.5 px-4 text-sm transition-colors",
            isSelected ? "bg-indigo-500/10" : "hover:bg-zinc-800/30",
            isFlashing && "animate-flash",
            isDropTarget && "bg-indigo-500/20 ring-1 ring-inset ring-indigo-500/50"
          )}
        >
          {/* Controls & Indentation */}
          <div style={{ paddingLeft: `${depth * 1.5}rem` }} className="flex items-center gap-2 shrink-0">
            <input 
              type="checkbox"
              className="rounded border-zinc-700 bg-zinc-900 cursor-pointer accent-indigo-500 opacity-0 group-hover:opacity-100 data-[state=checked]:opacity-100 transition-opacity w-3.5 h-3.5"
              checked={isSelected}
              onChange={() => toggleSelection(itemId)}
            />
            <button
              onClick={(e) => { e.stopPropagation(); toggleExpand(itemId); }}
              className={cn("w-4 h-4 flex items-center justify-center text-zinc-500 hover:text-zinc-300", item.childrenIds.length === 0 && "invisible")}
            >
              {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </button>
            <GripVertical className="w-4 h-4 text-zinc-600 opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing shrink-0" />
          </div>

          {/* Title & Badge */}
          <div className="flex flex-1 items-center gap-2.5 min-w-[200px]">
            <Icon className={cn("w-4 h-4 shrink-0", typeColor)} />
            <span className={cn(
              "font-medium truncate",
              item.type === 'phase' ? "text-zinc-100" : "text-zinc-300",
              item.status === 'done' || item.status === 'cancelled' ? "text-zinc-500 line-through" : ""
            )}>
              {item.title}
            </span>
            <Badge variant="outline" className="text-[9px] uppercase tracking-wider text-zinc-500 border-zinc-800 hidden sm:flex h-5 items-center px-1.5">
              {item.type}
            </Badge>
          </div>

          {/* Columns */}
          <div className="flex items-center gap-4 shrink-0 w-[420px] justify-end">
            <div className="w-24 truncate text-xs text-zinc-400 text-right flex justify-end">
              {item.assignee ? (
                <div className="flex items-center gap-1.5 bg-zinc-800/60 px-2 py-0.5 rounded-full border border-zinc-700/50">
                  <User className="w-3 h-3 text-indigo-400" />
                  <span className="truncate">{item.assignee}</span>
                </div>
              ) : (
                <span className="text-zinc-600 border border-dashed border-zinc-700/50 px-1.5 py-0.5 rounded">Unassigned</span>
              )}
            </div>
            
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="w-16 h-6 px-1 flex justify-center hover:bg-zinc-800 text-zinc-400">
                  {item.priority ? (
                    <span className={cn(
                      "text-[10px] font-semibold px-1.5 py-0.5 rounded uppercase tracking-wider",
                      item.priority === "critical" || item.priority === "urgent" ? "text-rose-400 bg-rose-500/10" :
                      item.priority === "high" ? "text-amber-400 bg-amber-500/10" :
                      "text-zinc-400 bg-zinc-800"
                    )}>
                      {item.priority.substring(0, 3)}
                    </span>
                  ) : (
                    <span className="text-[10px] opacity-50">--</span>
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-32 bg-zinc-900 border-zinc-800">
                {["low", "medium", "high", "critical"].map(p => (
                  <DropdownMenuItem 
                    key={p}
                    onClick={() => {
                      handleRemoteUpdate(itemId, { priority: p });
                      fetch(`/api/tasks/${itemId}`, {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ priority: p })
                      }).catch(console.error);
                    }}
                    className="text-xs uppercase cursor-pointer focus:bg-zinc-800"
                  >
                    {p}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-6 w-28 justify-start gap-2 px-2 hover:bg-zinc-800 border border-transparent hover:border-zinc-700 transition-colors text-zinc-300">
                  <StatusIcon className={cn("w-3.5 h-3.5 shrink-0", statusDef.color)} />
                  <span className="text-[11px] font-medium truncate">{statusDef.label}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-40 bg-zinc-900 border-zinc-800">
                {Object.entries(STATUS_CONFIG).map(([key, cfg]) => {
                  const SIcon = cfg.icon;
                  return (
                    <DropdownMenuItem 
                      key={key} 
                      onClick={() => {
                        handleRemoteUpdate(itemId, { status: key });
                        fetch(`/api/tasks/${itemId}`, {
                          method: "PATCH",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ status: key })
                        }).catch(console.error);
                      }}
                      className="gap-2 text-xs cursor-pointer focus:bg-zinc-800"
                    >
                      <SIcon className={cn("w-3.5 h-3.5", cfg.color)} />
                      {cfg.label}
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
            
            <div className="w-24 flex items-center justify-end gap-2 pr-2">
               <span className={cn(
                 "text-[10px] font-mono",
                 item.isPaused ? "text-zinc-500" : "text-emerald-400"
               )}>
                 {item.worklog || "0h 0m"}
               </span>
               <button 
                 onClick={(e) => { e.stopPropagation(); togglePause(item.id); }}
                 className={cn(
                   "p-1 rounded-full hover:bg-zinc-700 transition-colors",
                   item.isPaused ? "text-zinc-500 hover:text-zinc-300" : "text-emerald-500 hover:bg-emerald-500/10 hover:text-emerald-400"
                 )}
                 title={item.isPaused ? "Resume Work" : "Pause Work"}
               >
                 {item.isPaused ? <Play className="w-3 h-3 fill-current" /> : <Pause className="w-3 h-3 fill-current" />}
               </button>
            </div>
            
            <div className="w-6 flex justify-end">
               <Button variant="ghost" size="icon" className="h-6 w-6 text-zinc-500 opacity-0 group-hover:opacity-100 hover:text-zinc-200">
                 <MoreHorizontal className="w-4 h-4" />
               </Button>
            </div>
          </div>
        </div>

        {/* Recursive Children */}
        {isExpanded && item.childrenIds.length > 0 && (
          <div className="flex flex-col">
            {item.childrenIds.map(childId => renderRow(childId, depth + 1, newVisited))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full space-y-6">
      {/* ── CSS Animations ── */}
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes flash-highlight {
          0% { background-color: rgba(99, 102, 241, 0.25); }
          100% { background-color: transparent; }
        }
        .animate-flash {
          animation: flash-highlight 1.5s ease-out forwards;
        }
      `}} />

      {/* ── Header ────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-zinc-100 flex items-center gap-2">
            <FolderGit2 className="w-5 h-5 text-indigo-400" />
            Project Tracker
          </h2>
          <p className="text-sm text-zinc-400">
            Hierarchical tracking for <span className="text-zinc-200 font-medium">{repoOwner}/{repoName}</span>
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => navigate(`${basePath}/projects/kanban`)}>
            Board View
          </Button>
          <Button size="sm" className="gap-1 bg-indigo-600 hover:bg-indigo-700 text-white">
            <Plus className="w-4 h-4" /> New Issue
          </Button>
        </div>
      </div>

      {/* ── Toolbar ───────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-zinc-500" />
          <Input
            placeholder="Search issues, epics, assignees..."
            className="pl-9 h-9 bg-zinc-900 border-zinc-800 focus-visible:ring-indigo-500"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* ── Data Grid ─────────────────────────────────────────────────── */}
      <div className="flex-1 border border-zinc-800/80 bg-zinc-950/50 rounded-xl overflow-hidden flex flex-col shadow-2xl relative min-h-0">
        
        {/* Table Header */}
        <div className="flex items-center px-4 py-3 border-b border-zinc-800/80 bg-zinc-900/60 text-xs font-semibold text-zinc-500 uppercase tracking-wider select-none z-10 backdrop-blur-sm">
          <div className="w-16 flex items-center gap-2 pl-1">
             <input 
               type="checkbox" 
               className="rounded border-zinc-700 bg-zinc-900 cursor-pointer accent-indigo-500 w-3.5 h-3.5"
               checked={selectedIds.size > 0 && selectedIds.size === Object.keys(itemsMap).length}
               onChange={(e) => {
                 if (e.target.checked) setSelectedIds(new Set(Object.keys(itemsMap)));
                 else setSelectedIds(new Set());
               }}
             />
          </div>
          <div className="flex-1 min-w-[200px]">Title</div>
          <div className="flex items-center gap-4 shrink-0 w-[420px] justify-end">
            <div className="w-24 text-right">Assignee</div>
            <div className="w-16 text-center">Priority</div>
            <div className="w-28 text-left">Status</div>
            <div className="w-24 text-right pr-2">Tracking</div>
            <div className="w-6"></div>
          </div>
        </div>
        
        {/* Table Body */}
        <div className="flex-1 overflow-y-auto">
          {rootItems.length === 0 ? (
             <div className="p-16 flex flex-col items-center justify-center text-zinc-500 text-sm h-full">
                <Layers className="w-12 h-12 mb-4 opacity-20" />
                <p>No work items found matching your criteria.</p>
             </div>
          ) : (
            <div 
              className="divide-y divide-zinc-800/20 pb-32 min-h-full"
              onDragOver={(e) => {
                e.preventDefault();
                if (draggedId) setDropTargetId('ROOT');
              }}
              onDragLeave={() => setDropTargetId(null)}
              onDrop={(e) => {
                e.preventDefault();
                if (draggedId && dropTargetId === 'ROOT') {
                  handleDropToRoot(draggedId);
                }
                setDropTargetId(null);
                setDraggedId(null);
              }}
            >
              {rootItems.map(item => renderRow(item.id, 0, new Set()))}
            </div>
          )}
        </div>

        {/* ── Floating Bulk Action Bar ──────────────────────────────────── */}
        {selectedIds.size > 0 && (
          <div className="absolute bottom-8 left-1/2 -translate-x-1/2 bg-zinc-800 border border-zinc-700 shadow-[0_10px_40px_-10px_rgba(0,0,0,0.5)] rounded-full px-6 py-3 flex items-center gap-4 z-50 animate-in slide-in-from-bottom-5 fade-in duration-200">
            <span className="text-sm font-medium text-zinc-200 flex items-center gap-2">
              <Badge className="bg-indigo-500 hover:bg-indigo-600 text-white rounded-full px-2">
                {selectedIds.size}
              </Badge>
              selected
            </span>
            <div className="w-px h-5 bg-zinc-600 mx-1" />
            <div className="flex gap-1.5">
              <Button size="sm" variant="ghost" onClick={() => handleBulkUpdateStatus('done')} className="h-8 hover:bg-zinc-700 text-zinc-300">
                <Check className="w-4 h-4 mr-2 text-emerald-400" /> Mark Done
              </Button>
              <Button size="sm" variant="ghost" onClick={() => handleBulkUpdateStatus('review')} className="h-8 hover:bg-zinc-700 text-zinc-300">
                <AlertCircle className="w-4 h-4 mr-2 text-violet-400" /> Request Review
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())} className="h-8 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700 ml-2">
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}