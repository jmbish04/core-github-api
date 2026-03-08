import type { Edge, Node } from "@xyflow/react";
import { FiCpu, FiZap } from "react-icons/fi";
import { workflows } from "./data";
import type { TurboNodeData } from "./TurboNode";

export type WorkflowGraph = {
  nodes: Node<TurboNodeData>[];
  edges: Edge[];
};

export type WorkflowDefinition = {
  key: string;
  title: string;
  description: string;
  triggers: string[];
  automationDescription: string;
  graph: WorkflowGraph;
};

const workflowMetadata: Record<
  string,
  { triggers: string[]; automationDescription: string }
> = {
  turbo: {
    triggers: ["manual", "deployment"],
    automationDescription: "Build graph orchestration for dependency bundling.",
  },
  "github-search": {
    triggers: ["chat request", "manual run"],
    automationDescription:
      "Routes a user request through planner + workflow execution for GitHub search.",
  },
  "pr-review": {
    triggers: ["pull_request", "issue_comment"],
    automationDescription:
      "Parses PR context, summarizes key findings, and posts review feedback.",
  },
  "issue-triage": {
    triggers: ["issues.opened", "issues.edited"],
    automationDescription:
      "Classifies incoming issues, applies labels, and drafts initial responses.",
  },
  "release-pipeline": {
    triggers: ["push(main)", "workflow_dispatch"],
    automationDescription:
      "Builds and validates release artifacts before deployment and release tagging.",
  },
  "extract-comments": {
    triggers: ["issue_comment", "pull_request_review_comment"],
    automationDescription:
      "Extracts PR comments into structured records for downstream processing.",
  },
  "clear-conflicts": {
    triggers: ["pull_request.synchronize", "manual intervention"],
    automationDescription:
      "Guides conflict resolution flows and proposes patch-ready merge plans.",
  },
  "create-repo": {
    triggers: ["repository.created", "chat command"],
    automationDescription:
      "Scaffolds new repositories using predefined stack profiles and defaults.",
  },
};

export const workflowCatalog: WorkflowDefinition[] = Object.entries(workflows).map(
  ([key, value]) => {
    const metadata = workflowMetadata[key] || {
      triggers: ["manual"],
      automationDescription: "Automated workflow orchestration.",
    };

    return {
      key,
      title: value.title,
      description: value.description,
      triggers: metadata.triggers,
      automationDescription: metadata.automationDescription,
      graph: {
        nodes: value.nodes as Node<TurboNodeData>[],
        edges: value.edges as Edge[],
      },
    };
  },
);

export function getWorkflowDefinition(
  workflowKey: string,
): WorkflowDefinition | undefined {
  return workflowCatalog.find((workflow) => workflow.key === workflowKey);
}

export function createBlankWorkflowDraft(): WorkflowDefinition {
  const nodes: Node<TurboNodeData>[] = [
    {
      id: "draft-trigger",
      position: { x: 20, y: 140 },
      data: {
        title: "Trigger",
        subtitle: "Waiting for event",
        icon: <FiZap />,
        color: "green",
      },
      type: "turbo",
    },
    {
      id: "draft-agent",
      position: { x: 320, y: 140 },
      data: {
        title: "Assistant Draft",
        subtitle: "Describe your workflow goals",
        icon: <FiCpu />,
        color: "blue",
      },
      type: "turbo",
    },
  ];

  const edges: Edge[] = [
    {
      id: "draft-edge-1",
      source: "draft-trigger",
      target: "draft-agent",
      animated: true,
    },
  ];

  return {
    key: "new",
    title: "New Workflow Draft",
    description:
      "Use the assistant panel to iteratively define triggers, actions, and safeguards.",
    triggers: ["user-defined"],
    automationDescription:
      "Interactive workflow design flow before handoff to coding automation.",
    graph: { nodes, edges },
  };
}

