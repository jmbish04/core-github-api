// container/src/server.ts
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { WebSocketServer, WebSocket } from "ws";
import * as pty from "node-pty";
import * as fs from "fs";
import * as path from "path";
import { exec as execCallback } from "child_process";
import { promisify } from "util";

const execAsync = promisify(execCallback);
const app = new Hono();

// Keep orchestration API separate from code-server's port.
const CONTROL_PORT = Number(process.env.COLBY_CONTROL_PORT || 8788);

// --- State Management ---
let activePty: pty.IPty | null = null;
let activeBuffer = "";

type SessionState = {
  id: string;
  cwd: string;
  env: Record<string, string>;
  createdAt: string;
};

const sessions = new Map<string, SessionState>();
const exposedPorts = new Map<number, { sessionId: string; name?: string }>();

const DEFAULT_WORKSPACE = "/workspace";

function shellEscape(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

function ensureSession(sessionId?: string): SessionState {
  const id = sessionId || "default-session";
  const existing = sessions.get(id);
  if (existing) return existing;

  const session: SessionState = {
    id,
    cwd: DEFAULT_WORKSPACE,
    env: {},
    createdAt: new Date().toISOString(),
  };

  fs.mkdirSync(session.cwd, { recursive: true });
  sessions.set(id, session);
  return session;
}

function resolvePathForSession(session: SessionState, requestedPath: string): string {
  if (!requestedPath) {
    throw new Error("Path is required");
  }
  if (path.isAbsolute(requestedPath)) return requestedPath;
  return path.resolve(session.cwd, requestedPath);
}

async function runCommand(
  command: string,
  options?: {
    cwd?: string;
    env?: Record<string, string>;
    timeoutMs?: number;
  },
) {
  const timeout = options?.timeoutMs ?? 300_000;
  try {
    const result = await execAsync(command, {
      cwd: options?.cwd || DEFAULT_WORKSPACE,
      env: { ...process.env, ...(options?.env || {}) },
      timeout,
      maxBuffer: 20 * 1024 * 1024,
    });
    return {
      success: true,
      command,
      exitCode: 0,
      stdout: result.stdout ?? "",
      stderr: result.stderr ?? "",
    };
  } catch (error: any) {
    return {
      success: false,
      command,
      exitCode: typeof error?.code === "number" ? error.code : 1,
      stdout: error?.stdout ?? "",
      stderr: error?.stderr ?? error?.message ?? "Command failed",
    };
  }
}

async function handleExec(
  body: {
    command: string;
    sessionId?: string;
    timeoutMs?: number;
    env?: Record<string, string>;
    cwd?: string;
  },
) {
  if (!body?.command) {
    return {
      success: false,
      command: "",
      exitCode: 1,
      stdout: "",
      stderr: "command is required",
    };
  }

  const session = ensureSession(body.sessionId);
  const cwd = body.cwd ? resolvePathForSession(session, body.cwd) : session.cwd;

  return runCommand(body.command, {
    cwd,
    timeoutMs: body.timeoutMs,
    env: {
      ...session.env,
      ...(body.env || {}),
    },
  });
}

// --- 1. Existing Orchestration API ---

app.post("/execute", async (c) => {
  if (activePty) {
    return c.json({ error: "Container is busy. Please wait or stop the current task." }, 409);
  }

  const body = (await c.req.json()) as any;
  const { command, repoUrl, payload } = body;
  activePty = pty.spawn("node", ["dist/task_runner.js"], {
    name: "xterm-color",
    cols: 120,
    rows: 40,
    cwd: process.env.HOME || "/root",
    env: {
      ...process.env,
      COLBY_REPO_URL: repoUrl,
      COLBY_COMMAND: command,
      COLBY_PAYLOAD: JSON.stringify(payload || {}),
    },
  });

  setupPtyListeners(activePty);
  return c.json({ status: "started", message: "Task running. Connect via WebSocket to view logs." });
});

app.post("/stop", async (c) => {
  if (activePty) {
    activePty.kill();
    activePty = null;
    activeBuffer += "\r\n\x1b[31m[System] Process terminated by user.\x1b[0m\r\n";
    return c.json({ status: "stopped" });
  }
  return c.json({ status: "no_process" });
});

// --- 2. Generic command and filesystem endpoints ---

app.post("/exec", async (c) => {
  const body = (await c.req.json()) as any;
  const result = await handleExec(body);
  return c.json(result, result.success ? 200 : 500);
});

app.post("/api/execute", async (c) => {
  const body = (await c.req.json()) as any;
  const result = await handleExec(body);
  return c.json(result, result.success ? 200 : 500);
});

app.post("/api/session/create", async (c) => {
  const body = (await c.req.json()) as any;
  const id = body?.id || `session-${Date.now()}`;
  const session = ensureSession(id);

  if (body?.cwd) {
    session.cwd = body.cwd;
    fs.mkdirSync(session.cwd, { recursive: true });
  }

  if (body?.env && typeof body.env === "object") {
    session.env = { ...session.env, ...body.env };
  }

  sessions.set(id, session);
  return c.json({
    success: true,
    sessionId: id,
    createdAt: session.createdAt,
    timestamp: new Date().toISOString(),
  });
});

app.post("/api/session/delete", async (c) => {
  const body = (await c.req.json()) as any;
  const sessionId = body?.sessionId;
  if (!sessionId) {
    return c.json({ success: false, error: "sessionId is required" }, 400);
  }
  sessions.delete(sessionId);
  return c.json({
    success: true,
    sessionId,
    deletedAt: new Date().toISOString(),
  });
});

async function writeFileHandler(c: any) {
  const body = (await c.req.json()) as any;
  const { path: filePath, content = "", sessionId } = body;
  const session = ensureSession(sessionId);
  const resolved = resolvePathForSession(session, filePath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  fs.writeFileSync(resolved, String(content), "utf8");
  return c.json({
    success: true,
    path: resolved,
    bytesWritten: Buffer.byteLength(String(content), "utf8"),
  });
}

async function readFileHandler(c: any) {
  const body = (await c.req.json()) as any;
  const { path: filePath, sessionId } = body;
  const session = ensureSession(sessionId);
  const resolved = resolvePathForSession(session, filePath);
  const content = fs.readFileSync(resolved, "utf8");
  return c.json({
    success: true,
    path: resolved,
    content,
  });
}

app.post("/fs/write", writeFileHandler);
app.post("/api/write", writeFileHandler);
app.post("/fs/read", readFileHandler);
app.post("/api/read", readFileHandler);

app.post("/api/git/checkout", async (c) => {
  const body = (await c.req.json()) as any;
  const { repoUrl, branch, targetDir, sessionId } = body;

  if (!repoUrl) {
    return c.json({ success: false, error: "repoUrl is required" }, 400);
  }

  const session = ensureSession(sessionId);
  const destination = resolvePathForSession(
    session,
    targetDir || path.join(session.cwd, "repo"),
  );

  fs.mkdirSync(path.dirname(destination), { recursive: true });
  await runCommand(`rm -rf ${shellEscape(destination)}`, { cwd: session.cwd });

  const cloneParts = ["git", "clone", "--depth=1"];
  if (branch) cloneParts.push("--branch", shellEscape(String(branch)));
  cloneParts.push(shellEscape(String(repoUrl)), shellEscape(destination));

  const clone = await runCommand(cloneParts.join(" "), { cwd: session.cwd });
  if (!clone.success) {
    return c.json({ ...clone, success: false }, 500);
  }

  return c.json({
    success: true,
    repoUrl,
    branch: branch || "default",
    targetDir: destination,
    timestamp: new Date().toISOString(),
  });
});

app.get("/ps", async (c) => {
  const result = await runCommand("ps -eo user,pid,pcpu,pmem,time,command --no-headers");
  if (!result.success) {
    return c.json({ success: false, error: result.stderr }, 500);
  }

  const processes = result.stdout
    .split("\n")
    .map((line: string) => line.trim())
    .filter(Boolean)
    .map((line: string) => {
      const match = line.match(/^(\S+)\s+(\d+)\s+([\d.]+)\s+([\d.]+)\s+(\S+)\s+(.+)$/);
      if (!match) {
        return {
          user: "unknown",
          pid: "0",
          cpu: "0",
          mem: "0",
          time: "00:00:00",
          command: line,
        };
      }

      return {
        user: match[1],
        pid: match[2],
        cpu: match[3],
        mem: match[4],
        time: match[5],
        command: match[6],
      };
    });

  return c.json({ success: true, processes });
});

async function killHandler(c: any) {
  const body = (await c.req.json()) as any;
  const pid = body?.pid;
  if (!pid) {
    return c.json({ success: false, error: "pid is required" }, 400);
  }
  const killResult = await runCommand(`kill -9 ${shellEscape(String(pid))}`);
  return c.json(killResult, killResult.success ? 200 : 500);
}

app.post("/kill", killHandler);
app.post("/kill-process", killHandler);

app.post("/api/expose-port", async (c) => {
  const body = (await c.req.json()) as any;
  const port = Number(body?.port);
  const sessionId = String(body?.sessionId || "default-session");
  const name = body?.name;

  if (!port || Number.isNaN(port)) {
    return c.json({ success: false, error: "port is required" }, 400);
  }

  exposedPorts.set(port, { sessionId, name });
  return c.json({
    success: true,
    port,
    name,
    sessionId,
    url: `http://127.0.0.1:${port}`,
  });
});

app.get("/api/exposed-ports", async (c) => {
  const session = c.req.query("session");
  const ports = Array.from(exposedPorts.entries())
    .filter(([, value]) => !session || value.sessionId === session)
    .map(([port]) => ({
      port,
      status: "active",
    }));

  return c.json({ success: true, ports });
});

app.delete("/api/exposed-ports/:port", async (c) => {
  const port = Number(c.req.param("port"));
  exposedPorts.delete(port);
  return c.json({ success: true, port });
});

// --- 3. WebSocket Server ---

const server = serve({ fetch: app.fetch, port: CONTROL_PORT });
const wss = new WebSocketServer({ server: server as any });

wss.on("connection", (ws) => {
  if (activePty) {
    ws.send(activeBuffer);
    const disposable = activePty.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(data);
    });

    ws.on("message", (msg) => {
      if (activePty) activePty.write(msg.toString());
    });

    ws.on("close", () => disposable.dispose());
    return;
  }

  const shell = pty.spawn("bash", [], {
    name: "xterm-color",
    cols: 120,
    rows: 40,
    cwd: process.env.HOME || "/root",
    env: process.env as any,
  });

  shell.write('echo "Colby Container Ready."\r\n');
  shell.write(`echo "Control API listening on :${CONTROL_PORT}"\r\n`);

  shell.onData((data) => {
    if (ws.readyState === WebSocket.OPEN) ws.send(data);
  });

  ws.on("message", (msg) => shell.write(msg.toString()));
  ws.on("close", () => shell.kill());
});

function setupPtyListeners(ptyProc: pty.IPty) {
  activeBuffer = "";

  ptyProc.onData((data) => {
    activeBuffer += data;
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(data);
      }
    });
  });

  ptyProc.onExit(({ exitCode }) => {
    activePty = null;
    const msg = `\r\n\x1b[32m[System] Task completed (Exit Code: ${exitCode})\x1b[0m\r\n`;
    activeBuffer += msg;
    wss.clients.forEach((c) => c.send(msg));
  });
}

console.log(`Control server listening on port ${CONTROL_PORT}`);
