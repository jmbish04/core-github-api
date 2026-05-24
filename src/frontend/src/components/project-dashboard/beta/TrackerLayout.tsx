/**
 * @file TrackerLayout.tsx
 * @description Master shell for the Beta Project Tracker — Linear/ClickUp-inspired layout
 * with left sidebar (views + saved searches), top toolbar (search + filter),
 * and AI Assistant right sidebar.
 */

import React, { useState } from 'react';
import { NavLink, useParams, useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import {
  LayoutList,
  KanbanSquare,
  BarChart3,
  Search,
  Filter,
  Plus,
  Sparkles,
  Star,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Circle,
  ChevronRight,
  Bot,
  Send,
  X,
} from 'lucide-react';
import { TrackerListView } from './TrackerListView';
import { TrackerBoardView } from './TrackerBoardView';
import { TrackerReportsView } from './TrackerReportsView';

export interface TrackerTask {
  id: string;
  title: string;
  description?: string;
  status: 'backlog' | 'todo' | 'in_progress' | 'review' | 'done';
  priority?: 'low' | 'medium' | 'high' | 'critical';
  assignee?: string;
  kanbanColumn?: string;
  tags?: string[];
  createdAt?: string;
  updatedAt?: string;
  startAt?: string;
  endAt?: string;
  githubHtmlUrl?: string;
  repoId?: string;
  epicTitle?: string;
  storyTitle?: string;
}

export interface TrackerLayoutProps {
  tasks: TrackerTask[];
  isLoading: boolean;
  onTaskUpdate: (id: string, updates: Partial<TrackerTask>) => void;
  onTaskCreate: (task: { title: string; description?: string; status?: string }) => void;
  onTaskDelete: (id: string) => void;
}

const VIEWS = [
  { slug: 'list', label: 'List View', icon: LayoutList },
  { slug: 'board', label: 'Board View', icon: KanbanSquare },
  { slug: 'reports', label: 'Reports', icon: BarChart3 },
] as const;

const SAVED_SEARCHES = [
  { label: 'My Tasks', icon: Star, filter: 'assignee:me' },
  { label: 'Recently Updated', icon: Clock, filter: 'sort:updated' },
  { label: 'Critical Priority', icon: AlertTriangle, filter: 'priority:critical' },
  { label: 'Completed Today', icon: CheckCircle2, filter: 'status:done,updated:today' },
  { label: 'Unassigned', icon: Circle, filter: 'assignee:none' },
];

export function TrackerLayout({ tasks, isLoading, onTaskUpdate, onTaskCreate, onTaskDelete }: TrackerLayoutProps) {
  const { view: viewParam } = useParams<{ view?: string }>();
  const navigate = useNavigate();
  const activeView = viewParam || 'list';

  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const [aiMessages, setAiMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([]);
  const [aiInput, setAiInput] = useState('');
  const [isAiOpen, setIsAiOpen] = useState(false);

  // Build the base path depending on whether we're repo-scoped or global
  const { owner, repo } = useParams<{ owner?: string; repo?: string }>();
  const basePath = owner && repo
    ? `/project/${owner}/${repo}/beta-tracker`
    : '/beta/tracker';

  // Filter tasks by search query
  const filteredTasks = tasks.filter((task) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      task.title.toLowerCase().includes(q) ||
      task.description?.toLowerCase().includes(q) ||
      task.assignee?.toLowerCase().includes(q) ||
      task.tags?.some((t) => t.toLowerCase().includes(q))
    );
  });

  const handleAiSend = () => {
    if (!aiInput.trim()) return;
    setAiMessages((prev) => [...prev, { role: 'user', content: aiInput }]);
    // Simulate AI response
    setTimeout(() => {
      setAiMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: `I found ${filteredTasks.length} tasks matching your criteria. ${
            filteredTasks.filter((t) => t.status === 'in_progress').length
          } are in progress and ${
            filteredTasks.filter((t) => t.priority === 'critical').length
          } are critical priority.`,
        },
      ]);
    }, 500);
    setAiInput('');
  };

  // Status counts for sidebar badges
  const statusCounts = {
    backlog: tasks.filter((t) => t.status === 'backlog').length,
    todo: tasks.filter((t) => t.status === 'todo').length,
    in_progress: tasks.filter((t) => t.status === 'in_progress').length,
    review: tasks.filter((t) => t.status === 'review').length,
    done: tasks.filter((t) => t.status === 'done').length,
  };

  return (
    <div className="flex h-[calc(100vh-4rem)] bg-background">
      {/* ── Left Sidebar ── */}
      <aside className="w-56 shrink-0 border-r bg-zinc-950/40 flex flex-col">
        <div className="p-4 border-b">
          <h2 className="text-sm font-semibold tracking-tight text-foreground flex items-center gap-2">
            <LayoutList className="w-4 h-4 text-primary" />
            Tracker
            <Badge variant="outline" className="ml-auto text-[10px] font-mono">
              BETA
            </Badge>
          </h2>
        </div>

        <ScrollArea className="flex-1 p-3">
          {/* Views */}
          <div className="space-y-1 mb-6">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-2 px-2">
              Views
            </p>
            {VIEWS.map(({ slug, label, icon: Icon }) => (
              <NavLink
                key={slug}
                to={`${basePath}/${slug}`}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 px-2 py-1.5 rounded-md text-sm transition-colors',
                    isActive || activeView === slug
                      ? 'bg-accent text-foreground font-medium'
                      : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
                  )
                }
              >
                <Icon className="w-4 h-4" />
                {label}
              </NavLink>
            ))}
          </div>

          {/* Status Overview */}
          <div className="space-y-1 mb-6">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-2 px-2">
              Status
            </p>
            {Object.entries(statusCounts).map(([status, count]) => (
              <button
                key={status}
                onClick={() => setActiveFilter(activeFilter === status ? null : status)}
                className={cn(
                  'flex items-center justify-between w-full px-2 py-1 rounded-md text-xs transition-colors',
                  activeFilter === status
                    ? 'bg-accent text-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
                )}
              >
                <span className="capitalize">{status.replace('_', ' ')}</span>
                <Badge variant="secondary" className="text-[10px] h-5 min-w-[1.5rem] justify-center">
                  {count}
                </Badge>
              </button>
            ))}
          </div>

          {/* Saved Searches */}
          <div className="space-y-1">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-2 px-2">
              Saved Searches
            </p>
            {SAVED_SEARCHES.map(({ label, icon: Icon, filter }) => (
              <button
                key={filter}
                onClick={() => setSearchQuery(filter)}
                className="flex items-center gap-3 px-2 py-1.5 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors w-full text-left"
              >
                <Icon className="w-3.5 h-3.5" />
                {label}
              </button>
            ))}
          </div>
        </ScrollArea>
      </aside>

      {/* ── Main Content ── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Toolbar */}
        <header className="h-12 border-b flex items-center gap-3 px-4 bg-background/80 backdrop-blur shrink-0">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search tasks..."
              className="pl-9 h-8 bg-muted/40 border-none text-sm"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label="Clear search"
                title="Clear search"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <Button variant="outline" size="sm" className="h-8 gap-2 text-xs">
            <Filter className="w-3.5 h-3.5" />
            Filter
            {activeFilter && (
              <Badge variant="secondary" className="text-[10px] h-4 px-1">
                1
              </Badge>
            )}
          </Button>

          <div className="ml-auto flex items-center gap-2">
            <Button
              size="sm"
              className="h-8 gap-2 text-xs"
              onClick={() => onTaskCreate({ title: 'New Task', status: 'todo' })}
            >
              <Plus className="w-3.5 h-3.5" />
              New Task
            </Button>

            <Sheet open={isAiOpen} onOpenChange={setIsAiOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 gap-2 text-xs">
                  <Sparkles className="w-3.5 h-3.5" />
                  AI
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-[380px] p-0 flex flex-col">
                <SheetHeader className="p-4 border-b">
                  <SheetTitle className="flex items-center gap-2 text-sm">
                    <Bot className="w-4 h-4 text-primary" />
                    AI Assistant
                  </SheetTitle>
                </SheetHeader>
                <ScrollArea className="flex-1 p-4">
                  <div className="space-y-3">
                    {aiMessages.length === 0 && (
                      <p className="text-xs text-muted-foreground text-center py-8">
                        Ask me about your tasks, priorities, or project insights.
                      </p>
                    )}
                    {aiMessages.map((msg, i) => (
                      <div
                        key={i}
                        className={cn(
                          'text-sm rounded-lg px-3 py-2 max-w-[90%]',
                          msg.role === 'user'
                            ? 'bg-primary text-primary-foreground ml-auto'
                            : 'bg-muted text-foreground'
                        )}
                      >
                        {msg.content}
                      </div>
                    ))}
                  </div>
                </ScrollArea>
                <div className="p-3 border-t flex gap-2">
                  <Input
                    value={aiInput}
                    onChange={(e) => setAiInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAiSend()}
                    placeholder="Ask anything..."
                    className="h-8 text-sm"
                  />
                  <Button size="sm" className="h-8 px-3" onClick={handleAiSend}>
                    <Send className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </header>

        {/* Active View */}
        <main className="flex-1 overflow-auto">
          {activeView === 'list' && (
            <TrackerListView
              tasks={filteredTasks}
              isLoading={isLoading}
              onTaskUpdate={onTaskUpdate}
              onTaskDelete={onTaskDelete}
            />
          )}
          {activeView === 'board' && (
            <TrackerBoardView
              tasks={filteredTasks}
              isLoading={isLoading}
              onTaskUpdate={onTaskUpdate}
              onTaskDelete={onTaskDelete}
            />
          )}
          {activeView === 'reports' && (
            <TrackerReportsView tasks={tasks} isLoading={isLoading} />
          )}
        </main>
      </div>
    </div>
  );
}
