import { WorkflowStudio } from "@/components/workflows/WorkflowStudio";
import { createBlankWorkflowDraft } from "@/components/workflows/catalog";

export default function WorkflowNewPage() {
  const draft = createBlankWorkflowDraft();
  return <WorkflowStudio workflow={draft} mode="new" />;
}

