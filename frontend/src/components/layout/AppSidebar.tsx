import React, { useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ProjectFolder } from './ProjectFolder';
import { useProjectStore } from '@/stores/useProjectStore';
import { cn } from '@/lib/utils';
import { Plus, LayoutGrid, Home, Activity, BookOpen, Settings, Wrench } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { HealthWidget } from '@/components/health/HealthWidget';

export function AppSidebar({ className }: { className?: string }) {
  const { activeProjects, favoriteProjects, openProject } = useProjectStore();

  // On mount, ensure all favorites are "active" (visible)
  useEffect(() => {
    favoriteProjects.forEach((fav) => openProject(fav));
  }, [favoriteProjects, openProject]);

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
             <GlobalNavItem href="/control-center/dashboard" icon={LayoutGrid} label="Dashboard" />
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
           
           {/* Global Tools */}
           <div className="space-y-1">
             <h3 className="px-2 text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wider">
               Global Tools
             </h3>
             <GlobalNavItem href="/tools" icon={Wrench} label="Toolbox" />
             <GlobalNavItem href="/research" icon={BookOpen} label="Deep Research" />
             <GlobalNavItem href="/health" icon={Activity} label="System Health" />
             <GlobalNavItem href="/settings" icon={Settings} label="Global Settings" />
           </div>

        </div>
      </ScrollArea>

      {/* Footer / Global Actions */}
      <div className="p-4 border-t mt-auto">
         <div className="flex justify-center">
         <div className="flex justify-center">
            {/* HealthWidget moved to top header only */}
         </div>
         </div>
      </div>
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
