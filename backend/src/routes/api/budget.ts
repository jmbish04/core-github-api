import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { BudgetTracker } from '@budget';

const app = new OpenAPIHono<{ Bindings: Env }>();

// -- SCHEMAS --

const BudgetStatusSchema = z.object({
  limit: z.number(),
  spent: z.number(),
  remaining: z.number(),
  percentUsed: z.number(),
  lastReset: z.string().nullable().openapi({ type: 'string', format: 'date-time' })
}).openapi('BudgetStatus');

const TransactionSchema = z.object({
  id: z.string(),
  model: z.string(),
  inputTokens: z.number().nullable(),
  outputTokens: z.number().nullable(),
  costUsd: z.number().nullable(),
  sessionId: z.string().nullable(),
  documentId: z.string().nullable(),
  workflowName: z.string().nullable(),
  timestamp: z.string().openapi({ type: 'string', format: 'date-time' })
}).openapi('BudgetTransaction');

const TransactionListSchema = z.object({
    data: z.array(TransactionSchema)
}).openapi('BudgetTransactionList');

const ResetBodySchema = z.object({
    note: z.string().optional()
}).openapi('BudgetResetBody');

// -- ROUTES --

/**
 * GET /api/budget/status
 */
const getStatusRoute = createRoute({
    method: 'get',
    path: '/status',
    operationId: 'getBudgetStatus',
    summary: 'Get current AI budget status',
    responses: {
        200: {
            content: {
                'application/json': { schema: BudgetStatusSchema }
            },
            description: 'Current budget status'
        }
    }
});

app.openapi(getStatusRoute, async (c) => {
  const tracker = new BudgetTracker(c.env);
  const status = await tracker.getBudgetStatus();
  // Ensure date is serialized if needed, though JSON response handles it
  return c.json(status as any);
});

/**
 * GET /api/budget/transactions
 */
const getTransactionsRoute = createRoute({
    method: 'get',
    path: '/transactions',
    operationId: 'getBudgetTransactions',
    summary: 'Get recent AI transactions',
    request: {
        query: z.object({
            limit: z.string().optional().default('50'),
            offset: z.string().optional().default('0')
        })
    },
    responses: {
        200: {
            content: {
                'application/json': { schema: TransactionListSchema }
            },
            description: 'List of transactions'
        }
    }
});

app.openapi(getTransactionsRoute, async (c) => {
  const tracker = new BudgetTracker(c.env);
  const limit = parseInt(c.req.query('limit') || '50');
  const offset = parseInt(c.req.query('offset') || '0');
  
  const transactions = await tracker.getTransactions(limit, offset);
  return c.json({ data: transactions } as any);
});

/**
 * POST /api/budget/reset
 */
const resetBudgetRoute = createRoute({
    method: 'post',
    path: '/reset',
    operationId: 'resetBudget',
    summary: 'Reset the AI budget cycle',
    request: {
        body: {
            content: {
                'application/json': { schema: ResetBodySchema }
            }
        }
    },
    responses: {
        200: {
            content: {
                'application/json': {
                    schema: z.object({
                        success: z.boolean(),
                        message: z.string(),
                        timestamp: z.string()
                    })
                }
            },
            description: 'Reset successful'
        }
    }
});

app.openapi(resetBudgetRoute, async (c) => {
  const tracker = new BudgetTracker(c.env);
  const body = await c.req.json();
  
  await tracker.resetBudget(body.note);
  
  return c.json({ 
    success: true, 
    message: 'Budget cycle reset successfully.',
    timestamp: new Date().toISOString()
  });
});

export { app as budgetRoutes };
