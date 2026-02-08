import { cn } from "@/lib/utils";
import {
    BookOpen,
    Home,
    MessageSquare,
    Workflow,
    Activity,
    ChevronDown,
    ChevronRight,
    LayoutDashboard,
    Trello,
    FlaskConical,
    GitPullRequest,
    Webhook,
    FolderGit2
} from "lucide-react";
import { NavLink, useLocation } from "react-router-dom";
import { useState } from "react";
import { Button } from "@/components/ui/button";

interface SidebarProps extends React.HTMLAttributes<HTMLDivElement> { }

export function Sidebar({ className }: SidebarProps) {
    const location = useLocation();

    // Collapsible state for Control Center, default collapsed (true means collapsed? User said "collapsed by default")
    // Let's use isExpanded = false for default collapsed.
    const [isControlCenterExpanded, setIsControlCenterExpanded] = useState(false);

    // Group 1: Main
    const mainLinks = [
        { name: "Home", href: "/", icon: Home },
        { name: "Docs", href: "/docs", icon: BookOpen },
        { name: "Workflows", href: "/workflows", icon: Workflow },
        { name: "Health", href: "/health", icon: Activity },
    ];

    // Group 2: Control Center Items
    // Group 2: Control Center Items
    const controlCenterLinks = [
        { name: "Dashboard", href: "/control-center/dashboard", icon: LayoutDashboard },
        { name: "Projects", href: "/control-center/projects", icon: FolderGit2 },
        { name: "Chat", href: "/control-center/chat", icon: MessageSquare },
        { name: "Kanban", href: "/control-center/kanban", icon: Trello },
        { name: "Roadmap", href: "/control-center/roadmap", icon: Trello },
        { name: "PR Command Center", href: "/control-center/pr-center", icon: GitPullRequest },
        { name: "General Todos", href: "/control-center/todos", icon: BookOpen },
    ];

    const isControlCenterActive = controlCenterLinks.some(link => location.pathname === link.href);

    return (
        <div className={cn("pb-12 w-64 border-r min-h-screen bg-card text-card-foreground hidden md:block", className)}>
            <div className="space-y-4 py-4">
                <div className="px-3 py-2">
                    <h2 className="mb-2 px-4 text-lg font-semibold tracking-tight text-foreground">
                        Github Worker
                    </h2>
                    <div className="space-y-1">
                        {/* Main Links */}
                        {mainLinks.map((link) => (
                            <NavLink
                                key={link.href}
                                to={link.href}
                                className={({ isActive }) =>
                                    cn(
                                        "flex items-center rounded-md px-3 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground transition-colors",
                                        isActive ? "bg-secondary text-secondary-foreground" : "text-muted-foreground"
                                    )
                                }
                            >
                                <link.icon className="mr-2 h-4 w-4" />
                                {link.name}
                            </NavLink>
                        ))}

                        {/* Control Center Collapsible */}
                        <div className="pt-2">
                            <Button
                                variant="ghost"
                                className={cn(
                                    "w-full justify-between hover:bg-accent hover:text-accent-foreground px-3 py-2 h-auto font-medium",
                                    isControlCenterActive ? "text-primary" : "text-muted-foreground"
                                )}
                                onClick={() => setIsControlCenterExpanded(!isControlCenterExpanded)}
                            >
                                <span className="flex items-center text-sm">
                                    <Activity className="mr-2 h-4 w-4" />
                                    Control Center
                                </span>
                                {isControlCenterExpanded ? (
                                    <ChevronDown className="h-4 w-4" />
                                ) : (
                                    <ChevronRight className="h-4 w-4" />
                                )}
                            </Button>

                            {isControlCenterExpanded && (
                                <div className="ml-4 mt-1 space-y-1 border-l pl-2">
                                    {controlCenterLinks.map((link) => (
                                        <NavLink
                                            key={link.href}
                                            to={link.href}
                                            className={({ isActive }) =>
                                                cn(
                                                    "flex items-center rounded-md px-3 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground transition-colors",
                                                    isActive ? "bg-secondary/50 text-secondary-foreground" : "text-muted-foreground"
                                                )
                                            }
                                        >
                                            <link.icon className="mr-2 h-4 w-4 opacity-70" />
                                            {link.name}
                                        </NavLink>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
