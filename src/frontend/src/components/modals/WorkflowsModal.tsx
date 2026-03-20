import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Workflow, Play } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent } from "@/components/ui/card";

export function WorkflowsModal({ workflowCount = 8 }: { workflowCount?: number }) {
    return (
        <Dialog>
            <DialogTrigger asChild>
                <Button variant="outline" className="relative gap-2 bg-zinc-900 border-zinc-800 hover:bg-zinc-800">
                    <Workflow className="w-4 h-4 text-zinc-400" />
                    Workflows
                    <Badge variant="secondary" className="ml-1 h-5 w-5 p-0 justify-center bg-zinc-800 text-[10px] rounded-full">
                        {workflowCount}
                    </Badge>
                </Button>
            </DialogTrigger>
            <DialogContent className="max-w-3xl h-[70vh] flex flex-col bg-zinc-950 border-zinc-800 p-6">
                <div className="mb-4">
                    <h2 className="text-lg font-semibold flex items-center gap-2">
                        <Workflow className="w-5 h-5" />
                        Available Workflows
                    </h2>
                    <p className="text-sm text-zinc-500">Manage and trigger automated agent workflows.</p>
                </div>
                <ScrollArea className="flex-1 pr-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {[
                            "Github Search", "PR Review", "Issue Triage", "Release Pipeline",
                            "Extract Comments", "Clear Conflicts", "Create Repo", "Turbo Demo"
                        ].map((wf) => (
                            <Card key={wf} className="bg-zinc-900/50 border-zinc-800 hover:border-zinc-700 transition-colors">
                                <CardContent className="p-4 flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded bg-blue-900/20 flex items-center justify-center">
                                            <Workflow className="w-4 h-4 text-blue-400" />
                                        </div>
                                        <div className="font-medium text-sm">{wf}</div>
                                    </div>
                                    <Button size="icon" variant="ghost" className="h-8 w-8 hover:bg-zinc-800">
                                        <Play className="w-4 h-4 text-zinc-400" />
                                    </Button>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                </ScrollArea>
            </DialogContent>
        </Dialog>
    );
}
