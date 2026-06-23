import { Logger } from "@/lib/logger";
import { parseChangeSet, extractFilesFromUnifiedDiff, parsePullRequestNumber } from "./parsing";
import { getSession } from "./retrieval";
import { updateSessionActivity } from "./lifecycle";
import type { JulesService } from "../service";

export async function getSessionSnapshot(
  service: JulesService,
  sessionId: string,
  options?: { format?: 'json' | 'markdown'; include?: string[]; exclude?: string[]; activities?: boolean }
) {
  const session = await getSession(service, sessionId);
  const snapshot = await session.snapshot({ activities: options?.activities ?? false });
  
  if (options?.format === 'markdown') {
    return typeof snapshot.toMarkdown === 'function' ? snapshot.toMarkdown() : snapshot.toJSON(options as any);
  }
  
  return snapshot.toJSON(options as any);
}

export async function getSessionResult(service: JulesService, sessionId: string) {
  const logger = new Logger(service.env, "JulesResults");
  const session = await getSession(service, sessionId);
  const result = await session.result();
  
  const rawResult: any = result;
  const info = rawResult.info || rawResult;
  const outputs = info.outputs || [];
  const parsedOutputs: {
    pullRequests: { title: string; number: number; url: string }[];
    changeSets: { filename: string; content: string }[];
    generatedFiles: { path: string; content: string }[];
  } = { pullRequests: [], changeSets: [], generatedFiles: [] };

  for (const output of outputs) {
    switch (output.type) {
      case "pullRequest":
        parsedOutputs.pullRequests.push({
          title: output.pullRequest.title,
          number: output.pullRequest.number || parsePullRequestNumber(output.pullRequest.url),
          url: output.pullRequest.htmlUrl || output.pullRequest.url,
        });
        break;
      case "changeSet": {
        const parsedFiles: { filename: string; content: string }[] = [];
        if (typeof output.changeSet?.parsed === "function") {
          const parsed = output.changeSet.parsed();
          parsedFiles.push(
            ...((parsed?.files || []).map((file: any) => ({
              filename: file.path,
              content: file.content || "",
            })) as Array<{ filename: string; content: string }>),
          );
        }

        if (parsedFiles.length === 0) {
          parsedFiles.push(
            ...parseChangeSet(output.changeSet?.patch),
            ...extractFilesFromUnifiedDiff(output.changeSet?.gitPatch?.unidiffPatch),
          );
        }
        parsedOutputs.changeSets.push(...parsedFiles);
        break;
      }
      case "generatedFile":
        parsedOutputs.generatedFiles.push({
          path: output.generatedFile.path,
          content: output.generatedFile.content,
        });
        break;
    }
  }

  const generatedFiles = info.generatedFiles || rawResult.generatedFiles || [];
  for (const generatedFile of generatedFiles) {
    parsedOutputs.generatedFiles.push({
      path: generatedFile.path,
      content: generatedFile.content,
    });
  }

  updateSessionActivity(service, sessionId, "completed").catch((err) =>
    logger.error(`Failed to update session activity`, { error: err.message })
  );

  return {
    state: info.state,
    error: info.error,
    outputs: parsedOutputs,
    rawResult: result,
  };
}

export async function collectSessionOutcome(
  service: JulesService,
  sessionOrId: string | any
): Promise<{
  sessionId: string;
  state: string;
  lastAgentMessage: string | null;
  pullRequestUrl?: string;
  generatedFiles: Array<{ path: string; content: string }>;
  rawResult: any;
}> {
  const session = typeof sessionOrId === "string" ? await getSession(service, sessionOrId) : sessionOrId;
  const outcome = await session.result();
  const generatedFiles: Array<{ path: string; content: string }> = [];

  const filesCollection = typeof outcome?.generatedFiles === "function" ? outcome.generatedFiles() : null;

  if (filesCollection && typeof filesCollection.entries === "function") {
    for (const [path, file] of filesCollection.entries()) {
      let content = "";
      if (typeof file?.content === "string") {
        content = file.content;
      } else if (typeof file?.text === "function") {
        content = await file.text();
      } else if (typeof file === "string") {
        content = file;
      }

      generatedFiles.push({ path, content });
    }
  }

  return {
    sessionId: String(session.id || outcome?.id || ""),
    state: outcome?.state || "unknown",
    lastAgentMessage: typeof outcome?.lastAgentMessage === "string" ? outcome.lastAgentMessage : null,
    pullRequestUrl: typeof outcome?.pullRequest?.url === "string" ? outcome.pullRequest.url : undefined,
    generatedFiles,
    rawResult: outcome,
  };
}
