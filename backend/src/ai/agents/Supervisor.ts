import { createAgent, tool } from 'honidev';
import { z } from 'zod';
import { Hono } from 'hono';
import { generateUuid } from "@/utils/common";
import { checkGitHubAPIHealth, checkWebhooksHealth } from '@/workflows/health';

export const { Agent, handler } = createAgent<Env>({
  name: "supervisor",
  model: "claude-3-5-sonnet-latest",
  system: "You are a Supervisor Agent ensuring the health of a containerized task. Analyze logs and respond with concise, actionable guidance.",
  binding: "SUPERVISOR",
  tools: [],
  memory: {
     working: true
  },
  observability: { enabled: true, aiGatewaySlug: 'core-github-api', collectEvents: true }
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
    private startTime: number = 0;
    private healthStatus: any = null;

    override async fetch(request: Request): Promise<Response> {
        const url = new URL(request.url);

        if (url.pathname === "/websocket") {
            if (request.headers.get("Upgrade") !== "websocket") {
                return new Response("Expected Upgrade: websocket", { status: 426 });
            }
            const pair = new WebSocketPair();
            const [client, server] = Object.values(pair);
            const type = url.searchParams.get("type") === "control" ? "control" : "terminal";
            this.handleSession(server, type);
            return new Response(null, { status: 101, webSocket: client });
        }

        if (url.pathname === "/connect-container") {
            if (request.headers.get("Upgrade") !== "websocket") {
                return new Response("Expected Upgrade: websocket", { status: 426 });
            }
            const pair = new WebSocketPair();
            const [client, server] = Object.values(pair);
            this.handleContainer(server);
            return new Response(null, { status: 101, webSocket: client });
        }
        
        if (url.pathname === "/status") {
            return Response.json({
                status: this.status,
                startTime: this.startTime,
                logsCount: this.logs.length,
                health: this.healthStatus
            });
        }
        if (request.method === "POST" && url.pathname === "/health/github") {
            return this.runGithubHealthCheck();
        }

        return super.fetch(request);
    }
    
    async runGithubHealthCheck(): Promise<Response> {
        this.broadcast("[Supervisor] 🏥 Starting GitHub Health Check...\n");
        try {
            const results: any[] = [];
            results.push(await checkGitHubAPIHealth(this.env));
            results.push(await checkWebhooksHealth(this.env));

            const overallStatus = results.some(r => r.status === 'failure') ? 'unhealthy' :
                                  results.some(r => r.status === 'warning') ? 'unhealthy' : 'healthy';

            const healthStatus = {
                status: overallStatus,
                details: { results: results }
            };

            this.healthStatus = healthStatus;
            await this.ctx.storage.put("healthStatus", healthStatus);

            this.broadcast(`[Supervisor] Health Check Complete: ${healthStatus.status.toUpperCase()}\n`);
            this.broadcast(JSON.stringify(healthStatus.details, null, 2) + "\n");

            return Response.json(healthStatus);
        } catch (e: any) {
            this.broadcast(`[Supervisor] ❌ Health Check Failed: ${e.message}\n`);
            return Response.json({ status: 'error', error: e.message }, { status: 500 });
        }
    }

    handleSession(ws: WebSocket, type: 'terminal' | 'control') {
        const session = { ws, type };
        this.sessions.push(session);
        ws.accept();

        if (type === 'terminal') {
            ws.send(this.logs.join(""));
        } else if (type === 'control') {
            ws.send(JSON.stringify({ type: 'status', status: this.status, health: this.healthStatus }));
        }

        ws.addEventListener("message", async (msg) => {
            if (type === 'terminal') {
                if (this.containerWs) {
                    this.containerWs.send(msg.data);
                }
            } else if (type === 'control') {
                try {
                    const data = JSON.parse(msg.data as string);
                    if (data.type === 'chat') {
                        this.broadcast(`[User] ${data.message}\n`);
                        this.broadcastEvent({ type: 'chat', role: 'user', content: data.message });
                        const chatRes = await super.fetch(new Request("http://localhost/chat", {
                            method: "POST", headers: {"content-type": "application/json"},
                            body: JSON.stringify({ message: `Logs: ${this.logs.slice(-20).join('\\n')}\n\nUser Query: ${data.message}`})
                        }));
                    }
                } catch (e) {
                    console.error("Invalid control message", e);
                }
            }
        });

        ws.addEventListener("close", () => {
            this.sessions = this.sessions.filter(s => s !== session);
        });
    }

    handleContainer(ws: WebSocket) {
        if (this.containerWs) this.containerWs.close();
        this.containerWs = ws;
        ws.accept(); 
        ws.addEventListener("message", (msg) => {
            const text = msg.data.toString();
            this.logs.push(text);
            if (this.logs.length > 1000) this.logs.shift();
            this.broadcast(text);
        });
        ws.addEventListener("close", () => {
            this.status = 'completed';
            this.broadcast("\n[Supervisor] Container Disconnected.\n");
            this.broadcastEvent({ type: 'status', status: 'completed' });
            this.saveState();
        });
    }

    broadcast(msg: string) {
        this.sessions.filter(s => s.type === 'terminal').forEach(s => s.ws.send(msg));
    }
    broadcastEvent(event: any) {
        const payload = JSON.stringify(event);
        this.sessions.filter(s => s.type === 'control').forEach(s => s.ws.send(payload));
    }
    async saveState() {
        await this.ctx.storage.put("status", this.status);
        await this.ctx.storage.put("logs", this.logs);
        if (this.healthStatus) await this.ctx.storage.put("healthStatus", this.healthStatus);
    }
}
