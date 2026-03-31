import React, { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { 
  Collapsible, 
  CollapsibleContent, 
  CollapsibleTrigger 
} from '@/components/ui/collapsible';
import { Button } from '@/components/ui/button';
import { 
  ChevronRight, 
  LayoutDashboard, 
  FolderKanban, 
  MessageSquare, 
  Map, 
  Settings, 
  CheckSquare, 
  Star,
  X,
  BarChart3,
  Sparkles,
  Palette,
  ListChecks,
  GitPullRequest,
  SearchCode,
  Cloud,
  Wrench,
  ChevronDown,
  LayoutList
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { useProjectStore, type Repository } from '@/stores/useProjectStore';
import { cn } from '@/lib/utils';
import { getControlCenterUserId } from '@/lib/control-user';

interface ProjectFolderProps {
  repo: Repository;
}

export function ProjectFolder({ repo }: ProjectFolderProps) {
  const [isOpen, setIsOpen] = useState(true);
  const [isDashboardOpen, setIsDashboardOpen] = useState(true);
  const [isToolsOpen, setIsToolsOpen] = useState(false);
  const { addFavorite, removeFavorite, isFavorite } = useProjectStore();
  const location = useLocation();
  const isFav = isFavorite(repo.full_name);
  const userId = getControlCenterUserId();

  const basePath = `/project/${repo.owner}/${repo.name}`;

  // Fetch active PR count
  const overviewQuery = useQuery({
    queryKey: ["project-overview-prs", repo.owner, repo.name],
    enabled: Boolean(isOpen),
    queryFn: async () => {
      // Find internal ID if needed, but we can hit an optimized path if possible. 
      // For now, assume the standard overview endpoint handles it if we lookup by name, 
      // or we just fetch the standard overview which caches.
      const lookupResp = await fetch(`/api/projects/by-repo/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.name)}`, { credentials: "include" });
      if (!lookupResp.ok) return null;
      const { projectId } = (await lookupResp.json()) as any as any;
      if (!projectId) return null;

      const response = await fetch(`/api/projects/${projectId}/overview`, { credentials: "include" });
      if (!response.ok) return null;
      return ((await response.json()) as any) as any;
    },
    staleTime: 60000 // 1 minute
  });

  const activePrCount = overviewQuery.data?.pendingPrs?.length || 0;

  // Flattened Tabs
  const projectTabs = [
    { slug: "stats", label: "Stats", icon: BarChart3 },
    { slug: "explorer", label: "File Explorer", icon: SearchCode },
    { slug: "cloudflaresdk", label: "CloudflareSDK", icon: Cloud },
    { slug: "vibesdk", label: "VibeSDK", icon: Sparkles },
    { slug: "ux-workshop", label: "UX Workshop", icon: Palette },
    { slug: "plan", label: "Plan", icon: ListChecks },
    { slug: "prs", label: "PRs", icon: GitPullRequest, badge: activePrCount > 0 ? activePrCount : null },
    { slug: "beta-tracker", label: "Tracker [Beta]", icon: LayoutList },
  ];

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className="space-y-1">
      
      {/* Folder Header */}
      <div className="flex items-center group justify-between px-2 py-1 rounded-md hover:bg-accent/50">
        <CollapsibleTrigger asChild>
          <Button variant="ghost" size="sm" className="p-0 h-auto hover:bg-transparent font-medium w-full justify-start gap-2 text-foreground/90">
            <ChevronRight className={cn("w-4 h-4 transition-transform text-muted-foreground", isOpen && "rotate-90")} />
            <span className="truncate max-w-[120px]">{repo.name}</span>
          </Button>
        </CollapsibleTrigger>
        
        {/* Quick Actions (Hover Only) */}
        <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
          <button 
            onClick={() => isFav ? removeFavorite(getControlCenterUserId(), repo) : addFavorite(getControlCenterUserId(), repo)}
            className="p-1 hover:bg-background rounded-sm"
            title={isFav ? "Unfavorite" : "Favorite"}
          >
            <Star className={cn("w-3.5 h-3.5", isFav ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground")} />
          </button>
          {!isFav && (
            <button 
              onClick={() => removeFavorite(getControlCenterUserId(), repo)}
              className="p-1 hover:bg-background rounded-sm text-muted-foreground hover:text-red-400"
              title="Close"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Folder Contents */}
      <CollapsibleContent className="space-y-1 pl-4 border-l ml-4 border-border/40 pb-2">
        
        {projectTabs.map((tab) => (
          <NavItem
            key={tab.slug}
            href={`${basePath}/${tab.slug}`}
            icon={tab.icon}
            label={tab.label}
            badge={tab.badge}
          />
        ))}

        {/* Tools — collapsible, default closed */}
        <div>
          <button
            onClick={() => setIsToolsOpen(v => !v)}
            className={cn(
              "w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded-md text-sm font-medium transition-colors",
              "text-muted-foreground hover:text-foreground hover:bg-accent/60"
            )}
          >
            <span className="flex items-center gap-3">
              <Wrench className="w-4 h-4" />
              <span>Tools</span>
            </span>
            {isToolsOpen
              ? <ChevronDown className="w-3.5 h-3.5 opacity-60" />
              : <ChevronRight className="w-3.5 h-3.5 opacity-60" />
            }
          </button>
          {isToolsOpen && (
            <div className="ml-2 pl-2 border-l space-y-0.5 mt-0.5">
              <NavItem
                href={`${basePath}/tools/cloudflare-docs`}
                icon={Cloud}
                label="Cloudflare Docs"
              />
            </div>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

// Sub-component for individual links
function NavItem({ href, icon: Icon, label, badge }: { href: string; icon: any; label: string; badge?: number | string | null }) {
  return (
    <Button 
      variant="ghost" 
      size="sm" 
      className={cn(
        "w-full justify-start gap-3 h-9 px-2 font-normal text-muted-foreground hover:text-foreground relative group",
        "aria-[current=page]:text-foreground aria-[current=page]:font-medium aria-[current=page]:bg-secondary"
      )}
      asChild
    >
      <NavLink to={href} end>
        <span className="flex items-center gap-3 w-full">
            <Icon className="w-4 h-4 shrink-0" />
            <span className="truncate flex-1 text-left">{label}</span>
            {badge !== undefined && badge !== null && (
                <Badge variant="destructive" className="ml-auto px-2 min-w-[1.5rem] h-5 justify-center text-xs shrink-0">
                    {badge}
                </Badge>
            )}
        </span>
      </NavLink>
    </Button>
  );
}
