/**
 * @file frontend/src/components/cloudflare-chat/SystemPromptModal.tsx
 *
 * A read-only modal that displays the currently active Cloudflare Docs Agent
 * system prompt. Includes:
 *   - Copy prompt text button
 *   - Prominent API endpoint block with copy URL + copy integration prompts
 *   - "Update prompt" button that navigates to /tools/cloudflare-docs?tab=settings
 */

import { useState, useEffect } from "react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
    Loader2, Copy, CheckCheck, Settings2, Cloud,
    Code2, Zap} from "lucide-react";
import { handleGlobalSuccess } from '@/lib/success-handler';

interface Props {
    open: boolean;
    onClose: () => void;
}

interface PromptState {
    systemPrompt: string;
    lastUpdated: string | null;
    source: "kv" | "default";
}

export const SYSTEM_PROMPT_ENDPOINT = "https://core-github-api.hacolby.workers.dev/api/agents/cloudflare-docs/system-prompt";
export const WS_ENDPOINT = "wss://core-github-api.hacolby.workers.dev/agents/CloudflareDocsAgent";

// Prompt that coaches a coding agent on building the FULL Cloudflare Docs Agent from scratch
export const FULL_INTEGRATION_PROMPT = `# Task: Integrate a Full Cloudflare Docs Agent into This Worker

## Goal
Add a fully functional Cloudflare Docs Agent to this Cloudflare Worker project. The agent should:
1. Connect to the official Cloudflare Docs MCP server to retrieve up-to-date documentation
2. Use Gemini (primary) with Workers AI fallback for response generation
3. Be accessible over WebSocket via the Cloudflare Agents SDK
4. Be wired into the Hono router so it responds to HTTP + WS traffic
5. Return structured JSON blocks (section_header / text / codeblock) for the frontend renderer
6. Pull its system prompt dynamically from this shared endpoint (fall back to a hardcoded default):
   GET ${SYSTEM_PROMPT_ENDPOINT}

## Tech Stack (non-negotiable)
- Runtime: Cloudflare Workers (nodejs_compat)
- Agent: \`agents\` package (Cloudflare Agents SDK) — extend Agent
- Router: Hono — mount the agent WebSocket handler alongside REST routes
- DB: Drizzle ORM + D1 — log every interaction to a \`cloudflare_docs_interactions\` table
- Config: wrangler.jsonc (never wrangler.toml)
- Package manager: pnpm

## Agent Architecture
\`\`\`
CloudflareDocsAgent extends BaseAgent<Env, CloudflareDocsState>
  onMessage(connection, rawMessage):
    1. Parse { type: "chat", message, history, context, sessionId }
    2. Rewrite query for MCP → queryMCP(query)  [Cloudflare Docs MCP Server]
    3. Fetch repo tree from GitHub if context.repoUrl provided
    4. Load system prompt from: GET ${SYSTEM_PROMPT_ENDPOINT}
       → fall back to SYSTEM_PROMPT_BASE constant if request fails/times out
    5. Call Gemini structured output (gemini-2.5-flash)
       → fall back to Workers AI (@cf/meta/llama-3.3-70b-instruct-fp8-fast)
    6. Return { type: "result", blocks, followupPrompts, modelUsed, sessionId }
    7. Log to D1 cloudflare_docs_interactions table
\`\`\`

## Structured Response Format
The agent must return blocks as JSON:
\`\`\`typescript
interface ContentBlock {
  type: "section_header" | "text" | "codeblock";
  text: string;      // raw content; for codeblock: no fences
  language?: string; // only for codeblock
}
\`\`\`

## Frontend Chat (assistant-ui)
Build the chat UI using the \`assistant-ui\` library with Shadcn components:
- Thread sidebar (localStorage persistence per session)
- Each thread shows repo badge + Cloudflare binding badges (D1, KV, R2, etc.)
- Typed block renderer: section_header → h3, text → ReactMarkdown, codeblock → PrismLight
- Collapsible ThinkingBar showing agent progress events
- Follow-up prompt pills below last assistant message
- Composer with auto-grow textarea; send via WebSocket using \`useAgent\` from \`agents/react\`

## Wrangler Bindings Required
\`\`\`jsonc
// wrangler.jsonc additions
{
  "durable_objects": {
    "bindings": [
      { "name": "CloudflareDocsAgent", "class_name": "CloudflareDocsAgent" }
    ]
  },
  "migrations": [{ "tag": "v1", "new_sqlite_classes": ["CloudflareDocsAgent"] }],
  "kv_namespaces": [{ "binding": "KV_CONFIGS", "id": "<your-kv-id>" }],
  "d1_databases": [{ "binding": "DB", "database_name": "...", "database_id": "..." }]
}
\`\`\`

## D1 Schema
\`\`\`typescript
// drizzle/schema — cloudflare_docs_interactions
export const cloudflareDocsInteractions = sqliteTable("cloudflare_docs_interactions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  sessionId: text("session_id").notNull(),
  source: text("source").notNull(),
  githubUrl: text("github_url"),
  userPrompt: text("user_prompt").notNull(),
  mcpQuery: text("mcp_query"),
  responseSent: text("response_sent"),
  followUpPrompts: text("follow_up_prompts"),
  provider: text("provider"),
  modelUsed: text("model_used"),
  createdAt: text("created_at").default(sql\`CURRENT_TIMESTAMP\`),
});
\`\`\`

## Implementation Steps
1. Run: \`pnpm add agents @google/genai\`
2. Create \`src/ai/agents/CloudflareDocs.ts\` with the agent class
3. Add Durable Object migration in wrangler.jsonc using \`new_sqlite_classes\`
4. Mount WebSocket handler in Hono: \`app.get("/agents/:agentClass/:agentId", agentFetch)\`
5. Generate D1 migration: \`pnpm drizzle-kit generate\`
6. Build the React chat component using \`useAgent\` hook from \`agents/react\`
7. Run \`wrangler types\` to regenerate worker-configuration.d.ts
`;

// Prompt for API-only integration (no agent rebuild — just call the hosted one)
export const API_ONLY_INTEGRATION_PROMPT = `# Task: Integrate with the Hosted Cloudflare Docs Agent API

## Goal
Add Cloudflare Docs Agent capabilities to this worker WITHOUT building or hosting your own agent.
Instead, proxy user questions to the already-deployed agent at:

  WebSocket: ${WS_ENDPOINT}/{sessionId}

This worker should:
1. Accept user questions (REST or WebSocket)
2. Forward them to the hosted CloudflareDocsAgent Durable Object over WebSocket
3. Stream progress events + final response back to your frontend
4. Pull the shared system prompt for display purposes from:
   GET ${SYSTEM_PROMPT_ENDPOINT}

## Integration Pattern (Cloudflare Worker)

\`\`\`typescript
// src/routes/cf-docs-proxy.ts
import { Hono } from "hono";

const app = new Hono<{ Bindings: Env }>();

/**
 * POST /api/ask-cloudflare
 * Proxies a question to the hosted Cloudflare Docs Agent and returns
 * the streaming result as Server-Sent Events.
 */
app.post("/ask-cloudflare", async (c) => {
  const { message, history = [], context, sessionId } = await c.req.json();

  const agentUrl = \`${WS_ENDPOINT}/\${sessionId ?? crypto.randomUUID()}\`;
  const wsUrl = agentUrl.replace("https://", "wss://").replace("http://", "ws://");

  return new Response(
    new ReadableStream({
      start(controller) {
        const ws = new WebSocket(wsUrl);
        ws.addEventListener("open", () => {
          ws.send(JSON.stringify({ type: "chat", message, history, context, sessionId }));
        });
        ws.addEventListener("message", (evt) => {
          controller.enqueue(new TextEncoder().encode(\`data: \${evt.data}\\n\\n\`));
          const data = JSON.parse(evt.data);
          if (data.type === "result" || data.type === "error") {
            ws.close();
            controller.close();
          }
        });
        ws.addEventListener("error", (e) => controller.error(e));
      }
    }),
    { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" } }
  );
});

export default app;
\`\`\`

## Frontend Integration

\`\`\`typescript
// Minimal React hook to call your proxy endpoint
async function askCloudflareAgent(question: string, sessionId: string) {
  const res = await fetch("/api/ask-cloudflare", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: question, sessionId }),
  });

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const lines = decoder.decode(value).split("\\n\\n").filter(Boolean);
    for (const line of lines) {
      if (line.startsWith("data: ")) {
        const event = JSON.parse(line.slice(6));
        if (event.type === "result") {
          // event.blocks: ContentBlock[] — render these
          // event.followupPrompts: string[]
        }
        if (event.type === "progress") {
          // event.text — show as thinking indicator
        }
      }
    }
  }
}
\`\`\`

## System Prompt Display
To show users the agent's personality / instructions:
\`\`\`typescript
const res = await fetch("${SYSTEM_PROMPT_ENDPOINT}");
const { systemPrompt, source } = await res.json();
\`\`\`

## Notes
- Session continuity: reuse the same \`sessionId\` UUID across messages in the same conversation
- The hosted agent supports repo context: pass \`{ repoUrl: "https://github.com/owner/repo" }\` in the \`context\` field
- No auth required for the GET system-prompt endpoint; WebSocket connections are open
`;

function CopyButton({ text, label, icon: Icon = Copy }: { text: string; label: string; icon?: React.ElementType }) {
    const [copied, setCopied] = useState(false);
    const copy = () => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
        handleGlobalSuccess('Copied', "Copied to clipboard");
    };
    return (
        <Button variant="outline" size="sm" onClick={copy}
            className="gap-1.5 text-xs h-7 border-white/10 hover:bg-white/5">
            {copied ? <CheckCheck className="w-3 h-3 text-emerald-400" /> : <Icon className="w-3 h-3" />}
            {copied ? "Copied!" : label}
        </Button>
    );
}

export function SystemPromptModal({ open, onClose }: Props) {
    const [state, setState] = useState<PromptState | null>(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!open) return;
        setLoading(true);
        fetch("/api/agents/cloudflare-docs/system-prompt")
            .then(r => r.json() as Promise<PromptState>)
            .then(d => setState(d))
            .catch(() => {})
            .finally(() => setLoading(false));
    }, [open]);

    const goToSettings = () => {
        onClose();
        // Navigate to Agent Config tab on the tools page
        window.location.href = "/tools/cloudflare-docs?tab=settings";
    };

    return (
        <Dialog open={open} onOpenChange={v => !v && onClose()}>
            <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col gap-0 p-0 overflow-hidden bg-background border-border/50">
                {/* Header */}
                <div className="px-6 py-4 border-b border-border/30 shrink-0">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-base">
                            <Cloud className="w-4 h-4 text-orange-500" />
                            Cloudflare Docs Agent · System Prompt
                            {state && (
                                <Badge variant="outline" className={`ml-1 text-[10px] px-1.5 py-0 h-4 ${
                                    state.source === "kv"
                                        ? "border-emerald-500/40 text-emerald-400 bg-emerald-500/5"
                                        : "border-blue-500/40 text-blue-400 bg-blue-500/5"
                                }`}>
                                    {state.source === "kv" ? "✦ Custom" : "◈ Default"}
                                </Badge>
                            )}
                        </DialogTitle>
                        <DialogDescription className="text-xs">
                            The system prompt used by the Cloudflare Docs Agent on every conversation.
                            {state?.lastUpdated && (
                                <span className="ml-1 opacity-60">
                                    Last updated: {new Date(state.lastUpdated).toLocaleString()}
                                </span>
                            )}
                        </DialogDescription>
                    </DialogHeader>
                </div>

                <div className="flex-1 overflow-hidden flex flex-col">
                    <ScrollArea className="flex-1">
                        <div className="px-6 py-4 space-y-5">
                            {/* API Endpoint block */}
                            <div className="rounded-xl border border-orange-500/25 bg-orange-500/5 overflow-hidden">
                                <div className="px-4 py-2.5 border-b border-orange-500/15 flex items-center justify-between">
                                    <span className="text-[11px] font-semibold text-orange-300/80 flex items-center gap-1.5">
                                        <Zap className="w-3 h-3" />Public API Endpoint
                                    </span>
                                    <Badge variant="outline" className="text-[9px] px-1.5 h-4 border-orange-500/30 text-orange-400/70">
                                        No auth required · CORS open
                                    </Badge>
                                </div>
                                <div className="px-4 py-3 space-y-3">
                                    <code className="block font-mono text-[11px] text-orange-300 bg-black/30 px-3 py-2.5 rounded-lg break-all leading-relaxed select-all">
                                        GET {SYSTEM_PROMPT_ENDPOINT}
                                    </code>
                                    <div className="flex flex-wrap gap-2">
                                        <CopyButton text={SYSTEM_PROMPT_ENDPOINT} label="Copy endpoint URL" />
                                        <CopyButton
                                            text={FULL_INTEGRATION_PROMPT}
                                            label="Copy: Build full CF Docs Agent in my worker"
                                            icon={Code2}
                                        />
                                        <CopyButton
                                            text={API_ONLY_INTEGRATION_PROMPT}
                                            label="Copy: Use hosted agent via API proxy"
                                            icon={Zap}
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Prompt viewer */}
                            {loading ? (
                                <div className="flex items-center justify-center py-12 text-muted-foreground gap-2">
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    <span className="text-sm">Loading prompt…</span>
                                </div>
                            ) : state ? (
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between">
                                        <label className="text-[11px] font-medium text-muted-foreground">Active System Prompt</label>
                                        <CopyButton text={state.systemPrompt} label="Copy prompt text" />
                                    </div>
                                    <pre className="text-[11px] font-mono leading-relaxed whitespace-pre-wrap bg-muted/20 border border-border/40 rounded-lg px-4 py-3 text-foreground/80 max-h-[38vh] overflow-y-auto">
                                        {state.systemPrompt}
                                    </pre>
                                </div>
                            ) : null}
                        </div>
                    </ScrollArea>
                </div>

                {/* Footer */}
                <div className="px-6 py-3.5 border-t border-border/30 shrink-0 flex justify-between items-center bg-muted/10">
                    <p className="text-[10px] text-muted-foreground/50">
                        Changes to the prompt take effect immediately on the next agent message.
                    </p>
                    <div className="flex gap-2">
                        <Button variant="ghost" size="sm" onClick={onClose} className="text-xs">
                            Close
                        </Button>
                        <Button size="sm" onClick={goToSettings}
                            className="bg-orange-500 hover:bg-orange-600 text-white gap-1.5 text-xs">
                            <Settings2 className="w-3.5 h-3.5" />
                            Update prompt
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
