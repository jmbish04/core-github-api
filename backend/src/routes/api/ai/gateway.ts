import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { formatModelId } from './utils/format-model-id';
import { ChatCompletionRequestSchema, EmbeddingRequestSchema } from './schemas/gateway.schema';

// ============================================================================
// Hono App Setup & Environment Types
// ============================================================================

const gatewayApp = new OpenAPIHono<{ Bindings: Env }>();

// Simple Bearer token authentication middleware for GitHub actions
gatewayApp.use('*', async (c, next) => {
  const authHeader = c.req.header('Authorization');
  const expectedToken = await c.env.AI_GATEWAY_TOKEN.get();
  
  if (!authHeader || authHeader !== `Bearer ${expectedToken}`) {
    return c.json({ error: 'Unauthorized. Invalid API Key.' }, 401);
  }
  
  await next();
});

// ============================================================================
// Routes Definition
// ============================================================================

const chatCompletionRoute = createRoute({
  method: 'post',
  path: '/chat/completions',
  summary: 'Universal Chat Completions',
  description: 'Proxies standard OpenAI-compatible requests to Cloudflare AI Gateway with automatic provider normalization.',
  request: {
    body: {
      content: {
        'application/json': {
          schema: ChatCompletionRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Successful Response from AI Gateway',
      content: {
        'application/json': {
          schema: z.record(z.string(), z.any()), // Can be refined strictly to OpenAI response schema if needed
        },
      },
    },
    500: {
      description: 'AI Gateway Error',
      content: {
        'application/json': {
          schema: z.object({ error: z.string() }),
        },
      },
    }
  },
});

const embeddingRoute = createRoute({
  method: 'post',
  path: '/embeddings',
  summary: 'Universal Embeddings',
  description: 'Proxies standard OpenAI-compatible embedding requests to Cloudflare AI Gateway.',
  request: {
    body: {
      content: {
        'application/json': {
          schema: EmbeddingRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Successful Response from AI Gateway',
      content: {
        'application/json': {
          schema: z.record(z.string(), z.any()),
        },
      },
    },
    500: {
      description: 'AI Gateway Error',
      content: {
        'application/json': {
          schema: z.object({ error: z.string() }),
        },
      },
    }
  },
});

// ============================================================================
// Route Handlers
// ============================================================================

gatewayApp.openapi(chatCompletionRoute, async (c) => {
  const body = c.req.valid('json');
  const gatewayId = c.env.AI_GATEWAY_NAME || 'core-github-api';
  const token = await c.env.AI_GATEWAY_TOKEN.get();

  if (!token) {
    return c.json({ error: 'Server misconfiguration: Missing Cloudflare credentials.' }, 500);
  }

  const payload = {
    ...body,
    model: formatModelId(body.model),
  };

  const url = `${await c.env.AI.gateway(gatewayId).getUrl('compat')}/chat/completions`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'cf-aig-authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return c.json({ error: `Gateway Error (${response.status}): ${errorText}` }, 500);
    }

    const data = await response.json();
    return c.json(data as any, 200);
  } catch (error: any) {
    return c.json({ error: `Network/Proxy Error: ${error.message}` }, 500);
  }
});

gatewayApp.openapi(embeddingRoute, async (c) => {
  const body = c.req.valid('json');
  const gatewayId = c.env.AI_GATEWAY_NAME || 'core-github-api';
  const token = await c.env.AI_GATEWAY_TOKEN.get();

  if (!token) {
    return c.json({ error: 'Server misconfiguration: Missing Cloudflare credentials.' }, 500);
  }

  const payload = {
    ...body,
    model: formatModelId(body.model),
  };

  const url = `${await c.env.AI.gateway(gatewayId).getUrl('compat')}/embeddings`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'cf-aig-authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return c.json({ error: `Gateway Error (${response.status}): ${errorText}` }, 500);
    }

    const data = await response.json();
    return c.json(data as any, 200);
  } catch (error: any) {
    return c.json({ error: `Network/Proxy Error: ${error.message}` }, 500);
  }
});

export default gatewayApp;
