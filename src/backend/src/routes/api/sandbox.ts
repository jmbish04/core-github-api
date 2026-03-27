import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { getSandbox, parseSSEStream, type ExecEvent } from '@cloudflare/sandbox';
import { Shell, Editor } from '@cloudflare/sandbox/openai';
import { Agent, run, shellTool, applyPatchTool, setDefaultOpenAIClient } from '@openai/agents';
import OpenAI from 'openai';
import { AIGateway } from '@/ai/utils/ai-gateway';
import sandboxHandler from '@/ai/agents/SandboxAgent';

const app = new OpenAPIHono<{ Bindings: Env }>();

// ──────────────────────────────────────────────
// Helper: Create an OpenAI client pointing at
// the Cloudflare AI Gateway (Workers AI provider).
// The model `@cf/moonshotai/kimi-k2.5` is routed
// through the `compat` (workers-ai) gateway slot.
// ──────────────────────────────────────────────
async function createGatewayClient(env: Env): Promise<OpenAI> {
  const { baseUrl, apiKey, aigToken } = await AIGateway.getBaseUrl(env, {
    provider: 'workers-ai',
  });

  const defaultHeaders: Record<string, string> = {};
  if (aigToken) {
    defaultHeaders['cf-aig-authorization'] = `Bearer ${aigToken}`;
  }

  return new OpenAI({
    apiKey: apiKey || 'no-key', // AI Gateway BYOK — key injected by Gateway
    baseURL: baseUrl,
    defaultHeaders,
  });
}

// ──────────────────────────────────────────────
// Error helpers (ported from the reference impl)
// ──────────────────────────────────────────────
function isErrorWithProperties(error: unknown): error is {
  message?: string;
  exitCode?: number;
  stdout?: string;
  stderr?: string;
  status?: number;
  stack?: string;
} {
  return typeof error === 'object' && error !== null;
}

function getErrorMessage(error: unknown): string {
  if (isErrorWithProperties(error) && typeof error.message === 'string') {
    return error.message;
  }
  return String(error);
}

// ──────────────────────────────────────────────
// POST /execute — legacy Python code-gen + exec
// (kept intact for backwards compatibility)
// ──────────────────────────────────────────────
const ExecuteSchema = z.object({
  question: z.string().openapi({ example: 'Calculate the 10th fibonacci number' }),
});

app.openapi(
  createRoute({
    method: 'post',
    path: '/execute',
    request: { body: { content: { 'application/json': { schema: ExecuteSchema } } } },
    responses: {
      200: {
        description: 'Execution Result',
        content: {
          'application/json': {
            schema: z.object({
              success: z.boolean(),
              question: z.string(),
              code: z.string(),
              output: z.string(),
              error: z.string(),
            }),
          },
        },
      },
      500: { description: 'Internal Server Error' },
    },
  }),
  async (c) => {
    const { question } = c.req.valid('json');

    const openai = await createGatewayClient(c.env);

    const completion = await openai.chat.completions.create({
      model: '@cf/moonshotai/kimi-k2.5',
      messages: [
        {
          role: 'user',
          content: `Generate Python code to answer: "${question}"\nRequirements:\n- Use only Python standard library\n- Print the result using print()\n- Keep code simple and safe\nReturn ONLY the code, no explanations.`,
        },
      ],
    });

    const generatedCode = completion.choices[0]?.message?.content
      ?.replace(/^```python?\n?/, '')
      .replace(/\n?```\s*$/, '')
      .trim() || '';

    if (!generatedCode) {
      return c.json({ success: false, question, code: '', output: '', error: 'Failed to generate code' }, 500);
    }

    const sandbox = getSandbox(c.env.SANDBOX, `exec-${Date.now()}`);
    try {
      await sandbox.writeFile('/tmp/code.py', generatedCode);
      const result = await sandbox.exec('python3 /tmp/code.py');

      return c.json({
        success: result.success,
        question,
        code: generatedCode,
        output: result.stdout,
        error: result.stderr,
      });
    } finally {
      await sandbox.destroy();
    }
  }
);

// ──────────────────────────────────────────────
// POST /run — OpenAI Agents SDK + Shell/Editor
// Natural-language agentic sandbox execution
// ──────────────────────────────────────────────
const RunSchema = z.object({
  input: z.string().openapi({ example: 'List the files in /workspace and create a hello.txt' }),
  sessionId: z.string().optional().openapi({ example: 'my-session-id' }),
});

app.openapi(
  createRoute({
    method: 'post',
    path: '/run',
    request: {
      body: { content: { 'application/json': { schema: RunSchema } } },
      headers: z.object({
        'x-session-id': z.string().optional().openapi({ description: 'Sandbox session ID' }),
      }),
    },
    responses: {
      200: {
        description: 'Agent Run Result',
        content: {
          'application/json': {
            schema: z.object({
              naturalResponse: z.string().nullable(),
              commandResults: z.array(z.any()),
              fileOperations: z.array(z.any()),
            }),
          },
        },
      },
      400: { description: 'Bad Request' },
      500: { description: 'Internal Server Error' },
    },
  }),
  async (c) => {
    const { input, sessionId: bodySessionId } = c.req.valid('json');
    const headerSessionId = c.req.header('x-session-id');
    const sessionId = bodySessionId || headerSessionId || `session-${Date.now()}`;

    try {
      // Wire the AI Gateway-backed OpenAI client as the default for @openai/agents
      const openaiClient = await createGatewayClient(c.env);
      setDefaultOpenAIClient(openaiClient);

      const sandbox = getSandbox(c.env.SANDBOX, sessionId);
      const shell = new Shell(sandbox);
      const editor = new Editor(sandbox, '/workspace');

      const agent = new Agent({
        name: 'Sandbox Studio',
        model: '@cf/moonshotai/kimi-k2.5',
        instructions:
          'You are a powerful development assistant with access to a secure Cloudflare Sandbox environment. You can execute shell commands and edit files in /workspace. Use shell commands to inspect, run code, and test repos. Use apply_patch to create, update, or delete files. Always verify results and keep responses concise.',
        tools: [
          shellTool({ shell, needsApproval: false }),
          applyPatchTool({ editor, needsApproval: false }),
        ],
      });

      const result = await run(agent, input);

      return c.json({
        naturalResponse: result.finalOutput ?? null,
        commandResults: shell.results.sort((a, b) => a.timestamp - b.timestamp),
        fileOperations: editor.results.sort((a, b) => a.timestamp - b.timestamp),
      });
    } catch (error: unknown) {
      const message = getErrorMessage(error);
      return c.json(
        {
          naturalResponse: 'An error occurred while processing your request.',
          commandResults: [],
          fileOperations: [],
          error: message,
        },
        500
      );
    }
  }
);

// ──────────────────────────────────────────────
// POST /test-repo — Automated repo test runner
// ──────────────────────────────────────────────
const TestRepoSchema = z.object({
  repoUrl: z.string().openapi({ example: 'https://github.com/owner/repo' }),
  branch: z.string().optional().openapi({ example: 'main' }),
});

async function detectProjectType(sandbox: ReturnType<typeof getSandbox>): Promise<string> {
  try { await sandbox.readFile('/workspace/repo/package.json'); return 'nodejs'; } catch { /* ignore */ }
  try { await sandbox.readFile('/workspace/repo/requirements.txt'); return 'python'; } catch { /* ignore */ }
  try { await sandbox.readFile('/workspace/repo/go.mod'); return 'go'; } catch { /* ignore */ }
  return 'unknown';
}

function getInstallCommand(projectType: string): string {
  switch (projectType) {
    case 'nodejs': return 'npm install';
    case 'python': return 'pip install -r requirements.txt || pip install -e .';
    case 'go': return 'go mod download';
    default: return '';
  }
}

function getTestCommand(projectType: string): string {
  switch (projectType) {
    case 'nodejs': return 'npm test';
    case 'python': return 'python -m pytest || python -m unittest discover';
    case 'go': return 'go test ./...';
    default: return 'echo "Unknown project type"';
  }
}

app.openapi(
  createRoute({
    method: 'post',
    path: '/test-repo',
    request: { body: { content: { 'application/json': { schema: TestRepoSchema } } } },
    responses: {
      200: {
        description: 'Test Result',
        content: {
          'application/json': {
            schema: z.object({
              success: z.boolean(),
              exitCode: z.number(),
              projectType: z.string(),
              message: z.string(),
            }),
          },
        },
      },
      500: { description: 'Internal Server Error' },
    },
  }),
  async (c) => {
    const { repoUrl, branch } = c.req.valid('json');
    const sandbox = getSandbox(c.env.SANDBOX, `test-${Date.now()}`);

    try {
      let cloneUrl = repoUrl;
      if (c.env.GITHUB_PERSONAL_ACCESS_TOKEN && cloneUrl.includes('github.com')) {
        cloneUrl = cloneUrl.replace('https://', `https://${c.env.GITHUB_PERSONAL_ACCESS_TOKEN}@`);
      }

      await sandbox.gitCheckout(cloneUrl, {
        ...(branch && { branch }),
        depth: 1,
        targetDir: 'repo',
      });

      const projectType = await detectProjectType(sandbox);
      const installCmd = getInstallCommand(projectType);

      if (installCmd) {
        const installStream = await sandbox.execStream(`cd /workspace/repo && ${installCmd}`);
        let installExitCode = 0;
        for await (const event of parseSSEStream<ExecEvent>(installStream)) {
          if (event.type === 'complete') installExitCode = event.exitCode ?? 0;
        }
        if (installExitCode !== 0) {
          return c.json({ success: false, exitCode: installExitCode, projectType, message: 'Install failed' }, 500);
        }
      }

      const testCmd = getTestCommand(projectType);
      const testStream = await sandbox.execStream(`cd /workspace/repo && ${testCmd}`);
      let testExitCode = 0;
      for await (const event of parseSSEStream<ExecEvent>(testStream)) {
        if (event.type === 'complete') testExitCode = event.exitCode ?? 0;
      }

      return c.json({
        success: testExitCode === 0,
        exitCode: testExitCode,
        projectType,
        message: testExitCode === 0 ? 'All tests passed' : 'Tests failed',
      });
    } finally {
      await sandbox.destroy();
    }
  }
);

// Mount the Honi SandboxAgent at /agent/* by forwarding raw fetch args
app.all('/agent/*', (c) => sandboxHandler.fetch(c.req.raw, c.env, c.executionCtx));

// ──────────────────────────────────────────────
// Proxy endpoints for container-hosted goodies
// ──────────────────────────────────────────────

app.all('/:id/proxy/*', async (c) => {
  const sandboxId = c.req.param('id');
  const url = new URL(c.req.url);
  const pathParts = url.pathname.split('/proxy');
  const targetPath = pathParts[1] || '/';
  
  const sandbox = getSandbox(c.env.SANDBOX, sandboxId);
  // Default to 8788 for the task_runner API
  const targetUrl = `http://localhost:8788${targetPath}${url.search}`;
  
  try {
    const response = await sandbox.fetch(new Request(targetUrl, c.req.raw));
    return response;
  } catch (error) {
    return c.json({ error: getErrorMessage(error) }, 500);
  }
});

app.all('/:id/agent-proxy/*', async (c) => {
  const sandboxId = c.req.param('id');
  const url = new URL(c.req.url);
  const pathParts = url.pathname.split('/agent-proxy');
  const targetPath = pathParts[1] || '/';
  
  const sandbox = getSandbox(c.env.SANDBOX, sandboxId);
  // Default to 3001 for the agent-sdk HTTP API
  const targetUrl = `http://localhost:3001${targetPath}${url.search}`;
  
  try {
    const response = await sandbox.fetch(new Request(targetUrl, c.req.raw));
    return response;
  } catch (error) {
    return c.json({ error: getErrorMessage(error) }, 500);
  }
});

export default app;
