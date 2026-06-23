/**
 * @file views/repos/TrackerLayoutBeta.tsx
 * Master layout shell for the Beta Project Tracker.
 * Houses left sidebar (views + saved searches), top toolbar,
 * and a collapsible AI assistant right panel.
 *
 * Nested child routes (list, board, reports) render via <Outlet>.
 * Hooked up to /api/projects/sentinel/* backend APIs.
 */

import React, { useState } from "react";
import { Outlet, useLocation, useNavigate, useParams, useOutletContext } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  LayoutList, KanbanSquare, BarChart3, Sparkles,
  Plus, Bookmark, Filter, Search, PanelRightClose, PanelRightOpen
} from "lucide-react";
import { cn } from "@/lib/utils";

const VIEWS = [
  { id: "list", label: "List", icon: LayoutList, path: "list" },
  { id: "board", label: "Board", icon: KanbanSquare, path: "board" },
  { id: "reports", label: "Reports", icon: BarChart3, path: "reports" },
];

const SAVED_SEARCHES = [
  { id: "v1", name: "My Active Issues", filter: "assignee:me status:active" },
  { id: "v2", name: "High Priority Bugs", filter: "priority:high type:bug" },
  { id: "v3", name: "v2 Launch Epic", filter: "epic:v2-launch" },
];

export default function TrackerLayoutBeta() {
  const navigate = useNavigate();
  const location = useLocation();
  const { owner, repo } = useParams();
  const parentContext = useOutletContext<any>();

  const [isAssistantOpen, setAssistantOpen] = useState(false);
  const [activeSearch, setActiveSearch] = useState<string | null>(null);

  const isShadcn = location.pathname.includes('tracker-shadcn');
  const basePath = `/repos/${owner}/${repo}/projects/${isShadcn ? 'tracker-shadcn' : 'tracker-beta'}`;

  return (
    <div className="flex h-full bg-zinc-950 text-zinc-100 overflow-hidden selection:bg-indigo-500/30 font-sans">

      {/* Left Sidebar (Navigation & Saved Views) */}
      <aside className="w-56 border-r border-zinc-800/60 bg-zinc-900/30 flex flex-col hidden md:flex shrink-0">
        <div className="h-12 border-b border-zinc-800/60 flex items-center px-4 gap-3">
          <div className="w-6 h-6 rounded bg-indigo-600 flex items-center justify-center text-white font-bold text-xs shadow-[0_0_10px_rgba(99,102,241,0.4)]">
            {repo?.charAt(0).toUpperCase() || "P"}
          </div>
          <span className="font-semibold tracking-tight truncate text-sm">{repo || "Project"}</span>
        </div>

        <div className="flex-1 overflow-y-auto py-3 px-2 space-y-5">
          <div className="space-y-0.5">
            <p className="px-2 text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">Views</p>
            {VIEWS.map((view) => {
              const isActive = location.pathname.includes(view.path);
              return (
                <Button
                  key={view.id}
                  variant="ghost"
                  size="sm"
                  onClick={() => navigate(`${basePath}/${view.path}`)}
                  className={cn(
                    "w-full justify-start gap-3 h-8 text-xs",
                    isActive
                      ? "bg-zinc-800/80 text-zinc-100"
                      : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40"
                  )}
                >
                  <view.icon className="w-3.5 h-3.5" /> {view.label}
                </Button>
              );
            })}
          </div>

          <div className="space-y-0.5">
            <div className="px-2 text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-1.5 flex items-center justify-between">
              Saved Searches
              <Plus className="w-3 h-3 cursor-pointer hover:text-zinc-300" />
            </div>
            {SAVED_SEARCHES.map((search) => (
              <Button
                key={search.id}
                variant="ghost"
                size="sm"
                onClick={() => setActiveSearch(search.id)}
                className={cn(
                  "w-full justify-start gap-3 h-7 text-[11px]",
                  activeSearch === search.id
                    ? "bg-indigo-500/10 text-indigo-400"
                    : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40"
                )}
              >
                <Bookmark className="w-3 h-3" /> {search.name}
              </Button>
            ))}
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 transition-all duration-300 relative">

        {/* Top Toolbar */}
        <header className="h-12 border-b border-zinc-800/60 bg-zinc-950/80 backdrop-blur flex items-center justify-between px-5 shrink-0 z-10">
          <div className="flex items-center gap-2 w-full max-w-md">
            <div className="relative w-full">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-zinc-500" />
              <Input
                placeholder="Search issues, filter by status..."
                className="h-8 pl-8 bg-zinc-900 border-zinc-800 text-xs focus-visible:ring-indigo-500"
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              className="h-8 border-dashed border-zinc-700 bg-zinc-900 text-zinc-400 hover:text-zinc-200 text-xs"
            >
              <Filter className="w-3 h-3 mr-1.5" /> Filter
            </Button>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setAssistantOpen(!isAssistantOpen)}
              className={cn(
                "h-8 gap-1.5 border-indigo-500/30 transition-colors text-xs",
                isAssistantOpen
                  ? "bg-indigo-500/20 text-indigo-300"
                  : "bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500/20"
              )}
            >
              <Sparkles className="w-3 h-3" /> Copilot
              {isAssistantOpen ? (
                <PanelRightClose className="w-3.5 h-3.5 ml-0.5 opacity-50" />
              ) : (
                <PanelRightOpen className="w-3.5 h-3.5 ml-0.5 opacity-50" />
              )}
            </Button>
            <Button
              size="sm"
              className="h-8 bg-indigo-600 hover:bg-indigo-700 text-white text-xs shadow-[0_0_15px_rgba(79,70,229,0.3)]"
            >
              <Plus className="w-3.5 h-3.5 mr-1" /> New Issue
            </Button>
          </div>
        </header>

        {/* Sub-Routes (List, Board, Reports) */}
        <main className="flex-1 overflow-hidden relative p-4">
          <Outlet context={{ ...parentContext, activeSearch }} />
        </main>
      </div>

      {/* AI Assistant Sidebar */}
      <div
        className={cn(
          "border-l border-zinc-800/60 bg-zinc-950 flex flex-col shadow-2xl transition-all duration-300 absolute right-0 top-0 bottom-0 md:relative z-50",
          isAssistantOpen
            ? "w-[360px] translate-x-0"
            : "w-0 translate-x-full md:translate-x-0 border-none"
        )}
      >
        <div className="h-12 border-b border-zinc-800/60 flex items-center justify-between px-4 bg-zinc-900/30 shrink-0">
          <div className="flex items-center gap-2 text-indigo-400 font-medium text-xs">
            <Sparkles className="w-3.5 h-3.5" /> Project Intelligence
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 text-zinc-500 hover:text-zinc-200"
            onClick={() => setAssistantOpen(false)}
          >
            ✕
          </Button>
        </div>
        <div className="flex-1 overflow-hidden flex flex-col">
          <div className="flex-1 p-4 overflow-y-auto">
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 text-xs text-zinc-300 leading-relaxed">
              Hi! I'm your AI Project Manager. Select multiple items in the list
              view and ask me to apply a canned worklog update, or ask me for a
              summary of blocked tasks.
            </div>
          </div>
          <div className="p-3 border-t border-zinc-800/60 bg-zinc-950">
            <Input
              placeholder="Ask AI to update tasks..."
              className="bg-zinc-900 border-zinc-800 text-xs h-8"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
