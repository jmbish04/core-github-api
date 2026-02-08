import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Plus, Search, Filter, GitBranch, FolderGit2, Loader2, ArrowRight } from 'lucide-react';
import { NewProjectDialog } from '@/components/projects/NewProjectDialog';
import { LandingGeneratorModal } from '@/components/projects/LandingGeneratorModal';

// Mock types until shared types are strict
interface Project {
    id: string;
    name: string;
    description: string;
    status: string;
    repoId: string;
    createdAt: string;
    repoOwner?: string;
    repoName?: string;
}

export default function Projects() {
    const [isNewProjectOpen, setIsNewProjectOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");

    const { data, isLoading } = useQuery({
        queryKey: ['projects'],
        queryFn: async () => {
            const res = await fetch('/api/projects');
            if (!res.ok) throw new Error('Failed to fetch projects');
            return res.json() as Promise<{ projects: Project[], success: boolean }>;
        }
    });

    const projects = data?.projects || [];
    const filteredProjects = projects.filter(p =>
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.description?.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <div className="h-full flex flex-col space-y-6 container mx-auto py-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Projects</h1>
                    <p className="text-muted-foreground">Manage your repositories and expeditions.</p>
                </div>
                <Button onClick={() => setIsNewProjectOpen(true)} className="gap-2">
                    <Plus className="w-4 h-4" /> New Project
                </Button>
            </div>

            {/* Filters */}
            <div className="flex items-center gap-4 bg-card p-4 rounded-lg border">
                <div className="relative flex-1 max-w-sm">
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

            {/* Grid */}
            {isLoading ? (
                <div className="flex justify-center py-20">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {filteredProjects.map(project => (
                        <Card key={project.id} className="group hover:border-primary/50 transition-colors flex flex-col">
                            <CardHeader>
                                <div className="flex items-start justify-between">
                                    <CardTitle className="text-xl flex items-center gap-2">
                                        <FolderGit2 className="w-5 h-5 text-blue-500" />
                                        {project.name}
                                    </CardTitle>
                                    <Badge variant={project.status === 'active' ? 'default' : 'secondary'}>
                                        {project.status}
                                    </Badge>
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
                                    <span>Updated {new Date(project.createdAt).toLocaleDateString()}</span>
                                </div>
                            </CardContent>
                            <CardFooter className="bg-muted/10 border-t pt-4 flex gap-2">
                                <Button variant="ghost" className="flex-1 justify-between hover:bg-background group-hover:text-primary">
                                    View Dashboard <ArrowRight className="w-4 h-4" />
                                </Button>
                                {project.repoOwner && project.repoName && (
                                    <LandingGeneratorModal owner={project.repoOwner} repo={project.repoName} />
                                )}
                            </CardFooter>
                        </Card>
                    ))}

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
