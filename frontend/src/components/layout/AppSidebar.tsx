import React, { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ProjectFolder } from './ProjectFolder';
import { useProjectStore } from '@/stores/useProjectStore';
import { cn } from '@/lib/utils';
import { Plus, LayoutGrid, Home, Activity, BookOpen, Settings, Wrench, FolderKanban, MessageSquare, Map, CheckSquare, ChevronRight, ChevronDown, FileText, Globe, Webhook, Bot, LayoutList } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { HealthWidget } from '@/components/health/HealthWidget';
import { getControlCenterUserId } from '@/lib/control-user';

export function AppSidebar({ className }: { className?: string }) {
  const userId = getControlCenterUserId();
  const { activeProjects, fetchFavorites } = useProjectStore();
  const [isToolboxExpanded, setIsToolboxExpanded] = useState(false);
  const [isDeepResearchExpanded, setIsDeepResearchExpanded] = useState(false);

  // On mount, fetch favorites from D1
  useEffect(() => {
    fetchFavorites(userId);
  }, [userId, fetchFavorites]);

  // ============================================================
  // TOOLBOX SUBMENU
  // Instruction for agents: When adding a new tool to /tools (Tools.tsx),
  // you MUST add a corresponding entry to this toolboxLinks array below.
  // The `tab` value must match the TabsTrigger `value` in Tools.tsx.
  // ============================================================
  const toolboxLinks = [
    { label: 'PR Comment Extractor', tab: 'pr-extractor', icon: FileText },
    { label: 'Cloudflare Docs Agent', tab: 'cloudflare-docs', icon: Bot },
    { label: 'CF Docs Agent [Beta]', tab: 'cloudflare-docs-beta', icon: Bot },
    { label: 'PR Webhook Extractor', tab: 'pr-webhook', icon: Webhook },
    { label: 'Agent Workshop', tab: 'agent-factory', icon: Bot },
  ];

  return (
    <div className={cn("flex flex-col h-screen w-64 border-r bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60", className)}>
      
      {/* Header / Global Nav */}
      <div className="p-4 border-b flex items-center gap-2">
        <LayoutGrid className="w-5 h-5 text-primary" />
        <h2 className="text-sm font-semibold tracking-tight">
          Workbench
        </h2>
      </div>

      <ScrollArea className="flex-1 px-3 py-4">
        <div className="space-y-6">
          
          {/* Global Links */}
          <div className="space-y-1">
             <GlobalNavItem href="/" icon={Home} label="Home" />
             <GlobalNavItem href="/projects" icon={Plus} label="All Projects" />
             <div className="h-px bg-border/50 mx-2 my-2" />
             <GlobalNavItem href="/kanban" icon={FolderKanban} label="Projects (Kanban)" />
             <GlobalNavItem href="/chat" icon={MessageSquare} label="Chat Assistant" />
             <GlobalNavItem href="/roadmap" icon={Map} label="Roadmap" />
             <GlobalNavItem href="/todos" icon={CheckSquare} label="ToDos" />
             <GlobalNavItem href="/beta/tracker" icon={LayoutList} label="Tracker [Beta]" />
             <div className="h-px bg-border/50 mx-2 my-2" />
             <GlobalNavItem href="/dashboard" icon={LayoutGrid} label="Dashboard" />
          </div>

          <div className="h-px bg-border/50 mx-2" />

          {/* Section: Open Projects */}
          <div className="space-y-1">
             <h3 className="px-2 text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wider">
               Active Workspaces
             </h3>
             
             {activeProjects.length === 0 ? (
               <div className="text-xs text-muted-foreground px-4 py-8 text-center border border-dashed rounded-lg bg-muted/20">
                 No projects open. Go to "All Projects" to select a repo.
               </div>
             ) : (
               activeProjects.map((repo) => (
                 <ProjectFolder 
                   key={repo.full_name} 
                   repo={repo} 
                 />
               ))
             )}
          </div>
          
              <div className="h-px bg-border/50 mx-2" />
           
              <div className="space-y-1">
                <GlobalNavItem href="/workflows" icon={Activity} label="Workflows" />
                <GlobalNavItem href="/webhooks" icon={Wrench} label="Webhooks" />
              </div>

              <div className="h-px bg-border/50 mx-2 my-2" />
              
              <div className="space-y-1">
                <h3 className="px-2 text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wider">
                  Global Tools
                </h3>

                {/* Toolbox - Collapsible */}
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
                      <NavLink to={`/tools/${tab}`}>
                        <Icon className="w-3.5 h-3.5 opacity-70" />
                        {label}
                      </NavLink>
                    </Button>
                  ))}
                </CollapsibleNavGroup>

                {/* Deep Research - Collapsible */}
                <CollapsibleNavGroup
                  label="Deep Research"
                  icon={BookOpen}
                  isExpanded={isDeepResearchExpanded}
                  onToggle={() => setIsDeepResearchExpanded(v => !v)}
                >
                  <GlobalNavItem href="/research/custom" icon={CheckSquare} label="Custom Jobs" />
                  <GlobalNavItem href="/research/daily-trends" icon={Activity} label="Daily Trends" />
                  <GlobalNavItem href="/research/configure-cron" icon={Settings} label="Configure Cron" />
                </CollapsibleNavGroup>

                <GlobalNavItem href="/health" icon={Activity} label="System Health" />
                <GlobalNavItem href="/settings" icon={Settings} label="Global Settings" />
              </div>
          </div>
      </ScrollArea>

      {/* Footer / Global Actions */}
      <div className="border-t mt-auto">
        <div className="px-3 py-2">
          <GlobalNavItem href="/sitemap" icon={Globe} label="Site Map" />
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

function GlobalNavItem({ href, icon: Icon, label }: { href: string; icon: any; label: string }) {
  return (
      <Button 
        variant="ghost" 
        size="sm" 
        className={cn(
          "w-full justify-start gap-3 h-9 px-2 font-normal text-muted-foreground hover:text-foreground",
          "aria-[current=page]:text-foreground aria-[current=page]:font-medium aria-[current=page]:bg-secondary"
        )}
        asChild
      >
        <NavLink to={href} end>
          <Icon className="w-4 h-4" />
          {label}
        </NavLink>
      </Button>
  );
}
