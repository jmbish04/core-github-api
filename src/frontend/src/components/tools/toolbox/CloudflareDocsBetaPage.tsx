/**
 * @file CloudflareDocsBetaPage.tsx
 * @description Beta chat interface for the Cloudflare Docs Agent.
 *
 * Features (vs. production CloudflareDocsPage):
 *   - Native assistant-ui style: large, readable thread sidebar (w-80)
 *   - Shiki (kanagawa-wave) syntax highlighting
 *   - Built-in CF suggestion prompts on empty thread
 *   - Improved markdown: h1/h2/h3, tables, blockquotes, callouts
 *   - Thinking/progress bar with smooth accordion
 *   - Same WebSocket + localStorage connection strategy as production
 *   - [Beta] badge in header
 *
 * Connection:
 *   WS: ws(s)://host/agents/cloudflare-docs-agent/{sessionId}
 *   Fallback: POST /api/agents/cloudflare-chat
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { useParams } from "react-router-dom";
import { CFCommandCenterNav } from "@/components/cloudflare-chat/CFCommandCenterNav";
import {
    Cloud, Plus, Trash2, Loader2, Send, Square, Check, Copy,
    MessageSquare, Bot, User, Sparkles, ChevronDown, ChevronUp,
    RefreshCw, FileText, Cpu, Server,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import ShikiHighlighter from "react-shiki";
import { handleGlobalError } from "@/lib/error-handler";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { SystemPromptModal } from "@/components/cloudflare-chat/SystemPromptModal";
import {
    loadThreads, createThread, getThread, appendMessage, deleteThread,
    type CFDocsThread,
} from "@/lib/cf-docs-thread-store";

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

// ─── CF Suggestions ────────────────────────────────────────────────────────────

const CF_SUGGESTIONS = [
    {
        title: "D1 + Drizzle ORM",
        label: "Set up a database",
        prompt: "How do I set up Cloudflare D1 with Drizzle ORM in a Worker? Show schema, migrations and query examples.",
    },
    {
        title: "Durable Objects",
        label: "Stateful coordination",
        prompt: "Explain Durable Objects migrations, SQLite storage and how to expose RPC methods.",
    },
    {
        title: "Workers AI Streaming",
        label: "Run inference",
        prompt: "How do I stream responses from Workers AI (Llama 3.3) in a Hono route?",
    },
    {
        title: "Agents SDK",
        label: "Build agentic loops",
        prompt: "Show me how to use the Cloudflare Agents SDK to build a stateful agent with tools and MCP support.",
    },
    {
        title: "R2 Object Storage",
        label: "Files & assets",
        prompt: "How do I upload, retrieve and sign URLs for objects in R2 from a Worker?",
    },
    {
        title: "KV Namespace",
        label: "Global state",
        prompt: "What are best practices for using Workers KV for caching and config, including TTLs and consistency?",
    },
];

// ─── Utilities ─────────────────────────────────────────────────────────────────

function blocksToMarkdown(blocks: ContentBlock[]): string {
    return blocks.map(b => {
        if (b.type === "section_header") return `## ${b.text}`;
        if (b.type === "codeblock") return `\`\`\`${b.language || ""}\n${b.text}\n\`\`\``;
        return b.text;
    }).join("\n\n");
}

function buildWsUrl(sessionId: string): string {
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${proto}//${window.location.host}/agents/cloudflare-docs-agent/${sessionId}`;
}

// ─── Copy Button ───────────────────────────────────────────────────────────────

function CopyButton({ text, label, className }: { text: string; label?: string; className?: string }) {
    const [copied, setCopied] = useState(false);
    return (
        <button
            onClick={() => {
                navigator.clipboard.writeText(text);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
            }}
            className={cn(
                "flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium transition-all",
                copied
                    ? "text-emerald-400 bg-emerald-500/10"
                    : "text-muted-foreground/70 hover:text-foreground hover:bg-white/5",
                className
            )}
        >
            {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            {label ? (copied ? "Copied!" : label) : null}
        </button>
    );
}

// ─── Shiki Code Block ──────────────────────────────────────────────────────────

function CF_CodeBlock({ code, language }: { code: string; language?: string }) {
    const lang = language || "text";
    return (
        <div className="my-4 rounded-xl overflow-hidden border border-[#1a1b26]/60 bg-[#1a1b26] shadow-lg">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/5 bg-white/[0.03]">
                <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-red-500/60" />
                    <span className="w-2.5 h-2.5 rounded-full bg-yellow-500/60" />
                    <span className="w-2.5 h-2.5 rounded-full bg-green-500/60" />
                    <span className="ml-2 text-[10px] font-mono font-semibold uppercase tracking-widest text-[#7aa2f7]/70">
                        {lang}
                    </span>
                </div>
                <CopyButton text={code} label="Copy" />
            </div>
            <ShikiHighlighter
                language={lang}
                theme="tokyo-night"
                showLineNumbers={true}
                addDefaultStyles={false}
                className="[&_pre]:overflow-x-auto [&_pre]:p-4 [&_pre]:text-[0.81rem] [&_pre]:leading-[1.65] [&_pre]:bg-[#1a1b26]! [&_.line-number]:text-[#565f89] [&_.line-number]:select-none [&_.line-number]:pr-4 [&_.line-number]:text-right [&_.line-number]:min-w-[2.5rem] [&_.line-number]:inline-block"
            >
                {code.trim()}
            </ShikiHighlighter>
        </div>
    );
}

// ─── Markdown renderer ─────────────────────────────────────────────────────────

function MarkdownContent({ content }: { content: string }) {
    return (
        <div className="prose prose-sm dark:prose-invert max-w-none text-[13.5px] leading-[1.75] text-foreground/90">
            <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                    h1: ({ children }) => (
                        <h1 className="text-lg font-bold text-foreground mt-6 mb-3 pb-2 border-b border-border/30">
                            {children}
                        </h1>
                    ),
                    h2: ({ children }) => (
                        <h2 className="flex items-center gap-2 text-base font-semibold text-foreground mt-5 mb-2">
                            <span className="inline-block w-1 h-5 rounded-full bg-orange-500/70 shrink-0" />
                            {children}
                        </h2>
                    ),
                    h3: ({ children }) => (
                        <h3 className="text-sm font-semibold text-foreground/90 mt-4 mb-1.5 uppercase tracking-wide">
                            {children}
                        </h3>
                    ),
                    p: ({ children }) => (
                        <p className="my-2 text-foreground/85 leading-relaxed">{children}</p>
                    ),
                    a: ({ href, children }) => (
                        <a
                            href={href}
                            target="_blank"
                            rel="noreferrer"
                            className="text-orange-400 hover:text-orange-300 underline underline-offset-2 decoration-orange-500/30"
                        >
                            {children}
                        </a>
                    ),
                    strong: ({ children }) => (
                        <strong className="font-semibold text-foreground">{children}</strong>
                    ),
                    blockquote: ({ children }) => (
                        <blockquote className="my-3 pl-4 border-l-2 border-orange-500/40 text-muted-foreground italic">
                            {children}
                        </blockquote>
                    ),
                    ul: ({ children }) => (
                        <ul className="my-2 space-y-1 list-none pl-4">{children}</ul>
                    ),
                    ol: ({ children }) => (
                        <ol className="my-2 space-y-1 pl-4 list-decimal">{children}</ol>
                    ),
                    li: ({ children }) => (
                        <li className="flex items-start gap-2 text-foreground/85">
                            <span className="mt-2 w-1.5 h-1.5 rounded-full bg-orange-500/60 shrink-0" />
                            <span>{children}</span>
                        </li>
                    ),
                    table: ({ children }) => (
                        <div className="my-3 overflow-x-auto rounded-lg border border-border/30">
                            <table className="w-full text-xs">{children}</table>
                        </div>
                    ),
                    thead: ({ children }) => (
                        <thead className="bg-muted/40 text-muted-foreground uppercase tracking-wide text-[10px]">
                            {children}
                        </thead>
                    ),
                    th: ({ children }) => (
                        <th className="px-3 py-2 text-left font-semibold">{children}</th>
                    ),
                    td: ({ children }) => (
                        <td className="px-3 py-2 border-t border-border/20">{children}</td>
                    ),
                    code: ({ className, children, ...props }: any) => {
                        const match = /language-(\w+)/.exec(className || "");
                        if (match) {
                            return (
                                <CF_CodeBlock
                                    code={String(children).replace(/\n$/, "")}
                                    language={match[1]}
                                />
                            );
                        }
                        return (
                            <code
                                className="px-1.5 py-0.5 rounded-md bg-orange-500/10 text-orange-300 border border-orange-500/20 text-[0.8em] font-mono"
                                {...props}
                            >
                                {children}
                            </code>
                        );
                    },
                }}
            >
                {content}
            </ReactMarkdown>
        </div>
    );
}

// ─── Block Renderer (for structured agent blocks) ─────────────────────────────

function BlockContent({ blocks }: { blocks: ContentBlock[] }) {
    return (
        <div className="space-y-0 w-full min-w-0">
            {blocks.map((b, i) => {
                if (b.type === "section_header") {
                    return (
                        <h2 key={i} className="flex items-center gap-2 text-base font-semibold text-foreground mt-8 mb-3 pb-1 first:mt-0 border-b border-border/20">
                            <span className="inline-block w-1 h-5 rounded-full bg-orange-500/70 shrink-0" />
                            {b.text}
                        </h2>
                    );
                }
                if (b.type === "codeblock") {
                    return <div key={i} className="mt-3 mb-5"><CF_CodeBlock code={b.text} language={b.language} /></div>;
                }
                return <div key={i} className="mb-1"><MarkdownContent content={b.text} /></div>;
            })}
        </div>
    );
}

// ─── Thinking Bar ──────────────────────────────────────────────────────────────

const STEP_LABELS: Record<string, string> = {
    searching_docs: "Searching Cloudflare documentation…",
    mcp_done: "Found relevant docs",
    querying_ai: "Generating response…",
    ai_done: "Response ready",
    fallback: "Switching to fallback model…",
};

function ThinkingBar({ steps, isRunning }: { steps: ProgressStep[]; isRunning: boolean }) {
    const [expanded, setExpanded] = useState(true);
    if (steps.length === 0 && !isRunning) return null;
    const last = steps[steps.length - 1];
    const summary = isRunning && last
        ? (STEP_LABELS[last.step] ?? last.text)
        : isRunning ? "Thinking…"
        : `Completed (${steps.length} steps)`;

    return (
        <div className="rounded-xl border border-orange-500/20 bg-orange-500/5 overflow-hidden text-xs shadow-sm">
            <button
                onClick={() => setExpanded(e => !e)}
                className="w-full flex items-center gap-2.5 px-4 py-2.5 text-left hover:bg-orange-500/5 transition-colors"
            >
                <div className="w-6 h-6 rounded-full bg-orange-500/15 flex items-center justify-center shrink-0">
                    <Cpu className="w-3 h-3 text-orange-400" />
                </div>
                <span className="flex-1 text-orange-300/90 font-medium">{summary}</span>
                <div className="flex items-center gap-2">
                    {isRunning && <Loader2 className="w-3 h-3 text-orange-400 animate-spin" />}
                    {expanded
                        ? <ChevronUp className="w-3 h-3 text-muted-foreground/50" />
                        : <ChevronDown className="w-3 h-3 text-muted-foreground/50" />
                    }
                </div>
            </button>
            {expanded && steps.length > 0 && (
                <div className="px-4 pb-3 pt-1 border-t border-orange-500/10 space-y-1.5">
                    {steps.map((s, i) => {
                        const isLast = i === steps.length - 1;
                        return (
                            <div key={i} className={cn(
                                "flex items-center gap-2.5 transition-opacity",
                                isLast && !s.done ? "opacity-100" : "opacity-40"
                            )}>
                                {isLast && !s.done
                                    ? <Loader2 className="w-3 h-3 text-orange-400 animate-spin shrink-0" />
                                    : <Check className="w-3 h-3 text-emerald-400 shrink-0" />
                                }
                                <span className="text-muted-foreground text-[11px] leading-tight">
                                    {STEP_LABELS[s.step] ?? s.text}
                                </span>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

// ─── Suggestions Grid ──────────────────────────────────────────────────────────

function SuggestionsGrid({
    onSelect,
    disabled,
}: {
    onSelect: (prompt: string) => void;
    disabled: boolean;
}) {
    return (
        <div className="flex flex-col items-center justify-center h-full gap-8 px-6 py-8">
            <div className="flex flex-col items-center justify-center text-center">
                <div className="w-14 h-14 rounded-2xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center mx-auto shadow-lg shadow-orange-500/5 mb-4">
                    <Cloud className="w-7 h-7 text-orange-400" />
                </div>
                <h1 className="text-2xl font-semibold text-foreground">Welcome!</h1>
                <p className="text-muted-foreground mt-2">How can I help you today? Ask anything about Cloudflare.</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 w-full max-w-3xl">
                {CF_SUGGESTIONS.map((s) => (
                    <button
                        key={s.title}
                        onClick={() => onSelect(s.prompt)}
                        disabled={disabled}
                        className="rounded-lg border p-3 hover:bg-muted text-left flex flex-col transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        <div className="font-medium text-foreground">{s.title}</div>
                        <div className="text-muted-foreground text-sm">{s.label}</div>
                    </button>
                ))}
            </div>
        </div>
    );
}

// ─── Thread Sidebar ────────────────────────────────────────────────────────────

const MAX_BADGES = 3;

function BetaThreadSidebar({
    threads,
    activeId,
    onSelect,
    onNew,
    onDelete,
}: {
    threads: CFDocsThread[];
    activeId: string | null;
    onSelect: (id: string) => void;
    onNew: () => void;
    onDelete: (id: string) => void;
}) {
    const [confirmId, setConfirmId] = useState<string | null>(null);

    return (
        <div className="w-80 border-r flex flex-col shrink-0 bg-muted/5">
            {/* Header */}
            <div className="px-4 py-3.5 border-b flex items-center justify-between shrink-0 bg-background/40 backdrop-blur">
                <div className="flex items-center gap-2">
                    <Server className="w-4 h-4 text-orange-400" />
                    <span className="text-sm font-semibold">CF Docs Chats</span>
                    <Badge className="text-[9px] h-4 px-1.5 bg-orange-500/20 text-orange-300 border-orange-500/30 font-semibold">
                        BETA
                    </Badge>
                </div>
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 hover:bg-orange-500/10 hover:text-orange-400 rounded-lg"
                    onClick={onNew}
                    aria-label="New chat"
                >
                    <Plus className="w-4 h-4" />
                </Button>
            </div>

            {/* Thread list */}
            <ScrollArea className="flex-1">
                {threads.length === 0 ? (
                    <div className="p-6 text-center text-muted-foreground space-y-3">
                        <MessageSquare className="w-9 h-9 mx-auto opacity-15" />
                        <div className="text-xs space-y-1">
                            <p className="font-medium">No chats yet</p>
                            <p className="text-muted-foreground/60">Click + to start a conversation with the Cloudflare Docs Agent.</p>
                        </div>
                    </div>
                ) : (
                    <div className="p-2 space-y-1">
                        {threads.map(t => (
                            <div
                                key={t.id}
                                onClick={() => onSelect(t.id)}
                                className={cn(
                                    "group relative flex flex-col gap-2 p-3 rounded-xl cursor-pointer transition-all",
                                    activeId === t.id
                                        ? "bg-orange-500/10 border border-orange-500/25 shadow-sm"
                                        : "hover:bg-muted/50 border border-transparent"
                                )}
                            >
                                {/* Icon + title row */}
                                <div className="flex items-start gap-2.5 min-w-0">
                                    <div className={cn(
                                        "w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5",
                                        activeId === t.id
                                            ? "bg-orange-500/20 border border-orange-500/30"
                                            : "bg-muted/60 border border-border/30"
                                    )}>
                                        <MessageSquare className={cn(
                                            "w-3.5 h-3.5",
                                            activeId === t.id ? "text-orange-400" : "text-muted-foreground/50"
                                        )} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className={cn(
                                            "text-[13px] font-medium leading-snug truncate",
                                            activeId === t.id ? "text-foreground" : "text-foreground/75"
                                        )}>
                                            {t.title}
                                        </p>
                                        <p className="text-[11px] text-muted-foreground/50 mt-0.5">
                                            {formatDistanceToNow(new Date(t.updatedAt), { addSuffix: true })}
                                            {" · "}{t.messages.length} msg{t.messages.length !== 1 ? "s" : ""}
                                        </p>
                                    </div>
                                </div>

                                {/* Badges */}
                                {(t.repoBadge || t.bindingBadges.length > 0) && (
                                    <div className="flex flex-wrap gap-1 ml-9">
                                        {t.repoBadge && (
                                            <Badge variant="outline" className="text-[10px] px-1.5 py-0.5 h-auto border-orange-500/40 text-orange-400/90 bg-orange-500/5 font-mono">
                                                {t.repoBadge}
                                            </Badge>
                                        )}
                                        {t.bindingBadges.slice(0, MAX_BADGES).map(b => (
                                            <Badge key={b} variant="outline" className="text-[10px] px-1.5 py-0.5 h-auto border-blue-500/40 text-blue-400/90 bg-blue-500/5">
                                                {b}
                                            </Badge>
                                        ))}
                                        {t.bindingBadges.length > MAX_BADGES && (
                                            <Badge variant="outline" className="text-[10px] px-1.5 py-0.5 h-auto border-border/40 text-muted-foreground">
                                                +{t.bindingBadges.length - MAX_BADGES}
                                            </Badge>
                                        )}
                                    </div>
                                )}

                                {/* Delete confirm */}
                                {confirmId === t.id ? (
                                    <div className="absolute top-2 right-2 flex items-center gap-1 z-10">
                                        <button
                                            onClick={e => { e.stopPropagation(); setConfirmId(null); }}
                                            className="px-2 py-0.5 rounded-md text-[10px] text-muted-foreground border border-border/40 bg-card hover:bg-muted"
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            onClick={e => { e.stopPropagation(); onDelete(t.id); setConfirmId(null); }}
                                            className="px-2 py-0.5 rounded-md text-[10px] text-red-400 border border-red-500/30 bg-card hover:bg-red-500/10"
                                        >
                                            Delete
                                        </button>
                                    </div>
                                ) : (
                                    <button
                                        onClick={e => { e.stopPropagation(); setConfirmId(t.id); }}
                                        className="absolute top-2 right-2 p-1.5 rounded-lg opacity-0 group-hover:opacity-100 text-muted-foreground/40 hover:text-red-400 hover:bg-red-500/10 transition-all"
                                        aria-label="Delete thread"
                                    >
                                        <Trash2 className="w-3 h-3" />
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </ScrollArea>
        </div>
    );
}

// ─── Chat Panel ────────────────────────────────────────────────────────────────

function BetaChatPanel({
    defaultOwner,
    defaultRepo,
}: {
    defaultOwner?: string;
    defaultRepo?: string;
}) {
    const defaultRepoUrl = defaultOwner && defaultRepo
        ? `https://github.com/${defaultOwner}/${defaultRepo}`
        : "";

    const [threads, setThreads] = useState<CFDocsThread[]>(() => loadThreads());
    const [activeThread, setActiveThread] = useState<CFDocsThread | null>(null);
    const [input, setInput] = useState("");
    const [loading, setLoading] = useState(false);
    const [progressSteps, setProgressSteps] = useState<ProgressStep[]>([]);
    const [followupPrompts, setFollowupPrompts] = useState<string[]>([]);
    const [wsStatus, setWsStatus] = useState<"connecting" | "open" | "closed" | "error">("connecting");
    const [models, setModels] = useState<Array<{ id: string; name: string; provider: string }>>([]);
    const [selectedModel, setSelectedModel] = useState<string>("gemini-2.5-flash");
    const bottomRef = useRef<HTMLDivElement>(null);
    const wsRef = useRef<WebSocket | null>(null);
    const abortRef = useRef(false);

    // Init first thread
    useEffect(() => {
        const all = loadThreads();
        if (all.length === 0) {
            const t = createThread(defaultRepoUrl || null);
            setThreads(loadThreads());
            setActiveThread(t);
        } else {
            setActiveThread(all[0]);
            setThreads(all);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Sync messages on thread switch
    useEffect(() => {
        setInput("");
        setProgressSteps([]);
        setFollowupPrompts([]);
    }, [activeThread?.id]);

    // Fetch dynamic models list
    useEffect(() => {
        const fetchModels = async () => {
            try {
                // We want gemini models + worker ai models
                const res = await fetch("/api/agents/models?provider=gemini&include_default_workerai_models=true");
                if (res.ok) {
                    const data = await res.json() as any;
                    if (data.success && data.models) {
                        setModels(data.models);
                    }
                }
            } catch (err) {
                console.error("Failed to fetch models", err);
            }
        };
        fetchModels();
    }, []);

    // WS connection
    useEffect(() => {
        if (!activeThread) return;
        if (wsRef.current?.readyState === WebSocket.OPEN) return;

        setWsStatus("connecting");
        const ws = new WebSocket(buildWsUrl(activeThread.id));

        ws.onopen = () => { wsRef.current = ws; setWsStatus("open"); };
        ws.onclose = () => { setWsStatus("closed"); setLoading(false); setProgressSteps([]); };
        ws.onerror = () => { setWsStatus("error"); setLoading(false); setProgressSteps([]); };
        ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data) as any;
                const threadId = activeThread.id;

                if (data.type === "progress") {
                    setProgressSteps(prev => {
                        const updated = prev.map(s => ({ ...s, done: true }));
                        return [...updated, { step: data.step, text: data.text, done: false }];
                    });
                } else if (data.type === "result") {
                    if (abortRef.current) return;
                    const blocks: ContentBlock[] = data.blocks ?? [];
                    const markdown = blocksToMarkdown(blocks);
                    appendMessage(threadId, {
                        role: "assistant",
                        content: markdown,
                        blocks: blocks.length > 0 ? blocks : undefined,
                        followupPrompts: data.followupPrompts ?? [],
                        modelUsed: data.modelUsed,
                    });
                    const updated = getThread(threadId)!;
                    setActiveThread({ ...updated });
                    setThreads(loadThreads());
                    setFollowupPrompts(data.followupPrompts ?? []);
                    setProgressSteps([]);
                    setLoading(false);
                } else if (data.type === "error") {
                    appendMessage(threadId, { role: "assistant", content: `⚠️ ${data.text}` });
                    const updated = getThread(threadId)!;
                    setActiveThread({ ...updated });
                    setProgressSteps([]);
                    setLoading(false);
                }
            } catch (err) {
                handleGlobalError(`[CloudflareDocsBetaPage] Failed to parse WebSocket message: ${err}`);
            }
        };

        wsRef.current = ws;

        return () => {
            ws.onopen = null; ws.onclose = null; ws.onerror = null; ws.onmessage = null;
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeThread?.id]);

    // Auto-scroll
    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [activeThread?.messages?.length, progressSteps.length]);

    const handleNewThread = () => {
        const t = createThread(defaultRepoUrl || null);
        setThreads(loadThreads());
        setActiveThread(t);
        setFollowupPrompts([]);
        setProgressSteps([]);
    };

    const handleSelectThread = (id: string) => {
        const t = getThread(id);
        if (t) { setActiveThread(t); setFollowupPrompts([]); setProgressSteps([]); }
    };

    const handleDeleteThread = (id: string) => {
        deleteThread(id);
        const all = loadThreads();
        setThreads(all);
        if (activeThread?.id === id) setActiveThread(all[0] ?? null);
    };

    const sendMessage = useCallback((text?: string) => {
        const userMsg = (text ?? input).trim();
        if (!userMsg || loading || !activeThread) return;
        if (wsStatus !== "open") return;

        abortRef.current = false;
        setInput("");
        setFollowupPrompts([]);
        setProgressSteps([]);

        appendMessage(activeThread.id, { role: "user", content: userMsg });
        const freshThread = getThread(activeThread.id)!;
        setActiveThread({ ...freshThread });
        setThreads(loadThreads());
        setLoading(true);

        const history = freshThread.messages.slice(0, -1).map(m => ({
            role: m.role === "assistant" ? "model" : "user",
            content: m.content,
        }));

        const ws = wsRef.current;
        if (ws?.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
                type: "chat",
                message: userMsg,
                history,
                context: { repoUrl: (activeThread.repoUrl || defaultRepoUrl) || undefined },
                source: "beta",
                sessionId: activeThread.id,
                model: selectedModel,
            }));
        }
    }, [input, loading, activeThread, wsStatus, defaultRepoUrl, selectedModel]);

    const messages = activeThread ? (getThread(activeThread.id)?.messages ?? []) : [];
    const transcriptMarkdown = messages
        .map(m => m.role === "user" ? `**User:** ${m.content}` : `**Agent:**\n\n${m.content}`)
        .join("\n\n---\n\n");

    return (
        <div className="flex flex-1 min-h-0 overflow-hidden">
            {/* Thread sidebar */}
            <BetaThreadSidebar
                threads={threads}
                activeId={activeThread?.id ?? null}
                onSelect={handleSelectThread}
                onNew={handleNewThread}
                onDelete={handleDeleteThread}
            />

            {/* Chat pane */}
            <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
                {/* Toolbar */}
                <div className="px-4 py-2 border-b flex items-center gap-3 shrink-0 bg-background/30 backdrop-blur">
                    {/* WS status indicator */}
                    <div className="flex items-center gap-1.5">
                        {wsStatus === "connecting" && (
                            <div className="flex items-center gap-1.5 text-yellow-500/80 text-xs">
                                <Loader2 className="w-3 h-3 animate-spin" />
                                <span>Connecting…</span>
                            </div>
                        )}
                        {wsStatus === "open" && (
                            <div className="flex items-center gap-1.5 text-emerald-400 text-xs">
                                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                                <span>Live</span>
                            </div>
                        )}
                        {(wsStatus === "closed" || wsStatus === "error") && (
                            <div className="flex items-center gap-1.5 text-red-400 text-xs">
                                <RefreshCw className="w-3 h-3 animate-spin" />
                                <span>Reconnecting…</span>
                            </div>
                        )}
                    </div>

                    {/* Repo URL */}
                    <div className="flex-1 flex items-center bg-muted/30 border border-border/30 rounded-lg px-3 py-1.5 h-8 min-w-0">
                        <span className="text-[10px] text-muted-foreground mr-2 whitespace-nowrap shrink-0">Repo:</span>
                        <input
                            type="text"
                            placeholder="https://github.com/owner/repo"
                            defaultValue={activeThread?.repoUrl ?? defaultRepoUrl}
                            readOnly={!!(defaultOwner && defaultRepo)}
                            className="bg-transparent border-none outline-none w-full text-xs text-foreground/80 disabled:opacity-60"
                        />
                    </div>

                    {/* Model Select */}
                    <div className="flex items-center bg-muted/30 border border-border/30 rounded-lg px-2 py-1.5 h-8">
                        <Cpu className="w-3.5 h-3.5 text-muted-foreground mr-1.5 shrink-0" />
                        <select
                            value={selectedModel}
                            onChange={(e) => setSelectedModel(e.target.value)}
                            className="bg-transparent border-none outline-none text-[10px] font-semibold text-foreground/80 cursor-pointer focus:ring-0"
                        >
                            {models.map(m => (
                                <option key={m.id} value={m.id} className="bg-background text-foreground">
                                    {m.name}
                                </option>
                            ))}
                            {models.length === 0 && (
                                <option value="gemini-2.5-flash">Gemini 2.5 Flash</option>
                            )}
                        </select>
                    </div>

                    {/* Copy transcript */}
                    {messages.length > 0 && (
                        <CopyButton text={transcriptMarkdown} label="Chat" />
                    )}
                </div>

                {/* Messages area */}
                <div className="flex-1 overflow-y-auto">
                    {messages.length === 0 && !loading ? (
                        <SuggestionsGrid
                            onSelect={sendMessage}
                            disabled={wsStatus !== "open"}
                        />
                    ) : (
                        <div className="px-6 py-6 space-y-6 max-w-4xl mx-auto">
                            {messages.map((msg, i) => {
                                const isUser = msg.role === "user";
                                const isLast = i === messages.length - 1;
                                return (
                                    <div key={(msg as any).id ?? i} className={cn(
                                        "flex items-start gap-3",
                                        isUser ? "justify-end" : "justify-start"
                                    )}>
                                        {/* AI avatar */}
                                        {!isUser && (
                                            <div className="w-8 h-8 rounded-xl bg-orange-500/15 border border-orange-500/25 flex items-center justify-center shrink-0 mt-0.5 shadow-sm">
                                                <Bot className="w-4 h-4 text-orange-400" />
                                            </div>
                                        )}

                                        <div className={cn(
                                            "min-w-0",
                                            isUser ? "max-w-[75%] group" : "flex-1"
                                        )}>
                                            {isUser ? (
                                                // ── User bubble ──────────────────────────────
                                                <div className="relative">
                                                    <div className="px-4 py-3 rounded-2xl rounded-tr-sm bg-orange-500/12 border border-orange-500/20 text-[13.5px] leading-relaxed whitespace-pre-wrap shadow-sm">
                                                        {msg.content}
                                                    </div>
                                                    <div className="flex justify-end mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                        <CopyButton text={msg.content} />
                                                    </div>
                                                </div>
                                            ) : (
                                                // ── AI response ──────────────────────────────
                                                <div className="space-y-2">
                                                    {/* Top copy button (so you can copy without scrolling) */}
                                                    <div className="flex items-center gap-2 mb-2">
                                                        <CopyButton text={msg.content} label="Copy response" />
                                                        {(msg as any).modelUsed && (
                                                            <span className="text-[10px] text-muted-foreground/40 font-mono">
                                                                ↳ {(msg as any).modelUsed}
                                                            </span>
                                                        )}
                                                    </div>

                                                    {(msg as any).blocks && (msg as any).blocks.length > 0
                                                        ? <BlockContent blocks={(msg as any).blocks} />
                                                        : <MarkdownContent content={msg.content} />
                                                    }

                                                    {/* Bottom copy button (easy grab after reading) */}
                                                    <div className="flex items-center gap-2 mt-3 pt-2 border-t border-border/15">
                                                        <CopyButton text={msg.content} label="Copy response" />
                                                        {(msg as any).modelUsed && (
                                                            <span className="text-[10px] text-muted-foreground/40 font-mono">
                                                                ↳ {(msg as any).modelUsed}
                                                            </span>
                                                        )}
                                                    </div>

                                                    {/* Follow-up suggestions */}
                                                    {isLast && !loading && followupPrompts.length > 0 && (
                                                        <div className="mt-4 space-y-2">
                                                            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-muted-foreground/50 font-semibold">
                                                                <Sparkles className="w-3 h-3" />
                                                                Follow-up suggestions
                                                            </div>
                                                            <div className="flex flex-wrap gap-2">
                                                                {followupPrompts.map((p, pi) => (
                                                                    <button
                                                                        key={pi}
                                                                        onClick={() => sendMessage(p)}
                                                                        disabled={loading}
                                                                        className="px-3 py-1.5 rounded-xl border border-orange-500/20 bg-orange-500/5 text-xs text-orange-300/80 hover:bg-orange-500/10 hover:border-orange-500/35 disabled:opacity-40 transition-all text-left"
                                                                    >
                                                                        {p}
                                                                    </button>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>

                                        {/* User avatar */}
                                        {isUser && (
                                            <div className="w-8 h-8 rounded-xl bg-muted border border-border/30 flex items-center justify-center shrink-0 mt-0.5 shadow-sm">
                                                <User className="w-4 h-4 text-muted-foreground/70" />
                                            </div>
                                        )}
                                    </div>
                                );
                            })}

                            {/* Thinking bar */}
                            {(loading || progressSteps.length > 0) && (
                                <div className="ml-11">
                                    <ThinkingBar steps={progressSteps} isRunning={loading} />
                                </div>
                            )}

                            <div ref={bottomRef} />
                        </div>
                    )}
                </div>

                {/* Composer */}
                <div className="px-4 pb-4 pt-2 border-t shrink-0 bg-background/20 backdrop-blur">
                    <div className="max-w-4xl mx-auto">
                        <div className="flex items-end gap-2.5 rounded-2xl border border-border/50 bg-card/70 px-4 py-3 shadow-sm focus-within:border-orange-500/40 focus-within:shadow-orange-500/5 transition-all">
                            <textarea
                                value={input}
                                onChange={e => {
                                    setInput(e.target.value);
                                    const el = e.target;
                                    el.style.height = "auto";
                                    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
                                }}
                                onKeyDown={e => {
                                    if (e.key === "Enter" && !e.shiftKey) {
                                        e.preventDefault();
                                        sendMessage();
                                    }
                                }}
                                disabled={loading || wsStatus !== "open"}
                                placeholder={
                                    wsStatus !== "open"
                                        ? "Connecting to agent…"
                                        : "Ask about Cloudflare Workers, Agents SDK, D1, R2, KV…"
                                }
                                rows={1}
                                style={{ height: "24px" }}
                                className="flex-1 resize-none bg-transparent border-0 outline-none text-[13.5px] leading-relaxed py-0 min-h-[24px] max-h-[200px] disabled:opacity-50 placeholder:text-muted-foreground/35"
                            />
                            {loading ? (
                                <button
                                    onClick={() => {
                                        abortRef.current = true;
                                        setLoading(false);
                                        setProgressSteps([]);
                                    }}
                                    className="p-2 rounded-xl text-red-400 hover:bg-red-500/10 shrink-0 transition-colors"
                                    title="Stop generating"
                                >
                                    <Square className="w-4 h-4" />
                                </button>
                            ) : (
                                <button
                                    onClick={() => sendMessage()}
                                    disabled={!input.trim() || wsStatus !== "open"}
                                    className="p-2 rounded-xl bg-orange-500 hover:bg-orange-600 text-white disabled:opacity-30 disabled:cursor-not-allowed shrink-0 transition-colors shadow-md shadow-orange-500/20"
                                >
                                    <Send className="w-4 h-4" />
                                </button>
                            )}
                        </div>
                        <p className="text-center text-[10px] text-muted-foreground/30 mt-2">
                            ↵ send · ⇧↵ new line · Powered by Gemini 2.5 Flash + Cloudflare MCP · Beta
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function CloudflareDocsBetaPage() {
    const { owner, repo } = useParams();
    const [promptModalOpen, setPromptModalOpen] = useState(false);

    return (
        <>
            <div className="flex flex-col h-full overflow-hidden">
                {/* Shared CF Command Center header with nav strip */}
                <div className="shrink-0 border-b bg-card/30 backdrop-blur px-4 pt-3">
                    <div className="flex items-center justify-between mb-2.5">
                        <div className="flex items-center gap-2">
                            <Cloud className="w-4 h-4 text-orange-500" />
                            <span className="font-semibold text-sm">Cloudflare Command Center</span>
                            {owner && repo && (
                                <span className="text-muted-foreground text-xs font-normal ml-1">&mdash; {owner}/{repo}</span>
                            )}
                        </div>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setPromptModalOpen(true)}
                            className="gap-1.5 text-xs h-7 border-orange-500/30 text-orange-400 hover:bg-orange-500/10 hover:text-orange-300 shrink-0"
                        >
                            <FileText className="w-3 h-3" />
                            System Prompt
                        </Button>
                    </div>

                    {/* Shared nav — chat-beta is active; cross-page links for other tabs */}
                    <CFCommandCenterNav activeTab="chat-beta" />
                </div>

                {/* Chat */}
                <BetaChatPanel defaultOwner={owner} defaultRepo={repo} />
            </div>

            <SystemPromptModal
                open={promptModalOpen}
                onClose={() => setPromptModalOpen(false)}
            />
        </>
    );
}
