import { Link, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { WorkflowStudio } from "@/components/workflows/WorkflowStudio";
import { getWorkflowDefinition } from "@/components/workflows/catalog";

export default function WorkflowEditorPage() {
  const { workflowId = "" } = useParams();
  const workflow = getWorkflowDefinition(workflowId);

  if (!workflow) {
    return (
      <div className="mx-auto flex h-[calc(100vh-8rem)] max-w-3xl flex-col items-start justify-center gap-4">
        <h1 className="text-3xl font-bold">Workflow Not Found</h1>
        <p className="text-muted-foreground">
          The selected workflow does not exist. Open the workflow catalog and choose a valid item.
        </p>
        <Button asChild>
          <Link to="/workflows">Back to Workflows</Link>
        </Button>
      </div>
    );
  }

  return <WorkflowStudio workflow={workflow} mode="edit" />;
}

