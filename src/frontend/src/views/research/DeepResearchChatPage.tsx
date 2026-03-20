/**
 * @file DeepResearchChatPage.tsx
 * @description Chat interface for the Deep Research Agent.
 * Self-contained WebSocket-backed chat, mirrors CloudflareDocsBetaPage pattern.
 *
 * Connection:
 *   WS:  ws(s)://host/agents/deep-research-chat-agent/{sessionId}
 *   Fallback: POST /api/agents/deep-research-chat
 */

import { useState, useRef, useEffect, useCallback } from "react";
import {
    Play, Mail, Loader2, Send, Square, Check, Copy, RefreshCw,
    MessageSquare, Cpu, Search, ChevronDown, ChevronUp,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import ShikiHighlighter from "react-shiki";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api-client";
import { toast } from "sonner";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface ContentBlock {
    type: "section_header" | "text" | "codeblock";
    text: string;
    language?: string;
}

interface ChatMessage {
    id: string;
    role: "user" | "assistant";
    content: string;
    blocks?: ContentBlock[];
    followupPrompts?: string[];
    modelUsed?: string;
    createdAt: Date;
}

interface ProgressStep { step: string; text: string; done: boolean; }

// ─── Helpers ───────────────────────────────────────────────────────────────────

function buildWsUrl(sessionId: string): string {
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${proto}//${window.location.host}/agents/deep-research-chat-agent/${sessionId}`;
}

function blocksToMarkdown(blocks: ContentBlock[]): string {
    return blocks.map(b => {
        if (b.type === "section_header") return `## ${b.text}`;
        if (b.type === "codeblock") return `\`\`\`${b.language || ""}\n${b.text}\n\`\`\``;
        return b.text;
    }).join("\n\n");
}

function generateId(): string {
    return Math.random().toString(36).slice(2, 11);
}

// ─── Copy Button ───────────────────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
    const [copied, setCopied] = useState(false);
    return (
        <button
            onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
            className="flex items-center gap-1.5 px-2 py-1 rounded text-xs text-muted-foreground/70 hover:text-foreground hover:bg-white/5 transition-all"
        >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? "Copied!" : "Copy"}
        </button>
    );
}

// ─── Code Block ────────────────────────────────────────────────────────────────

function CodeBlock({ code, language }: { code: string; language?: string }) {
    const lang = language || "text";
    return (
        <div className="my-4 rounded-xl overflow-hidden border border-[#1a1b26]/60 bg-[#1a1b26] shadow-lg">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/5 bg-white/[0.03]">
                <span className="text-[10px] font-mono font-semibold uppercase tracking-widest text-[#7aa2f7]/70">{lang}</span>
                <CopyButton text={code} />
            </div>
            <ShikiHighlighter language={lang} theme="tokyo-night" showLineNumbers={true} addDefaultStyles={false}
                className="[&_pre]:overflow-x-auto [&_pre]:p-4 [&_pre]:text-[0.81rem] [&_pre]:leading-[1.65] [&_pre]:bg-[#1a1b26]! [&_.line-number]:text-[#565f89] [&_.line-number]:select-none [&_.line-number]:pr-4 [&_.line-number]:text-right [&_.line-number]:min-w-[2.5rem] [&_.line-number]:inline-block"
            >
                {code.trim()}
            </ShikiHighlighter>
        </div>
    );
}

// ─── Markdown ──────────────────────────────────────────────────────────────────

function MarkdownContent({ content }: { content: string }) {
    return (
        <div className="prose prose-sm dark:prose-invert max-w-none text-[13.5px] leading-[1.75] text-foreground/90">
            <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                    h2: ({ children }) => <h2 className="flex items-center gap-2 text-base font-semibold text-foreground mt-5 mb-2"><span className="inline-block w-1 h-5 rounded-full bg-orange-500/70 shrink-0" />{children}</h2>,
                    p: ({ children }) => <p className="my-2 text-foreground/85 leading-relaxed">{children}</p>,
                    a: ({ href, children }) => <a href={href} target="_blank" rel="noreferrer" className="text-orange-400 hover:text-orange-300 underline">{children}</a>,
                    ul: ({ children }) => <ul className="my-2 space-y-1 list-none pl-4">{children}</ul>,
                    li: ({ children }) => <li className="flex items-start gap-2 text-foreground/85"><span className="mt-2 w-1.5 h-1.5 rounded-full bg-orange-500/60 shrink-0" /><span>{children}</span></li>,
                    code: ({ className, children }: { className?: string; children?: React.ReactNode }) => {
                        const match = /language-(\w+)/.exec(className || "");
                        if (match) return <CodeBlock code={String(children).replace(/\n$/, "")} language={match[1]} />;
                        return <code className="px-1.5 py-0.5 rounded-md bg-orange-500/10 text-orange-300 border border-orange-500/20 text-[0.8em] font-mono">{children}</code>;
                    },
                }}
            >
                {content}
            </ReactMarkdown>
        </div>
    );
}

// ─── Progress Bar ──────────────────────────────────────────────────────────────

function ThinkingBar({ steps, isRunning }: { steps: ProgressStep[]; isRunning: boolean }) {
    const [expanded, setExpanded] = useState(true);
    if (steps.length === 0 && !isRunning) return null;
    const summary = isRunning && steps.length > 0 ? steps[steps.length - 1].text : isRunning ? "Thinking…" : `Done (${steps.length} steps)`;
    return (
        <div className="rounded-xl border border-orange-500/20 bg-orange-500/5 overflow-hidden text-xs shadow-sm">
            <button onClick={() => setExpanded(e => !e)} className="w-full flex items-center gap-2.5 px-4 py-2.5 text-left hover:bg-orange-500/5 transition-colors">
                <Cpu className="w-3.5 h-3.5 text-orange-400 shrink-0" />
                <span className="flex-1 text-orange-300/90 font-medium">{summary}</span>
                {isRunning && <Loader2 className="w-3 h-3 text-orange-400 animate-spin" />}
                {expanded ? <ChevronUp className="w-3 h-3 text-muted-foreground/50" /> : <ChevronDown className="w-3 h-3 text-muted-foreground/50" />}
            </button>
            {expanded && steps.length > 0 && (
                <div className="px-4 pb-3 pt-1 border-t border-orange-500/10 space-y-1.5">
                    {steps.map((s, i) => (
                        <div key={i} className={cn("flex items-center gap-2.5 transition-opacity", i === steps.length - 1 && !s.done ? "opacity-100" : "opacity-40")}>
                            {i === steps.length - 1 && !s.done ? <Loader2 className="w-3 h-3 text-orange-400 animate-spin shrink-0" /> : <Check className="w-3 h-3 text-emerald-400 shrink-0" />}
                            <span className="text-muted-foreground text-[11px] leading-tight">{s.text}</span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

// ─── Suggestions ───────────────────────────────────────────────────────────────

const SUGGESTIONS = [
    { title: "Repo Analysis", prompt: "Analyze the architecture of honojs/hono and explain the core design patterns." },
    { title: "Code Search", prompt: "Find all middleware patterns in a Cloudflare Worker codebase." },
    { title: "Research Summary", prompt: "Summarize the trending GitHub repos in the AI/LLM space from the last week." },
    { title: "Deep Dive", prompt: "Start a deep research job on the Cloudflare Agents SDK patterns." },
];

function SuggestionsGrid({ onSelect, disabled }: { onSelect: (p: string) => void; disabled: boolean }) {
    return (
        <div className="flex flex-col items-center justify-center h-full gap-8 px-6 py-8">
            <div className="flex flex-col items-center text-center">
                <div className="w-14 h-14 rounded-2xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center shadow-lg shadow-orange-500/5 mb-4">
                    <Search className="w-7 h-7 text-orange-400" />
                </div>
                <h1 className="text-2xl font-semibold">Deep Research</h1>
                <p className="text-muted-foreground mt-2">Ask anything — I can explore repositories, summarize code, and trigger research workflows.</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-2xl">
                {SUGGESTIONS.map(s => (
                    <button key={s.title} onClick={() => onSelect(s.prompt)} disabled={disabled}
                        className="rounded-lg border p-3 hover:bg-muted text-left flex flex-col transition-all disabled:opacity-40">
                        <div className="font-medium text-foreground">{s.title}</div>
                        <div className="text-muted-foreground text-sm mt-0.5 truncate">{s.prompt}</div>
                    </button>
                ))}
            </div>
        </div>
    );
}

// ─── Chat Panel ────────────────────────────────────────────────────────────────

export default function DeepResearchChatPage() {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState("");
    const [loading, setLoading] = useState(false);
    const [progressSteps, setProgressSteps] = useState<ProgressStep[]>([]);
    const [followupPrompts, setFollowupPrompts] = useState<string[]>([]);
    const [wsStatus, setWsStatus] = useState<"connecting" | "open" | "closed" | "error">("connecting");
    const [sessionId] = useState(() => generateId());
    const [isTriggering, setIsTriggering] = useState(false);
    const [isEmailing, setIsEmailing] = useState(false);

    const wsRef = useRef<WebSocket | null>(null);
    const abortRef = useRef(false);
    const bottomRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        setWsStatus("connecting");
        const ws = new WebSocket(buildWsUrl(sessionId));
        ws.onopen = () => setWsStatus("open");
        ws.onclose = () => { setWsStatus("closed"); setLoading(false); setProgressSteps([]); };
        ws.onerror = () => { setWsStatus("error"); setLoading(false); };
        ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                if (data.type === "progress") {
                    setProgressSteps(prev => [...prev.map(s => ({ ...s, done: true })), { step: data.step ?? "", text: data.text ?? "", done: false }]);
                } else if (data.type === "result") {
                    if (abortRef.current) return;
                    const blocks: ContentBlock[] = data.blocks ?? [];
                    const markdown = blocks.length > 0 ? blocksToMarkdown(blocks) : (data.response ?? "");
                    setMessages(prev => [...prev, {
                        id: generateId(), role: "assistant", content: markdown, blocks: blocks.length > 0 ? blocks : undefined,
                        followupPrompts: data.followupPrompts ?? [], modelUsed: data.modelUsed, createdAt: new Date()
                    }]);
                    setFollowupPrompts(data.followupPrompts ?? []);
                    setProgressSteps([]);
                    setLoading(false);
                } else if (data.type === "error") {
                    setMessages(prev => [...prev, { id: generateId(), role: "assistant", content: `⚠️ ${data.text}`, createdAt: new Date() }]);
                    setProgressSteps([]);
                    setLoading(false);
                }
            } catch { /* skip non-JSON */ }
        };
        wsRef.current = ws;
        return () => { ws.onopen = null; ws.onclose = null; ws.onerror = null; ws.onmessage = null; };
    
    }, [sessionId]);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages.length, progressSteps.length]);

    const sendMessage = useCallback(async (text?: string) => {
        const userMsg = (text ?? input).trim();
        if (!userMsg || loading) return;

        abortRef.current = false;
        setInput("");
        setFollowupPrompts([]);
        setProgressSteps([]);
        setLoading(true);

        const userEntry: ChatMessage = { id: generateId(), role: "user", content: userMsg, createdAt: new Date() };
        setMessages(prev => [...prev, userEntry]);

        const history = messages.map(m => ({ role: m.role === "assistant" ? "model" : "user", content: m.content }));

        if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ type: "chat", message: userMsg, history, sessionId, source: "web" }));
        } else {
            // REST fallback
            try {
                const res = await fetch("/api/agents/deep-research-chat", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ message: userMsg, sessionId, history, source: "web" })
                });
                const data = await res.json() as { response: string; blocks?: ContentBlock[]; followupPrompts?: string[]; modelUsed?: string };
                const blocks = data.blocks ?? [];
                setMessages(prev => [...prev, {
                    id: generateId(), role: "assistant",
                    content: blocks.length > 0 ? blocksToMarkdown(blocks) : data.response,
                    blocks: blocks.length > 0 ? blocks : undefined,
                    followupPrompts: data.followupPrompts ?? [],
                    modelUsed: data.modelUsed,
                    createdAt: new Date()
                }]);
                setFollowupPrompts(data.followupPrompts ?? []);
            } catch (e: unknown) {
                const msg = e instanceof Error ? e.message : "Unknown error";
                setMessages(prev => [...prev, { id: generateId(), role: "assistant", content: `⚠️ ${msg}`, createdAt: new Date() }]);
            } finally {
                setLoading(false);
            }
        }
    }, [input, loading, messages, sessionId]);

    const handleRunJob = async () => {
        setIsTriggering(true);
        try {
            const res = await (api as unknown as { research: { "trigger-job": { $post: (v: unknown) => Promise<Response> } } })
                .research["trigger-job"].$post({ json: { repoUrl: "https://github.com/honojs/hono", repoOwner: "honojs", repoName: "hono" } });
            const data = await res.json() as { success: boolean; workflowId?: string; error?: string };
            if (data.success) toast.success(`Workflow started: ${data.workflowId}`);
            else toast.error(data.error ?? "Failed to start workflow");
        } catch (e: unknown) {
            toast.error(e instanceof Error ? e.message : "Failed to trigger job");
        } finally {
            setIsTriggering(false);
        }
    };

    const handleTestEmail = async () => {
        setIsEmailing(true);
        try {
            const res = await (api as unknown as { research: { "test-email": { $post: () => Promise<Response> } } })
                .research["test-email"].$post();
            const data = await res.json() as { success: boolean; message?: string; error?: string };
            if (data.success) toast.success(data.message ?? "Email triggered");
            else toast.error(data.error ?? "Failed to send email");
        } catch (e: unknown) {
            toast.error(e instanceof Error ? e.message : "Failed to trigger email");
        } finally {
            setIsEmailing(false);
        }
    };

    return (
        <div className="flex flex-col h-full overflow-hidden">
            {/* Header */}
            <div className="shrink-0 border-b bg-card/30 backdrop-blur px-4 pt-3 pb-2">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Search className="w-4 h-4 text-orange-500" />
                        <span className="font-semibold text-sm">Deep Research Chat</span>
                        <Badge className="text-[9px] h-4 px-1.5 bg-orange-500/20 text-orange-300 border-orange-500/30 font-semibold">BETA</Badge>
                        {/* WS Status */}
                        <div className="ml-2 flex items-center gap-1.5 text-xs">
                            {wsStatus === "open" && <><span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" /><span className="text-emerald-400">Live</span></>}
                            {wsStatus === "connecting" && <><Loader2 className="w-3 h-3 text-yellow-500 animate-spin" /><span className="text-yellow-500">Connecting…</span></>}
                            {(wsStatus === "closed" || wsStatus === "error") && <><RefreshCw className="w-3 h-3 text-red-400 animate-spin" /><span className="text-red-400">Reconnecting…</span></>}
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button variant="secondary" size="sm" onClick={handleTestEmail} disabled={isEmailing}
                            className="bg-purple-500/10 text-purple-400 hover:bg-purple-500/20 border border-purple-500/30 h-7 text-xs">
                            {isEmailing ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Mail className="w-3.5 h-3.5 mr-1" />}
                            Test Email
                        </Button>
                        <Button variant="default" size="sm" onClick={handleRunJob} disabled={isTriggering}
                            className="bg-orange-500 hover:bg-orange-600 text-white h-7 text-xs shadow-md shadow-orange-500/20">
                            {isTriggering ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Play className="w-3.5 h-3.5 mr-1 fill-white" />}
                            Run Job
                        </Button>
                    </div>
                </div>
            </div>

            {/* Messages */}
            <div className="flex flex-1 min-h-0 overflow-hidden">
                {/* Sidebar placeholder for threads (can expand later) */}
                <div className="w-64 border-r flex flex-col shrink-0 bg-muted/5">
                    <div className="px-4 py-3.5 border-b flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <MessageSquare className="w-4 h-4 text-orange-400" />
                            <span className="text-sm font-semibold">Session</span>
                        </div>
                    </div>
                    <ScrollArea className="flex-1">
                        <div className="p-3">
                            <div className="rounded-lg border border-orange-500/25 bg-orange-500/10 p-3">
                                <p className="text-[12px] font-medium text-foreground truncate">Current Session</p>
                                <p className="text-[10px] text-muted-foreground/60 mt-0.5 font-mono">{sessionId}</p>
                                <p className="text-[10px] text-muted-foreground/50 mt-1">{messages.length} message{messages.length !== 1 ? "s" : ""}</p>
                            </div>
                        </div>
                    </ScrollArea>
                </div>

                {/* Chat pane */}
                <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
                    <div className="flex-1 overflow-y-auto">
                        {messages.length === 0 && !loading ? (
                            <SuggestionsGrid onSelect={sendMessage} disabled={wsStatus !== "open" && wsStatus !== "closed"} />
                        ) : (
                            <div className="px-6 py-6 space-y-6 max-w-4xl mx-auto">
                                {messages.map((msg) => {
                                    const isUser = msg.role === "user";
                                    return (
                                        <div key={msg.id} className={cn("flex gap-3", isUser ? "justify-end" : "justify-start")}>
                                            {!isUser && (
                                                <div className="w-7 h-7 rounded-full bg-orange-500/15 border border-orange-500/25 flex items-center justify-center shrink-0 mt-0.5">
                                                    <Search className="w-3.5 h-3.5 text-orange-400" />
                                                </div>
                                            )}
                                            <div className={cn("max-w-[82%]", isUser && "bg-muted/50 border border-border/40 px-4 py-3 rounded-2xl rounded-tr-sm")}>
                                                {isUser
                                                    ? <p className="text-[13.5px] leading-relaxed">{msg.content}</p>
                                                    : <MarkdownContent content={msg.content} />
                                                }
                                                {!isUser && msg.followupPrompts && msg.followupPrompts.length > 0 && (
                                                    <div className="mt-4 flex flex-wrap gap-2">
                                                        {msg.followupPrompts.map((p, idx) => (
                                                            <button key={idx} onClick={() => sendMessage(p)} disabled={loading}
                                                                className="text-[11px] px-3 py-1.5 rounded-lg bg-orange-500/10 text-orange-400 border border-orange-500/30 hover:bg-orange-500/20 transition-colors disabled:opacity-40">
                                                                {p}
                                                            </button>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}

                                {/* Progress */}
                                {loading && <ThinkingBar steps={progressSteps} isRunning={loading} />}
                                <div ref={bottomRef} />
                            </div>
                        )}
                    </div>

                    {/* Followup prompts */}
                    {!loading && followupPrompts.length > 0 && (
                        <div className="px-6 py-2 flex flex-wrap gap-2 border-t bg-background/20">
                            {followupPrompts.map((p, i) => (
                                <button key={i} onClick={() => sendMessage(p)}
                                    className="text-[11px] px-3 py-1.5 rounded-lg bg-orange-500/10 text-orange-400 border border-orange-500/30 hover:bg-orange-500/20 transition-colors">
                                    {p}
                                </button>
                            ))}
                        </div>
                    )}

                    {/* Composer */}
                    <div className="px-4 pb-4 pt-2 border-t shrink-0 bg-background/20 backdrop-blur">
                        <div className="max-w-4xl mx-auto">
                            <div className="flex items-end gap-2.5 rounded-2xl border border-border/50 bg-card/70 px-4 py-3 shadow-sm focus-within:border-orange-500/40 transition-all">
                                <textarea
                                    value={input}
                                    onChange={e => {
                                        setInput(e.target.value);
                                        const el = e.target;
                                        el.style.height = "auto";
                                        el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
                                    }}
                                    onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                                    disabled={loading}
                                    placeholder="Ask about repositories, request code analysis, or start a research workflow…"
                                    rows={1}
                                    style={{ height: "24px" }}
                                    className="flex-1 resize-none bg-transparent border-0 outline-none text-[13.5px] leading-relaxed py-0 min-h-[24px] max-h-[200px] disabled:opacity-50 placeholder:text-muted-foreground/35"
                                />
                                {loading ? (
                                    <button onClick={() => { abortRef.current = true; setLoading(false); setProgressSteps([]); }}
                                        className="p-2 rounded-xl text-red-400 hover:bg-red-500/10 shrink-0 transition-colors" title="Stop">
                                        <Square className="w-4 h-4" />
                                    </button>
                                ) : (
                                    <button onClick={() => sendMessage()} disabled={!input.trim()}
                                        className="p-2 rounded-xl bg-orange-500 hover:bg-orange-600 text-white disabled:opacity-30 shrink-0 transition-colors shadow-md shadow-orange-500/20">
                                        <Send className="w-4 h-4" />
                                    </button>
                                )}
                            </div>
                            <p className="text-center text-[10px] text-muted-foreground/30 mt-2">↵ send · ⇧↵ new line · Powered by Gemini + Deep Research Agent</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
