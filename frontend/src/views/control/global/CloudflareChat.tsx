/**
 * @file frontend/src/views/control/global/CloudflareChat.tsx
 * @description Full-featured Cloudflare Docs Agent chat experience.
 *
 * Architecture:
 *   - Thread list (localStorage-persisted) in left sidebar
 *   - Each thread = a distinct CloudflareDocsAgent Durable Object session
 *   - Real-time streaming via WebSocket (/agents/cloudflare-docs-agent/{id})
 *   - Typed ContentBlock[] rendered as canvas (rich blocks, syntax-highlighted code)
 *   - Progress steps (thinking bar) during generation
 *   - Follow-up prompt pills after each assistant response
 *   - Repo + Cloudflare binding badges auto-extracted and shown in sidebar
 */

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import {
  BookOpen, Plus, Bot, User,
  Zap
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  type CFDocsThread,
  type CFDocsMessage,
  loadThreads,
  createThread,
} from '@/lib/cf-docs-thread-store';
import { ChatComposer } from '@/components/cloudflare-chat/ChatComposer';
import { useCFDocsRuntime } from '@/components/cloudflare-chat/useCFDocsRuntime';
import { CFDocsBlockRenderer } from '@/components/cloudflare-chat/CFDocsBlockRenderer';
import { CFDocsThinkingBar } from '@/components/cloudflare-chat/CFDocsThinkingBar';
import { CFDocsFollowups } from '@/components/cloudflare-chat/CFDocsFollowups';
import { CFDocsThreadSidebar } from '@/components/cloudflare-chat/CFDocsThreadSidebar';

// ─── Repo options ─────────────────────────────────────────────────────────────

const REPOS = [
  { label: 'core-github-api',        value: 'https://github.com/jmbish04/core-github-api' },
  { label: 'core-repo-templates',    value: 'https://github.com/jmbish04/core-repo-templates' },
  { label: 'workers-chat-demo',      value: 'https://github.com/jmbish04/workers-chat-demo' },
  { label: 'No repo context',        value: '' },
];

// ─── Message bubble ───────────────────────────────────────────────────────────

function MessageBubble({
  msg, isLast, isRunning, onFollowup,
}: {
  msg: CFDocsMessage;
  isLast: boolean;
  isRunning: boolean;
  onFollowup: (p: string) => void;
}) {
  const isUser = msg.role === 'user';

  if (isUser) {
    return (
      <div className="flex items-start gap-3 justify-end">
        <div className="max-w-[75%] px-4 py-3 rounded-2xl rounded-tr-sm bg-orange-500/15 border border-orange-500/25 text-sm text-foreground leading-relaxed whitespace-pre-wrap">
          {msg.content}
        </div>
        <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center shrink-0 mt-1">
          <User className="w-3.5 h-3.5 text-muted-foreground" />
        </div>
      </div>
    );
  }

  // Assistant message
  return (
    <div className="flex items-start gap-3">
      <div className="w-7 h-7 rounded-full bg-orange-500/20 border border-orange-500/30 flex items-center justify-center shrink-0 mt-1">
        <Bot className="w-3.5 h-3.5 text-orange-400" />
      </div>
      <div className="flex-1 min-w-0 space-y-2">
        {/* Rich block renderer (or fallback text) */}
        {msg.blocks && msg.blocks.length > 0 ? (
          <CFDocsBlockRenderer blocks={msg.blocks} modelUsed={msg.modelUsed} />
        ) : (
          <div className="text-sm text-foreground/90 leading-relaxed whitespace-pre-wrap">
            {msg.content}
          </div>
        )}
        {/* Follow-up pills — only show on last assistant message when not running */}
        {isLast && !isRunning && msg.followupPrompts && msg.followupPrompts.length > 0 && (
          <CFDocsFollowups
            prompts={msg.followupPrompts}
            onSelect={onFollowup}
            disabled={isRunning}
          />
        )}
      </div>
    </div>
  );
}

// ─── Composer ─────────────────────────────────────────────────────────────────

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function CloudflareChat() {

  const [threads, setThreads] = useState<CFDocsThread[]>(() => loadThreads());
  const [activeThread, setActiveThread] = useState<CFDocsThread | null>(null);
  const [selectedRepoUrl, setSelectedRepoUrl] = useState('');
  const [models, setModels] = useState<Array<{ id: string; name: string; provider: string }>>([]);
  const [selectedModel, setSelectedModel] = useState<string>('gemini-2.5-flash');
  const scrollRef = useRef<HTMLDivElement>(null);

  const updateActiveThread = useCallback((t: CFDocsThread) => {
    setActiveThread(t);
    setThreads(loadThreads());
  }, []);

  const { messages, isRunning, thinkingSteps, sendMessage, cancelRun } =
    useCFDocsRuntime(activeThread, updateActiveThread);

  // Scroll to bottom on new messages
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, thinkingSteps]);

  const handleNewThread = useCallback(() => {
    const thread = createThread(selectedRepoUrl || null);
    setThreads(loadThreads());
    setActiveThread(thread);
  }, [selectedRepoUrl]);

  const handleSelectThread = useCallback((id: string) => {
    const t = threads.find((x) => x.id === id) ?? null;
    setActiveThread(t);
  }, [threads]);

  const handleThreadDeleted = useCallback((id: string) => {
    setThreads(loadThreads());
    if (activeThread?.id === id) setActiveThread(null);
  }, [activeThread]);

  // Auto-create thread on first load if none exist
  useEffect(() => {
    if (threads.length === 0) {
      const t = createThread(null);
      setThreads(loadThreads());
      setActiveThread(t);
    } else if (!activeThread && threads.length > 0) {
      setActiveThread(threads[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const fetchModels = async () => {
      try {
        const res = await fetch('/api/agents/models?filter=structured_response');
        if (res.ok) {
          const data = await res.json() as { success: boolean; models: Array<{ id: string; name: string; provider: string }> };
          if (data.success && data.models) {
            setModels(data.models);
          }
        }
      } catch (err) {
        console.error('Failed to fetch models', err);
      }
    };
    fetchModels();
  }, []);

  const groupedModels = useMemo(() => {
    const groups: Record<string, typeof models> = {};
    
    models.forEach(m => {
      // Handle the 'google' provider mapped to gemini etc.
      let groupName = m.provider.charAt(0).toUpperCase() + m.provider.slice(1);
      
      if (m.provider === 'cloudflare' && m.id.startsWith('@cf/')) {
        const subProvider = m.id.split('/')[1];
        if (subProvider) {
          groupName = `Cloudflare - ${subProvider.charAt(0).toUpperCase() + subProvider.slice(1)}`;
        }
      }
      
      if (!groups[groupName]) {
        groups[groupName] = [];
      }
      groups[groupName].push(m);
    });

    const sortedGroups = Object.keys(groups).sort();
    
    return sortedGroups.map(groupName => {
      const sortedGroupModels = [...groups[groupName]].sort((a, b) => a.name.localeCompare(b.name));
      return {
        groupName,
        models: sortedGroupModels
      };
    });
  }, [models]);

  return (
    <div className="flex h-[calc(100vh-4rem)] bg-background overflow-hidden">
      {/* ── Thread Sidebar ─────────────────────────────────────────────────── */}
      <CFDocsThreadSidebar
        threads={threads}
        activeThreadId={activeThread?.id ?? null}
        onSelectThread={handleSelectThread}
        onNewThread={handleNewThread}
        onThreadDeleted={handleThreadDeleted}
      />

      {/* ── Chat Area ──────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="h-14 border-b flex items-center justify-between px-5 bg-background/80 backdrop-blur shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-full bg-orange-500/20 border border-orange-500/40 flex items-center justify-center">
              <BookOpen className="w-3.5 h-3.5 text-orange-400" />
            </div>
            <div>
              <h2 className="text-sm font-semibold leading-tight">Cloudflare Docs Agent</h2>
              <p className="text-[10px] text-muted-foreground leading-tight">
                Gemini 2.5 Flash · Workers AI fallback · MCP-powered docs
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Repo context selector */}
            <Select
              value={selectedRepoUrl}
              onValueChange={(v) => setSelectedRepoUrl(v)}
            >
              <SelectTrigger className="w-[200px] h-8 text-xs bg-card/50 border-border/50">
                <SelectValue placeholder="No repo context" />
              </SelectTrigger>
              <SelectContent>
                {REPOS.map((r) => (
                  <SelectItem key={r.value} value={r.value} className="text-xs">
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 text-xs"
              onClick={handleNewThread}
            >
              <Plus className="w-3.5 h-3.5" /> New Chat
            </Button>
          </div>
        </div>

        {/* Messages */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto px-6 py-6 space-y-6 scroll-smooth"
        >
          {!activeThread || messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-4 text-center text-muted-foreground">
              <div className="w-16 h-16 rounded-full bg-orange-500/10 border border-orange-500/20 flex items-center justify-center">
                <Zap className="w-8 h-8 text-orange-400 opacity-60" />
              </div>
              <div className="space-y-1">
                <p className="font-medium text-foreground">Ask anything about Cloudflare</p>
                <p className="text-sm">Workers, D1, R2, Durable Objects, KV, Queues — all fair game.</p>
              </div>
              <div className="flex flex-wrap justify-center gap-2 max-w-md">
                {[
                  'How do I set up D1 with Drizzle?',
                  'What are Durable Objects migrations?',
                  'How do I stream from Workers AI?',
                ].map((q) => (
                  <button
                    key={q}
                    onClick={() => sendMessage(q, selectedModel)}
                    disabled={!activeThread}
                    className="px-3 py-1.5 rounded-full border border-orange-500/25 bg-orange-500/5 text-xs text-orange-300/90 hover:bg-orange-500/15 transition-all disabled:opacity-30"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              {messages.map((msg, i) => {
                const isLast = i === messages.length - 1;
                return (
                  <MessageBubble
                    key={msg.id}
                    msg={msg}
                    isLast={isLast}
                    isRunning={isRunning}
                    onFollowup={sendMessage}
                  />
                );
              })}

              {/* Thinking bar — below messages while running */}
              {(isRunning || thinkingSteps.length > 0) && (
                <div className="ml-10">
                  <CFDocsThinkingBar steps={thinkingSteps} isRunning={isRunning} />
                </div>
              )}
            </>
          )}
        </div>

        {/* Composer */}
        <div className="px-6 pb-5 pt-2 shrink-0">
          <ChatComposer
            onSend={(text) => {
              if (!activeThread) {
                const t = createThread(selectedRepoUrl || null);
                setActiveThread(t);
                setThreads(loadThreads());
                // sendMessage will pick up the new thread on next render
                setTimeout(() => sendMessage(text, selectedModel), 50);
              } else {
                sendMessage(text, selectedModel);
              }
            }}
            isRunning={isRunning}
            onCancel={cancelRun}
            disabled={false}
          />
          <div className="flex items-center justify-between mt-2 px-1">
            <select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              className="bg-transparent border border-border/40 text-[10px] text-muted-foreground/80 rounded px-1.5 py-0.5 outline-none focus:border-orange-500/40"
            >
              {groupedModels.length > 0 ? (
                groupedModels.map((g) => (
                  <optgroup key={g.groupName} label={g.groupName} className="bg-[#1a1a2e] text-orange-500/80 font-semibold mb-2">
                    {g.models.map((m) => (
                      <option key={m.id} value={m.id} className="bg-[#1a1a2e] text-foreground font-normal">
                        {m.name}
                      </option>
                    ))}
                  </optgroup>
                ))
              ) : (
                <option value="gemini-2.5-flash" className="bg-[#1a1a2e]">
                  Gemini 2.5 Flash (Recommended)
                </option>
              )}
            </select>
            <p className="text-center text-[10px] text-muted-foreground/40">
              Gemini 2.5 Flash · Workers AI fallback · Real-time via WebSocket · Threads persist locally
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
