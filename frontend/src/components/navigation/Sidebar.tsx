import { cn } from "@/lib/utils";
import {
    BookOpen,
    Clock3,
    Home,
    MessageSquare,
    Workflow,
    Activity,
    Settings,
    ChevronDown,
    ChevronRight,
    Package,
    LayoutDashboard,
    Trello,
    GitPullRequest,
    FolderGit2,
    Star,
    Wand2,
    DollarSign
} from "lucide-react";
import { NavLink, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { workflowCatalog } from "@/components/workflows/catalog";
import { useQuery } from "@tanstack/react-query";
import { getControlCenterUserId } from "@/lib/control-user";
import {
    getRecentProjects,
    subscribeToRecentProjectUpdates,
    type RecentProject,
} from "@/lib/project-recents";
import { useAuth } from "@/context/auth-context";

interface SidebarProps extends React.HTMLAttributes<HTMLDivElement> { }
type FavoriteProject = {
    repoOwner: string;
    repoName: string;
    createdAt: string;
    repoId?: string | null;
    projectDescription?: string | null;
};

export function Sidebar({ className }: SidebarProps) {
    const location = useLocation();
    const { isAuthenticated } = useAuth();
    const userId = getControlCenterUserId();

    const [isControlCenterExpanded, setIsControlCenterExpanded] = useState(false);
    const [isDocsExpanded, setIsDocsExpanded] = useState(false);
    const [isWorkflowsExpanded, setIsWorkflowsExpanded] = useState(false);
    const [isWorkshopExpanded, setIsWorkshopExpanded] = useState(false);
    const [recentProjects, setRecentProjects] = useState<RecentProject[]>([]);

    const { data: favorites = [] } = useQuery({
        queryKey: ["project-favorites", userId],
        enabled: isAuthenticated,
        queryFn: async () => {
            const response = await fetch(`/api/projects/favorites?userId=${encodeURIComponent(userId)}`, {
                credentials: "include",
            });
            if (!response.ok) {
                throw new Error("Failed to fetch favorites");
            }
            const payload = (await response.json()) as any as { favorites?: FavoriteProject[] };
            return payload.favorites || [];
        },
    });

    const mainLinks = [
        { name: "Home", href: "/", icon: Home },
        { name: "Health", href: "/health", icon: Activity },
        { name: "App Store", href: "/apps", icon: Package }
    ];

    const docsLinks = [
        { name: "Overview", href: "/docs" },
        { name: "OpenAPI JSON", href: "/openapi.json" },
        { name: "Swagger", href: "/swagger" },
        { name: "Scaler", href: "/scaler" },
        { name: "LLMS.txt", href: "/llms.txt" },
    ];

    const workflowLinks = [
        { name: "All Workflows", href: "/workflows" },
        { name: "New Workflow", href: "/workflows/new" },
        ...workflowCatalog.map((workflow) => ({
            name: workflow.title,
            href: `/workflows/${workflow.key}`,
        })),
    ];

    const workshopLinks = [
        { name: "Workshop", href: "/workshop" },
        { name: "Command Center", href: "/workshop/command-center" },
        { name: "Takeover Wizard", href: "/workshop/takeover" },
        { name: "Decision Inbox", href: "/workshop/inbox" },
        { name: "Analytics", href: "/workshop/analytics" },
    ];

    const controlCenterLinks = [
        { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
        { name: "Projects", href: "/projects", icon: FolderGit2 },
        { name: "Chat", href: "/chat", icon: MessageSquare },
        { name: "Costs & Billing", href: "/costs", icon: DollarSign },
        { name: "Kanban", href: "/kanban", icon: Trello },
        { name: "Roadmap", href: "/roadmap", icon: Trello },
        { name: "PR Command Center", href: "/pr-center", icon: GitPullRequest },
        { name: "Settings", href: "/settings", icon: Settings },
        { name: "General Todos", href: "/todos", icon: BookOpen },
    ];

    const isControlCenterActive = controlCenterLinks.some(link => location.pathname === link.href);
    const isDocsActive = docsLinks.some(link => location.pathname === link.href);
    const isWorkflowsActive =
        location.pathname.startsWith("/workflows");
    const isProjectRouteActive = location.pathname.startsWith("/projects/");
    const isWorkshopActive = location.pathname.startsWith("/workshop");

    useEffect(() => {
        if (isDocsActive) setIsDocsExpanded(true);
    }, [isDocsActive]);

    useEffect(() => {
        if (isWorkflowsActive) setIsWorkflowsExpanded(true);
    }, [isWorkflowsActive]);

    useEffect(() => {
        if (isWorkshopActive) setIsWorkshopExpanded(true);
    }, [isWorkshopActive]);

    useEffect(() => {
        if (isControlCenterActive) setIsControlCenterExpanded(true);
    }, [isControlCenterActive]);

    useEffect(() => {
        setRecentProjects(getRecentProjects());
        return subscribeToRecentProjectUpdates(() => {
            setRecentProjects(getRecentProjects());
        });
    }, []);

    const isWorkflowLinkActive = (href: string) => {
        if (location.pathname === href) return true;
        if (href.startsWith("/workflows")) {
            return location.pathname === href;
        }
        return false;
    };

    return (
        <div className={cn("pb-12 w-64 border-r min-h-screen bg-card text-card-foreground hidden md:block", className)}>
            <div className="space-y-4 py-4">
                <div className="px-3 py-2">
                    <h2 className="mb-2 px-4 text-lg font-semibold tracking-tight text-foreground">
                        Github Worker
                    </h2>
                    <div className="space-y-1">
                        {isAuthenticated && (
                            <>
                                <div className="px-3 py-2">
                                    <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                        <Star className="h-3.5 w-3.5" />
                                        Favorites
                                    </div>
                                    <div className="space-y-1">
                                        {favorites.length === 0 ? (
                                            <p className="px-2 py-1 text-xs text-muted-foreground">
                                                Star projects to keep them pinned.
                                            </p>
                                        ) : (
                                            favorites.slice(0, 8).map((favorite) => {
                                                const href = `/projects/${favorite.repoOwner}/${favorite.repoName}`;
                                                return (
                                                    <NavLink
                                                        key={`${favorite.repoOwner}/${favorite.repoName}`}
                                                        to={href}
                                                        className={cn(
                                                            "flex items-center rounded-md px-3 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground transition-colors",
                                                            location.pathname === href
                                                                ? "bg-secondary/50 text-secondary-foreground"
                                                                : "text-muted-foreground",
                                                        )}
                                                    >
                                                        <Star className="mr-2 h-4 w-4 fill-current text-amber-400" />
                                                        <span className="truncate">{favorite.repoOwner}/{favorite.repoName}</span>
                                                    </NavLink>
                                                );
                                            })
                                        )}
                                    </div>
                                </div>

                                <div className="px-3 py-2">
                                    <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                        <Clock3 className="h-3.5 w-3.5" />
                                        Recent
                                    </div>
                                    <div className="space-y-1">
                                        {recentProjects.length === 0 ? (
                                            <p className="px-2 py-1 text-xs text-muted-foreground">
                                                Open a project to see it here.
                                            </p>
                                        ) : (
                                            recentProjects.slice(0, 8).map((project) => {
                                                const href = `/projects/${project.repoOwner}/${project.repoName}`;
                                                return (
                                                    <NavLink
                                                        key={`${project.repoOwner}/${project.repoName}`}
                                                        to={href}
                                                        className={cn(
                                                            "flex items-center rounded-md px-3 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground transition-colors",
                                                            location.pathname === href
                                                                ? "bg-secondary/50 text-secondary-foreground"
                                                                : "text-muted-foreground",
                                                        )}
                                                    >
                                                        <Clock3 className="mr-2 h-4 w-4 opacity-80" />
                                                        <span className="truncate">
                                                            {project.projectName || `${project.repoOwner}/${project.repoName}`}
                                                        </span>
                                                    </NavLink>
                                                );
                                            })
                                        )}
                                    </div>
                                </div>
                            </>
                        )}

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

                        <NavLink
                            to="/projects"
                            className={({ isActive }) =>
                                cn(
                                    "flex items-center rounded-md px-3 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground transition-colors",
                                    isActive || isProjectRouteActive
                                        ? "bg-secondary text-secondary-foreground"
                                        : "text-muted-foreground",
                                )
                            }
                        >
                            <FolderGit2 className="mr-2 h-4 w-4" />
                            Projects
                        </NavLink>

                        {/* Workflows Collapsible */}
                        <div className="pt-2">
                            <Button
                                variant="ghost"
                                className={cn(
                                    "w-full justify-between hover:bg-accent hover:text-accent-foreground px-3 py-2 h-auto font-medium",
                                    isWorkflowsActive ? "text-primary" : "text-muted-foreground"
                                )}
                                onClick={() => setIsWorkflowsExpanded(!isWorkflowsExpanded)}
                            >
                                <span className="flex items-center text-sm">
                                    <Workflow className="mr-2 h-4 w-4" />
                                    Workflows
                                </span>
                                {isWorkflowsExpanded ? (
                                    <ChevronDown className="h-4 w-4" />
                                ) : (
                                    <ChevronRight className="h-4 w-4" />
                                )}
                            </Button>

                            {isWorkflowsExpanded && (
                                <div className="ml-4 mt-1 space-y-1 border-l pl-2">
                                    {workflowLinks.map((link) => (
                                        <NavLink
                                            key={link.href}
                                            to={link.href}
                                            className={cn(
                                                "flex items-center rounded-md px-3 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground transition-colors",
                                                isWorkflowLinkActive(link.href)
                                                    ? "bg-secondary/50 text-secondary-foreground"
                                                    : "text-muted-foreground"
                                            )}
                                        >
                                            <Workflow className="mr-2 h-4 w-4 opacity-70" />
                                            {link.name}
                                        </NavLink>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Docs Collapsible */}
                        <div className="pt-2">
                            <Button
                                variant="ghost"
                                className={cn(
                                    "w-full justify-between hover:bg-accent hover:text-accent-foreground px-3 py-2 h-auto font-medium",
                                    isDocsActive ? "text-primary" : "text-muted-foreground"
                                )}
                                onClick={() => setIsDocsExpanded(!isDocsExpanded)}
                            >
                                <span className="flex items-center text-sm">
                                    <BookOpen className="mr-2 h-4 w-4" />
                                    Docs
                                </span>
                                {isDocsExpanded ? (
                                    <ChevronDown className="h-4 w-4" />
                                ) : (
                                    <ChevronRight className="h-4 w-4" />
                                )}
                            </Button>

                            {isDocsExpanded && (
                                <div className="ml-4 mt-1 space-y-1 border-l pl-2">
                                    {docsLinks.map((link) => (
                                        <a
                                            key={link.href}
                                            href={link.href}
                                            className={cn(
                                                "flex items-center rounded-md px-3 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground transition-colors",
                                                location.pathname === link.href ? "bg-secondary/50 text-secondary-foreground" : "text-muted-foreground"
                                            )}
                                        >
                                            <BookOpen className="mr-2 h-4 w-4 opacity-70" />
                                            {link.name}
                                        </a>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Workshop Collapsible */}
                        <div className="pt-2">
                            <Button
                                variant="ghost"
                                className={cn(
                                    "w-full justify-between hover:bg-accent hover:text-accent-foreground px-3 py-2 h-auto font-medium",
                                    isWorkshopActive ? "text-primary" : "text-muted-foreground"
                                )}
                                onClick={() => setIsWorkshopExpanded(!isWorkshopExpanded)}
                            >
                                <span className="flex items-center text-sm">
                                    <Wand2 className="mr-2 h-4 w-4" />
                                    Agent Workshop
                                </span>
                                {isWorkshopExpanded ? (
                                    <ChevronDown className="h-4 w-4" />
                                ) : (
                                    <ChevronRight className="h-4 w-4" />
                                )}
                            </Button>

                            {isWorkshopExpanded && (
                                <div className="ml-4 mt-1 space-y-1 border-l pl-2">
                                    {workshopLinks.map((link) => (
                                        <NavLink
                                            key={link.href}
                                            to={link.href}
                                            className={({ isActive }) =>
                                                cn(
                                                    "flex items-center rounded-md px-3 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground transition-colors",
                                                    isActive || location.pathname === link.href ? "bg-secondary/50 text-secondary-foreground" : "text-muted-foreground"
                                                )
                                            }
                                        >
                                            <Wand2 className="mr-2 h-4 w-4 opacity-70" />
                                            {link.name}
                                        </NavLink>
                                    ))}
                                </div>
                            )}
                        </div>

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
