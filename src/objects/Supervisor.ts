

import { Agent } from "agents";
import { DurableObject } from "cloudflare:workers";

import { Bindings } from "../utils/hono";

interface Env extends Bindings {
    AI: any;
    COLBY_OPS: any;
}

import { checkGitHubHealth } from "../workflows/health";

export class Supervisor extends Agent<Env> {
    // State
    private sessions: { ws: WebSocket; type: 'terminal' | 'control' }[] = []; // Frontend clients
    private containerWs: WebSocket | null = null; // Connection to Container
    private logs: string[] = [];
    private status: 'idle' | 'running' | 'completed' | 'failed' | 'intervention_needed' = 'idle';
    private startTime: number = 0;
    private containerId: string | null = null;
    private healthStatus: any = null;

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

    async runGithubHealthCheck(): Promise<Response> {
        this.broadcast("[Supervisor] 🏥 Starting GitHub Health Check...\n");

        try {
            const runId = crypto.randomUUID();
            const results = await checkGitHubHealth(this.env, runId);

            const failure = results.find(r => r.status === 'failure');
            const overallStatus = failure ? 'unhealthy' : 'healthy';

            const result = {
                status: overallStatus,
                details: { results }
            };

            this.healthStatus = result;
            await this.ctx.storage.put("healthStatus", result);

            this.broadcast(`[Supervisor] Health Check Complete: ${result.status.toUpperCase()}\n`);
            this.broadcast(JSON.stringify(result.details, null, 2) + "\n");

            return Response.json(result);
        } catch (e: any) {
            this.broadcast(`[Supervisor] ❌ Health Check Failed: ${e.message}\n`);
            return Response.json({ status: 'error', error: e.message }, { status: 500 });
        }
    }

    async startTask(params: any): Promise<Response> {
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
            const response = await this.env.COLBY_OPS.fetch("http://container/execute", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(params)
            });

            if (!response.ok) throw new Error(await response.text());

            const wsResponse = await this.env.COLBY_OPS.fetch("http://container/execute", {
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
    }

    async killTask(): Promise<Response> {
        this.broadcast("[Supervisor] 🛑 Kill command received.\n");
        try {
            await this.env.COLBY_OPS.fetch("http://container/stop", { method: "POST" });
            this.status = 'failed'; // or terminated
            await this.saveState();
            this.broadcastEvent({ type: 'status', status: 'failed' });
            return Response.json({ status: "killed" });
        } catch (e: any) {
            return Response.json({ error: e.message }, { status: 500 });
        }
    }

    async relayToContainer(req: Request, path: string): Promise<Response> {
        try {
            const containerRes = await this.env.COLBY_OPS.fetch(`http://container${path}`, {
                method: req.method,
                headers: req.headers,
                body: req.body
            });
            return containerRes;
        } catch (e: any) {
            return Response.json({ error: `Relay failed: ${e.message}` }, { status: 502 });
        }
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

    // --- Deep Reasoning Logic ---
    async processDeepReasoning(prompt: string): Promise<string> {
        // Step 1: Reasoning with @cf/openai/gpt-oss-120b
        const reasoningResponse = await this.env.AI.run("@cf/openai/gpt-oss-120b", {
            instructions: "You are a deep thinking assistant. Analyze the system logs and user query critically.",
            input: prompt,
            reasoning: {
                effort: "medium",
                summary: "concise",
            },
        } as any);

        const reasoningOutput = (reasoningResponse as any).response || JSON.stringify(reasoningResponse);

        // Step 2: Formulating response with @cf/meta/llama-3.3-70b-instruct-fp8-fast
        const formattingPrompt = `
        You are a helpful AI ops assistant.
        
        System Context & Reasoning:
        ${reasoningOutput}
        
        User Query: "${prompt}"
        
        Task: Provide a helpful, clear, and direct response to the user's query based on the analysis. Do not expose internal reasoning steps unless necessary for clarity.
        `;

        const response = await this.env.AI.run("@cf/meta/llama-3.3-70b-instruct-fp8-fast", {
            messages: [{ role: "system", content: "You are a helpful AI ops assistant." }, { role: "user", content: formattingPrompt }]
        } as any);

        return (response as any).response;
    }

    // --- WebSocket Handling ---

    handleSession(ws: WebSocket, type: 'terminal' | 'control') {
        const session = { ws, type };
        this.sessions.push(session);
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
            this.sessions = this.sessions.filter(s => s !== session);
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
        this.sessions.filter(s => s.type === 'terminal').forEach(s => s.ws.send(msg));
    }

    broadcastEvent(event: any) {
        // Broadcast JSON events to control clients
        const payload = JSON.stringify(event);
        this.sessions.filter(s => s.type === 'control').forEach(s => s.ws.send(payload));
    }

    async saveState() {
        await this.ctx.storage.put("status", this.status);
        await this.ctx.storage.put("logs", this.logs);
        if (this.healthStatus) await this.ctx.storage.put("healthStatus", this.healthStatus);
    }
}

