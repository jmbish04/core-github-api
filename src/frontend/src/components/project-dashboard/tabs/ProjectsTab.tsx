import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { HierarchyProvider } from "../hierarchy/HierarchyContext";
import { HierarchyTable } from "../hierarchy/HierarchyTable";
import { KanbanView } from "../hierarchy/KanbanView";
import { Card, CardContent } from "@/components/ui/card";
import { LayoutList, KanbanSquare } from "lucide-react";

export function ProjectsTab({ project, projectId }: { project: any, projectId: string }) {
    // Hydration Safety: Ensure strict JSON serialization
    const safeProject = JSON.parse(JSON.stringify(project));

    return (
        <HierarchyProvider initialData={safeProject} projectId={projectId}>
            <Tabs defaultValue="hierarchy" className="w-full space-y-4">
                <div className="flex items-center justify-between">
                     <div>
                        <h2 className="text-2xl font-bold tracking-tight">{project.title}</h2>
                        <p className="text-muted-foreground">Manage epics, stories, and tasks.</p>
                     </div>
                    <TabsList className="bg-muted/50 border">
                        <TabsTrigger value="hierarchy" className="gap-2 data-[state=active]:bg-background">
                            <LayoutList size={14}/> List
                        </TabsTrigger>
                        <TabsTrigger value="kanban" className="gap-2 data-[state=active]:bg-background">
                            <KanbanSquare size={14}/> Board
                        </TabsTrigger>
                    </TabsList>
                </div>

                <TabsContent value="hierarchy" className="mt-0">
                    <Card className="border-none shadow-none bg-transparent">
                        <CardContent className="p-0">
                            <HierarchyTable />
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="kanban" className="mt-0">
                    <Card className="border-none shadow-none bg-transparent">
                         <CardContent className="p-0">
                            <KanbanView />
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </HierarchyProvider>
    );
}
