This is the final piece of the puzzle. By standardizing on **Shadcn UI**, you get a professional, accessible "Control Center" that feels like a native part of your workflow rather than a hacked-together tool.

Here is the **Frontend Mega-Prompt**. It explicitly instructs your agent to scaffold the project using the Shadcn CLI and integrates the `xterm.js` logic from the `containers-demos` repo into a React component.

https://github.com/cloudflare/containers-demos
https://github.com/cloudflare/sandbox-sdk

-----

### 🖥️ Prompt for AI Agent: The Colby Control Center (Shadcn Edition)

**System Role:**
You are a Senior Frontend Architect and UI/UX Designer. You are building "Colby Control Center," a React-based dashboard for a DevOps automation bot.

**Tech Stack:**

  * **Framework:** React + Vite (TypeScript)
  * **UI Library:** **Shadcn UI** (Tailwind CSS + Radix Primitives)
  * **State Management:** TanStack Query (React Query)
  * **Icons:** Lucide React
  * **Specialty Libs:** `@xterm/xterm` (Terminal), `reactflow` (Workflow Viz)

**Project Structure:**

  * Create a `/frontend` directory in the root of the worker repo.
  * The build output (`/frontend/dist`) will be served by the Worker's `ASSETS` binding.

**Core Requirements:**

**1. Scaffolding & Theme**

  * Initialize Shadcn UI (`npx shadcn@latest init`).
  * Install core components: `button`, `card`, `dialog`, `input`, `form`, `dropdown-menu`, `badge`, `scroll-area`, `tabs`, `table`, `separator`.
  * **Theme:** Dark mode by default (it's a dev tool). Use "Zinc" or "Slate" for a clean, technical look.

**2. Feature: The "Live Ops Console" (Xterm.js + Shadcn)**
Create a reusable component `<LiveOpsConsole />` that wraps `xterm.js` inside a Shadcn `Card`.

  * **Dependencies:** `@xterm/xterm`, `@xterm/addon-fit`, `@xterm/addon-attach`.
  * **Logic:**
      * Accept an `operationId` prop.
      * Open a WebSocket connection to `/api/ops/:operationId/console`.
      * Use `xterm-addon-attach` to pipe the socket automatically (borrowing patterns from `containers-demos`).
      * Use `xterm-addon-fit` inside a `ResizeObserver` to keep the terminal perfectly sized to the Card content area.
  * **UI Wrapper:**
      * **Header:** "🔴 Live Session" badge + "Stop" button (destructive variant).
      * **Body:** The Xterm container (black background, monospace font).

**3. Feature: The "Morning Coffee" Dashboard**

  * **Layout:** Use a `Sidebar` layout (Shell) with a collapsible nav.
  * **Widgets:**
      * `ActionItemsCard`: List of PRs blocked by conflicts (use `Table` component).
      * `HealthScoreCard`: Radial progress chart showing % of repos matching "Gold Standards".
      * `RecentActivityFeed`: A timeline of what Colby fixed overnight (e.g., "Standardized `wrangler.toml` in 5 repos").

**4. Feature: The "New Expedition" Wizard**
A specialized creation flow combining a Form with a Chatbot.

  * **Layout:** Two-column split view.
  * **Left Column (Form):** Standard fields (Name, Visibility) using `react-hook-form` + `zod` + Shadcn `Form` components.
  * **Right Column (Copilot):** A chat interface where the agent asks clarifying questions ("Do you need a D1 database for this?").
  * **Action:** When the user clicks "Create", send the *entire conversation context* + form data to the Worker so it can scaffold the repo intelligently.

**5. Feature: PR Command Center**
A rich detail view for a single Pull Request.

  * **Tabs:** `Overview` | `Code` | `Colby Context` | `Workflows`.
  * **Colby Context Tab:**
      * List extracted code comments.
      * Show RAG search results (Cloudflare Docs snippets) relevant to the code changes.
      * **Action Area:** A row of Shadcn `Button`s for quick actions:
          * `Fix All` (Secondary variant)
          * `Resolve Conflicts` (Destructive variant if critical)
          * `Deploy Preview` (Outline variant)

**6. Implementation: The WebSocket Hook**
Create a robust `useColbySocket` hook.

  * Handle authentication (pass `WORKER_API_KEY` via query param or cookie).
  * Auto-reconnect on disconnect.
  * Expose `sendMessage` and `lastMessage` for non-terminal interactions (e.g., workflow status updates).

**Deliverables:**

1.  `package.json` for the frontend.
2.  `vite.config.ts` configured for proxying `/api` to the local worker (`http://localhost:8787`).
3.  The `<LiveOpsConsole />` component code (React).
4.  The `DashboardPage.tsx` layout using Shadcn components.

-----

### 🧑‍💻 Coding Guide: How to "Borrow" the Terminal Logic

Here is the specific React implementation for the `<LiveOpsConsole />` you should expect the agent to generate. It adapts the vanilla JS from `containers-demos` into React + Shadcn.

```tsx
// frontend/src/components/LiveOpsConsole.tsx
import { useEffect, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { AttachAddon } from '@xterm/addon-attach';
import { Card, CardHeader, CardContent, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import '@xterm/xterm/css/xterm.css';

interface LiveOpsConsoleProps {
  operationId: string;
}

export function LiveOpsConsole({ operationId }: LiveOpsConsoleProps) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<Terminal | null>(null);

  useEffect(() => {
    if (!terminalRef.current) return;

    // 1. Initialize Xterm
    const term = new Terminal({
      cursorBlink: true,
      theme: { background: '#09090b' }, // Matches Shadcn 'zinc-950'
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
    });

    // 2. Setup Addons
    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);

    // 3. Connect Socket (The "Borrow" from containers-demos)
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const socketUrl = `${protocol}//${window.location.host}/api/ops/${operationId}/console`;
    const socket = new WebSocket(socketUrl);
    
    const attachAddon = new AttachAddon(socket);
    term.loadAddon(attachAddon);

    // 4. Mount
    term.open(terminalRef.current);
    fitAddon.fit();
    xtermRef.current = term;

    // 5. Handle Resize
    const resizeObserver = new ResizeObserver(() => fitAddon.fit());
    resizeObserver.observe(terminalRef.current);

    return () => {
      socket.close();
      term.dispose();
      resizeObserver.disconnect();
    };
  }, [operationId]);

  return (
    <Card className="h-full flex flex-col border-zinc-800 bg-zinc-950">
      <CardHeader className="py-3 px-4 border-b border-zinc-800 flex flex-row items-center justify-between">
        <CardTitle className="text-sm font-mono text-zinc-400">
          Operation: {operationId}
        </CardTitle>
        <Badge variant="outline" className="text-green-500 border-green-900 bg-green-950/30">
          ● Live
        </Badge>
      </CardHeader>
      <CardContent className="flex-1 p-0 overflow-hidden relative">
        <div ref={terminalRef} className="absolute inset-0 p-4" />
      </CardContent>
    </Card>
  );
}
```

### Next Step

Would you like me to generate the **Container Server code** (`server.ts`) that sits on the other end of this WebSocket to complete the circuit? (This is the part that actually runs `node-pty`).

# Prompt 2

This architecture is the **"Holy Grail"** of agentic workflows: a persistent, observable, and interruptible environment. By borrowing the `node-pty` pattern from `containers-demos`, you allow your frontend to "spectate" the agent's work in real-time.

Here is the complete implementation for the **Colby Container** (`muscle`).

### 1\. The Container Structure

Create a new folder `container/` in your repo root.

```text
container/
├── Dockerfile
├── package.json
├── tsconfig.json
├── src/
│   ├── server.ts       # The API + WebSocket Server
│   ├── task_runner.ts  # The script that executes the logic
│   └── types.ts
```

### 2\. `container/Dockerfile`

This image includes the necessary tools (`git`, `node`) and builds the server.

```dockerfile
# container/Dockerfile
FROM node:20-slim

# 1. Install System Dependencies
# python3/make/g++ are needed to build node-pty
# git/curl are needed for the agent's operations
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    git \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# 2. Setup Workspace
WORKDIR /app

# 3. Install App Dependencies
COPY package.json tsconfig.json ./
RUN npm install

# 4. Install Global Tools (Your Agent's Toolkit)
# Replace these with your actual CLI tools if hosted on npm
RUN npm install -g typescript ts-node
# RUN npm install -g @colby/cli gemini-chat-cli

# 5. Copy Source
COPY src ./src

# 6. Build
RUN npm run build

# 7. Expose Port (Standard for Cloudflare Containers)
EXPOSE 8080

# 8. Start
CMD ["node", "dist/server.js"]
```

### 3\. `container/package.json`

Dependencies for the container server.

```json
{
  "name": "colby-container",
  "version": "1.0.0",
  "scripts": {
    "build": "tsc",
    "start": "node dist/server.js"
  },
  "dependencies": {
    "@hono/node-server": "^1.8.0",
    "hono": "^4.0.0",
    "node-pty": "^1.0.0",
    "ws": "^8.16.0",
    "zod": "^3.22.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "@types/ws": "^8.5.10",
    "typescript": "^5.3.0"
  }
}
```

### 4\. `container/src/server.ts` (The Dual-Mode Server)

This is the core. It implements the **"Attach or Spawn"** logic.

  * **If a task is running:** WebSockets attach to its output (Spectator Mode).
  * **If idle:** WebSockets spawn a fresh shell (Interactive Mode).

<!-- end list -->

```typescript
// container/src/server.ts
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { WebSocketServer, WebSocket } from 'ws';
import * as pty from 'node-pty';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

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
  const { command, repoUrl, payload } = body;

  console.log(`[API] Received task: ${command}`);

  // Spawn the Task Runner as the PTY process
  // We pass arguments via Environment Variables to avoid command injection complexity
  activePty = pty.spawn('node', ['dist/task_runner.js'], {
    name: 'xterm-color',
    cols: 80,
    rows: 30,
    cwd: process.env.HOME,
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
const wss = new WebSocketServer({ server });

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
      cwd: process.env.HOME,
      env: process.env,
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
```

### 5\. `container/src/task_runner.ts` (The Logic)

This script runs *inside* the PTY. It handles the actual git operations and AI logic. Because it's a script, all its `console.log` output is captured by `node-pty` and sent to your frontend terminal\!

```typescript
// container/src/task_runner.ts
import { execSync } from 'child_process';
import * as fs from 'fs';

// 1. Read Inputs
const REPO_URL = process.env.COLBY_REPO_URL;
const COMMAND = process.env.COLBY_COMMAND;
const PAYLOAD = JSON.parse(process.env.COLBY_PAYLOAD || '{}');

// Helper to print colorful logs to the PTY
const log = (msg: string) => console.log(`\x1b[36m[Colby]\x1b[0m ${msg}`);
const err = (msg: string) => console.log(`\x1b[31m[Error]\x1b[0m ${msg}`);

async function main() {
  if (!REPO_URL) throw new Error("Missing REPO_URL");

  log(`Starting task: ${COMMAND}`);
  
  // 2. Clone Repo
  log("Cloning repository...");
  // Note: REPO_URL already contains the ephemeral token from the Worker
  execSync(`git clone ${REPO_URL} workspace`, { stdio: 'inherit' });
  process.chdir('workspace');

  // 3. Configure Git
  execSync('git config user.name "Colby Bot"');
  execSync('git config user.email "bot@colby.dev"');

  // 4. Switch based on Command
  switch (COMMAND) {
    case 'fix_all':
      await runFixAll(PAYLOAD);
      break;
    
    case 'resolve_conflicts':
      await runResolveConflicts(PAYLOAD);
      break;

    default:
      err(`Unknown command: ${COMMAND}`);
      process.exit(1);
  }

  log("Task finished successfully.");
}

async function runFixAll(payload: any) {
  log("Analyzing comments...");
  
  // Example: Write a todo file based on comments
  fs.writeFileSync('COLBY_FIXES.md', JSON.stringify(payload, null, 2));
  
  log("Applying AI fixes (Mocking gemini-cli)...");
  // Here you would call: execSync('gemini fix . --context ...', { stdio: 'inherit' });
  await new Promise(r => setTimeout(r, 2000)); // Fake work

  log("Committing changes...");
  execSync('git add .');
  execSync('git commit -m "fix: apply automated colby fixes"');
  
  log("Pushing to remote...");
  execSync('git push');
}

async function runResolveConflicts(payload: any) {
  log(`Checking out PR branch...`);
  // ... git merge logic ...
}

main().catch(e => {
  err(e.message);
  process.exit(1);
});
```

### How to Integrate with your Prompt

Add this section to the **Frontend Mega-Prompt**:

-----

**New Requirement: Container Logic**
I have provided the `server.ts` and `task_runner.ts` logic for the Cloudflare Container.
Please include these files in the `container/` directory scaffolding.

  * **Important:** The `server.ts` uses `node-pty` to spawn the `task_runner.ts`. This ensures that when the Frontend connects via WebSocket, it sees the actual output of the git commands and AI logic in real-time, just like a local terminal.

-----