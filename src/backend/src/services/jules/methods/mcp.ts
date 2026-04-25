import { Logger } from "@/lib/logger";
import { getDb } from "@db";
import { julesSessions } from "@db/schemas/jules";
import { eq } from "drizzle-orm";
import type { JulesService } from "../service";
import { startSession } from "./lifecycle";
import { sendMessage } from "./actions";
import { getSessionSnapshot } from "./results";
import { getSession } from "./retrieval";
import { getTool } from "@/ai/mcp/tools";

export async function executeMCPTool(service: JulesService, toolName: string, args: Record<string, any>): Promise<any> {
  const logger = new Logger(service.env, "JulesMCP");
  switch (toolName) {
    case 'create_session': {
      const params = {
        prompt: args.prompt ?? '',
        ...(args.agentId ? { agentId: args.agentId } : {}),
        ...(args.requireApproval != null ? { requireApproval: args.requireApproval } : {}),
        ...(args.repoOwner && args.repoName ? {
          repo: { owner: args.repoOwner, repo: args.repoName, branch: args.branch },
        } : {}),
      };
      const session = await startSession(service, params);
      return { sessionId: session.id, status: 'created' };
    }

    case 'list_sessions': {
      return listSessions(service, args.agentId, args.status);
    }

    case 'get_session_state': {
      return getSessionState(service, args.sessionId);
    }

    case 'send_reply_to_session': {
      await sendMessage(service, args.sessionId, args.message ?? '');
      return { sent: true };
    }

    case 'show_code_diff': {
      return getSessionSnapshot(service, args.sessionId, {
        format: args.format ?? 'json',
        activities: false,
      });
    }

    case 'get_code_review_context': {
      return getCodeReviewContext(service, args.sessionId);
    }

    case 'get_bash_outputs': {
      return getBashOutputs(service, args.sessionId);
    }

    case 'query_cache': {
      return queryCache(service, args.query);
    }

    default:
      const tool = getTool(toolName) as any;
      if (tool && tool.execute) {
        return await tool.execute(args, service.env);
      }
      logger.error(`Unknown MCP tool requested: ${toolName}`);
      throw new Error(`[JulesService.executeMCPTool] Unknown tool: ${toolName}`);
  }
}

export async function listSessions(service: JulesService, _agentId?: string, _status?: string): Promise<any[]> {
  const db = getDb(service.env.DB);
  const query = db.select().from(julesSessions);
  return query;
}

export async function getSessionState(service: JulesService, sessionId: string): Promise<any> {
  const db = getDb(service.env.DB);
  const rows = await db
    .select()
    .from(julesSessions)
    .where(eq(julesSessions.id, sessionId))
    .limit(1);
  return rows[0] ?? null;
}

export async function getCodeReviewContext(service: JulesService, sessionId: string): Promise<any> {
  return getSessionSnapshot(service, sessionId, { activities: true, format: 'json' });
}

export async function getBashOutputs(service: JulesService, sessionId: string): Promise<any> {
  const logger = new Logger(service.env, "JulesMCP");
  try {
    const session = await getSession(service, sessionId);
    const items: any[] = [];
    for await (const activity of session.stream()) {
      const type = (activity as any)?.type ?? '';
      if (type === 'bash_output' || type === 'shell' || type === 'progress_updated') {
        items.push(activity);
      }
    }
    return { sessionId, bashOutputs: items };
  } catch (e: any) {
    logger.error(`getBashOutputs failed for session ${sessionId}`, { error: e.message });
    return { sessionId, bashOutputs: [], error: e.message };
  }
}

export async function queryCache(service: JulesService, query: string): Promise<any[]> {
  const db = getDb(service.env.DB);
  const rows = await db
    .select()
    .from(julesSessions)
    .limit(20);
  return rows.filter((r: any) =>
    r.prompt?.toLowerCase().includes(query?.toLowerCase() ?? ''),
  );
}
