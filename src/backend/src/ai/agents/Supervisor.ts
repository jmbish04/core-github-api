import { Hono } from 'hono';
import { createAgent } from '@/ai/agents/honi';
import { buildMaxAgentMemory } from '@/ai/agents/memory';
import { checkGitHubAPIHealth, checkWebhooksHealth } from '@/workflows/health';

export const { Agent, handler } = createAgent<Env>({
  name: 'supervisor',
  model: 'claude-3-5-sonnet-latest',
  system: 'You are a Supervisor Agent ensuring the health of a containerized task. Analyze logs and respond with concise, actionable guidance.',
  binding: 'SUPERVISOR',
  tools: [],
  memory: buildMaxAgentMemory({
    agentName: 'Supervisor',
    graphId: 'core-github-api-supervisor',
  }),
  observability: { enabled: true, aiGatewaySlug: 'core-github-api', collectEvents: true },
});

const app = new Hono<{ Bindings: Env }>();
app.get('/health', (c) => c.json({ status: 'ok', agent: 'Supervisor' }));
app.get('/docs', (c) => c.text('Supervisor Agent API Documentation'));
app.get('/context', (c) => c.json({ environment: 'Cloudflare Workers', agent: 'Supervisor' }));
app.get('/openapi.json', (c) => c.json({ openapi: '3.1.0', info: { title: 'Supervisor', version: '1.0.0' }, paths: {} }));
app.all('/*', (c) => handler.fetch(c.req.raw, c.env, c.executionCtx));
export default app;

export class Supervisor extends Agent {
  private sessions: { ws: WebSocket; type: 'terminal' | 'control' }[] = [];
  private containerWs: WebSocket | null = null;
  private logs: string[] = [];
  private status: 'idle' | 'running' | 'completed' | 'failed' | 'intervention_needed' = 'idle';
  private startTime = 0;
  private healthStatus: unknown = null;

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/websocket') {
      if (request.headers.get('Upgrade') !== 'websocket') {
        return new Response('Expected Upgrade: websocket', { status: 426 });
      }
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      const type = url.searchParams.get('type') === 'control' ? 'control' : 'terminal';
      this.handleSession(server, type);
      return new Response(null, { status: 101, webSocket: client });
    }

    if (url.pathname === '/connect-container') {
      if (request.headers.get('Upgrade') !== 'websocket') {
        return new Response('Expected Upgrade: websocket', { status: 426 });
      }
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      this.handleContainer(server);
      return new Response(null, { status: 101, webSocket: client });
    }

    if (url.pathname === '/status') {
      return Response.json({
        status: this.status,
        startTime: this.startTime,
        logsCount: this.logs.length,
        health: this.healthStatus,
      });
    }

    if (request.method === 'POST' && url.pathname === '/health/github') {
      return this.runGithubHealthCheck();
    }

    return super.fetch(request);
  }

  async runGithubHealthCheck(): Promise<Response> {
    this.broadcast('[Supervisor] 🏥 Starting GitHub Health Check...\n');
    try {
      const results = [await checkGitHubAPIHealth(this.env), await checkWebhooksHealth(this.env)];
      const overallStatus = results.some((result) => result.status === 'failure' || result.status === 'warning')
        ? 'unhealthy'
        : 'healthy';

      const healthStatus = {
        status: overallStatus,
        details: { results },
      };

      this.healthStatus = healthStatus;
      await this.ctx.storage.put('healthStatus', healthStatus);

      this.broadcast(`[Supervisor] Health Check Complete: ${healthStatus.status.toUpperCase()}\n`);
      this.broadcast(`${JSON.stringify(healthStatus.details, null, 2)}\n`);

      return Response.json(healthStatus);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown health check error';
      this.broadcast(`[Supervisor] ❌ Health Check Failed: ${message}\n`);
      return Response.json({ status: 'error', error: message }, { status: 500 });
    }
  }

  handleSession(ws: WebSocket, type: 'terminal' | 'control'): void {
    const session = { ws, type };
    this.sessions.push(session);
    ws.accept();

    if (type === 'terminal') {
      ws.send(this.logs.join(''));
    } else {
      ws.send(JSON.stringify({ type: 'status', status: this.status, health: this.healthStatus }));
    }

    ws.addEventListener('message', async (message) => {
      if (type === 'terminal') {
        if (this.containerWs) {
          this.containerWs.send(message.data);
        }
        return;
      }

      try {
        const data = JSON.parse(String(message.data)) as { type?: string; message?: string };
        if (data.type !== 'chat' || !data.message) {
          return;
        }

        this.broadcast(`[User] ${data.message}\n`);
        this.broadcastEvent({ type: 'chat', role: 'user', content: data.message });
        await super.fetch(
          new Request('http://localhost/chat', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              message: `Logs: ${this.logs.slice(-20).join('\n')}\n\nUser Query: ${data.message}`,
            }),
          }),
        );
      } catch (error) {
        console.error('Invalid control message', error);
      }
    });

    ws.addEventListener('close', () => {
      this.sessions = this.sessions.filter((candidate) => candidate !== session);
    });
  }

  handleContainer(ws: WebSocket): void {
    if (this.containerWs) {
      this.containerWs.close();
    }

    this.containerWs = ws;
    ws.accept();
    ws.addEventListener('message', (message) => {
      const text = String(message.data);
      this.logs.push(text);
      if (this.logs.length > 1000) {
        this.logs.shift();
      }
      this.broadcast(text);
    });
    ws.addEventListener('close', () => {
      this.status = 'completed';
      this.broadcast('\n[Supervisor] Container Disconnected.\n');
      this.broadcastEvent({ type: 'status', status: 'completed' });
      void this.saveState();
    });
  }

  broadcast(message: string): void {
    this.sessions.filter((session) => session.type === 'terminal').forEach((session) => session.ws.send(message));
  }

  broadcastEvent(event: Record<string, unknown>): void {
    const payload = JSON.stringify(event);
    this.sessions.filter((session) => session.type === 'control').forEach((session) => session.ws.send(payload));
  }

  async saveState(): Promise<void> {
    await this.ctx.storage.put('status', this.status);
    await this.ctx.storage.put('logs', this.logs);
    if (this.healthStatus) {
      await this.ctx.storage.put('healthStatus', this.healthStatus);
    }
  }
}
