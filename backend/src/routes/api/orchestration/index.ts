import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import { z } from 'zod';

const app = new OpenAPIHono<{ Bindings: Env }>();

const vibeRoute = createRoute({
  method: 'post',
  path: '/vibe',
  summary: 'Trigger Vibe Orchestrator',
  description: 'Triggers the Vibe Orchestrator agent to process a feature request',
  request: {
    body: {
      content: {
        'application/json': {
          schema: z.object({
            vibe: z.string().describe('Natural language feature request (vibe)'),
          })
        }
      }
    }
  },
  responses: {
    200: {
      description: 'Orchestrator triggered successfully',
      content: {
        'application/json': {
          schema: z.object({
            success: z.boolean(),
            message: z.string(),
            data: z.object({ taskId: z.string().optional(), status: z.string().optional(), result: z.string().optional() }).optional()
          })
        }
      }
    }
  }
});

app.openapi(vibeRoute, async (c) => {
  const { vibe } = c.req.valid('json');

  const orchestratorId = c.env.VIBE_ORCHESTRATOR_DO.idFromName("global");
  const orchestratorObj = c.env.VIBE_ORCHESTRATOR_DO.get(orchestratorId);

  const response = await orchestratorObj.fetch(new Request('http://orchestrator/task', {
      method: 'POST',
      body: JSON.stringify({ prompt: vibe }),
      headers: { 'Content-Type': 'application/json' }
  }));

  const text = await response.text();
  let parsedData: any = { result: text };
  try {
    const json = JSON.parse(text);
    if (json.taskId || json.status) {
      parsedData = { taskId: json.taskId, status: json.status, result: JSON.stringify(json) };
    }
  } catch (e) {
    // raw text
  }
  return c.json({
    success: true,
    message: 'Vibe orchestration initiated',
    data: parsedData
  });
});

export default app;
