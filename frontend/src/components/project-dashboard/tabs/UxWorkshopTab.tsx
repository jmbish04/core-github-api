import { ProjectAssistant } from "../ProjectAssistant";
import { LandingPageGenerator } from "../LandingPageGenerator";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type UxWorkshopTabProps = {
  projectId: string;
  projectName: string;
};

export function UxWorkshopTab({ projectId, projectName }: UxWorkshopTabProps) {
  return (
    <Tabs defaultValue="studio" className="h-full space-y-4">
      <div className="flex items-center justify-between">
         <TabsList>
            <TabsTrigger value="studio">UX Design Studio</TabsTrigger>
            <TabsTrigger value="landing">Landing Page Generator</TabsTrigger>
         </TabsList>
      </div>

      <TabsContent value="studio" className="h-[calc(100%-3rem)] mt-0 border-none outline-none">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 h-full min-h-[500px]">
          <ProjectAssistant
            projectId={projectId}
            projectName={projectName}
            title="UX Architect"
            description="Generate design studies and Stitch-ready mockup tasks."
            suggestions={[
                "Generate a complete UX design study",
                "Prepare a Stitch handoff",
                "Critique current frontend architecture",
                "Assign implementation tasks to Jules"
            ]}
            className="h-full"
          />
          
          <Card className="flex flex-col h-full">
            <CardHeader>
              <CardTitle>Mockup Preview</CardTitle>
              <CardDescription>
                Mockups generated from Stitch handoff will appear here.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex-1 min-h-0 bg-muted/20 rounded-md m-6 mt-0 border border-dashed flex items-center justify-center">
                <p className="text-sm text-muted-foreground">No mockups generated yet.</p>
            </CardContent>
          </Card>
        </div>
      </TabsContent>

      <TabsContent value="landing" className="h-[calc(100%-3rem)] mt-0 border-none outline-none">
         <LandingPageGenerator projectId={projectId} projectName={projectName} />
      </TabsContent>
    </Tabs>
  );
}

