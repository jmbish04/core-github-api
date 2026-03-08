import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Plus, Search, Filter, GitBranch, FolderGit2, Loader2, ArrowRight, Star, RefreshCw, XCircle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { NewProjectDialog } from '@/components/projects/NewProjectDialog';
import { getControlCenterUserId } from '@/lib/control-user';
import { pushRecentProject, removeRecentProject } from '@/lib/project-recents';
import { cn } from '@/lib/utils';
import { useProjectStore } from '@/stores/useProjectStore';

interface Project {
    id: string;
    name: string;
    description: string;
    status: string;
    repoId: string;
    createdAt: string;
    updatedAt?: string;
    lastDeployedAt?: string | null;
    repoOwner?: string;
    repoName?: string;
}
interface FavoriteProject {
    repoOwner: string;
    repoName: string;
}

function getProjectHealth(project: Project): {
    label: string;
    dotClassName: string;
} {
    const status = (project.status || "").toLowerCase();
    const lastActivity = new Date(project.lastDeployedAt || project.updatedAt || project.createdAt || 0).getTime();
    const daysSinceActivity = Number.isFinite(lastActivity)
        ? (Date.now() - lastActivity) / (1000 * 60 * 60 * 24)
        : Infinity;

    if (status === "active" && daysSinceActivity <= 7) {
        return { label: "healthy", dotClassName: "bg-emerald-400" };
    }
    if (status === "active") {
        return { label: "stale", dotClassName: "bg-amber-400" };
    }
    if (status === "failed" || status === "error") {
        return { label: "degraded", dotClassName: "bg-rose-400" };
    }
    return { label: status || "unknown", dotClassName: "bg-zinc-400" };
}

export default function Projects() {
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const userId = getControlCenterUserId();
    const [isNewProjectOpen, setIsNewProjectOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");

    const { data, isLoading, isError, error, isFetching } = useQuery({
        queryKey: ['projects'],
        queryFn: async () => {
            const res = await fetch('/api/projects', { credentials: 'include' });
            if (!res.ok) throw new Error('Failed to fetch projects');
            return res.json() as Promise<{ projects: Project[], success: boolean }>;
        }
    });

    const favoritesQuery = useQuery({
        queryKey: ['project-favorites', userId],
        queryFn: async () => {
            const res = await fetch(`/api/projects/favorites?userId=${encodeURIComponent(userId)}`, {
                credentials: 'include'
            });
            if (!res.ok) throw new Error('Failed to fetch project favorites');
            const payload = (await res.json()) as any as { favorites?: FavoriteProject[] };
            return payload.favorites || [];
        }
    });

    const favoriteSet = new Set(
        (favoritesQuery.data || [])
            .filter(f => f.repoOwner && f.repoName)
            .map(f => `${f.repoOwner.toLowerCase()}/${f.repoName.toLowerCase()}`)
    );

    const { addFavorite, removeFavorite, isFavorite } = useProjectStore();

    const toggleFavorite = (project: Project) => {
        const repo = {
            id: parseInt(project.repoId) || 0,
            owner: project.repoOwner!,
            name: project.repoName!,
            full_name: `${project.repoOwner}/${project.repoName}`,
            description: project.description
        };
        if (isFavorite(repo.full_name)) {
            removeFavorite(userId, repo);
        } else {
            addFavorite(userId, repo);
        }
    };

    const openProject = (project: Project) => {
        if (project.repoOwner && project.repoName) {
            pushRecentProject({
                repoOwner: project.repoOwner,
                repoName: project.repoName,
                projectName: project.name,
            });
            
            const repo = {
                id: parseInt(project.repoId) || 0,
                owner: project.repoOwner,
                name: project.repoName,
                full_name: `${project.repoOwner}/${project.repoName}`,
                description: project.description
            };
            
            // Adding as favorite makes it an active workspace
            addFavorite(userId, repo);

            navigate(`/project/${project.repoOwner}/${project.repoName}/dashboard`);
            return;
        }

        navigate(`/projects/${project.id}`);
    };

    const projects = [...(data?.projects || [])].sort((a, b) => {
        const left = new Date(b.lastDeployedAt || b.updatedAt || b.createdAt || 0).getTime();
        const right = new Date(a.lastDeployedAt || a.updatedAt || a.createdAt || 0).getTime();
        return left - right;
    });
    const filteredProjects = projects.filter(p =>
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.description?.toLowerCase().includes(searchQuery.toLowerCase())
    );

    // Render Skeletons for Loading State
    const Skeletons = () => (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array.from({ length: 6 }).map((_, i) => (
                <Card key={i} className="flex flex-col h-full border-muted">
                    <CardHeader className="gap-2">
                        <div className="flex items-start justify-between">
                            <Skeleton className="h-6 w-3/4" />
                            <div className="flex gap-2">
                                <Skeleton className="h-5 w-16" />
                                <Skeleton className="h-5 w-16 rounded-full" />
                            </div>
                        </div>
                        <Skeleton className="h-4 w-full mt-2" />
                        <Skeleton className="h-4 w-5/6" />
                    </CardHeader>
                    <CardContent className="flex-1">
                        <div className="flex gap-2 mt-4">
                            <Skeleton className="h-3 w-12" />
                            <Skeleton className="h-3 w-24" />
                        </div>
                    </CardContent>
                    <CardFooter className="bg-muted/10 border-t pt-4">
                        <Skeleton className="h-9 w-full" />
                    </CardFooter>
                </Card>
            ))}
        </div>
    );

    return (
        <div className="h-full overflow-y-auto flex flex-col space-y-6 container mx-auto py-6 px-4 md:px-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Projects</h1>
                    <p className="text-muted-foreground">Manage your repositories and expeditions.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <Button 
                        variant="outline" 
                        onClick={() => {
                            queryClient.invalidateQueries({ queryKey: ['projects'] });
                            // Optional: Trigger a hard sync via API if needed, but for now invalidate is good
                            // Actually, let's do the hard sync as requested
                            fetch('/api/projects?sync=true', { credentials: 'include' }).then(() => {
                                queryClient.invalidateQueries({ queryKey: ['projects'] });
                            });
                        }}
                    >
                        <RefreshCw className="w-4 h-4 mr-2" />
                        Sync GitHub
                    </Button>
                    <Button onClick={() => setIsNewProjectOpen(true)} className="gap-2">
                        <Plus className="w-4 h-4" /> New Project
                    </Button>
                </div>
            </div>

            {/* Filters */}
            <div className="flex flex-wrap items-center gap-4 bg-card p-4 rounded-lg border w-full">
                <div className="relative flex-1 min-w-[200px] max-w-sm">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Search projects..."
                        className="pl-9"
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                    />
                </div>
                <Button variant="outline" size="icon">
                    <Filter className="w-4 h-4" />
                </Button>
            </div>

            {/* Status Alert */}
            {isLoading || isFetching ? (
                <Card className="mb-6 bg-muted/20 border-muted">
                    <CardContent className="flex items-center gap-3 py-4">
                        <Loader2 className="h-5 w-5 animate-spin text-primary" />
                        <span className="text-sm font-medium">
                            {isLoading ? "Loading projects..." : "Syncing latest data..."}
                        </span>
                    </CardContent>
                </Card>
            ) : isError ? (
                <Card className="mb-6 border-destructive/50 bg-destructive/10">
                    <CardContent className="flex items-center gap-3 py-4 text-destructive">
                        <div className="rounded-full bg-destructive/20 p-1">
                            <XCircle className="h-5 w-5" />
                        </div>
                        <div className="flex flex-col">
                            <span className="text-sm font-semibold">Error Loading Projects</span>
                            <span className="text-xs opacity-90">
                                {error instanceof Error ? error.message : "An unexpected error occurred."}
                            </span>
                        </div>
                    </CardContent>
                </Card>
            ) : null}

            {/* Grid */}
            {isLoading || isError ? (
                <Skeletons />
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {filteredProjects.map(project => {
                        const health = getProjectHealth(project);
                        return (
                            <Card
                                key={project.id}
                                className="group hover:border-primary/50 transition-colors flex flex-col cursor-pointer"
                                onClick={() => openProject(project)}
                            >
                                <CardHeader>
                                    <div className="flex items-start justify-between">
                                        <CardTitle className="text-xl flex items-center gap-2">
                                            <FolderGit2 className="w-5 h-5 text-blue-500" />
                                            {project.name}
                                        </CardTitle>
                                        <div className="flex items-center gap-2">
                                            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                                                <span className={`h-2 w-2 rounded-full ${health.dotClassName}`} />
                                                {health.label}
                                            </span>
                                            <Badge variant={project.status === 'active' ? 'default' : 'secondary'}>
                                                {project.status}
                                            </Badge>
                                            {project.repoOwner && project.repoName && (
                                                <Button
                                                    size="icon"
                                                    variant="ghost"
                                                    className="h-7 w-7"
                                                    onClick={(event) => {
                                                        event.stopPropagation();
                                                        toggleFavorite(project);
                                                    }}
                                                >
                                                    <Star
                                                        className={cn(
                                                            "h-4 w-4",
                                                            isFavorite(`${project.repoOwner!.toLowerCase()}/${project.repoName!.toLowerCase()}`)
                                                                ? "fill-current text-amber-400"
                                                                : "text-muted-foreground",
                                                        )}
                                                    />
                                                </Button>
                                            )}
                                        </div>
                                    </div>
                                    <CardDescription className="line-clamp-2 min-h-[2.5em]">
                                        {project.description || "No description provided."}
                                    </CardDescription>
                                </CardHeader>
                                <CardContent className="flex-1">
                                    <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                                        <span className="flex items-center gap-1">
                                            <GitBranch className="w-3 h-3" /> main
                                        </span>
                                        <span>•</span>
                                        <span>
                                            Last deployed {new Date(project.lastDeployedAt || project.updatedAt || project.createdAt).toLocaleDateString()}
                                        </span>
                                    </div>
                                </CardContent>
                                <CardFooter className="bg-muted/10 border-t pt-4 flex gap-2">
                                    <Button
                                        variant="ghost"
                                        className="flex-1 justify-between hover:bg-background group-hover:text-primary"
                                        onClick={(event) => {
                                            event.stopPropagation();
                                            openProject(project);
                                        }}
                                    >
                                        View Dashboard <ArrowRight className="w-4 h-4" />
                                    </Button>
                                </CardFooter>
                            </Card>
                        );
                    })}

                    {/* Empty State */}
                    {filteredProjects.length === 0 && (
                        <div className="col-span-full py-12 text-center text-muted-foreground border-2 border-dashed rounded-lg">
                            <FolderGit2 className="w-12 h-12 mx-auto mb-4 opacity-50" />
                            <h3 className="text-lg font-medium">No projects found</h3>
                            <p>Try adjusting your filters or create a new one.</p>
                            <Button variant="link" onClick={() => setIsNewProjectOpen(true)} className="mt-2">
                                Create Project
                            </Button>
                        </div>
                    )}
                </div>
            )}

            <NewProjectDialog open={isNewProjectOpen} onOpenChange={setIsNewProjectOpen} />
        </div>
    );
}
