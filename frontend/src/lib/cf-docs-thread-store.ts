/**
 * @file frontend/src/lib/cf-docs-thread-store.ts
 * @description localStorage-backed thread persistence for the Cloudflare Docs Chat.
 *
 * Each thread maps 1:1 with a CloudflareDocsAgent Durable Object session.
 * The thread.id is used as the WS sessionId sent in every message.
 */

const nanoid = () => crypto.randomUUID();

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface CFDocsMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string; // markdown fallback
  /** Typed content blocks from the agent (assistant messages only) */
  blocks?: Array<{ type: 'section_header' | 'text' | 'codeblock'; text: string; language?: string }>;
  /** Follow-up prompts (last assistant message only) */
  followupPrompts?: string[];
  /** Model that generated this response */
  modelUsed?: string;
  createdAt: string;
}

export interface CFDocsThread {
  id: string;          // UUID — used as WS sessionId
  title: string;       // extracted from first user message
  repoBadge: string | null;    // e.g. "core-github-api"
  bindingBadges: string[];     // e.g. ["D1", "KV", "R2"]
  repoUrl: string | null;      // full owner/repo passed as context
  messages: CFDocsMessage[];
  createdAt: string;
  updatedAt: string;
}

// ─── Cloudflare binding keyword extraction ──────────────────────────────────────

const BINDING_KEYWORDS = [
  { label: 'D1',          pattern: /\bD1\b|\bsqlite\b/i },
  { label: 'KV',          pattern: /\bKV\b|KV_/i },
  { label: 'R2',          pattern: /\bR2\b|env\.R2|R2Bucket/i },
  { label: 'Workers AI',  pattern: /workers\s+ai|env\.AI\b/i },
  { label: 'DO',          pattern: /durable\s+object|\bDurableObject\b|DurableObjectStub/i },
  { label: 'Queue',       pattern: /\bQueue\b|env\.QUEUE|\bMessageBatch\b/i },
  { label: 'Vectorize',   pattern: /\bVectorize\b|VectorizeIndex/i },
  { label: 'Browser',     pattern: /browser\s+rendering|\bPuppeteer\b|env\.BROWSER/i },
  { label: 'Hyperdrive',  pattern: /\bHyperdrive\b/i },
  { label: 'Workflows',   pattern: /WorkflowEntrypoint|\.workflow\b/i },
] as const;

export function extractBindingBadges(text: string): string[] {
  return BINDING_KEYWORDS
    .filter(({ pattern }) => pattern.test(text))
    .map(({ label }) => label);
}

export function extractRepoBadge(text: string): string | null {
  // Match "github.com/owner/repo" or just "/owner/repo" patterns
  const ghMatch = text.match(/github\.com\/[^/\s]+\/([^\s/)"']+)/i);
  if (ghMatch) return ghMatch[1].replace(/\.git$/, '');
  return null;
}

// ─── Storage key ─────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'cf_docs_threads_v2';

// ─── API ────────────────────────────────────────────────────────────────────────

export function loadThreads(): CFDocsThread[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as CFDocsThread[];
  } catch {
    return [];
  }
}

function saveThreads(threads: CFDocsThread[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(threads));
  } catch { /* storage full — silently fail */ }
}

export function createThread(repoUrl: string | null): CFDocsThread {
  const thread: CFDocsThread = {
    id: nanoid(),
    title: 'New conversation',
    repoBadge: repoUrl ? repoUrl.split('/').pop() ?? null : null,
    bindingBadges: [],
    repoUrl,
    messages: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const threads = loadThreads();
  saveThreads([thread, ...threads]);
  return thread;
}

export function getThread(id: string): CFDocsThread | null {
  return loadThreads().find((t) => t.id === id) ?? null;
}

export function updateThread(thread: CFDocsThread): void {
  const threads = loadThreads();
  const idx = threads.findIndex((t) => t.id === thread.id);
  const updated = { ...thread, updatedAt: new Date().toISOString() };
  if (idx >= 0) {
    threads[idx] = updated;
  } else {
    threads.unshift(updated);
  }
  saveThreads(threads);
}

export function deleteThread(id: string): void {
  saveThreads(loadThreads().filter((t) => t.id !== id));
}

export function appendMessage(threadId: string, message: Omit<CFDocsMessage, 'id' | 'createdAt'>): CFDocsMessage {
  const threads = loadThreads();
  const thread = threads.find((t) => t.id === threadId);
  if (!thread) throw new Error(`Thread ${threadId} not found`);

  const msg: CFDocsMessage = {
    ...message,
    id: nanoid(),
    createdAt: new Date().toISOString(),
  };
  thread.messages.push(msg);
  thread.updatedAt = new Date().toISOString();

  // Auto-generate title from first user message
  if (thread.title === 'New conversation' && message.role === 'user') {
    thread.title = message.content.slice(0, 60) + (message.content.length > 60 ? '…' : '');
  }

  // Update badges from assistant messages
  if (message.role === 'assistant') {
    const text = message.content;
    const newBindings = extractBindingBadges(text);
    const existing = new Set(thread.bindingBadges);
    newBindings.forEach((b) => existing.add(b));
    thread.bindingBadges = [...existing];

    const repo = extractRepoBadge(text);
    if (repo && !thread.repoBadge) thread.repoBadge = repo;
  }

  saveThreads(threads);
  return msg;
}
