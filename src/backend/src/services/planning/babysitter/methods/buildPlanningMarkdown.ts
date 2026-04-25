import type { PlanningWorkstream } from "@/lib/schemas/jules";
import { PlanningCaptureState, PlanningSessionResultSummary } from "../types";

export function buildPlanningMarkdown(options: {
  requestId: string;
  workstream: PlanningWorkstream;
  prompt: string;
  githubRepo?: string;
  baseBranch?: string;
  capture: PlanningCaptureState;
  result?: PlanningSessionResultSummary | null;
  failureMessage?: string | null;
}): string {
  const sections: string[] = [];
  const result = options.result;

  sections.push(`# Planning Request ${options.requestId}`);
  sections.push(
    [
      `- Workstream: ${options.workstream}`,
      options.githubRepo ? `- Repository: ${options.githubRepo}` : null,
      options.baseBranch ? `- Base branch: ${options.baseBranch}` : null,
      result?.state ? `- Final Jules state: ${result.state}` : null,
      options.failureMessage ? `- Failure: ${options.failureMessage}` : null,
    ]
      .filter(Boolean)
      .join("\n"),
  );

  sections.push("## Prompt");
  sections.push(options.prompt);

  const hasFiles =
    options.capture.diffSummaries.length > 0 ||
    result?.outputs?.generatedFiles?.length ||
    result?.outputs?.changeSets?.length;

  if (options.capture.planSteps.length > 0) {
    sections.push("## Generated Plan");
    sections.push(
      options.capture.planSteps
        .sort((left, right) => (left.index ?? 0) - (right.index ?? 0))
        .map((step, index) => {
          const title = `${index + 1}. ${step.title}`;
          return step.description ? `${title}\n   - ${step.description}` : title;
        })
        .join("\n")
    );
  } else if (hasFiles) {
    sections.push("## Derived Plan (from File Changes)");
    if (result?.outputs?.generatedFiles?.length) {
      sections.push("### Generated Files");
      sections.push(
        result.outputs.generatedFiles
          .map((file) => `- ${file.path}`)
          .join("\n")
      );
    }
    if (result?.outputs?.changeSets?.length) {
      sections.push("### Change Set Files");
      sections.push(
        result.outputs.changeSets
          .map((file) => `- ${file.filename}`)
          .join("\n")
      );
    }
    if (options.capture.diffSummaries.length > 0) {
      sections.push("### Diff Summary");
      sections.push(
        options.capture.diffSummaries
          .map((summary) => {
            const files = summary.files
              .map(
                (file) =>
                  `  - ${file.changeType || "modified"} ${file.path} (+${file.additions || 0}/-${
                    file.deletions || 0
                  })`
              )
              .join("\n");
            return `- ${summary.createTime}\n${files}`;
          })
          .join("\n")
      );
    }
  } else if (options.capture.agentMessages.length > 0) {
    sections.push("## Derived Plan (from Agent Messages)");
    sections.push(
      options.capture.agentMessages
        .map((message) => `- ${message.createTime}: ${message.message}`)
        .join("\n")
    );
  }

  if (result?.outputs?.pullRequests?.length) {
    sections.push("## Pull Requests");
    sections.push(
      result.outputs.pullRequests
        .map((pullRequest) => `- [#${pullRequest.number || "?"} ${pullRequest.title}](${pullRequest.url})`)
        .join("\n")
    );
  }

  return sections.join("\n\n").trim();
}
