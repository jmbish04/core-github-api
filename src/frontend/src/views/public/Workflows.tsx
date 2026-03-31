import { useParams } from "react-router-dom";
import Flow from "@/components/workflows/Flow";
import { workflows } from "@/components/workflows/data";

export default function WorkflowsPage() {
    const { workflowId } = useParams();

    // Default to 'turbo' if no ID provided, or if ID doesn't exist (fallback)
    const activeKey = (workflowId && workflows[workflowId as keyof typeof workflows])
        ? (workflowId as keyof typeof workflows)
        : 'turbo';

    const activeWorkflow = workflows[activeKey];

    return (
        <div className="space-y-6 max-w-6xl mx-auto h-[calc(100vh-4rem)] flex flex-col">
            <div className="space-y-2 flex-shrink-0">
                <h1 className="text-3xl font-bold tracking-tight">{activeWorkflow.title}</h1>
                <p className="text-muted-foreground text-lg">{activeWorkflow.description}</p>
            </div>

            <div className="flex-grow border rounded-lg overflow-hidden shadow-sm relative">
                <Flow initialNodes={activeWorkflow.nodes} initialEdges={activeWorkflow.edges} />
            </div>
        </div>
    );
}
