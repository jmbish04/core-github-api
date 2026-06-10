import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { 
  Collapsible, 
  CollapsibleContent, 
  CollapsibleTrigger 
} from '@/components/ui/collapsible';
import { Button } from '@/components/ui/button';
import { 
  ChevronRight, 
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
  Component,
  Layers,
  LayoutList,
  KanbanSquare
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { useProjectStore, type Repository } from '@/stores/useProjectStore';
import { cn } from '@/lib/utils';

interface RepoFolderProps {
  repo: Repository;
}

export function RepoFolder({ repo }: RepoFolderProps) {
  const [isOpen, setIsOpen] = useState(true);
  const [isToolsOpen, setIsToolsOpen] = useState(false);
  const { addFavorite, removeFavorite, isFavorite } = useProjectStore();
  const isFav = isFavorite(repo.full_name);

  const basePath = `/repos/${repo.owner}/${repo.name}`;

  // Fetch active PR count
  const overviewQuery = useQuery({
    queryKey: ["project-overview-prs", repo.owner, repo.name],
    enabled: Boolean(isOpen),
    queryFn: async () => {
      const response = await fetch(
        `/api/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.name)}/overview`,
        { credentials: "include" }
      );
      if (!response.ok) return null;
      return (await response.json()) as any;
    },
    staleTime: 60000
  });

  const activePrCount = overviewQuery.data?.pendingPrs?.length || 0;

  const repoTabs = [
    { slug: "stats", label: "Stats", icon: BarChart3 },
    { slug: "explorer", label: "File Explorer", icon: SearchCode },
    { slug: "cloudflaresdk", label: "CloudflareSDK", icon: Cloud },
    { slug: "vibesdk", label: "VibeSDK", icon: Sparkles },
    { slug: "ux-workshop", label: "UX Workshop", icon: Palette },
    { slug: "component-identifier", label: "Shadcn Components", icon: Component },
    { slug: "plan", label: "AI Planner", icon: Sparkles },
    { slug: "projects", label: "Backlog", icon: ListChecks },
    { slug: "projects/tracker", label: "Projects [Beta]", icon: Layers },
    { slug: "projects/tracker-beta/list", label: "Tracker List [Beta]", icon: LayoutList },
    { slug: "projects/tracker-beta/board", label: "Tracker Board [Beta]", icon: KanbanSquare },
    { slug: "projects/tracker-beta/reports", label: "Tracker Reports [Beta]", icon: BarChart3 },
    { slug: "prs", label: "PRs", icon: GitPullRequest, badge: activePrCount > 0 ? activePrCount : null },
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
        <div className="flex items-center opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
          <button 
            onClick={() => isFav ? removeFavorite(repo) : addFavorite(repo)}
            className="p-1 hover:bg-background rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            title={isFav ? "Unfavorite" : "Favorite"}
            aria-label={isFav ? "Remove from favorites" : "Add to favorites"}
          >
            <Star className={cn("w-3.5 h-3.5", isFav ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground")} />
          </button>
          {!isFav && (
            <button 
              onClick={() => removeFavorite(repo)}
              className="p-1 hover:bg-background rounded-sm text-muted-foreground hover:text-red-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              title="Close"
              aria-label={`Remove ${repo.name} from active workspaces`}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Folder Contents */}
      <CollapsibleContent className="space-y-1 pl-4 border-l ml-4 border-border/40 pb-2">
        
        {repoTabs.map((tab) => (
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
