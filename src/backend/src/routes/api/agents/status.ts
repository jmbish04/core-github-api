import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import { z } from 'zod';
import { getDb } from '@db';
import { agentStateMirror } from '@db/schemas/agents/mirror';
import { desc } from 'drizzle-orm';

const statusApi = new OpenAPIHono<{ Bindings: Env }>();

export const AgentStatusSchema = z.object({
  id: z.string(),
  agentType: z.string(),
  agentId: z.string(),
  stateJson: z.string(),
  updatedAt: z.string(),
});

const getStatusRoute = createRoute({
  method: 'get',
  path: '/',
  operationId: 'getAgentStatuses',
  tags: ['Agents'],
  summary: 'Retrieve latest state for active agents',
  responses: {
    200: {
      description: 'Latest agent states',
      content: {
        'application/json': {
          schema: z.object({
            statuses: z.array(AgentStatusSchema),
          }),
        },
      },
    },
  },
});

statusApi.openapi(getStatusRoute, async (c) => {
  const db = getDb(c.env.DB);
  
  // Get the latest records for each agent type
  // Note: SQLite doesn't have true DISTINCT ON, so we fetch recent and group in memory
  // or just fetch top 50 recent and unique by agentType/Id.
  const records = await db
    .select()
    .from(agentStateMirror)
    .orderBy(desc(agentStateMirror.updatedAt))
    .limit(100);
    
  const latestStates = new Map();
  for (const record of records) {
    const key = `${record.agentType}-${record.agentId}`;
    if (!latestStates.has(key)) {
      latestStates.set(key, record);
    }
  }

  return c.json({ statuses: Array.from(latestStates.values()) });
});

export default statusApi;
