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
  GitPullRequest, 
  Settings, 
  CheckSquare, 
  Star,
  X
} from 'lucide-react';
import { useProjectStore, type Repository } from '@/stores/useProjectStore';
import { cn } from '@/lib/utils';

interface ProjectFolderProps {
  repo: Repository;
}

export function ProjectFolder({ repo }: ProjectFolderProps) {
  const [isOpen, setIsOpen] = useState(true);
  const { toggleFavorite, isFavorite, closeProject } = useProjectStore();
  const location = useLocation();
  const isFav = isFavorite(repo.full_name);

  // Helper to check active route
  const isActive = (path: string) => location.pathname.includes(path);
  const basePath = `/project/${repo.owner}/${repo.name}`;

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
            onClick={() => toggleFavorite(repo)}
            className="p-1 hover:bg-background rounded-sm"
            title={isFav ? "Unfavorite" : "Favorite"}
          >
            <Star className={cn("w-3.5 h-3.5", isFav ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground")} />
          </button>
          {!isFav && (
            <button 
              onClick={() => closeProject(repo.full_name)}
              className="p-1 hover:bg-background rounded-sm text-muted-foreground hover:text-red-400"
              title="Close"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Folder Contents */}
      <CollapsibleContent className="space-y-1 pl-4 border-l ml-4 border-border/40">
        
        <NavItem 
          href={`${basePath}/dashboard`} 
          icon={LayoutDashboard} 
          label="Dashboard" 
        />
        
        <NavItem 
          href={`${basePath}/kanban`} 
          icon={FolderKanban} 
          label="Projects (Kanban)" 
        />

        {/* Assistant UI Integration */}
        <NavItem 
          href={`${basePath}/chat`} 
          icon={MessageSquare} 
          label="Chat Assistant" 
        />

        <NavItem 
          href={`${basePath}/roadmap`} 
          icon={Map} 
          label="Roadmap" 
        />

        <NavItem 
          href={`${basePath}/pr-center`} 
          icon={GitPullRequest} 
          label="PR Command Center" 
        />

        <NavItem 
          href={`${basePath}/settings`} 
          icon={Settings} 
          label="Settings" 
        />

        <NavItem 
          href={`${basePath}/icebox`} 
          icon={CheckSquare} 
          label="General Todos" 
        />

      </CollapsibleContent>
    </Collapsible>
  );
}

// Sub-component for individual links
function NavItem({ href, icon: Icon, label }: { href: string; icon: any; label: string }) {
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
