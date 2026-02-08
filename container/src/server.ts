// container/src/server.ts
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { WebSocketServer, WebSocket } from 'ws';
import * as pty from 'node-pty';
// import { fileURLToPath } from 'url'; // Note: Not using ES modules output, so skipping this unless needed for later
// import { dirname, join } from 'path';

const app = new Hono();
const port = 8080;

// --- State Management ---
// We keep track of the active PTY process to allow late-joining/reconnecting
let activePty: pty.IPty | null = null;
let activeBuffer: string = ''; // Keep recent logs for new connections

// --- 1. HTTP API (The "Trigger") ---

app.post('/execute', async (c) => {
    if (activePty) {
        return c.json({ error: 'Container is busy. Please wait or stop the current task.' }, 409);
    }

    const body = await c.req.json();
    const { command, repoUrl, payload } = body as any;

    console.log(`[API] Received task: ${command}`);

    // Spawn the Task Runner as the PTY process
    // We pass arguments via Environment Variables to avoid command injection complexity
    activePty = pty.spawn('node', ['dist/task_runner.js'], {
        name: 'xterm-color',
        cols: 80,
        rows: 30,
        cwd: process.env.HOME || '/root',
        env: {
            ...process.env,
            COLBY_REPO_URL: repoUrl,
            COLBY_COMMAND: command,
            COLBY_PAYLOAD: JSON.stringify(payload || {}),
        },
    });

    setupPtyListeners(activePty);

    return c.json({ status: 'started', message: 'Task running. Connect via WebSocket to view logs.' });
});

app.post('/stop', async (c) => {
    if (activePty) {
        activePty.kill();
        activePty = null;
        activeBuffer += '\r\n\x1b[31m[System] Process terminated by user.\x1b[0m\r\n';
        return c.json({ status: 'stopped' });
    }
    return c.json({ status: 'no_process' });
});

// --- 2. WebSocket Server (The "Console") ---

const server = serve({ fetch: app.fetch, port });
const wss = new WebSocketServer({ server: server as any });

wss.on('connection', (ws) => {
    console.log('[WS] Client connected');

    // A. If a task is already running, attach to it (Spectator Mode)
    if (activePty) {
        ws.send(activeBuffer); // Send history

        // Forward PTY -> WebSocket
        const disposable = activePty.onData((data) => {
            if (ws.readyState === WebSocket.OPEN) ws.send(data);
        });

        // Forward WebSocket -> PTY (Allow user intervention!)
        ws.on('message', (msg) => {
            if (activePty) activePty.write(msg.toString());
        });

        ws.on('close', () => disposable.dispose());
    }
    // B. If idle, spawn a fresh Bash shell (Interactive Mode)
    else {
        const shell = pty.spawn('bash', [], {
            name: 'xterm-color',
            cols: 80,
            rows: 30,
            cwd: process.env.HOME || '/root',
            env: process.env as any,
        });

        shell.write('echo "🤖 Colby Container Ready. Waiting for tasks..."\r\n');
        shell.write('echo "You have full shell access."\r\n');

        shell.onData((data) => {
            if (ws.readyState === WebSocket.OPEN) ws.send(data);
        });

        ws.on('message', (msg) => shell.write(msg.toString()));

        ws.on('close', () => shell.kill());
    }
});

// --- Helpers ---

function setupPtyListeners(ptyProc: pty.IPty) {
    activeBuffer = ''; // Reset buffer for new task

    ptyProc.onData((data) => {
        activeBuffer += data;
        // Broadcast to all "Spectator" sockets
        wss.clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(data);
            }
        });
    });

    ptyProc.onExit(({ exitCode }) => {
        console.log(`[PTY] Process exited with code ${exitCode}`);
        activePty = null;
        const msg = `\r\n\x1b[32m[System] Task completed (Exit Code: ${exitCode})\x1b[0m\r\n`;
        activeBuffer += msg;

        wss.clients.forEach((c) => c.send(msg));
    });
}

console.log(`Server listening on port ${port}`);
