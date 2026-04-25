/**
 * @file frontend/src/components/tools/AgentFactoryTool.tsx
 * @description Agent Factory Workshop — a specialized chat interface that connects
 * to the CloudflareDocsAgent for generating Cloudflare Worker/Agent blueprints,
 * schemas, and architectural patterns. Inspired by the "Agent Factory Workshop"
 * Stitch design. Fully responsive (mobile + desktop), Shadcn dark theme.
 */
import { useState, useEffect, useRef, useCallback } from "react";
import { useAgent } from "agents/react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
    Bot, User, Cpu, Loader2, Plus, Trash2,
    MessageSquare, Check, RefreshCw, Copy, CheckCheck, Sparkles,
    Database, Layers, Rocket, BarChart3,
    ArrowRight, ChevronDown, ChevronUp, Factory
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { PrismLight as SyntaxHighlighter } from "react-syntax-highlighter";
import oneDark from "react-syntax-highlighter/dist/esm/styles/prism/one-dark";
import ReactMarkdown from "react-markdown";
import {
    loadThreads, createThread, getThread, appendMessage, deleteThread,
    type CFDocsThread,
} from "@/lib/cf-docs-thread-store";
import { handleGlobalError } from "@/lib/error-handler";
import { ChatComposer } from "@/components/cloudflare-chat/ChatComposer";
import { cn } from "@/lib/utils";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface ContentBlock {
    type: "section_header" | "text" | "codeblock";
    text: string;
    language?: string;
}

interface ProgressStep {
    step: string;
    text: string;
    done: boolean;
}

// ─── Suggested Prompts by Specialist Area ─────────────────────────────────────

type WorkshopArea = "agent" | "data" | "rag" | "deploy" | "analytics";

const WORKSHOP_AREAS: Record<WorkshopArea, {
    label: string;
    icon: React.ElementType;
    color: string;
    accent: string;
    prompts: string[];
}> = {
    agent: {
        label: "Agent Factory",
        icon: Factory,
        color: "text-orange-400",
        accent: "border-orange-500/40 bg-orange-500/5 hover:bg-orange-500/15",
        prompts: [
            "Generate a Cloudflare Agent with tool-calling and memory",
            "How do I implement stateful Durable Object agents?",
            "Create an MCP server with Zod-typed tools",
            "Agent-to-Agent RPC pattern with WorkflowEntrypoint",
        ],
    },
    data: {
        label: "Data Workshop",
        icon: Database,
        color: "text-blue-400",
        accent: "border-blue-500/40 bg-blue-500/5 hover:bg-blue-500/15",
        prompts: [
            "D1 + Drizzle ORM schema with migrations",
            "Hono RPC route with Zod validation",
            "Multi-table relational D1 schema for SaaS",
            "Drizzle-kit migration workflow for Workers",
        ],
    },
    rag: {
        label: "RAG Studio",
        icon: Layers,
        color: "text-purple-400",
        accent: "border-purple-500/40 bg-purple-500/5 hover:bg-purple-500/15",
        prompts: [
            "Vectorize + Workers AI RAG pipeline",
            "Hybrid search with D1 + Vectorize",
            "Chunking strategy for code documentation",
            "Embed and upsert GitHub files to Vectorize",
        ],
    },
    deploy: {
        label: "Deployment",
        icon: Rocket,
        color: "text-emerald-400",
        accent: "border-emerald-500/40 bg-emerald-500/5 hover:bg-emerald-500/15",
        prompts: [
            "wrangler.jsonc bindings for D1 + Vectorize + AI",
            "CI/CD deployment script for Cloudflare Workers",
            "Environment secrets management pattern",
            "Preview deployments with wrangler dev",
        ],
    },
    analytics: {
        label: "Analytics",
        icon: BarChart3,
        color: "text-amber-400",
        accent: "border-amber-500/40 bg-amber-500/5 hover:bg-amber-500/15",
        prompts: [
            "Workers Analytics Engine for agentic tracing",
            "Real-time logging to D1 from Worker",
            "Health check endpoint with structured JSON",
            "Monitoring pattern for Durable Object agents",
        ],
    },
};

// ─── Helpers ───────────────────────────────────────────────────────────────────

function blocksToMarkdown(blocks: ContentBlock[]): string {
    return blocks.map(b => {
        if (b.type === "section_header") return `## ${b.text}`;
        if (b.type === "codeblock") return `\`\`\`${b.language || ""}\n${b.text}\n\`\`\``;
        return b.text;
    }).join("\n\n");
}

// ─── Copy Button ───────────────────────────────────────────────────────────────

function CopyButton({ text, size = "sm", label }: { text: string; size?: "sm" | "xs"; label?: string }) {
    const [copied, setCopied] = useState(false);
    const copy = () => {
        navigator.clipboard.writeText(text).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    };
    return (
        <button
            onClick={copy}
            title="Copy"
            className="flex items-center gap-1 px-1.5 py-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors text-xs"
        >
            {copied
                ? <><CheckCheck className={size === "xs" ? "w-3 h-3" : "w-3.5 h-3.5"} />{label && " Copied"}</>
                : <><Copy className={size === "xs" ? "w-3 h-3" : "w-3.5 h-3.5"} />{label && ` ${label}`}</>
            }
        </button>
    );
}

// ─── Block Renderer ────────────────────────────────────────────────────────────

function BlockRenderer({ block }: { block: ContentBlock }) {
    if (block.type === "section_header") {
        return (
            <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground mt-5 mb-2 first:mt-0">
                <span className="inline-block w-1 h-4 rounded-full bg-orange-500/70 shrink-0" />
                {block.text}
            </h3>
        );
    }
    if (block.type === "codeblock") {
        const lang = block.language || "text";
        return (
            <div className="my-3 rounded-lg overflow-hidden border border-border/40 bg-[#0d0d1a]">
                <div className="flex items-center justify-between px-3 py-1.5 border-b border-white/5 bg-white/[0.02]">
                    <span className="text-[10px] font-mono font-semibold uppercase tracking-widest text-orange-400/80">{lang}</span>
                    <CopyButton text={block.text} size="xs" label="Copy" />
                </div>
                <SyntaxHighlighter
                    language={lang}
                    style={oneDark as any}
                    customStyle={{ margin: 0, padding: "0.85rem", fontSize: "0.78rem", lineHeight: 1.6, background: "transparent", overflowX: "auto" }}
                    wrapLongLines={false}
                    showLineNumbers={block.text.split("\n").length > 5}
                >
                    {block.text}
                </SyntaxHighlighter>
            </div>
        );
    }
    return (
        <div className="prose prose-sm dark:prose-invert max-w-none text-sm text-foreground/90 leading-relaxed">
            <ReactMarkdown
                components={{
                    code: ({ className, children, ...props }: any) => {
                        if (className?.includes("language-")) {
                            const lang = className.replace("language-", "") || "text";
                            const codeText = String(children).replace(/\n$/, "");
                            return (
                                <div className="my-2 rounded-lg overflow-hidden border border-border/40 bg-[#0d0d1a]">
                                    <div className="flex items-center justify-between px-3 py-1 border-b border-white/5">
                                        <span className="text-[10px] font-mono uppercase tracking-widest text-orange-400/70">{lang}</span>
                                        <CopyButton text={codeText} size="xs" />
                                    </div>
                                    <SyntaxHighlighter language={lang} style={oneDark as any}
                                        customStyle={{ margin: 0, padding: "0.75rem", fontSize: "0.78rem", background: "transparent" }}>
                                        {codeText}
                                    </SyntaxHighlighter>
                                </div>
                            );
                        }
                        return <code className="px-1.5 py-0.5 rounded bg-muted text-orange-400 text-[0.8em] font-mono" {...props}>{children}</code>;
                    },
                    ol: ({ children, ...props }: any) => <ol className="list-decimal list-inside space-y-1 my-2" {...props}>{children}</ol>,
                    ul: ({ children, ...props }: any) => <ul className="list-disc list-inside space-y-1 my-2" {...props}>{children}</ul>,
                }}
            >
                {block.text}
            </ReactMarkdown>
        </div>
    );
}

// ─── Thread Sidebar ────────────────────────────────────────────────────────────

function ThreadSidebar({ threads, activeId, onSelect, onNew, onDelete }: {
    threads: CFDocsThread[];
    activeId: string | null;
    onSelect: (id: string) => void;
    onNew: () => void;
    onDelete: (id: string) => void;
}) {
    const [confirmId, setConfirmId] = useState<string | null>(null);
    return (
        <div className="flex flex-col h-full">
            <div className="px-3 py-2.5 border-b border-border/50 flex items-center justify-between shrink-0">
                <span className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wider">Sessions</span>
                <button onClick={onNew} aria-label="New session"
                    className="p-1 rounded hover:bg-orange-500/10 hover:text-orange-400 text-muted-foreground transition-colors">
                    <Plus className="w-3.5 h-3.5" />
                </button>
            </div>
            <div className="flex-1 overflow-y-auto">
                {threads.length === 0 ? (
                    <div className="p-4 text-center text-xs text-muted-foreground/40 space-y-2">
                        <Factory className="w-5 h-5 mx-auto opacity-20" />
                        <p>No sessions yet.<br />Click + to begin.</p>
                    </div>
                ) : (
                    <div className="p-1.5 space-y-0.5">
                        {threads.map(t => (
                            <div key={t.id} onClick={() => onSelect(t.id)}
                                className={cn(
                                    "group relative flex flex-col gap-1 p-2 rounded-lg cursor-pointer transition-all",
                                    activeId === t.id
                                        ? "bg-orange-500/10 border border-orange-500/20"
                                        : "hover:bg-muted/30 border border-transparent"
                                )}
                            >
                                <p className={cn("text-[11px] font-medium leading-tight break-words line-clamp-2", activeId === t.id ? "text-foreground" : "text-foreground/70")}>
                                    {t.title}
                                </p>
                                <p className="text-[9px] text-muted-foreground/40">
                                    {formatDistanceToNow(new Date(t.updatedAt), { addSuffix: true })}
                                </p>
                                {confirmId === t.id ? (
                                    <div className="absolute top-1 right-1 flex gap-1 z-10">
                                        <button onClick={e => { e.stopPropagation(); setConfirmId(null); }}
                                            className="px-1 py-0.5 rounded text-[8px] border border-border/40 text-muted-foreground bg-card">Cancel</button>
                                        <button onClick={e => { e.stopPropagation(); onDelete(t.id); setConfirmId(null); }}
                                            className="px-1 py-0.5 rounded text-[8px] border border-red-500/30 text-red-400 bg-card">Del</button>
                                    </div>
                                ) : (
                                    <button onClick={e => { e.stopPropagation(); setConfirmId(t.id); }}
                                        className="absolute top-1 right-1 p-0.5 rounded opacity-0 group-hover:opacity-100 text-muted-foreground/30 hover:text-red-400 hover:bg-red-500/10 transition-all">
                                        <Trash2 className="w-2.5 h-2.5" />
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

// ─── Thinking Bar ──────────────────────────────────────────────────────────────

const STEP_LABELS: Record<string, string> = {
    searching_docs: "Searching Cloudflare docs",
    mcp_done: "Found documentation context",
    querying_ai: "Querying Gemini Pro",
    ai_done: "Blueprint generated",
    fallback: "Switching to Workers AI",
};

function ThinkingBar({ steps, isRunning }: { steps: ProgressStep[]; isRunning: boolean }) {
    const [expanded, setExpanded] = useState(true);
    if (steps.length === 0 && !isRunning) return null;
    const last = steps[steps.length - 1];
    return (
        <div className="rounded-lg border border-orange-500/20 bg-orange-500/5 overflow-hidden text-xs">
            <button onClick={() => setExpanded(e => !e)} className="w-full flex items-center gap-2 px-3 py-2 text-left">
                <Cpu className="w-3 h-3 text-orange-400 shrink-0" />
                <span className="flex-1 text-orange-300/80 font-medium truncate">
                    {isRunning && last ? (STEP_LABELS[last.step] ?? last.text) : isRunning ? "Generating blueprint…" : `Done (${steps.length} steps)`}
                </span>
                {isRunning && <Loader2 className="w-3 h-3 text-orange-400 animate-spin shrink-0" />}
                {expanded ? <ChevronUp className="w-3 h-3 text-muted-foreground/40" /> : <ChevronDown className="w-3 h-3 text-muted-foreground/40" />}
            </button>
            {expanded && steps.length > 0 && (
                <div className="px-3 pb-2 space-y-1 border-t border-orange-500/10">
                    {steps.map((s, i) => {
                        const isLast = i === steps.length - 1;
                        return (
                            <div key={i} className={`flex items-start gap-2 pt-1 ${isLast && !s.done ? "opacity-100" : "opacity-50"}`}>
                                {isLast && !s.done
                                    ? <Loader2 className="w-2.5 h-2.5 text-orange-400 animate-spin shrink-0 mt-0.5" />
                                    : <Check className="w-2.5 h-2.5 text-emerald-400 shrink-0 mt-0.5" />}
                                <span className="text-muted-foreground leading-tight">{s.text}</span>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

// ─── Workshop Suggestions Panel ────────────────────────────────────────────────

function WorkshopSuggestions({ onSelect, disabled }: { onSelect: (p: string) => void; disabled?: boolean }) {
    const [activeArea, setActiveArea] = useState<WorkshopArea>("agent");
    const area = WORKSHOP_AREAS[activeArea];

    return (
        <div className="flex flex-col items-center justify-center h-full px-4 py-6 gap-6 max-w-2xl mx-auto w-full">
            {/* Header */}
            <div className="text-center space-y-2">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-orange-500/15 border border-orange-500/30 mb-1">
                    <Factory className="w-6 h-6 text-orange-400" />
                </div>
                <h2 className="text-lg font-semibold text-foreground">Agent Factory Workshop</h2>
                <p className="text-sm text-muted-foreground max-w-sm">
                    Generate Cloudflare Worker blueprints, agent architectures, and deployment patterns using Gemini Pro.
                </p>
            </div>

            {/* Workshop Area Tabs */}
            <div className="flex flex-wrap justify-center gap-2 w-full">
                {(Object.entries(WORKSHOP_AREAS) as [WorkshopArea, typeof WORKSHOP_AREAS[WorkshopArea]][]).map(([key, cfg]) => {
                    const Icon = cfg.icon;
                    const isActive = key === activeArea;
                    return (
                        <button
                            key={key}
                            onClick={() => setActiveArea(key)}
                            className={cn(
                                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all",
                                isActive ? cfg.accent + " " + cfg.color : "border-border/40 text-muted-foreground hover:border-border hover:text-foreground"
                            )}
                        >
                            <Icon className="w-3.5 h-3.5" />
                            {cfg.label}
                        </button>
                    );
                })}
            </div>

            {/* Prompt Pills */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full">
                {area.prompts.map((p, i) => (
                    <button
                        key={i}
                        onClick={() => onSelect(p)}
                        disabled={disabled}
                        className={cn(
                            "group flex items-start gap-2.5 p-3 rounded-xl border text-left text-sm transition-all disabled:opacity-30",
                            area.accent,
                            area.color
                        )}
                    >
                        <ArrowRight className="w-3.5 h-3.5 mt-0.5 shrink-0 opacity-50 group-hover:opacity-100 transition-opacity" />
                        <span className="text-foreground/80 group-hover:text-foreground transition-colors text-[12px] leading-relaxed">{p}</span>
                    </button>
                ))}
            </div>
        </div>
    );
}

// ─── Main AgentFactoryTool ─────────────────────────────────────────────────────

export function AgentFactoryTool() {
    const [threads, setThreads] = useState<CFDocsThread[]>(() => loadThreads());
    const [activeThread, setActiveThread] = useState<CFDocsThread | null>(null);
    const [models, setModels] = useState<Array<{ id: string; name: string }>>([]);
    const [selectedModel, setSelectedModel] = useState<string>("gemini-2.5-pro");
    const [loading, setLoading] = useState(false);
    const [progressSteps, setProgressSteps] = useState<ProgressStep[]>([]);
    const [followupPrompts, setFollowupPrompts] = useState<string[]>([]);
    const [wsStatus, setWsStatus] = useState<"connecting" | "open" | "closed" | "error">("connecting");
    const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

    const bottomRef = useRef<HTMLDivElement>(null);
    const wsStatusRef = useRef(wsStatus);
    useEffect(() => {
        wsStatusRef.current = wsStatus;
    }, [wsStatus]);

    // Thread key for agent scope — use different prefix to isolate from CloudflareDocsTool

    // Fetch models – prefer Gemini Pro models
    useEffect(() => {
        const fetchModels = async () => {
            try {
                const res = await fetch("/api/agents/models?provider=gemini&filter=structured_response&include_default_workerai_models=true");
                const data = await res.json() as any;
                if (data.success && data.models?.length > 0) {
                    setModels(data.models);
                    // Default to Gemini pro if available
                    const pro = data.models.find((m: any) => m.id.includes("pro"));
                    if (pro) setSelectedModel(pro.id);
                }
            } catch (e: any) {
                handleGlobalError(e instanceof Error ? e : new Error(`[AgentFactoryTool] Failed to fetch models: ${e}`));
            }
        };
        fetchModels();
    }, []);

    // Auto-load last thread on mount
    useEffect(() => {
        const all = loadThreads();
        if (all.length > 0) {
            setActiveThread(all[0]);
            setThreads(all);
        }
    }, []);

    const updateActiveThread = useCallback((t: CFDocsThread) => {
        setActiveThread(t);
        setThreads(loadThreads());
    }, []);

    // ── WebSocket Agent ─────────────────────────────────────────────────────────
    const sessionId = activeThread?.id ?? "agent-factory-init";
    const agent = useAgent({
        agent: "cloudflare-docs-agent",
        name: sessionId,
        onOpen() { setWsStatus("open"); },
        onClose() {
            setWsStatus("closed");
            if (loading) { setProgressSteps([]); setLoading(false); }
        },
        onError() {
            setWsStatus("error");
            if (loading) { setProgressSteps([]); setLoading(false); }
        },
        onMessage(event: MessageEvent) {
            try {
                const data = JSON.parse(event.data);
                if (data.type === "progress") {
                    setProgressSteps(prev => {
                        const updated = prev.map(s => ({ ...s, done: true }));
                        return [...updated, { step: data.step, text: data.text, done: false }];
                    });
                } else if (data.type === "result" && activeThread) {
                    const blocks: ContentBlock[] = data.blocks ?? [];
                    const markdown = blocksToMarkdown(blocks);
                    appendMessage(activeThread.id, {
                        role: "assistant",
                        content: markdown,
                        blocks: blocks.length > 0 ? blocks : undefined,
                        followupPrompts: data.followupPrompts ?? [],
                        modelUsed: data.modelUsed,
                    });
                    const updated = getThread(activeThread.id)!;
                    updateActiveThread({ ...updated });
                    setFollowupPrompts(data.followupPrompts ?? []);
                    setProgressSteps([]);
                    setLoading(false);
                } else if (data.type === "error" && activeThread) {
                    appendMessage(activeThread.id, { role: "assistant", content: `⚠️ ${data.text}` });
                    const updated = getThread(activeThread.id)!;
                    updateActiveThread({ ...updated });
                    setProgressSteps([]);
                    setLoading(false);
                }
            } catch (e: unknown) { handleGlobalError(new Error(`[AgentFactoryTool] WebSocket malformed JSON: ${e instanceof Error ? e.message : String(e)}`)); }
        },
    } as any);

    // Auto-scroll
    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [activeThread?.messages?.length, progressSteps.length]);

    const handleNewThread = useCallback(() => {
        const t = createThread(null);
        setThreads(loadThreads());
        setActiveThread(t);
        setFollowupPrompts([]);
        setProgressSteps([]);
        setMobileSidebarOpen(false);
    }, []);

    const handleSelectThread = useCallback((id: string) => {
        const t = getThread(id);
        if (t) { setActiveThread(t); setFollowupPrompts([]); setProgressSteps([]); }
        setMobileSidebarOpen(false);
    }, []);

    const handleDeleteThread = useCallback((id: string) => {
        deleteThread(id);
        const all = loadThreads();
        setThreads(all);
        if (activeThread?.id === id) setActiveThread(all[0] ?? null);
    }, [activeThread]);

    const sendMessage = useCallback((text: string) => {
        const userMsg = text.trim();
        if (!userMsg || loading || wsStatusRef.current !== "open") return;

        // Create a thread on first message if none active
        let thread = activeThread;
        if (!thread) {
            thread = createThread(null);
            setThreads(loadThreads());
            setActiveThread(thread);
        }

        setFollowupPrompts([]);
        setProgressSteps([]);
        appendMessage(thread.id, { role: "user", content: userMsg });
        const updated = getThread(thread.id)!;
        updateActiveThread({ ...updated });
        setLoading(true);

        const history = updated.messages.slice(0, -1).map(m => ({
            role: m.role === "assistant" ? "model" : "user",
            content: m.content,
        }));

        (agent as any).send(JSON.stringify({
            type: "chat",
            message: userMsg,
            history,
            context: { repoUrl: undefined },
            source: "agent-factory",
            sessionId: thread.id,
            model: selectedModel,
        }));
    }, [loading, activeThread, agent, selectedModel, updateActiveThread]);

    const messages = activeThread ? (getThread(activeThread.id)?.messages ?? []) : [];

    const wsIndicator = {
        connecting: <><Loader2 className="w-2.5 h-2.5 animate-spin" /><span>Connecting</span></>,
        open: <><Check className="w-2.5 h-2.5" /><span>Live</span></>,
        closed: <><RefreshCw className="w-2.5 h-2.5 animate-spin" /><span>Reconnecting</span></>,
        error: <><RefreshCw className="w-2.5 h-2.5 animate-spin" /><span>Error</span></>,
    }[wsStatus];

    const wsColor = {
        connecting: "text-yellow-500/80",
        open: "text-emerald-500/80",
        closed: "text-red-500/80",
        error: "text-red-500/80",
    }[wsStatus];

    return (
        <Card className="w-full h-full flex flex-col border-none shadow-none bg-transparent">
            <CardHeader className="px-0 pb-3 shrink-0">
                <div className="flex items-start justify-between gap-3">
                    <div>
                        <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                            <div className="w-7 h-7 rounded-lg bg-orange-500/15 border border-orange-500/30 flex items-center justify-center shrink-0">
                                <Factory className="w-4 h-4 text-orange-400" />
                            </div>
                            Agent Factory Workshop
                        </CardTitle>
                        <CardDescription className="mt-0.5 text-xs sm:text-sm">
                            Generate Worker blueprints · Agent architectures · D1 schemas · RAG pipelines
                        </CardDescription>
                    </div>
                    {/* Mobile sidebar toggle */}
                    <Button
                        variant="outline"
                        size="sm"
                        className="sm:hidden gap-1.5 text-xs h-7 border-border/50 shrink-0"
                        onClick={() => setMobileSidebarOpen(o => !o)}
                    >
                        <MessageSquare className="w-3 h-3" />
                        Sessions
                    </Button>
                </div>
            </CardHeader>

            <CardContent className="px-0 flex-1 flex flex-col min-h-0 relative">
                <div className="flex flex-1 min-h-0 border border-border/40 rounded-xl overflow-hidden bg-card/30">

                    {/* Sidebar — hidden on mobile unless toggled */}
                    <div className={cn(
                        "absolute inset-y-0 left-0 z-20 w-56 bg-background border-r border-border/50 transition-transform duration-200 sm:static sm:translate-x-0 sm:z-auto sm:flex sm:flex-col sm:w-52 sm:shrink-0",
                        mobileSidebarOpen ? "translate-x-0" : "-translate-x-full"
                    )}>
                        <ThreadSidebar
                            threads={threads}
                            activeId={activeThread?.id ?? null}
                            onSelect={handleSelectThread}
                            onNew={handleNewThread}
                            onDelete={handleDeleteThread}
                        />
                    </div>
                    {/* Mobile backdrop */}
                    {mobileSidebarOpen && (
                        <div className="absolute inset-0 z-10 bg-black/50 sm:hidden" onClick={() => setMobileSidebarOpen(false)} />
                    )}

                    {/* Main Chat Area */}
                    <div className="flex-1 flex flex-col min-w-0 min-h-0">
                        {/* Toolbar */}
                        <div className="px-3 py-1.5 border-b border-border/40 flex items-center gap-2 shrink-0 bg-muted/5">
                            <div className={cn("flex items-center gap-1 text-[10px] font-medium", wsColor)}>
                                {wsIndicator}
                            </div>
                            <Separator orientation="vertical" className="h-3 mx-1" />
                            <div className="flex items-center gap-1.5 bg-muted/30 border border-border/40 rounded-md px-2 py-1 h-6">
                                <Cpu className="w-2.5 h-2.5 text-muted-foreground shrink-0" />
                                <select
                                    value={selectedModel}
                                    onChange={e => setSelectedModel(e.target.value)}
                                    className="bg-transparent border-none outline-none text-[10px] font-medium text-foreground cursor-pointer focus:ring-0 max-w-[140px]"
                                >
                                    {models.length > 0 ? models.map(m => (
                                        <option key={m.id} value={m.id} className="bg-background text-foreground">{m.name}</option>
                                    )) : (
                                        <option value="gemini-2.5-pro" className="bg-background">Gemini 2.5 Pro</option>
                                    )}
                                </select>
                            </div>
                            <div className="ml-auto flex items-center gap-1">
                                <button onClick={handleNewThread}
                                    className="hidden sm:flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium border border-border/40 text-muted-foreground hover:border-orange-500/40 hover:text-orange-400 transition-all">
                                    <Plus className="w-2.5 h-2.5" /> New
                                </button>
                            </div>
                        </div>

                        {/* Messages */}
                        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5 min-h-0">
                            {messages.length === 0 && !loading ? (
                                <WorkshopSuggestions
                                    onSelect={sendMessage}
                                    disabled={wsStatus !== "open"}
                                />
                            ) : (
                                <>
                                    {messages.map((msg, i) => {
                                        const isUser = msg.role === "user";
                                        const isLast = i === messages.length - 1;
                                        return (
                                            <div key={(msg as any).id ?? i} className={cn(
                                                "flex items-start gap-2.5",
                                                isUser ? "justify-end" : "justify-start"
                                            )}>
                                                {!isUser && (
                                                    <div className="w-6 h-6 rounded-lg bg-orange-500/15 border border-orange-500/30 flex items-center justify-center shrink-0 mt-0.5">
                                                        <Bot className="w-3 h-3 text-orange-400" />
                                                    </div>
                                                )}
                                                <div className={cn(
                                                    "min-w-0",
                                                    isUser
                                                        ? "max-w-[80%] px-3.5 py-2.5 rounded-2xl rounded-tr-sm bg-orange-500/10 border border-orange-500/20 text-sm whitespace-pre-wrap text-foreground/90"
                                                        : "flex-1 space-y-1"
                                                )}>
                                                    {isUser ? msg.content : (
                                                        <>
                                                            <div className="space-y-1">
                                                                {(msg as any).blocks && (msg as any).blocks.length > 0
                                                                    ? (msg as any).blocks.map((b: ContentBlock, bi: number) => <BlockRenderer key={bi} block={b} />)
                                                                    : <p className="text-sm whitespace-pre-wrap text-foreground/90 leading-relaxed">{msg.content}</p>
                                                                }
                                                            </div>
                                                            <div className="flex items-center gap-2 mt-1.5">
                                                                <CopyButton text={msg.content} size="xs" label="Copy" />
                                                                {(msg as any).modelUsed && (
                                                                    <span className="text-[9px] text-muted-foreground/40 font-mono">↳ {(msg as any).modelUsed}</span>
                                                                )}
                                                            </div>
                                                            {isLast && !loading && followupPrompts.length > 0 && (
                                                                <div className="mt-3 space-y-1.5">
                                                                    <div className="flex items-center gap-1 text-[9px] uppercase tracking-widest text-muted-foreground/50 font-medium">
                                                                        <Sparkles className="w-2.5 h-2.5" /> Follow-ups
                                                                    </div>
                                                                    <div className="flex flex-wrap gap-1.5">
                                                                        {followupPrompts.map((p, pi) => (
                                                                            <button key={pi} onClick={() => sendMessage(p)} disabled={loading}
                                                                                className="px-2.5 py-1 rounded-full border border-orange-500/20 bg-orange-500/5 text-[11px] text-orange-300/80 hover:bg-orange-500/15 hover:border-orange-500/40 disabled:opacity-40 transition-all text-left">
                                                                                {p}
                                                                            </button>
                                                                        ))}
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </>
                                                    )}
                                                </div>
                                                {isUser && (
                                                    <div className="w-6 h-6 rounded-lg bg-muted border border-border/40 flex items-center justify-center shrink-0 mt-0.5">
                                                        <User className="w-3 h-3 text-muted-foreground" />
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                    {(loading || progressSteps.length > 0) && (
                                        <div className="ml-8">
                                            <ThinkingBar steps={progressSteps} isRunning={loading} />
                                        </div>
                                    )}
                                </>
                            )}
                            <div ref={bottomRef} />
                        </div>

                        {/* Composer */}
                        <div className="px-3 pb-3 pt-2 border-t border-border/40 shrink-0">
                            <ChatComposer
                                onSend={sendMessage}
                                isRunning={loading}
                                onCancel={() => { setLoading(false); setProgressSteps([]); }}
                                disabled={wsStatus !== "open"}
                            />
                            <p className="text-center text-[9px] text-muted-foreground/25 mt-1.5">
                                ↵ send · ⇧↵ new line · Gemini Pro + Workers AI fallback · sessions persist locally
                            </p>
                        </div>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}

export default AgentFactoryTool;
