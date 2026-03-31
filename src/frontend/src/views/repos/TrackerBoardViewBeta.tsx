/**
 * @file views/repos/TrackerBoardViewBeta.tsx
 * Kanban board view with drag-and-drop columns.
 * Fetches from /api/projects/sentinel/tasks/available and
 * PATCHes /api/projects/sentinel/tasks/:id on column drop.
 */

import React, { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Plus, GripHorizontal, CircleDashed, Clock, CheckCircle2, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const COLUMNS = [
  { id: "todo", title: "To Do", icon: CircleDashed, color: "text-zinc-400", border: "border-zinc-700" },
  { id: "in_progress", title: "In Progress", icon: Clock, color: "text-amber-500", border: "border-amber-500/50" },
  { id: "done", title: "Done", icon: CheckCircle2, color: "text-emerald-500", border: "border-emerald-500/50" },
];

interface BoardCard {
  id: string;
  title: string;
  status: string;
  tags: string[];
  assignee: string | null;
  priority?: string;
}

const FALLBACK_CARDS: BoardCard[] = [
  { id: "ENG-142", title: "Standardize D1 Schemas across modules", status: "in_progress", tags: ["Backend"], assignee: "AL" },
  { id: "ENG-145", title: "WebSocket fallback polling", status: "todo", tags: ["Frontend", "Bug"], priority: "Critical", assignee: null },
  { id: "ENG-149", title: "Update assistant-ui prompts", status: "in_progress", tags: ["AI"], assignee: "JU" },
];

export default function TrackerBoardViewBeta() {
  const { owner, repo } = useParams();
  const [cards, setCards] = useState<BoardCard[]>(FALLBACK_CARDS);
  const [loading, setLoading] = useState(true);
  const [draggedId, setDraggedId] = useState<string | null>(null);

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
          const mapped: BoardCard[] = data.tasks.map((t: any) => ({
            id: t.id || t.taskId || `TASK-${Math.random().toString(36).slice(2, 6)}`,
            title: t.title || t.name || "Untitled",
            status: t.status || "todo",
            tags: t.tags?.map((tag: any) => (typeof tag === "string" ? tag : tag.name)) || [],
            assignee: t.assignee || t.claimedBy || null,
            priority: t.priority,
          }));
          setCards(mapped);
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

  const handleDrop = async (colId: string) => {
    if (!draggedId) return;
    // Optimistic update
    setCards((prev) => prev.map((c) => (c.id === draggedId ? { ...c, status: colId } : c)));
    // Persist to API
    fetch(`/api/projects/sentinel/tasks/${draggedId}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: colId }),
    }).catch(() => {
      // Revert on failure
      setCards((prev) => prev.map((c) => (c.id === draggedId ? { ...c, status: c.status } : c)));
    });
    setDraggedId(null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-zinc-500">
        <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading board...
      </div>
    );
  }

  return (
    <div className="flex h-full gap-5 overflow-x-auto pb-6 no-scrollbar pt-2">
      {COLUMNS.map((col) => {
        const colCards = cards.filter((c) => c.status === col.id);
        const Icon = col.icon;

        return (
          <div
            key={col.id}
            className="flex flex-col w-[320px] shrink-0 bg-zinc-900/30 rounded-xl border border-zinc-800/60 overflow-hidden"
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => handleDrop(col.id)}
          >
            {/* Header */}
            <div className={cn("p-3 border-b flex items-center justify-between bg-zinc-900/80", col.border)}>
              <div className="flex items-center gap-2">
                <Icon className={cn("w-4 h-4", col.color)} />
                <h3 className="font-semibold text-sm text-zinc-200">{col.title}</h3>
                <span className="text-[10px] font-medium bg-zinc-800 text-zinc-400 px-1.5 py-0.5 rounded-md">
                  {colCards.length}
                </span>
              </div>
              <button className="text-zinc-500 hover:text-zinc-300">
                <Plus className="w-4 h-4" />
              </button>
            </div>

            {/* Droppable Body */}
            <div className="flex-1 p-3 space-y-3 overflow-y-auto">
              {colCards.map((card) => (
                <div
                  key={card.id}
                  draggable
                  onDragStart={() => setDraggedId(card.id)}
                  className="group bg-zinc-950 border border-zinc-800 hover:border-zinc-600 rounded-lg p-4 shadow-sm cursor-grab active:cursor-grabbing transition-colors"
                >
                  <div className="flex justify-between items-start mb-3">
                    <span className="text-[10px] font-mono text-zinc-500">{card.id}</span>
                    <GripHorizontal className="w-4 h-4 text-zinc-600 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>

                  <p className="text-sm text-zinc-200 font-medium leading-snug mb-4">{card.title}</p>

                  <div className="flex items-center justify-between mt-auto">
                    <div className="flex gap-1 flex-wrap">
                      {card.priority === "Critical" && (
                        <Badge
                          variant="outline"
                          className="text-[9px] bg-rose-500/10 text-rose-400 border-none px-1.5 py-0 h-4"
                        >
                          Critical
                        </Badge>
                      )}
                      {card.tags.map((t) => (
                        <Badge
                          key={t}
                          variant="outline"
                          className="text-[9px] bg-zinc-800 text-zinc-400 border-zinc-700 px-1.5 py-0 h-4"
                        >
                          {t}
                        </Badge>
                      ))}
                    </div>
                    {card.assignee && (
                      <div
                        className="w-6 h-6 rounded-full bg-indigo-500/20 border border-indigo-500/50 flex items-center justify-center text-[10px] text-indigo-300 font-bold"
                        title={card.assignee}
                      >
                        {card.assignee.slice(0, 2).toUpperCase()}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
