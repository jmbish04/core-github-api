import React, { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { ScrollArea } from '@/components/ui/scroll-area';
import { RepoFolder } from './RepoFolder';
import { useProjectStore } from '@/stores/useProjectStore';
import { useSidebarStore } from '@/stores/useSidebarStore';
import { cn } from '@/lib/utils';
import {
  Github, LayoutGrid, LayoutList, Home, Activity, BookOpen, Settings as SettingsIcon,
  Wrench, FolderKanban, MessageSquare, Map, CheckSquare, ChevronRight,
  ChevronDown, FileText, Globe, Webhook, Bot, Telescope,
  PanelLeftClose, PanelLeftOpen, Sparkles, ListTodo, Plus, BarChart3,
  Cpu, Palette, GitBranch, Blocks, Settings
} from 'lucide-react';
import { Button } from '@/components/ui/button';

export function AppSidebar({ className }: { className?: string }) {
  const { activeProjects, fetchFavorites } = useProjectStore();
  const { isCollapsed, toggle } = useSidebarStore();
  const [isToolboxExpanded, setIsToolboxExpanded] = useState(false);
  const [isDeepResearchExpanded, setIsDeepResearchExpanded] = useState(false);

  // On mount, fetch favorites from D1
  useEffect(() => {
    fetchFavorites();
  }, [fetchFavorites]);

  // ============================================================
  // TOOLBOX SUBMENU
  // Instruction for agents: When adding a new tool to /tools (Tools.tsx),
  // you MUST add a corresponding entry to this toolboxLinks array below.
  // The `tab` value must match the TabsTrigger `value` in Tools.tsx.
  // ============================================================
  const toolboxLinks = [
    { label: 'Reverse Engineering', tab: '__reverse_engineering__', icon: Telescope },
    { label: 'PR Comment Extractor', tab: 'pr-extractor', icon: FileText },
    { label: 'Cloudflare Docs Agent', tab: 'cloudflare-docs', icon: Bot },
    { label: 'CF Docs Agent [Beta]', tab: 'cloudflare-docs-beta', icon: Bot },
    { label: 'PR Webhook Extractor', tab: 'pr-webhook', icon: Webhook },
    { label: 'Agent Workshop', tab: 'agent-factory', icon: Bot },
  ];

  return (
    <div className={cn(
      "flex flex-col h-screen border-r bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 transition-all duration-300",
      isCollapsed ? "w-[52px]" : "min-w-[264px]",
      className
    )}>
      
      {/* Header / Global Nav */}
      <div className={cn("p-4 border-b flex items-center", isCollapsed ? "justify-center" : "justify-between gap-2")}>
        <div className="flex items-center gap-2 overflow-hidden">
          <LayoutGrid className="w-5 h-5 text-primary shrink-0" />
          {!isCollapsed && (
            <h2 className="text-sm font-semibold tracking-tight whitespace-nowrap">
              Workbench
            </h2>
          )}
        </div>
        <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={toggle}>
          {isCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
        </Button>
      </div>

      <ScrollArea className={cn("flex-1 py-4", isCollapsed ? "px-2" : "px-3")}>
        <div className="space-y-6">
          
          {/* Global Links */}
          <div className="space-y-1">
             <GlobalNavItem href="/" icon={Home} label="Home" isCollapsed={isCollapsed} />
             <GlobalNavItem href="/repos" icon={Github} label="Repos" isCollapsed={isCollapsed} />
             <div className="h-px bg-border/50 mx-2 my-2" />
             <GlobalNavItem href="/kanban" icon={FolderKanban} label="Projects (Kanban)" isCollapsed={isCollapsed} />
             <GlobalNavItem href="/chat" icon={MessageSquare} label="Chat Assistant" isCollapsed={isCollapsed} />
             <GlobalNavItem href="/roadmap" icon={Map} label="Roadmap" isCollapsed={isCollapsed} />
             <GlobalNavItem href="/todos" icon={CheckSquare} label="ToDos" isCollapsed={isCollapsed} />
             <GlobalNavItem href="/beta/tracker" icon={LayoutList} label="Tracker [Beta]" isCollapsed={isCollapsed} />
             <div className="h-px bg-border/50 mx-2 my-2" />
             <GlobalNavItem href="/dashboard" icon={LayoutGrid} label="Dashboard" isCollapsed={isCollapsed} />
          </div>

          <div className="h-px bg-border/50 mx-2" />

          {/* Section: Jules */}
          <div className="space-y-1">
             {!isCollapsed && (
               <h3 className="px-2 text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wider">
                 Jules
               </h3>
             )}
             <GlobalNavItem href="/jules" icon={Sparkles} label="Jules Home" isCollapsed={isCollapsed} />
             <GlobalNavItem href="/jules/tasks" icon={ListTodo} label="Tasks" isCollapsed={isCollapsed} />
             <GlobalNavItem href="/jules/tasks/new" icon={Plus} label="New Task" isCollapsed={isCollapsed} />
             <GlobalNavItem href="/jules/activity" icon={Activity} label="Activity" isCollapsed={isCollapsed} />
             <GlobalNavItem href="/jules/backlog" icon={LayoutList} label="Backlog" isCollapsed={isCollapsed} />
             <GlobalNavItem href="/jules/velocity" icon={BarChart3} label="Velocity" isCollapsed={isCollapsed} />
             <GlobalNavItem href="/jules/insights" icon={Cpu} label="Insights" isCollapsed={isCollapsed} />
             <GlobalNavItem href="/jules/design" icon={Palette} label="Design Lab" isCollapsed={isCollapsed} />
             <GlobalNavItem href="/jules/github" icon={GitBranch} label="GitHub" isCollapsed={isCollapsed} />
             <GlobalNavItem href="/jules/skills" icon={Blocks} label="Skills" isCollapsed={isCollapsed} />
             <GlobalNavItem href="/jules/settings" icon={SettingsIcon} label="Settings" isCollapsed={isCollapsed} />
             <GlobalNavItem href="/jules/chat" icon={MessageSquare} label="Chat" isCollapsed={isCollapsed} />
          </div>

          <div className="h-px bg-border/50 mx-2" />

          {/* Section: Open Projects */}
          <div className="space-y-1">
             {!isCollapsed && (
               <h3 className="px-2 text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wider">
                 Active Workspaces
               </h3>
             )}
             
             {activeProjects.length === 0 ? (
               !isCollapsed && (
                 <div className="text-xs text-muted-foreground px-4 py-8 text-center border border-dashed rounded-lg bg-muted/20">
                   No projects open. Go to "All Projects" to select a repo.
                 </div>
               )
             ) : (
               activeProjects.map((repo) => (
                 <RepoFolder 
                   key={repo.full_name} 
                   repo={repo}
                   isCollapsed={isCollapsed}
                 />
               ))
             )}
          </div>
          
              <div className="h-px bg-border/50 mx-2" />
           
              <div className="space-y-1">
                <GlobalNavItem href="/workflows" icon={Activity} label="Workflows" isCollapsed={isCollapsed} />
                <GlobalNavItem href="/webhooks" icon={Wrench} label="Webhooks" isCollapsed={isCollapsed} />
              </div>

              <div className="h-px bg-border/50 mx-2 my-2" />
              
              <div className="space-y-1">
                {!isCollapsed && (
                  <h3 className="px-2 text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wider">
                    Global Tools
                  </h3>
                )}

                {/* Toolbox - Collapsible */}
                {!isCollapsed ? (
                  <CollapsibleNavGroup
                    label="Toolbox"
                    icon={Wrench}
                    isExpanded={isToolboxExpanded}
                    onToggle={() => setIsToolboxExpanded(v => !v)}
                  >
                    {toolboxLinks.map(({ label, tab, icon: Icon }) => (
                      <Button
                        key={tab}
                        variant="ghost"
                        size="sm"
                        className="w-full justify-start gap-3 h-8 px-2 font-normal text-muted-foreground hover:text-foreground"
                        asChild
                      >
                        <NavLink to={tab === '__reverse_engineering__' ? '/reverse-engineering' : `/tools/${tab}`}>
                          <Icon className="w-3.5 h-3.5 opacity-70 shrink-0" />
                          {label}
                        </NavLink>
                      </Button>
                    ))}
                  </CollapsibleNavGroup>
                ) : (
                  <GlobalNavItem href="/tools" icon={Wrench} label="Toolbox" isCollapsed={isCollapsed} />
                )}

                {/* Deep Research - Collapsible */}
                {!isCollapsed ? (
                  <CollapsibleNavGroup
                    label="Deep Research"
                    icon={BookOpen}
                    isExpanded={isDeepResearchExpanded}
                    onToggle={() => setIsDeepResearchExpanded(v => !v)}
                  >
                    <GlobalNavItem href="/research/custom" icon={CheckSquare} label="Custom Jobs" isCollapsed={isCollapsed} />
                    <GlobalNavItem href="/research/daily-trends" icon={Activity} label="Daily Trends" isCollapsed={isCollapsed} />
                    <GlobalNavItem href="/research/configure-cron" icon={SettingsIcon} label="Configure Cron" isCollapsed={isCollapsed} />
                  </CollapsibleNavGroup>
                ) : (
                  <GlobalNavItem href="/research/custom" icon={BookOpen} label="Deep Research" isCollapsed={isCollapsed} />
                )}

                <GlobalNavItem href="/health" icon={Activity} label="System Health" isCollapsed={isCollapsed} />
                <GlobalNavItem href="/settings" icon={SettingsIcon} label="Global Settings" isCollapsed={isCollapsed} />
              </div>
          </div>
      </ScrollArea>

      {/* Footer / Global Actions */}
      <div className="border-t mt-auto">
        <div className={cn("py-2", isCollapsed ? "px-2" : "px-3")}>
          <GlobalNavItem href="/sitemap" icon={Globe} label="Site Map" isCollapsed={isCollapsed} />
        </div>
      </div>
    </div>
  );
}

/** Collapsible nav group with a toggle header and indented children */
function CollapsibleNavGroup({
  label,
  icon: Icon,
  isExpanded,
  onToggle,
  children,
}: {
  label: string;
  icon: any;
  isExpanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div>
      <button
        onClick={onToggle}
        className={cn(
          "w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded-md text-sm font-medium transition-colors",
          "text-muted-foreground hover:text-foreground hover:bg-accent"
        )}
      >
        <span className="flex items-center gap-3">
          <Icon className="w-4 h-4" />
          {label}
        </span>
        {isExpanded
          ? <ChevronDown className="w-3.5 h-3.5 opacity-60" />
          : <ChevronRight className="w-3.5 h-3.5 opacity-60" />
        }
      </button>

      {isExpanded && (
        <div className="ml-4 pl-2 border-l space-y-0.5 mt-0.5">
          {children}
        </div>
      )}
    </div>
  );
}

function GlobalNavItem({ href, icon: Icon, label, isCollapsed }: { href: string; icon: any; label: string; isCollapsed?: boolean }) {
  return (
      <Button 
        variant="ghost" 
        size="sm" 
        className={cn(
          "h-9 font-normal text-muted-foreground hover:text-foreground",
          isCollapsed ? "w-9 p-0 justify-center" : "w-full justify-start gap-3 px-2",
          "aria-[current=page]:text-foreground aria-[current=page]:font-medium aria-[current=page]:bg-secondary"
        )}
        title={isCollapsed ? label : undefined}
        asChild
      >
        <NavLink to={href} end>
          <Icon className="w-4 h-4 shrink-0" />
          {!isCollapsed && <span>{label}</span>}
        </NavLink>
      </Button>
  );
}
