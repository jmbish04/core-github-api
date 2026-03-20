import {
  createAgent as createHoniAgent,
  tool as createHoniTool,
  workflow as createHoniWorkflow,
  step as createHoniStep,
  routeToAgent,
  getAgentHistory,
  clearAgentHistory,
  callAgentTool,
  listAgentTools,
} from 'honidev';
import { z } from 'zod';

type ToolShape = Record<string, z.ZodTypeAny>;
type ToolSchema = z.ZodTypeAny | ToolShape | undefined;
type ToolHandler = (input: any, ctx?: any) => Promise<unknown>;

export interface HoniAgentRuntime<TEnv extends Env = Env> {
  fetch(request: Request, env: TEnv, executionCtx?: any): Promise<Response>;
  handler: {
    fetch(request: Request, env: TEnv, executionCtx?: any): Promise<Response>;
  };
  DurableObject: new (ctx: DurableObjectState, env: TEnv) => DurableObject & {
    env: TEnv;
    ctx: DurableObjectState;
    fetch(request: Request): Promise<Response>;
  };
  Agent: new (ctx: DurableObjectState, env: TEnv) => DurableObject & {
    env: TEnv;
    ctx: DurableObjectState;
    fetch(request: Request): Promise<Response>;
  };
}

function isZodSchema(value: unknown): value is z.ZodTypeAny {
  return !!value && typeof value === 'object' && 'safeParse' in (value as Record<string, unknown>);
}

function normalizeToolInput(input: ToolSchema): z.ZodTypeAny {
  if (!input) {
    return z.object({});
  }

  if (isZodSchema(input)) {
    return input;
  }

  return z.object(input);
}

export function tool(config: {
  name: string;
  description: string;
  input?: ToolSchema;
  handler: ToolHandler;
}): unknown;
export function tool(
  name: string,
  description: string,
  input: ToolSchema,
  handler: ToolHandler,
): unknown;
export function tool(
  nameOrConfig: string | {
    name: string;
    description: string;
    input?: ToolSchema;
    handler: ToolHandler;
  },
  description?: string,
  input?: ToolSchema,
  handler?: ToolHandler,
) {
  if (typeof nameOrConfig === 'object') {
    return createHoniTool({
      name: nameOrConfig.name,
      description: nameOrConfig.description,
      input: normalizeToolInput(nameOrConfig.input),
      handler: nameOrConfig.handler,
    } as unknown as Parameters<typeof createHoniTool>[0]);
  }

  return createHoniTool({
    name: nameOrConfig,
    description: description || '',
    input: normalizeToolInput(input),
    handler: handler as ToolHandler,
  } as unknown as Parameters<typeof createHoniTool>[0]);
}

export function createAgent<TEnv extends Env = Env>(config: Record<string, unknown>): HoniAgentRuntime<TEnv> {
  const runtime = createHoniAgent(config as unknown as Parameters<typeof createHoniAgent>[0]) as any;

  return {
    ...runtime,
    handler: {
      fetch: runtime.fetch.bind(runtime),
    },
    DurableObject: runtime.DurableObject,
    Agent: runtime.DurableObject,
  } as HoniAgentRuntime<TEnv>;
}

export const workflow = createHoniWorkflow;
export const step = createHoniStep;

export {
  routeToAgent,
  getAgentHistory,
  clearAgentHistory,
  callAgentTool,
  listAgentTools,
};
