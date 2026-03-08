/**
 * Supervisor Agent (Operational Watchdog)
 * 
 * The Supervisor is a Durable Object responsible for:
 * 1. Managing connections between the frontend and the backend container.
 * 2. Monitoring execution health and logging.
 * 3. Providing a "Live Surgery" interface for real-time debugging.
 * 4. Running diagnostic health checks (GitHub, etc.).
 * 5. Leveraging high-reasoning models to diagnose stuck processes.
 * 
 * @module AI/Agents/Supervisor
 */
import { Agent, callable } from "agents";
import { BaseAgent } from "./base/BaseAgent";
import { DurableObject } from "cloudflare:workers";
import { getSandbox } from "@cloudflare/sandbox";
import { generateUuid } from "@/utils/common";
import { resolveDefaultAiModel, resolveDefaultAiProvider } from "@/ai/providers/config";
import { checkGitHubAPIHealth, checkWebhooksHealth } from '@/workflows/health';

/**
 * The Supervisor Durable Object manages task orchestration and infrastructure health.
 */
export class Supervisor extends BaseAgent<Env> {
    private static readonly CONTAINER_API_ORIGIN = "http://container:8788";
    private static readonly DEBUG_PORT = 8080;
    private static readonly DEBUG_SESSION_TTL_MS = 60 * 60 * 1000;

    // State
    private terminalSessions: WebSocket[] = [];
    private controlSessions: WebSocket[] = []; // Frontend clients
    private containerWs: WebSocket | null = null; // Connection to Container
    private logs: string[] = [];
    private status: 'idle' | 'running' | 'completed' | 'failed' | 'intervention_needed' = 'idle';
    private startTime: number = 0;
    private healthStatus: any = null;
    private debugSessions = new Map<string, { issuedAt: number; operationId: string; port: number }>();

    constructor(ctx: DurableObjectState, env: Env) {
        super(ctx, env);
        // Restore state if needed, but usually ephemeral for supervision
        this.ctx.blockConcurrencyWhile(async () => {
            const storedLogs = await this.ctx.storage.get<string[]>("logs");
            if (storedLogs) this.logs = storedLogs;
            const storedStatus = await this.ctx.storage.get<string>("status");
            if (storedStatus) this.status = storedStatus as any;
            const storedHealth = await this.ctx.storage.get("healthStatus");
            if (storedHealth) this.healthStatus = storedHealth;
        });
    }

    @callable()
    healthProbe() {
        return {
            status: "ok",
            agent: "Supervisor",
            timestamp: new Date().toISOString(),
            runtimeStatus: this.status,
        };
    }

    async fetch(request: Request): Promise<Response> {
        const url = new URL(request.url);

        // 1. Browser/Frontend Connection (Spectator & Control)
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

        // 2. Container Connection (The Managed Resource)
        // The container connects here to stream logs TO the supervisor
        if (url.pathname === "/connect-container") {
            if (request.headers.get("Upgrade") !== "websocket") {
                return new Response("Expected Upgrade: websocket", { status: 426 });
            }
            const pair = new WebSocketPair();
            const [client, server] = Object.values(pair);

            this.handleContainer(server);
            return new Response(null, { status: 101, webSocket: client });
        }

        // 3. RPC / API
        if (url.pathname === "/status") {
            return Response.json({
                status: this.status,
                startTime: this.startTime,
                logsCount: this.logs.length,
                health: this.healthStatus
            });
        }

        if (request.method === "GET" && url.pathname === "/health-probe") {
            return Response.json(this.healthProbe());
        }

        if (request.method === "POST" && url.pathname === "/start") {
            const body = await request.json() as any;
            return this.startTask(body);
        }

        if (request.method === "POST" && url.pathname === "/kill") {
            return this.killTask();
        }

        if (request.method === "POST" && url.pathname === "/chat") {
            const body = await request.json() as any;
            return this.handleChat(body.message);
        }

        if (request.method === "POST" && url.pathname === "/health/github") {
            return this.runGithubHealthCheck();
        }

        if (request.method === "POST" && url.pathname === "/debug/start") {
            return this.startLiveSurgery(request);
        }

        if (url.pathname.startsWith("/debug/")) {
            return this.handleDebugProxy(request, url);
        }

        // --- Operator Relays ---
        if (request.method === "POST" && url.pathname === "/exec") {
            return this.relayToContainer(request, "/exec");
        }
        if (request.method === "GET" && url.pathname === "/ps") {
            return this.relayToContainer(request, "/ps");
        }
        if (request.method === "POST" && url.pathname === "/fs/read") {
            return this.relayToContainer(request, "/fs/read");
        }
        if (request.method === "POST" && url.pathname === "/fs/write") {
            return this.relayToContainer(request, "/fs/write");
        }
        if (request.method === "POST" && url.pathname === "/kill-process") {
            return this.relayToContainer(request, "/kill"); // Remap to container's /kill
        }

        return new Response("Not Found", { status: 404 });
    }

    // --- Logic ---

/**
 * Triggers a comprehensive GitHub integration health check.
 * Checks API connectivity and webhook delivery status.
 */
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

    async startTask(params: any): Promise<Response> {
        return Response.json({ error: "Container support temporarily disabled" }, { status: 503 });
        /* 
        if (this.status === 'running') {
            return Response.json({ error: "Task already running" }, { status: 409 });
        }

        this.status = 'running';
        this.startTime = Date.now();
        this.logs = [`[Supervisor] Starting task: ${params.command}`];
        await this.saveState();

        this.broadcast(`[Supervisor] 🚀 Task Started: ${params.command}\n`);
        this.broadcastEvent({ type: 'status', status: 'running' });

        // Call Cloudflare Container Service to Start
        try {
            const response = await this.env.COLBY_OPS.fetch(`${Supervisor.CONTAINER_API_ORIGIN}/execute`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(params)
            });

            if (!response.ok) throw new Error(await response.text());

            const wsResponse = await this.env.COLBY_OPS.fetch(`${Supervisor.CONTAINER_API_ORIGIN}/execute`, {
                headers: { Upgrade: "websocket" }
            });

            const ws = wsResponse.webSocket;
            if (ws) {
                this.handleContainer(ws);
            } else {
                this.broadcast("[Supervisor] ⚠️ Container started via HTTP, but WebSocket connect failed.\n");
            }

            // Set Alarm for Watchdog
            await this.ctx.storage.setAlarm(Date.now() + 60 * 1000);

            return Response.json({ status: "started" });

        } catch (e: any) {
            this.status = 'failed';
            this.broadcast(`[Supervisor] ❌ Start Failed: ${e.message}\n`);
            this.broadcastEvent({ type: 'status', status: 'failed', error: e.message });
            return Response.json({ error: e.message }, { status: 500 });
        }
        */
    }

    async killTask(): Promise<Response> {
         return Response.json({ error: "Container support temporarily disabled" }, { status: 503 });
         /*
        this.broadcast("[Supervisor] 🛑 Kill command received.\n");
        try {
            await this.env.COLBY_OPS.fetch(`${Supervisor.CONTAINER_API_ORIGIN}/stop`, { method: "POST" });
            this.status = 'failed'; // or terminated
            await this.saveState();
            this.broadcastEvent({ type: 'status', status: 'failed' });
            return Response.json({ status: "killed" });
        } catch (e: any) {
            return Response.json({ error: e.message }, { status: 500 });
        }
        */
    }

    async relayToContainer(req: Request, path: string): Promise<Response> {
        return Response.json({ error: "Container support temporarily disabled" }, { status: 503 });
        /*
        try {
            const containerRes = await this.env.COLBY_OPS.fetch(`${Supervisor.CONTAINER_API_ORIGIN}${path}`, {
                method: req.method,
                headers: req.headers,
                body: req.body
            });
            return containerRes;
        } catch (e: any) {
            return Response.json({ error: `Relay failed: ${e.message}` }, { status: 502 });
        }
        */
    }

    private pruneExpiredDebugSessions() {
        const now = Date.now();
        for (const [sessionId, session] of this.debugSessions.entries()) {
            if (now - session.issuedAt > Supervisor.DEBUG_SESSION_TTL_MS) {
                this.debugSessions.delete(sessionId);
            }
        }
    }

    private async startLiveSurgery(request: Request): Promise<Response> {
        return Response.json({ error: "Container support temporarily disabled" }, { status: 503 });
        /*
        const origin = request.headers.get("x-forwarded-origin") || new URL(request.url).origin;
        const operationId = request.headers.get("x-operation-id") || `op-${Date.now()}`;
        const sessionId = generateUuid();

        const startCommand = [
            "mkdir -p /workspace",
            "pkill -f 'code-server --bind-addr 0.0.0.0:8080' || true",
            "nohup code-server --bind-addr 0.0.0.0:8080 --auth none /workspace >/tmp/code-server.log 2>&1 &",
        ].join(" && ");

        const execRes = await this.env.COLBY_OPS.fetch(`${Supervisor.CONTAINER_API_ORIGIN}/exec`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
                command: startCommand,
                timeoutMs: 120000,
            })
        });

        if (!execRes.ok) {
            const details = await execRes.text();
            return Response.json({ error: "Failed to launch code-server", details }, { status: 500 });
        }

        // Mirrors "sandbox.exposePort(8080, { token: session_id })" semantics using our
        // container-side registry and a supervisor-token-gated proxy URL.
        await this.env.COLBY_OPS.fetch(`${Supervisor.CONTAINER_API_ORIGIN}/api/expose-port`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
                port: Supervisor.DEBUG_PORT,
                sessionId,
                name: `live-surgery-${operationId}`,
            }),
        });

        this.debugSessions.set(sessionId, {
            issuedAt: Date.now(),
            operationId,
            port: Supervisor.DEBUG_PORT,
        });

        const debugUrl = `${origin}/api/ops/${operationId}/debug/${sessionId}/`;
        return Response.json({
            success: true,
            sessionId,
            operationId,
            debugUrl,
            expiresAt: new Date(Date.now() + Supervisor.DEBUG_SESSION_TTL_MS).toISOString(),
        });
        */
    }

    private async handleDebugProxy(request: Request, url: URL): Promise<Response> {
        return Response.json({ error: "Container support temporarily disabled" }, { status: 503 });
        /*
        this.pruneExpiredDebugSessions();

        const parts = url.pathname.split("/").filter(Boolean);
        const sessionId = parts[1];
        if (!sessionId) {
            return Response.json({ error: "Missing debug session token" }, { status: 400 });
        }

        const session = this.debugSessions.get(sessionId);
        if (!session) {
            return Response.json({ error: "Invalid or expired debug session token" }, { status: 401 });
        }

        if (request.method === "DELETE") {
            this.debugSessions.delete(sessionId);
            await this.env.COLBY_OPS.fetch(`${Supervisor.CONTAINER_API_ORIGIN}/api/exposed-ports/${session.port}?session=${encodeURIComponent(sessionId)}`, {
                method: "DELETE",
            }).catch(() => { });
            return Response.json({ success: true });
        }

        const downstreamPath = `/${parts.slice(2).join("/")}`.replace(/\/+$/, "") || "/";
        const downstreamUrl = new URL(downstreamPath || "/", "http://container");
        downstreamUrl.search = url.search;

        const sandbox = getSandbox(this.env.Sandbox, sessionId);
        return sandbox.containerFetch(new Request(downstreamUrl, request), session.port);
        */
    }

    async handleChat(msg: string): Promise<Response> {
        // Agentic support
        // Broadcast user message to terminal log too for context
        this.broadcast(`[User] ${msg}\n`);

        // Also send to control clients as a chat event
        this.broadcastEvent({ type: 'chat', role: 'user', content: msg });

        try {
            const context = `
            You are a Supervisor Agent ensuring the health of a containerized task.
            Logs:
            ${this.logs.slice(-20).join('\n')}
            
            User Query: ${msg}
            `;

            const reply = await this.processDeepReasoning(context);

            this.broadcast(reply + "\n");
            this.broadcastEvent({ type: 'chat', role: 'ai', content: reply });

            return Response.json({ reply });
        } catch (e) {
            return Response.json({ error: "AI Busy or Failed" });
        }
    }

/**
 * Core reasoning logic for operational assistance.
 * Analyzes logs/context to provide guidance to the operator.
 */
    async processDeepReasoning(prompt: string): Promise<string> {
        const provider = resolveDefaultAiProvider(this.env as any);
        const model = resolveDefaultAiModel(this.env as any, provider);
        return await this.runTextWithModel({
            provider,
            model,
            name: "SupervisorReasoning",
            instructions:
                "You are a helpful AI ops assistant. Analyze logs and respond with concise, actionable guidance.",
            prompt,
        });
    }

    // --- WebSocket Handling ---

    handleSession(ws: WebSocket, type: 'terminal' | 'control') {
        if (type === 'terminal') {
            this.terminalSessions.push(ws);
        } else if (type === 'control') {
            this.controlSessions.push(ws);
        }
        ws.accept();

        if (type === 'terminal') {
            // Send history to terminal
            ws.send(this.logs.join(""));
        } else if (type === 'control') {
            // Send initial status and state
            ws.send(JSON.stringify({ type: 'status', status: this.status, health: this.healthStatus }));
            // Could send chat history here too if we stored it separately
        }

        ws.addEventListener("message", async (msg) => {
            if (type === 'terminal') {
                // Handle client input (like typing in terminal) -> Forward to Container
                if (this.containerWs) {
                    this.containerWs.send(msg.data);
                }
            } else if (type === 'control') {
                // Handle control messages (e.g. Chat from control socket)
                try {
                    const data = JSON.parse(msg.data as string);
                    if (data.type === 'chat') {
                        await this.handleChat(data.message);
                    }
                } catch (e) {
                    console.error("Invalid control message", e);
                }
            }
        });

        ws.addEventListener("close", () => {
            if (type === 'terminal') {
                this.terminalSessions = this.terminalSessions.filter(s => s !== ws);
            } else if (type === 'control') {
                this.controlSessions = this.controlSessions.filter(s => s !== ws);
            }
        });
    }

    handleContainer(ws: WebSocket) {
        if (this.containerWs) this.containerWs.close();
        this.containerWs = ws;

        ws.accept(); // Connect

        ws.addEventListener("message", (msg) => {
            const text = msg.data.toString();
            this.logs.push(text);
            // Cap logs
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
        // Broadcast raw text to terminal clients
        for (let i = 0; i < this.terminalSessions.length; i++) {
            this.terminalSessions[i].send(msg);
        }
    }

    broadcastEvent(event: any) {
        // Broadcast JSON events to control clients
        const payload = JSON.stringify(event);
        for (let i = 0; i < this.controlSessions.length; i++) {
            this.controlSessions[i].send(payload);
        }
    }

    async saveState() {
        await this.ctx.storage.put("status", this.status);
        await this.ctx.storage.put("logs", this.logs);
        if (this.healthStatus) await this.ctx.storage.put("healthStatus", this.healthStatus);
    }
}
