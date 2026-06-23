import { Logger } from "@/lib/logger";
import { buildWebhookInstruction } from "../webhook-instruction";
import { getWorkerHost } from "./lifecycle";
import { logStream } from "./retrieval";
import type { JulesService } from "../service";

export async function runSession(service: JulesService, prompt: string) {
  const logger = new Logger(service.env, "JulesRepoless");
  const client = await service.getClient();
  const tempId = crypto.randomUUID();
  const enrichedPrompt = `${prompt}\n\n${buildWebhookInstruction(getWorkerHost(service), tempId)}`;
  
  logger.info(`Running automated session`, { promptPreview: prompt.substring(0, 60) });
  
  return (client as any).run({ prompt: enrichedPrompt });
}

export async function runRepolessSession(
  service: JulesService,
  prompt: string
): Promise<{ agentMessage?: string; files: Record<string, string> }> {
  const logger = new Logger(service.env, "JulesRepoless");
  const client = await service.getClient();
  const tempId = crypto.randomUUID();
  const enrichedPrompt = `${prompt}\n\n${buildWebhookInstruction(getWorkerHost(service), tempId)}`;
  
  const session = await (client as any).session({ prompt: enrichedPrompt });

  const outcomePromise = session.result().then((outcome: any) => {
    logger.info(`Session result acquired`, { state: outcome.state, prUrl: outcome.pullRequest?.url ?? "none" });

    const files: Record<string, string> = {};
    if (outcome.generatedFiles && typeof outcome.generatedFiles().all === "function") {
      for (const file of outcome.generatedFiles().all()) {
        files[file.path] = file.content;
      }
    }
    return files;
  });

  let agentMessage: string | undefined;
  await logStream(service, session, {
    agentMessaged: (a: any) => {
      agentMessage = a.message;
      logger.info(`Agent message`, { preview: a.message?.slice(0, 120) });
    },
    progressUpdated: (a: any) => logger.info(`Progress updated`, { title: a.title }),
  });

  const files = await outcomePromise;
  return { agentMessage, files };
}

export async function runConcurrentSessions(
  service: JulesService,
  tasks: string[],
  concurrency: number = 2
) {
  const logger = new Logger(service.env, "JulesRepoless");
  const client = await service.getClient();
  
  logger.info(`Creating concurrent sessions`, { count: tasks.length });

  const sessions = await (client as any).all(
    tasks,
    (task: string) => ({ prompt: task }),
    { concurrency, stopOnError: false }
  );
  return sessions;
}
