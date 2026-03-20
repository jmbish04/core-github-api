import { unifiedActionLogsTable } from '@/db/schemas/app';
import { drizzle } from 'drizzle-orm/d1';
import { eq } from 'drizzle-orm';

export interface DispatchOptions {
  taskType: string;
  githubOwner: string;
  githubRepo: string;
  projectId?: string;
  requestPayload: Record<string, any>;
  env: Env;
}

export async function dispatchToActionWorker(options: DispatchOptions): Promise<{ taskId: string; status: string; httpStatus: number }> {
  const { taskType, githubOwner, githubRepo, projectId, requestPayload, env } = options;
  const taskId = crypto.randomUUID();

  // 1. Log the pending task
  const db = drizzle(env.DB);
  await db.insert(unifiedActionLogsTable).values({
    id: crypto.randomUUID(),
    taskId,
    taskType,
    githubOwner,
    githubRepo,
    projectId,
    requestPayload: JSON.stringify(requestPayload),
    status: 'pending',
  });

  // 2. Transmit to GitHub
  // Target Repo: jmbish04/core-github-standardization
  const dispatchUrl = env.GITHUB_ACTION_WORKER_DISPATCHER_URI;
  const tokenRecord = env.GITHUB_TOKEN || env.GITHUB_PERSONAL_ACCESS_TOKEN;
  const githubToken = typeof tokenRecord === 'string' ? tokenRecord : await (tokenRecord as any)?.get();

  const combinedPayload = {
    ...requestPayload,
    taskId,
    taskType,
    githubOwner,
    githubRepo,
    projectId,
  };

  const response = await fetch(dispatchUrl, {
    method: 'POST',
    headers: {
      'Accept': 'application/vnd.github.v3+json',
      'Authorization': `Bearer ${githubToken}`,
      'User-Agent': 'Cloudflare-Worker-Unified-Action-Dispatcher',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      event_type: 'unified_action_dispatch',
      client_payload: combinedPayload,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    await db.update(unifiedActionLogsTable)
      .set({ status: 'error', responsePayload: JSON.stringify({ error: errorText }) })
      .where(eq(unifiedActionLogsTable.taskId, taskId));
    
    return { taskId, status: 'error', httpStatus: response.status };
  }

  return { taskId, status: 'pending', httpStatus: response.status };
}
