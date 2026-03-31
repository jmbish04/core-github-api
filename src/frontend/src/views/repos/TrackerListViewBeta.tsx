/**
 * @file views/repos/TrackerListViewBeta.tsx
 * Hierarchical list view with on-the-fly tagging, multi-select,
 * and floating bulk action bar with canned worklog responses.
 *
 * Fetches data from /api/projects/sentinel/tasks/available
 * and /api/projects/sentinel/status.
 */

import React, { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import {
  ChevronRight,
  ChevronDown,
  CheckCircle2,
  Circle,
  MessageSquareText,
  Check,
  Plus,
  GripVertical,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Tag {
  id: string;
  name: string;
  color: string;
}

interface ListItem {
  id: string;
  type: string;
  title: string;
  status: string;
  assignee: string | null;
  tags: Tag[];
  children?: ListItem[];
}

const FALLBACK_DATA: ListItem[] = [
  {
    id: "ENG-101",
    type: "epic",
    title: "Overhaul Auth System",
    status: "in_progress",
    assignee: "Alex",
    tags: [{ id: "t1", name: "Security", color: "bg-rose-500/10 text-rose-400 border-rose-500/20" }],
    children: [
      { id: "ENG-102", type: "task", title: "Migrate to OAuth2 PKCE", status: "done", assignee: "Sarah", tags: [] },
      {
        id: "ENG-103",
        type: "task",
        title: "Update Login UI Components",
        status: "in_progress",
        assignee: "Alex",
        tags: [{ id: "t2", name: "Frontend", color: "bg-blue-500/10 text-blue-400 border-blue-500/20" }],
      },
    ],
  },
  { id: "ENG-104", type: "epic", title: "AI Analytics Dashboard", status: "todo", assignee: null, tags: [], children: [] },
];

const CANNED_RESPONSES = [
  "Code reviewed and approved. LGTM. +30m",
  "Blocked by external API dependency. +0m",
  "Deployed to staging environment. Awaiting QA. +45m",
];

export default function TrackerListViewBeta() {
  const { owner, repo } = useParams();
  const [items, setItems] = useState<ListItem[]>(FALLBACK_DATA);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set(["ENG-101"]));
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [newTagInput, setNewTagInput] = useState("");

  // Fetch tasks from sentinel API
  useEffect(() => {
    let cancelled = false;
    async function fetchTasks() {
      try {
        const res = await fetch("/api/projects/sentinel/tasks/available", {
          credentials: "include",
        });
        if (!res.ok) throw new Error("Failed to fetch");
        const data = await res.json();
        if (!cancelled && Array.isArray(data?.tasks) && data.tasks.length > 0) {
          const mapped: ListItem[] = data.tasks.map((t: any) => ({
            id: t.id || t.taskId || `TASK-${Math.random().toString(36).slice(2, 6)}`,
            type: t.type || "task",
            title: t.title || t.name || "Untitled",
            status: t.status || "todo",
            assignee: t.assignee || t.claimedBy || null,
            tags: t.tags || [],
            children: [],
          }));
          setItems(mapped);
        }
      } catch {
        // Keep fallback data
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchTasks();
    return () => { cancelled = true; };
  }, [owner, repo]);

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleBulkStatusUpdate = async (status: string) => {
    const ids = Array.from(selected);
    await Promise.allSettled(
      ids.map((id) =>
        fetch(`/api/projects/sentinel/tasks/${id}`, {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status }),
        })
      )
    );
    setItems((prev) =>
      prev.map((item) => (selected.has(item.id) ? { ...item, status } : item))
    );
    setSelected(new Set());
  };

  const renderRow = (item: ListItem, depth = 0) => {
    const isSelected = selected.has(item.id);
    const isExpanded = expanded.has(item.id);

    return (
      <div key={item.id}>
        <div
          className={cn(
            "flex items-center px-6 py-2.5 border-b border-zinc-800/40 hover:bg-zinc-800/30 transition-colors group",
            isSelected && "bg-indigo-500/10 hover:bg-indigo-500/10"
          )}
        >
          <div style={{ paddingLeft: `${depth * 1.5}rem` }} className="flex items-center gap-3 w-[450px]">
            <input
              type="checkbox"
              checked={isSelected}
              onChange={() => toggleSelect(item.id)}
              className="w-3.5 h-3.5 rounded border-zinc-700 bg-zinc-950 accent-indigo-500 cursor-pointer"
            />
            <button
              className={cn(
                "w-4 h-4 text-zinc-500 hover:text-zinc-300",
                (!item.children || item.children.length === 0) && "invisible"
              )}
              onClick={() => {
                const next = new Set(expanded);
                next.has(item.id) ? next.delete(item.id) : next.add(item.id);
                setExpanded(next);
              }}
            >
              {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </button>
            <GripVertical className="w-4 h-4 text-zinc-600 opacity-0 group-hover:opacity-100 cursor-grab shrink-0" />
            <span className="text-[10px] font-mono text-zinc-500 w-16 shrink-0">{item.id}</span>
            {item.status === "done" ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
            ) : (
              <Circle className="w-4 h-4 text-zinc-600 shrink-0" />
            )}
            <span className={cn("text-sm font-medium truncate", item.status === "done" && "text-zinc-500 line-through")}>
              {item.title}
            </span>
          </div>

          {/* On-the-fly Tags */}
          <div className="flex-1 flex items-center gap-1.5 px-4 min-w-0">
            {item.tags?.map((t) => (
              <Badge key={t.id} variant="outline" className={cn("text-[10px] h-5 px-1.5 border", t.color)}>
                {t.name}
              </Badge>
            ))}

            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-5 px-1.5 text-[10px] text-zinc-500 hover:text-zinc-300 opacity-0 group-hover:opacity-100 border border-dashed border-zinc-700 rounded-sm"
                >
                  <Plus className="w-3 h-3 mr-1" /> Tag
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-48 p-2 bg-zinc-900 border-zinc-800" align="start">
                <Input
                  placeholder="Type to create tag..."
                  className="h-8 text-xs bg-zinc-950 border-zinc-800 focus-visible:ring-indigo-500"
                  value={newTagInput}
                  onChange={(e) => setNewTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") setNewTagInput("");
                  }}
                />
              </PopoverContent>
            </Popover>
          </div>

          <div className="w-32 shrink-0">
            <Badge
              variant="outline"
              className="text-[10px] uppercase tracking-wider bg-zinc-900 border-zinc-800 text-zinc-400"
            >
              {item.status.replace("_", " ")}
            </Badge>
          </div>
          <div className="w-24 shrink-0 text-xs text-zinc-400">{item.assignee || "--"}</div>
        </div>

        {isExpanded && item.children?.map((child) => renderRow(child, depth + 1))}
      </div>
    );
  };

  return (
    <div className="h-full flex flex-col relative bg-zinc-950/50 rounded-xl border border-zinc-800/80 overflow-hidden shadow-xl">
      {/* Table Header */}
      <div className="flex items-center px-6 py-3 border-b border-zinc-800/60 bg-zinc-900/60 text-xs font-semibold text-zinc-500 uppercase tracking-wider">
        <div className="w-[450px] pl-7">Issue</div>
        <div className="flex-1 px-4">Tags</div>
        <div className="w-32">Status</div>
        <div className="w-24">Assignee</div>
      </div>

      <div className="flex-1 overflow-y-auto pb-32">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-zinc-500">
            <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading tasks...
          </div>
        ) : (
          items.map((item) => renderRow(item))
        )}
      </div>

      {/* Floating Bulk Action Bar */}
      {selected.size > 0 && (
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 bg-zinc-800 border border-zinc-700 shadow-[0_10px_40px_-10px_rgba(0,0,0,0.5)] rounded-full px-4 py-2 flex items-center gap-3 z-50 animate-in slide-in-from-bottom-5">
          <Badge className="bg-indigo-500 text-white rounded-full px-2">{selected.size}</Badge>
          <span className="text-xs font-medium text-zinc-300 pr-2 border-r border-zinc-700">Selected</span>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="ghost" className="h-7 text-xs hover:bg-zinc-700 text-zinc-300">
                <MessageSquareText className="w-3.5 h-3.5 mr-1.5 text-indigo-400" /> Canned Worklog
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="center" className="w-72 bg-zinc-950 border-zinc-800" sideOffset={10}>
              <DropdownMenuLabel className="text-[10px] text-zinc-500 uppercase tracking-wider">
                Apply to {selected.size} items
              </DropdownMenuLabel>
              <DropdownMenuSeparator className="bg-zinc-800" />
              {CANNED_RESPONSES.map((res, i) => (
                <DropdownMenuItem key={i} className="text-xs cursor-pointer focus:bg-zinc-800 text-zinc-300 py-2">
                  {res}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator className="bg-zinc-800" />
              <div className="p-2">
                <Input placeholder="Type custom log..." className="h-8 text-xs bg-zinc-900 border-zinc-800" />
              </div>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs hover:bg-zinc-700 text-zinc-300"
            onClick={() => handleBulkStatusUpdate("done")}
          >
            <Check className="w-3.5 h-3.5 mr-1.5 text-emerald-400" /> Mark Done
          </Button>

          <Button
            size="sm"
            variant="ghost"
            onClick={() => setSelected(new Set())}
            className="h-7 text-xs text-zinc-500 hover:text-zinc-200"
          >
            Clear
          </Button>
        </div>
      )}
    </div>
  );
}
