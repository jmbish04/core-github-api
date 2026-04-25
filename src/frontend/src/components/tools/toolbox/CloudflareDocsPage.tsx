import { useState, useRef, useEffect, useCallback } from "react";
import { useAgent } from "agents/react";
import {
    Cloud, Loader2, Database, HardDrive,
    Camera, ChevronRight, RefreshCw,
    Server, Box, Network, Copy, CheckCheck, Sparkles, Check,
    MessageSquare, Plus, Trash2, Bot, User, Cpu, FileText,
} from "lucide-react";
import { ChatComposer } from "@/components/cloudflare-chat/ChatComposer";
import { CFCommandCenterNav } from "@/components/cloudflare-chat/CFCommandCenterNav";
import { formatDistanceToNow } from "date-fns";
import { PrismLight as SyntaxHighlighter } from "react-syntax-highlighter";
import oneDark from "react-syntax-highlighter/dist/esm/styles/prism/one-dark";
import ReactMarkdown from "react-markdown";
import {
    loadThreads, createThread, getThread, appendMessage, deleteThread,
    type CFDocsThread,
} from "@/lib/cf-docs-thread-store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { SystemPromptEditor } from "@/components/cloudflare-chat/SystemPromptEditor";
import { SystemPromptModal } from "@/components/cloudflare-chat/SystemPromptModal";
import { handleGlobalError } from '@/lib/error-handler';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";

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

// ─── Helpers ───────────────────────────────────────────────────────────────────

function blocksToMarkdown(blocks: ContentBlock[]): string {
    return blocks.map(b => {
        if (b.type === "section_header") return `## ${b.text}`;
        if (b.type === "codeblock") return `\`\`\`${b.language || ""}\n${b.text}\n\`\`\``;
        return b.text;
    }).join("\n\n");
}

// ─── Copy button ───────────────────────────────────────────────────────────────
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
            title={label ? `Copy ${label}` : "Copy to clipboard"}
            className="flex items-center gap-1 px-1.5 py-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors text-xs"
        >
            {copied
                ? <><CheckCheck className={size === "xs" ? "w-3 h-3" : "w-3.5 h-3.5"} />{label && " Copied"}</>
                : <><Copy className={size === "xs" ? "w-3 h-3" : "w-3.5 h-3.5"} />{label && ` ${label}`}</>
            }
        </button>
    );
}

// ─── Block renderer ────────────────────────────────────────────────────────────

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
            <div className="my-3 rounded-lg overflow-hidden border border-border/40 bg-[#1a1a2e]">
                <div className="flex items-center justify-between px-3 py-1.5 border-b border-white/5 bg-white/[0.03]">
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
    // Text block — render markdown; intercept fenced code blocks to add copy buttons
    return (
        <div className="prose prose-sm dark:prose-invert max-w-none text-sm text-foreground/90 leading-relaxed">
            <ReactMarkdown
                components={{
                    code: ({ className, children, ...props }: any) => {
                        if (className?.includes("language-")) {
                            const lang = className.replace("language-", "") || "text";
                            const codeText = String(children).replace(/\n$/, "");
                            return (
                                <div className="my-3 rounded-lg overflow-hidden border border-border/40 bg-[#1a1a2e]">
                                    <div className="flex items-center justify-between px-3 py-1.5 border-b border-white/5 bg-white/[0.03]">
                                        <span className="text-[10px] font-mono font-semibold uppercase tracking-widest text-orange-400/80">{lang}</span>
                                        <CopyButton text={codeText} size="xs" label="Copy" />
                                    </div>
                                    <SyntaxHighlighter
                                        language={lang}
                                        style={oneDark as any}
                                        customStyle={{ margin: 0, padding: "0.85rem", fontSize: "0.78rem", lineHeight: 1.6, background: "transparent", overflowX: "auto" }}
                                        wrapLongLines={false}
                                        showLineNumbers={codeText.split("\n").length > 5}
                                    >
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

const MAX_BADGES = 3;

function ThreadSidebar({ threads, activeId, onSelect, onNew, onDelete }: {
    threads: CFDocsThread[];
    activeId: string | null;
    onSelect: (id: string) => void;
    onNew: () => void;
    onDelete: (id: string) => void;
}) {
    const [confirmId, setConfirmId] = useState<string | null>(null);
    return (
        <div className="w-56 border-r flex flex-col shrink-0 bg-muted/5">
            <div className="px-3 py-2.5 border-b flex items-center justify-between shrink-0">
                <span className="text-[10px] font-semibold text-muted-foreground/70 uppercase tracking-wider">Threads</span>
                <button onClick={onNew} aria-label="New thread"
                    className="p-1 rounded hover:bg-orange-500/10 hover:text-orange-400 text-muted-foreground transition-colors">
                    <Plus className="w-3.5 h-3.5" />
                </button>
            </div>
            <div className="flex-1 overflow-y-auto">
                {threads.length === 0 ? (
                    <div className="p-4 text-center text-xs text-muted-foreground/50 space-y-1.5">
                        <MessageSquare className="w-5 h-5 mx-auto opacity-20" />
                        <p>No threads yet.<br />Click + to start.</p>
                    </div>
                ) : (
                    <div className="p-1.5 space-y-0.5">
                        {threads.map(t => (
                            <div key={t.id} onClick={() => onSelect(t.id)}
                                className={`group relative flex flex-col gap-1 p-2 rounded-lg cursor-pointer transition-all ${
                                    activeId === t.id
                                        ? "bg-orange-500/10 border border-orange-500/20"
                                        : "hover:bg-muted/40 border border-transparent"
                                }`}
                            >
                                <p className={`text-[11px] font-medium truncate leading-tight ${activeId === t.id ? "text-foreground" : "text-foreground/75"}`}>
                                    {t.title}
                                </p>
                                <p className="text-[9px] text-muted-foreground/50">
                                    {formatDistanceToNow(new Date(t.updatedAt), { addSuffix: true })}
                                </p>
                                <div className="flex flex-wrap gap-1">
                                    {t.repoBadge && (
                                        <Badge variant="outline" className="text-[8px] px-1 py-0 h-3 border-orange-500/40 text-orange-400/80 bg-orange-500/5 font-mono">{t.repoBadge}</Badge>
                                    )}
                                    {t.bindingBadges.slice(0, MAX_BADGES).map(b => (
                                        <Badge key={b} variant="outline" className="text-[8px] px-1 py-0 h-3 border-blue-500/40 text-blue-400/80 bg-blue-500/5">{b}</Badge>
                                    ))}
                                    {t.bindingBadges.length > MAX_BADGES && (
                                        <Badge variant="outline" className="text-[8px] px-1 py-0 h-3 border-border/40 text-muted-foreground">+{t.bindingBadges.length - MAX_BADGES}</Badge>
                                    )}
                                </div>
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

// ─── Progress indicator ────────────────────────────────────────────────────────

const STEP_LABELS: Record<string, string> = {
    searching_docs: "Searching Cloudflare docs",
    mcp_done: "Found documentation context",
    querying_ai: "Querying AI model",
    ai_done: "Response generated",
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
                    {isRunning && last ? (STEP_LABELS[last.step] ?? last.text) : isRunning ? "Thinking…" : `Done (${steps.length} steps)`}
                </span>
                {isRunning && <Loader2 className="w-3 h-3 text-orange-400 animate-spin shrink-0" />}
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

// ─── Chat Panel ────────────────────────────────────────────────────────────────

function ChatPanel({ defaultOwner, defaultRepo, source = "global-tools", locked = false }: {
    defaultOwner?: string;
    defaultRepo?: string;
    source?: string;
    locked?: boolean;
}) {
    const isLocked = locked || !!(defaultOwner && defaultRepo);
    const defaultRepoUrl = defaultOwner && defaultRepo ? `https://github.com/${defaultOwner}/${defaultRepo}` : "";

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
    const messagesRef = useRef(activeThread?.messages ?? []);
    const wsStatusRef = useRef(wsStatus);
    wsStatusRef.current = wsStatus;

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

    useEffect(() => {
        const fetchModels = async () => {
            try {
                const res = await fetch("/api/agents/models?provider=gemini&include_default_workerai_models=true&filter=structured_response");
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

    useEffect(() => {
        const t = activeThread ? getThread(activeThread.id) : null;
        messagesRef.current = t?.messages ?? [];
        setInput("");
        setProgressSteps([]);
        setFollowupPrompts([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeThread?.id]);

    const sessionId = activeThread?.id ?? "init";
    const agent = useAgent({
        agent: "cloudflare-docs-agent",
        name: sessionId,
        onOpen() { setWsStatus("open"); },
        onClose() {
            setWsStatus("closed");
            if (loading) {
                handleGlobalError("The agent connection was closed unexpectedly.");
                setProgressSteps([]);
                setLoading(false);
            }
        },
        onError() {
            setWsStatus("error");
            if (loading) {
                handleGlobalError("Failed to connect to the Cloudflare Docs Agent.");
                setProgressSteps([]);
                setLoading(false);
            }
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
                    setActiveThread({ ...updated });
                    messagesRef.current = updated.messages;
                    setThreads(loadThreads());
                    setFollowupPrompts(data.followupPrompts ?? []);
                    setProgressSteps([]);
                    setLoading(false);
                } else if (data.type === "error" && activeThread) {
                    appendMessage(activeThread.id, { role: "assistant", content: `⚠️ ${data.text}` });
                    const updated = getThread(activeThread.id)!;
                    setActiveThread({ ...updated });
                    setProgressSteps([]);
                    setLoading(false);
                }
            } catch (err) {
                handleGlobalError(`[CloudflareDocsTool] Failed to parse WebSocket message: ${err}`);
            }
        },
    } as any);

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
        if (wsStatusRef.current !== "open") return;

        setInput("");
        setFollowupPrompts([]);
        setProgressSteps([]);

        appendMessage(activeThread.id, { role: "user", content: userMsg });
        const updated = getThread(activeThread.id)!;
        setActiveThread({ ...updated });
        messagesRef.current = updated.messages;
        setThreads(loadThreads());
        setLoading(true);

        const history = messagesRef.current.slice(0, -1).map(m => ({
            role: m.role === "assistant" ? "model" : "user",
            content: m.content,
        }));

        (agent as any).send(JSON.stringify({
            type: "chat",
            message: userMsg,
            history,
            context: { repoUrl: (activeThread.repoUrl || defaultRepoUrl) || undefined },
            source,
            sessionId: activeThread.id,
            model: selectedModel,
        }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [input, loading, activeThread, agent, source, defaultRepoUrl]);

    const messages = activeThread ? (getThread(activeThread.id)?.messages ?? []) : [];
    const transcriptMarkdown = messages
        .map(m => m.role === "user" ? `**User:** ${m.content}` : `**Agent:**\n\n${m.content}`)
        .join("\n\n---\n\n");

    return (
        // flex row: thread sidebar | chat pane — fills all available vertical space
        <div className="flex flex-1 min-h-0 overflow-hidden">
            <ThreadSidebar
                threads={threads}
                activeId={activeThread?.id ?? null}
                onSelect={handleSelectThread}
                onNew={handleNewThread}
                onDelete={handleDeleteThread}
            />

            {/* Chat pane */}
            <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

                {/* Toolbar: WS status + repo URL + copy transcript */}
                <div className="px-3 py-1.5 border-b flex items-center gap-2 shrink-0">
                    {wsStatus === "connecting" && (
                        <div className="flex items-center gap-1 text-yellow-500/80 text-[10px]">
                            <Loader2 className="w-2.5 h-2.5 animate-spin" /> Connecting…
                        </div>
                    )}
                    {wsStatus === "open" && (
                        <div className="flex items-center gap-1 text-emerald-500/80 text-[10px]">
                            <Check className="w-2.5 h-2.5" /> Live
                        </div>
                    )}
                    {(wsStatus === "closed" || wsStatus === "error") && (
                        <div className="flex items-center gap-1 text-red-500/80 text-[10px]">
                            <RefreshCw className="w-2.5 h-2.5 animate-spin" /> Reconnecting…
                        </div>
                    )}
                    <div className="flex-1 flex items-center bg-muted/30 border border-border/40 rounded-md px-2 py-1 h-7">
                        <span className="text-[10px] text-muted-foreground mr-1.5 whitespace-nowrap shrink-0">Repo:</span>
                        <input
                            type="text"
                            placeholder="https://github.com/owner/repo"
                            value={activeThread?.repoUrl ?? defaultRepoUrl}
                            readOnly={isLocked || !activeThread}
                            className="bg-transparent border-none outline-none w-full text-[11px] disabled:opacity-60"
                        />
                        {isLocked && <Badge variant="secondary" className="text-[9px] px-1 py-0 h-4 ml-1 shrink-0">Locked</Badge>}
                    </div>
                    {messages.length > 0 && (
                        <CopyButton text={transcriptMarkdown} size="xs" label="Copy chat" />
                    )}
                </div>

                {/* Persistent Alert for WS Connection Failure */}
                {(wsStatus === "closed" || wsStatus === "error") && (
                    <div className="px-4 pt-4 border-b border-border/40 bg-muted/10 shrink-0">
                        <Alert variant="destructive" className="bg-destructive/10 border-destructive/20 py-2">
                            <AlertCircle className="h-4 w-4" />
                            <AlertTitle className="text-xs font-semibold">Connection Lost</AlertTitle>
                            <AlertDescription className="text-xs text-destructive/90">
                                The real-time connection to the Cloudflare Docs Agent was disconnected. Please refresh or check your network.
                            </AlertDescription>
                        </Alert>
                    </div>
                )}

                {/* Messages scroll area */}
                <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
                    {messages.length === 0 && !loading ? (
                        <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground gap-3">
                            <Cloud className="w-10 h-10 opacity-15" />
                            <p className="text-sm font-medium">Ask anything about Cloudflare</p>
                            <div className="flex flex-wrap justify-center gap-2">
                                {["How do I set up D1 with Drizzle?", "Durable Objects migrations?", "Stream from Workers AI?"].map(q => (
                                    <button key={q} onClick={() => sendMessage(q)} disabled={wsStatus !== "open"}
                                        className="px-3 py-1.5 rounded-full border border-orange-500/20 bg-orange-500/5 text-xs text-orange-300/80 hover:bg-orange-500/10 transition-all disabled:opacity-30">
                                        {q}
                                    </button>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <>
                            {messages.map((msg, i) => {
                                const isUser = msg.role === "user";
                                const isLast = i === messages.length - 1;
                                return (
                                    <div key={(msg as any).id ?? i} className={`flex items-start gap-2.5 ${isUser ? "justify-end" : "justify-start"}`}>
                                        {!isUser && (
                                            <div className="w-5 h-5 rounded-full bg-orange-500/20 border border-orange-500/30 flex items-center justify-center shrink-0 mt-0.5">
                                                <Bot className="w-2.5 h-2.5 text-orange-400" />
                                            </div>
                                        )}
                                        <div className={`min-w-0 ${isUser ? "max-w-[75%] group" : "flex-1 space-y-1"}`}>
                                            {isUser ? (
                                                // ── User bubble ─────────────────────────────────
                                                <div className="relative">
                                                    <div className="px-3.5 py-2.5 rounded-2xl rounded-tr-sm bg-orange-500/15 border border-orange-500/20 text-sm whitespace-pre-wrap">
                                                        {msg.content}
                                                    </div>
                                                    {/* Per-user-bubble copy — visible on hover */}
                                                    <div className="flex justify-end mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                                        <CopyButton text={msg.content} size="xs" />
                                                    </div>
                                                </div>
                                            ) : (
                                                // ── AI bubble ───────────────────────────────────
                                                <>
                                                    <div className="space-y-1">
                                                        {(msg as any).blocks && (msg as any).blocks.length > 0
                                                            ? (msg as any).blocks.map((b: ContentBlock, bi: number) => <BlockRenderer key={bi} block={b} />)
                                                            : <p className="text-sm whitespace-pre-wrap text-foreground/90 leading-relaxed">{msg.content}</p>
                                                        }
                                                    </div>
                                                    {/* Per-AI-bubble copy + model tag */}
                                                    <div className="flex items-center gap-2 mt-1">
                                                        <CopyButton text={msg.content} size="xs" label="Copy" />
                                                        {(msg as any).modelUsed && <span className="text-[9px] text-muted-foreground/40 font-mono">↳ {(msg as any).modelUsed}</span>}
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
                                            <div className="w-5 h-5 rounded-full bg-muted flex items-center justify-center shrink-0 mt-0.5">
                                                <User className="w-2.5 h-2.5 text-muted-foreground" />
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                            {(loading || progressSteps.length > 0) && (
                                <div className="ml-7">
                                    <ThinkingBar steps={progressSteps} isRunning={loading} />
                                </div>
                            )}
                        </>
                    )}
                    <div ref={bottomRef} />
                </div>

                {/* Composer */}
                <div className="px-3 pb-3 pt-2 border-t shrink-0">
                    <ChatComposer
                        onSend={sendMessage}
                        isRunning={loading}
                        onCancel={() => setLoading(false)}
                        disabled={wsStatus !== "open" || !activeThread}
                    />
                    <div className="flex items-center justify-between mt-1.5 px-1">
                        <select 
                            value={selectedModel}
                            onChange={e => setSelectedModel(e.target.value)}
                            className="bg-transparent border border-border/40 text-[10px] text-muted-foreground/80 rounded px-1.5 py-0.5 outline-none focus:border-orange-500/40"
                        >
                            {models.length > 0 ? models.map(m => (
                                <option key={m.id} value={m.id} className="bg-[#1a1a2e]">{m.name}</option>
                            )) : (
                                <option value="gemini-2.5-flash" className="bg-[#1a1a2e]">Gemini 2.5 Flash (Recommended)</option>
                            )}
                        </select>
                        <p className="text-[9px] text-muted-foreground/30">↵ send · ⇧↵ new line · threads persist locally</p>
                    </div>
                </div>
            </div>
        </div>
    );
}

// ─── Resource browser ──────────────────────────────────────────────────────────

type ResourceType = 'workers' | 'd1' | 'kv' | 'r2' | 'hyperdrive';
const RESOURCE_CONFIG: Record<ResourceType, { label: string; icon: any; toolName: string }> = {
    workers:    { label: 'Workers',    icon: Server,    toolName: 'cf_worker_list' },
    d1:         { label: 'D1',         icon: Database,  toolName: 'cf_d1_list' },
    kv:         { label: 'KV',         icon: HardDrive, toolName: 'cf_kv_list' },
    r2:         { label: 'R2',         icon: Box,       toolName: 'cf_r2_list' },
    hyperdrive: { label: 'Hyperdrive', icon: Network,   toolName: 'cf_hyperdrive_list' },
};

function ResourceBrowser() {
    const [active, setActive] = useState<ResourceType>('workers');
    const [data, setData] = useState<Record<ResourceType, any[] | null>>({
        workers: null, d1: null, kv: null, r2: null, hyperdrive: null
    });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchResource = async (type: ResourceType) => {
        setActive(type);
        if (data[type] !== null) return;
        setLoading(true);
        setError(null);
        try {
            const res = await fetch('/api/cloudflare/resources', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tool: RESOURCE_CONFIG[type].toolName })
            });
            if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
            const json = await res.json() as any;
            setData(prev => ({ ...prev, [type]: Array.isArray(json.result) ? json.result : [json.result].filter(Boolean) }));
        } catch (e: any) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    };

    const refresh = () => { setData(prev => ({ ...prev, [active]: null })); fetchResource(active); };

    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => { fetchResource('workers'); }, []);

    const items = data[active];

    return (
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
            <div className="flex items-center gap-2 flex-wrap">
                {(Object.entries(RESOURCE_CONFIG) as [ResourceType, typeof RESOURCE_CONFIG[ResourceType]][]).map(([key, cfg]) => {
                    const Icon = cfg.icon;
                    return (
                        <Button key={key} variant={active === key ? "default" : "outline"} size="sm" className="gap-2" onClick={() => fetchResource(key)}>
                            <Icon className="w-3.5 h-3.5" /> {cfg.label}
                        </Button>
                    );
                })}
                <Button variant="ghost" size="sm" className="ml-auto gap-2" onClick={refresh} disabled={loading}>
                    <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
                </Button>
            </div>
            {error && <div className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md px-3 py-2">{error}</div>}
            <ScrollArea className="h-[400px] border rounded-lg bg-muted/20">
                {loading ? (
                    <div className="flex items-center justify-center h-full pt-16">
                        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                    </div>
                ) : !items ? null : items.length === 0 ? (
                    <div className="flex items-center justify-center text-muted-foreground text-sm pt-16">
                        No {RESOURCE_CONFIG[active].label} resources found.
                    </div>
                ) : (
                    <div className="divide-y">
                        {items.map((item: any, idx: number) => (
                            <div key={idx} className="px-4 py-3 hover:bg-muted/40 transition-colors">
                                <div className="flex items-center justify-between">
                                    <span className="text-sm font-medium">{item.name || item.title || item.id || `Item ${idx + 1}`}</span>
                                    <ChevronRight className="w-4 h-4 text-muted-foreground" />
                                </div>
                                {item.id && item.id !== item.name && (
                                    <span className="text-xs text-muted-foreground font-mono">{item.id}</span>
                                )}
                                {item.script_tag && (
                                    <Badge variant="outline" className="mt-1 text-xs">{item.script_tag}</Badge>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </ScrollArea>
        </div>
    );
}

// ─── Browser rendering ─────────────────────────────────────────────────────────

function BrowserRenderTab() {
    const [url, setUrl] = useState("");
    const [mode, setMode] = useState<'screenshot' | 'markdown' | 'scrape'>('screenshot');
    const [result, setResult] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const run = async () => {
        if (!url.trim()) return;
        setLoading(true);
        setResult(null);
        setError(null);
        try {
            const res = await fetch(`/api/cloudflare/browser/${mode}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url })
            });
            if (!res.ok) throw new Error(`${res.status} - ${await res.text()}`);
            const data = await res.json() as any;
            setResult(typeof data === 'string' ? data : JSON.stringify(data, null, 2));
        } catch (e: any) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
            <div className="flex gap-2">
                <input
                    type="text"
                    placeholder="https://example.com"
                    value={url}
                    onChange={e => setUrl(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && run()}
                    className="flex-1 border border-border/50 rounded-md px-3 py-2 text-sm bg-background outline-none focus:border-primary/60"
                />
                <Button onClick={run} disabled={loading || !url.trim()} className="gap-2 shrink-0">
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
                    Render
                </Button>
            </div>
            <div className="flex gap-2">
                {(['screenshot', 'markdown', 'scrape'] as const).map(m => (
                    <Button key={m} size="sm" variant={mode === m ? 'default' : 'outline'} className="capitalize" onClick={() => setMode(m)}>{m}</Button>
                ))}
            </div>
            {error && <div className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md px-3 py-2">{error}</div>}
            {result && (
                mode === 'screenshot' && result.startsWith('data:image') ? (
                    <img src={result} alt="Screenshot" className="w-full rounded-lg border" />
                ) : (
                    <ScrollArea className="h-[500px] border rounded-lg bg-muted/20">
                        <pre className="p-4 text-xs whitespace-pre-wrap">{result}</pre>
                    </ScrollArea>
                )
            )}
        </div>
    );
}

// ─── Main page export ──────────────────────────────────────────────────────────

export default function CloudflareDocsPage() {
    const pathParts = window.location.pathname.split("/");
    const isProjectCtx = pathParts[1] === "project";
    const owner = isProjectCtx ? pathParts[2] : undefined;
    const repo  = isProjectCtx ? pathParts[3] : undefined;

    const [promptModalOpen, setPromptModalOpen] = useState(false);
    const [activeTab, setActiveTab] = useState<string>(() => {
        const urlTab = new URLSearchParams(window.location.search).get("tab") ?? "chat";
        return ["chat", "resources", "browser", "settings"].includes(urlTab) ? urlTab : "chat";
    });

    return (
        <>
        {/*
          The entire page is a flex column.
          - Sub-header row (title + tablist) = shrink-0, auto height
          - Tab content area = flex-1 min-h-0, fills remaining vertical space
          The parent (RootLayout outlet) is `flex-1 overflow-hidden`, so h-full works.
        */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col h-full overflow-hidden">

            {/* ── Sub-header: title bar + shared nav strip ────────────────── */}
            <div className="shrink-0 border-b bg-card/30 backdrop-blur px-4 pt-3">
                <div className="flex items-center justify-between mb-2.5">
                    <div className="flex items-center gap-2">
                        <Cloud className="w-4 h-4 text-orange-500" />
                        <span className="font-semibold text-sm">Cloudflare Command Center</span>
                        {owner && repo && (
                            <span className="text-muted-foreground text-xs font-normal ml-1">— {owner}/{repo}</span>
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

                {/* Shared nav — Docs Agent is active; internal tabs wired via onTabChange */}
                <CFCommandCenterNav
                    activeTab={activeTab as any}
                    useInternalTabs={true}
                    onTabChange={setActiveTab}
                />
            </div>

            {/* ── Content panels — fill remaining height ─────────────────── */}

            {/* Chat: thread sidebar + chat pane side-by-side */}
            <TabsContent value="chat" className="flex-1 min-h-0 m-0 data-[state=active]:flex overflow-hidden">
                <ChatPanel defaultOwner={owner} defaultRepo={repo} />
            </TabsContent>

            {/* Resources: scrollable list */}
            <TabsContent value="resources" className="flex-1 min-h-0 m-0 data-[state=active]:flex flex-col overflow-hidden">
                <ResourceBrowser />
            </TabsContent>

            {/* Browser render */}
            <TabsContent value="browser" className="flex-1 min-h-0 m-0 data-[state=active]:flex flex-col overflow-hidden">
                <BrowserRenderTab />
            </TabsContent>

            {/* Agent config / system prompt editor */}
            <TabsContent value="settings" className="flex-1 min-h-0 m-0 overflow-y-auto p-6">
                <SystemPromptEditor />
            </TabsContent>

        </Tabs>

        <SystemPromptModal open={promptModalOpen} onClose={() => setPromptModalOpen(false)} />
        </>
    );
}
