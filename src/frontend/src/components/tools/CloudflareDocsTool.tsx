import { useState, useEffect, useRef, useCallback } from "react";
import { useAgent } from "agents/react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
    Cloud, Loader2, Send, Package2, Database, HardDrive,
    Globe, Camera, ChevronRight, RefreshCw, Activity,
    Server, Box, Network, Copy, CheckCheck, Sparkles, Check,
    MessageSquare, Plus, Trash2, Bot, User, Cpu, Square, Settings, FileText,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { PrismLight as SyntaxHighlighter } from "react-syntax-highlighter";
import oneDark from "react-syntax-highlighter/dist/esm/styles/prism/one-dark";
import ReactMarkdown from "react-markdown";
import {
    loadThreads, createThread, getThread, appendMessage, deleteThread,
    type CFDocsThread,
} from "@/lib/cf-docs-thread-store";
import { SystemPromptEditor } from "@/components/cloudflare-chat/SystemPromptEditor";
import { SystemPromptModal } from "@/components/cloudflare-chat/SystemPromptModal";

import { handleGlobalError } from "@/lib/error-handler";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface CloudflareDocsToolProps {
    defaultOwner?: string;
    defaultRepo?: string;
    source?: string;
    locked?: boolean;
}

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
    return (
        <div className="prose prose-sm dark:prose-invert max-w-none text-sm text-foreground/90 leading-relaxed">
            <ReactMarkdown
                components={{
                    code: ({ className, children, ...props }: any) => {
                        if (className?.includes("language-")) return <code className={className} {...props}>{children}</code>;
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

// ─── Chat Tab ──────────────────────────────────────────────────────────────────

function ChatTab({ defaultOwner, defaultRepo, source = "global-tools", locked = false }: CloudflareDocsToolProps) {
    const isLocked = locked || !!(defaultOwner && defaultRepo);
    const defaultRepoUrl = defaultOwner && defaultRepo ? `https://github.com/${defaultOwner}/${defaultRepo}` : "";

    const [threads, setThreads] = useState<CFDocsThread[]>(() => loadThreads());
    const [activeThread, setActiveThread] = useState<CFDocsThread | null>(null);
    const [availableModels, setAvailableModels] = useState<Array<{ id: string; name: string }>>([]);
    const [selectedModel, setSelectedModel] = useState("gemini-2.5-flash");
    const [input, setInput] = useState("");
    const [loading, setLoading] = useState(false);
    const [progressSteps, setProgressSteps] = useState<ProgressStep[]>([]);
    const [followupPrompts, setFollowupPrompts] = useState<string[]>([]);
    const [wsStatus, setWsStatus] = useState<"connecting" | "open" | "closed" | "error">("connecting");

    // Fetch available models
    useEffect(() => {
        const fetchModels = async () => {
            try {
                // We want gemini models + worker ai models
                const res = await fetch("/api/agents/models?provider=gemini&include_default_workerai_models=true");
                const data = await res.json() as any;
                if (data.success) {
                    setAvailableModels(data.models || []);
                }
            } catch (err) {
                console.error("Failed to fetch models for CF Docs tool:", err);
            }
        };
        fetchModels();
    }, []);

    const bottomRef = useRef<HTMLDivElement>(null);
    const messagesRef = useRef(activeThread?.messages ?? []);
    const wsStatusRef = useRef(wsStatus);
    wsStatusRef.current = wsStatus;

    // On mount: auto-create or load existing thread
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

    // Sync when active thread changes (keyed on ID only — other thread fields are irrelevant)
    const activeThreadId = activeThread?.id;
    useEffect(() => {
        const t = activeThreadId ? getThread(activeThreadId) : null;
        messagesRef.current = t?.messages ?? [];
        setInput("");
        setProgressSteps([]);
        setFollowupPrompts([]);
    }, [activeThreadId]);

    // ── useAgent WebSocket ─────────────────────────────────────────────────────
    const sessionId = activeThread?.id ?? "init";
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
            } catch (e: unknown) { handleGlobalError(new Error(`WebSocket malformed JSON: ${e instanceof Error ? e.message : String(e)}`)); }
        },
    } as any);

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
    }, [input, loading, activeThread, agent, source, defaultRepoUrl, selectedModel]);

    const messages = activeThread ? (getThread(activeThread.id)?.messages ?? []) : [];
    const transcriptMarkdown = messages
        .map(m => m.role === "user" ? `**User:** ${m.content}` : `**Agent:**\n\n${m.content}`)
        .join("\n\n---\n\n");

    return (
        <div className="flex h-full min-h-0">
            {/* Thread sidebar */}
            <ThreadSidebar
                threads={threads}
                activeId={activeThread?.id ?? null}
                onSelect={handleSelectThread}
                onNew={handleNewThread}
                onDelete={handleDeleteThread}
            />

            {/* Chat pane */}
            <div className="flex-1 flex flex-col min-w-0 min-h-0">
                {/* Status + repo toolbar */}
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
                    
                    <div className="flex-1 flex items-center gap-2">
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

                        <div className="flex items-center bg-muted/30 border border-border/40 rounded-md px-2 py-1 h-7">
                            <Cpu className="w-3 h-3 text-muted-foreground mr-1.5 shrink-0" />
                            <select 
                                value={selectedModel} 
                                onChange={(e) => setSelectedModel(e.target.value)}
                                className="bg-transparent border-none outline-none text-[10px] font-medium text-foreground cursor-pointer focus:ring-0"
                            >
                                {availableModels.map(m => (
                                    <option key={m.id} value={m.id} className="bg-background text-foreground">{m.name}</option>
                                ))}
                                {availableModels.length === 0 && (
                                    <option value="gemini-2.5-flash">Gemini 2.5 Flash</option>
                                )}
                            </select>
                        </div>
                    </div>

                    {messages.length > 0 && (
                        <CopyButton text={transcriptMarkdown} size="xs" label="Copy chat" />
                    )}
                </div>

                {/* Messages */}
                <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5 min-h-0">
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
                                        <div className={`min-w-0 ${isUser
                                            ? "max-w-[75%] px-3.5 py-2.5 rounded-2xl rounded-tr-sm bg-orange-500/15 border border-orange-500/20 text-sm whitespace-pre-wrap"
                                            : "flex-1 space-y-1"
                                        }`}>
                                            {isUser ? msg.content : (
                                                <>
                                                    <div className="space-y-1">
                                                        {(msg as any).blocks && (msg as any).blocks.length > 0
                                                            ? (msg as any).blocks.map((b: ContentBlock, bi: number) => <BlockRenderer key={bi} block={b} />)
                                                            : <p className="text-sm whitespace-pre-wrap text-foreground/90 leading-relaxed">{msg.content}</p>
                                                        }
                                                    </div>
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
                    <div className="flex items-end gap-2 rounded-xl border border-border/60 bg-card/60 px-3 py-2 focus-within:border-orange-500/40 transition-colors">
                        <textarea
                            value={input}
                            onChange={e => {
                                setInput(e.target.value);
                                const el = e.target;
                                el.style.height = "auto";
                                el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
                            }}
                            onKeyDown={e => {
                                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
                            }}
                            disabled={loading || wsStatus !== "open"}
                            placeholder={wsStatus !== "open" ? "Connecting…" : "Ask about Cloudflare Workers, D1, R2, Agents…"}
                            rows={1}
                            className="flex-1 resize-none bg-transparent border-0 outline-none text-sm leading-relaxed py-0.5 min-h-[22px] max-h-[150px] disabled:opacity-50 placeholder:text-muted-foreground/40"
                            style={{ height: "22px" }}
                        />
                        {loading ? (
                            <button onClick={() => setLoading(false)} className="p-1.5 rounded-lg text-red-400 hover:bg-red-500/10 shrink-0">
                                <Square className="w-3.5 h-3.5" />
                            </button>
                        ) : (
                            <button onClick={() => sendMessage()} disabled={!input.trim() || wsStatus !== "open"}
                                className="p-1.5 rounded-lg bg-orange-500 hover:bg-orange-600 text-white disabled:opacity-30 disabled:cursor-not-allowed shrink-0 transition-colors">
                                <Send className="w-3.5 h-3.5" />
                            </button>
                        )}
                    </div>
                    <p className="text-center text-[9px] text-muted-foreground/30 mt-1">↵ send · ⇧↵ new line · Gemini 2.5 Flash + Workers AI fallback · threads persist locally</p>
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

    const refresh = () => {
        setData(prev => ({ ...prev, [active]: null }));
        fetchResource(active);
    };

    useEffect(() => { fetchResource('workers'); // eslint-disable-next-line react-hooks/exhaustive-deps -- one-time mount fetch; fetchResource depends on mutable `data` state
    }, []);

    const items = data[active];

    return (
        <div className="space-y-4">
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
        <div className="space-y-4">
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
                    <ScrollArea className="h-[380px] border rounded-lg bg-muted/20">
                        <pre className="p-4 text-xs whitespace-pre-wrap">{result}</pre>
                    </ScrollArea>
                )
            )}
        </div>
    );
}

// ─── Main export ───────────────────────────────────────────────────────────────
export function CloudflareDocsTool({ defaultOwner, defaultRepo, source = "global-tools", locked = false }: CloudflareDocsToolProps) {
    const [promptModalOpen, setPromptModalOpen] = useState(false);

    // Support ?tab=settings URL param for direct deep-linking into Agent Config
    const urlTab = typeof window !== "undefined"
        ? new URLSearchParams(window.location.search).get("tab") ?? "chat"
        : "chat";
    const validTabs = ["chat", "resources", "browser", "settings"];
    const defaultTab = validTabs.includes(urlTab) ? urlTab : "chat";

    return (
        <>
        <Card className="w-full h-full flex flex-col border-none shadow-none bg-transparent">
            <CardHeader className="px-0 pb-2 shrink-0">
                <div className="flex items-start justify-between">
                    <div>
                        <CardTitle className="flex items-center gap-2">
                            <Cloud className="w-5 h-5 text-orange-500" />
                            Cloudflare Command Center
                        </CardTitle>
                        <CardDescription className="mt-0.5">
                            Chat with the Cloudflare Docs Agent · Browse live resources · Render web pages
                        </CardDescription>
                    </div>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPromptModalOpen(true)}
                        className="gap-1.5 text-xs h-7 border-orange-500/30 text-orange-400 hover:bg-orange-500/10 hover:text-orange-300 shrink-0"
                    >
                        <FileText className="w-3 h-3" />
                        View System Prompt
                    </Button>
                </div>
            </CardHeader>
            <CardContent className="px-0 flex-1 flex flex-col min-h-0">
                <Tabs defaultValue={defaultTab} className="w-full flex flex-col flex-1 min-h-0">
                    <TabsList className="bg-muted/50 shrink-0">
                        <TabsTrigger value="chat" className="gap-2"><Activity className="w-3.5 h-3.5" />Docs Agent</TabsTrigger>
                        <TabsTrigger value="resources" className="gap-2"><Package2 className="w-3.5 h-3.5" />Resources</TabsTrigger>
                        <TabsTrigger value="browser" className="gap-2"><Globe className="w-3.5 h-3.5" />Browser</TabsTrigger>
                        <TabsTrigger value="settings" className="gap-2"><Settings className="w-3.5 h-3.5" />Agent Config</TabsTrigger>
                    </TabsList>
                    <TabsContent value="chat" className="outline-none flex-1 min-h-0 mt-2">
                        <ChatTab defaultOwner={defaultOwner} defaultRepo={defaultRepo} source={source} locked={locked} />
                    </TabsContent>
                    <TabsContent value="resources" className="outline-none mt-2">
                        <ResourceBrowser />
                    </TabsContent>
                    <TabsContent value="browser" className="outline-none mt-2">
                        <BrowserRenderTab />
                    </TabsContent>
                    <TabsContent value="settings" className="outline-none mt-2 overflow-y-auto">
                        <SystemPromptEditor />
                    </TabsContent>
                </Tabs>
            </CardContent>
        </Card>

        <SystemPromptModal open={promptModalOpen} onClose={() => setPromptModalOpen(false)} />
        </>
    );
}
