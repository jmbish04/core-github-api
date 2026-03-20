import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Loader2, PlusIcon, BotIcon, FileTextIcon, MoreHorizontalIcon, CalendarIcon, GanttChartSquareIcon } from "lucide-react";
// @ts-ignore
import groupBy from "lodash.groupby";

import {
    GanttFeatureItem,
    GanttFeatureList,
    GanttFeatureListGroup,
    GanttHeader,
    GanttProvider,
    GanttSidebar,
    GanttSidebarGroup,
    GanttSidebarItem,
    GanttTimeline,
    GanttToday,
} from "@/components/kibo-ui/gantt";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
// import { Markdown } from "@/components/ui/markdown"; 

// --- Types ---

interface Project {
    id: string;
    repoId: string;
    name: string;
    description: string;
    status: string;
    owner: string;
}

interface Phase {
    id: string;
    projectId: string;
    name: string;
    description: string;
    status: string;
    startDate: string;
    endDate: string;
    successCriteria?: string;
    technicalInstructions?: string;
}

// --- Components ---

const PhaseDetailDialog = ({ phase, project, open, onOpenChange }: { phase: Phase | null, project: Project | null, open: boolean, onOpenChange: (open: boolean) => void }) => {
    const queryClient = useQueryClient();
    const [isGenerating, setIsGenerating] = useState(false);

    const generateMutation = useMutation({
        mutationFn: async () => {
            if (!phase) return;
            setIsGenerating(true);
            const res = await fetch(`/api/projects/phases/${phase.id}/generate-instructions`, { method: 'POST' });
            if (!res.ok) throw new Error('Failed to generate');
            return res.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries(['projects']);
            setIsGenerating(false);
        },
        onError: () => setIsGenerating(false)
    });

    if (!phase) return null;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        {phase.name}
                        <Badge variant="outline">{phase.status}</Badge>
                    </DialogTitle>
                    <DialogDescription>
                        Project: <span className="font-semibold">{project?.name}</span>
                    </DialogDescription>
                </DialogHeader>

                <div className="flex-1 overflow-auto p-1">
                    <Tabs defaultValue="details" className="w-full">
                        <TabsList>
                            <TabsTrigger value="details">Details</TabsTrigger>
                            <TabsTrigger value="technical">Technical Instructions (AI)</TabsTrigger>
                        </TabsList>

                        <TabsContent value="details" className="space-y-4 mt-4">
                            <div className="space-y-2">
                                <Label>Description</Label>
                                <div className="text-sm text-muted-foreground p-3 bg-muted/20 rounded-md">
                                    {phase.description || "No description."}
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <Label>Start Date</Label>
                                    <div className="text-sm">{phase.startDate ? format(new Date(phase.startDate), 'PPP') : 'Not set'}</div>
                                </div>
                                <div>
                                    <Label>End Date</Label>
                                    <div className="text-sm">{phase.endDate ? format(new Date(phase.endDate), 'PPP') : 'Not set'}</div>
                                </div>
                            </div>
                        </TabsContent>

                        <TabsContent value="technical" className="mt-4 h-full flex flex-col">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-sm font-medium flex items-center gap-2">
                                    <BotIcon className="w-4 h-4 text-purple-500" />
                                    AI Technical Plan
                                </h3>
                                <Button
                                    size="sm"
                                    variant="secondary"
                                    onClick={() => generateMutation.mutate()}
                                    disabled={isGenerating}
                                >
                                    {isGenerating ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <BotIcon className="w-4 h-4 mr-2" />}
                                    {phase.technicalInstructions ? "Regenerate" : "Generate Instructions"}
                                </Button>
                            </div>

                            <ScrollArea className="h-[400px] w-full rounded-md border p-4 bg-muted/10">
                                {phase.technicalInstructions ? (
                                    <div className="prose prose-sm dark:prose-invert max-w-none">
                                        {/* Simple markdown rendering or just pre-wrap if no renderer available */}
                                        <pre className="whitespace-pre-wrap font-sans">{phase.technicalInstructions}</pre>
                                    </div>
                                ) : (
                                    <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                                        <BotIcon className="w-12 h-12 mb-2 opacity-20" />
                                        <p>No technical instructions generated yet.</p>
                                        <p className="text-xs">Click generate to have AI analyze the project and create a plan.</p>
                                    </div>
                                )}
                            </ScrollArea>
                        </TabsContent>
                    </Tabs>
                </div>
            </DialogContent>
        </Dialog>
    );
};

const CreatePhaseDialog = ({ projectId, open, onOpenChange }: { projectId: string, open: boolean, onOpenChange: (o: boolean) => void }) => {
    const queryClient = useQueryClient();
    const [formData, setFormData] = useState({ name: '', description: '', startDate: '', endDate: '' });

    const createMutation = useMutation({
        mutationFn: async () => {
            const res = await fetch(`/api/projects/${projectId}/phases`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            });
            if (!res.ok) throw new Error('Failed to create');
        },
        onSuccess: () => {
            queryClient.invalidateQueries(['projects']);
            onOpenChange(false);
            setFormData({ name: '', description: '', startDate: '', endDate: '' });
        }
    });

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Add Project Phase</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                    <div className="space-y-2">
                        <Label>Phase Name</Label>
                        <Input value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} placeholder="e.g. Phase 1: MVP" />
                    </div>
                    <div className="space-y-2">
                        <Label>Description</Label>
                        <Textarea value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })} placeholder="What are the goals of this phase?" />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Start Date</Label>
                            <Input type="date" value={formData.startDate} onChange={e => setFormData({ ...formData, startDate: e.target.value })} />
                        </div>
                        <div className="space-y-2">
                            <Label>End Date</Label>
                            <Input type="date" value={formData.endDate} onChange={e => setFormData({ ...formData, endDate: e.target.value })} />
                        </div>
                    </div>
                </div>
                <DialogFooter>
                    <Button onClick={() => createMutation.mutate()}>Create Phase</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};

// --- Values ---

const RoadmapPage = () => {
    const { data: projectsData, isLoading } = useQuery({
        queryKey: ['projects'],
        queryFn: async () => {
            const res = await fetch('/api/projects');
            if (!res.ok) throw new Error('Failed to load projects');
            const data = (await res.json()) as any;

            // Fetch phase details for each project in parallel,
            // but never let a single failure abort the whole load.
            const projectsWithPhases = await Promise.all(
                (data.projects ?? []).map(async (p: any) => {
                    try {
                        const details = await fetch(`/api/projects/${p.id}`).then(r => r.json() as any);
                        return { ...p, phases: details.phases ?? [] };
                    } catch {
                        return { ...p, phases: [] };
                    }
                })
            );
            return projectsWithPhases;
        },
        staleTime: 60_000,           // treat data as fresh for 60 s
        refetchOnWindowFocus: false,  // don't refetch on tab focus
        retry: 1,
    });

    const [selectedPhase, setSelectedPhase] = useState<Phase | null>(null);
    const [selectedFrameworkProject, setSelectedFrameworkProject] = useState<Project | null>(null);
    const [createPhaseOpen, setCreatePhaseOpen] = useState(false);
    const [createProjectId, setCreateProjectId] = useState<string | null>(null);

    // Transform to Gantt Features
    const features = useMemo(() => {
        if (!projectsData) return [];
        const allFeatures: any[] = [];

        projectsData.forEach((project: any) => {
            if (project.phases && project.phases.length > 0) {
                project.phases.forEach((phase: any) => {
                    allFeatures.push({
                        id: phase.id,
                        name: phase.name,
                        startAt: phase.startDate ? new Date(phase.startDate) : new Date(project.createdAt),
                        endAt: phase.endDate ? new Date(phase.endDate) : new Date(new Date().getTime() + 86400000 * 30),
                        status: { id: phase.status, name: phase.status, color: '#3b82f6' }, // Mock status color
                        group: { id: project.id, name: project.name },
                        owner: { name: project.owner || 'Team' },
                        // Metadata
                        fullPhase: phase,
                        fullProject: project
                    });
                });
            } else {
                // Determine implicit project timeline? Or just don't show project if empty phases?
                // Let's create a placeholder feature for the project itself if no phases
                allFeatures.push({
                    id: project.id,
                    name: "Planning / No Phases",
                    startAt: new Date(project.createdAt),
                    endAt: new Date(project.createdAt), // Point
                    status: { id: project.status, name: project.status, color: '#9ca3af' },
                    group: { id: project.id, name: project.name },
                    owner: { name: project.owner || 'Team' },
                    fullProject: project,
                    isPlaceholder: true
                });
            }
        });
        return allFeatures;
    }, [projectsData]);

    // Grouping for Gantt Sidebar
    const groupedFeatures = useMemo(() => {
        return groupBy(features, (f: any) => f.group?.name || "Uncategorized");
    }, [features]);

    const handlePhaseClick = (feature: any) => {
        if (feature.isPlaceholder) {
            setCreateProjectId(feature.fullProject.id);
            setCreatePhaseOpen(true);
            return;
        }
        setSelectedPhase(feature.fullPhase);
        setSelectedFrameworkProject(feature.fullProject);
    };

    if (isLoading) return <div className="flex h-screen items-center justify-center"><Loader2 className="animate-spin" /></div>;

    return (
        <div className="flex flex-col h-screen bg-background p-6">
            <div className="flex items-center justify-between mb-6">
                <div className="space-y-1">
                    <h1 className="text-2xl font-bold">Strategic Roadmap</h1>
                    <p className="text-muted-foreground">High-level project phases and technical plans.</p>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" onClick={() => { }} disabled>
                        <PlusIcon className="w-4 h-4 mr-2" />
                        New Project
                    </Button>
                </div>
            </div>

            <div className="flex-1 overflow-hidden border rounded-lg bg-card shadow-sm">
                <GanttProvider
                    className="rounded-none h-full"
                    range="monthly" // Default to monthly for phases
                    zoom={100}
                >
                    <GanttSidebar className="w-64 border-r">
                        {Object.entries(groupedFeatures).map(([group, groupFeatures]) => (
                            <GanttSidebarGroup key={group} name={group}>
                                {(groupFeatures as any[]).map((feature) => (
                                    <GanttSidebarItem
                                        feature={feature}
                                        key={feature.id}
                                        onSelectItem={() => handlePhaseClick(feature)}
                                    />
                                ))}
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="w-full justify-start text-xs text-muted-foreground mt-1"
                                    onClick={() => {
                                        // Find project ID from group features
                                        const pid = (groupFeatures as any[])[0]?.group?.id;
                                        if (pid) {
                                            setCreateProjectId(pid);
                                            setCreatePhaseOpen(true);
                                        }
                                    }}
                                >
                                    <PlusIcon className="w-3 h-3 mr-1" /> Add Phase
                                </Button>
                            </GanttSidebarGroup>
                        ))}
                    </GanttSidebar>
                    <GanttTimeline>
                        <GanttHeader />
                        <GanttFeatureList>
                            {Object.entries(groupedFeatures).map(([group, groupFeatures]) => (
                                <GanttFeatureListGroup key={group}>
                                    {(groupFeatures as any[]).map((feature) => (
                                        <div className="flex" key={feature.id}>
                                            <button
                                                className="w-full text-left"
                                                onClick={() => handlePhaseClick(feature)}
                                            >
                                                <GanttFeatureItem
                                                    {...feature}
                                                    className={feature.isPlaceholder ? "opacity-50 border-dashed" : ""}
                                                >
                                                    <span className="truncate text-xs px-2 font-medium">
                                                        {feature.name}
                                                    </span>
                                                </GanttFeatureItem>
                                            </button>
                                        </div>
                                    ))}
                                </GanttFeatureListGroup>
                            ))}
                        </GanttFeatureList>
                        <GanttToday />
                    </GanttTimeline>
                </GanttProvider>
            </div>

            {/* Dialogs */}
            <PhaseDetailDialog
                open={!!selectedPhase}
                onOpenChange={(o) => !o && setSelectedPhase(null)}
                phase={selectedPhase}
                project={selectedFrameworkProject}
            />

            <CreatePhaseDialog
                open={createPhaseOpen}
                onOpenChange={setCreatePhaseOpen}
                projectId={createProjectId || ''}
            />

        </div>
    );
};

export default RoadmapPage;
