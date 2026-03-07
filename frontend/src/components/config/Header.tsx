import React from "react";
import { Separator } from "@/components/ui/separator";
// import { SidebarTrigger } from "@/components/ui/sidebar" // Assuming sidebar trigger exists or use custom
import { Button } from "@/components/ui/button";
import { History, Save, RefreshCw } from "lucide-react";

interface ConfigHeaderProps {
  title?: string;
  description?: string;
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

export function ConfigHeader({ 
  title = "Configuration", 
  description = "Manage system settings and secrets.",
  onRefresh,
  isRefreshing
}: ConfigHeaderProps) {
  return (
    <header className="sticky top-0 z-10 flex h-14 items-center gap-2 border-b bg-background px-4">
      {/* Mobile trigger if needed, usually handled by layout */}
      <div className="flex flex-1 items-center gap-2">
         {/* <SidebarTrigger /> */}
         <div className="flex flex-col">
             <h1 className="text-sm font-semibold">{title}</h1>
             {description && <p className="text-xs text-muted-foreground hidden md:block">{description}</p>}
         </div>
      </div>
      
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={onRefresh} disabled={isRefreshing}>
           <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
        </Button>
        <Button variant="ghost" size="sm" asChild>
            <a href="/config/history">
                <History className="mr-2 h-4 w-4" />
                History
            </a>
        </Button>
      </div>
    </header>
  );
}
