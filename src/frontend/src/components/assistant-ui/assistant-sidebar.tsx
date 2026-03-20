import type { ReactNode } from "react";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { WorkflowThread, type WorkflowMutation } from "./workflow-thread";

type AssistantSidebarProps = {
  children: ReactNode;
  workflowKey: string;
  workflowTitle: string;
  mode: "new" | "edit";
  onApplyMutation: (mutation: WorkflowMutation) => void;
  onSendToJules: (payload: {
    optimizedPrompt: string;
    transcript: Array<{ id: string; role: "assistant" | "user"; content: string }>;
  }) => Promise<{ ok: boolean; message: string }>;
};

export function AssistantSidebar({
  children,
  workflowKey,
  workflowTitle,
  mode,
  onApplyMutation,
  onSendToJules,
}: AssistantSidebarProps) {
  return (
    <ResizablePanelGroup orientation="horizontal" className="h-full rounded-lg border">
      <ResizablePanel defaultSize={65} minSize={30}>
        <div className="h-full overflow-hidden">{children}</div>
      </ResizablePanel>
      <ResizableHandle withHandle />
      <ResizablePanel defaultSize={35} minSize={20} maxSize={50}>
        <WorkflowThread
          workflowKey={workflowKey}
          workflowTitle={workflowTitle}
          mode={mode}
          onApplyMutation={onApplyMutation}
          onSendToJules={onSendToJules}
        />
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
