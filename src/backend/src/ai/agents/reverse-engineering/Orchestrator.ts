import { z } from 'zod';
import { createAgent } from '@/ai/agents/honi';
import { buildMaxAgentMemory } from '@/ai/agents/memory';
import type { ReverseEngineeringAuthInput } from '@/lib/schemas/reverse-engineering';
import {
  resumeReverseEngineeringAnalysis,
  runReverseEngineeringAnalysis,
} from '@/services/reverse-engineering/orchestration';

const StartReverseEngineeringSchema = z.object({
  snapshotId: z.string(),
  projectId: z.string().nullable().optional(),
  owner: z.string(),
  repo: z.string(),
  repoUrl: z.string().url(),
  branch: z.string().default('main'),
  frontendUrl: z.string().url().optional(),
  auth: z.any().optional(),
  useSandboxPreview: z.boolean().optional().default(true),
  title: z.string().optional(),
});

const ResumeReverseEngineeringSchema = z.object({
  snapshotId: z.string(),
  auth: z.any(),
  frontendUrl: z.string().url().optional(),
});

const runtime = createAgent<Env>({
  name: 'honi-orchestrator',
  model: 'claude-sonnet-4-5',
  system: [
    'You are the reverse-engineering orchestration agent.',
    'Your job is to understand repository structure, coordinate Jules research, and supervise final synthesis artifacts.',
    'Preserve complete execution context and prefer deterministic outputs over broad speculation.',
  ].join(' '),
  binding: 'HONI_ORCHESTRATOR',
  tools: [],
  memory: buildMaxAgentMemory({
    agentName: 'HoniOrchestrator',
    semanticBinding: 'RESEARCH_INDEX',
    graphId: 'core-github-api-reverse-engineering-orchestrator',
  }),
  observability: { enabled: true, aiGatewaySlug: 'core-github-api', collectEvents: true },
});

const OrchestratorDurableObject = runtime.DurableObject as new (
  ctx: DurableObjectState,
  env: Env,
) => DurableObject & {
  env: Env;
  fetch(request: Request): Promise<Response>;
};

function renderOpenApi() {
  return {
    openapi: '3.1.0',
    info: { title: 'HoniOrchestrator', version: '1.0.0' },
    paths: {
      '/run': { post: { operationId: 'reverseEngineeringRun', responses: { 200: { description: 'Queued' } } } },
      '/resume': { post: { operationId: 'reverseEngineeringResume', responses: { 200: { description: 'Queued' } } } },
      '/health': { get: { operationId: 'reverseEngineeringHealth', responses: { 200: { description: 'Healthy' } } } },
      '/context': { get: { operationId: 'reverseEngineeringContext', responses: { 200: { description: 'Context' } } } },
    },
  };
}

export class HoniOrchestrator extends OrchestratorDurableObject {
  declare env: Env;
  declare ctx: DurableObjectState;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.env = env;
    this.ctx = ctx;
  }

  async run(payload: z.infer<typeof StartReverseEngineeringSchema>) {
    return runReverseEngineeringAnalysis(this.env, {
      snapshotId: payload.snapshotId,
      projectId: payload.projectId || null,
      owner: payload.owner,
      repo: payload.repo,
      repoUrl: payload.repoUrl,
      branch: payload.branch,
      frontendUrl: payload.frontendUrl,
      auth: payload.auth as ReverseEngineeringAuthInput | undefined,
      useSandboxPreview: payload.useSandboxPreview,
      title: payload.title,
    });
  }

  async resume(snapshotId: string, auth: ReverseEngineeringAuthInput, frontendUrl?: string) {
    return resumeReverseEngineeringAnalysis(this.env, {
      snapshotId,
      auth,
      frontendUrl,
    });
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'POST' && url.pathname === '/run') {
      const payload = StartReverseEngineeringSchema.parse(await request.json());
      this.ctx.waitUntil(this.run(payload));
      return Response.json({ success: true, snapshotId: payload.snapshotId, queued: true });
    }

    if (request.method === 'POST' && url.pathname === '/resume') {
      const payload = ResumeReverseEngineeringSchema.parse(await request.json());
      this.ctx.waitUntil(
        this.resume(payload.snapshotId, payload.auth as ReverseEngineeringAuthInput, payload.frontendUrl),
      );
      return Response.json({ success: true, snapshotId: payload.snapshotId, queued: true });
    }

    if (url.pathname === '/health') {
      return Response.json({ status: 'ok', agent: 'HoniOrchestrator' });
    }

    if (url.pathname === '/docs') {
      return new Response('Reverse Engineering Orchestrator Agent API');
    }

    if (url.pathname === '/context') {
      return Response.json({ environment: 'Cloudflare Workers', agent: 'HoniOrchestrator' });
    }

    if (url.pathname === '/openapi.json') {
      return Response.json(renderOpenApi());
    }

    return super.fetch(request);
  }
}

