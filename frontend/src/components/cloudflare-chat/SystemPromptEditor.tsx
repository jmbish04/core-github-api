/**
 * @file frontend/src/components/cloudflare-chat/SystemPromptEditor.tsx
 *
 * Agent Config tab — read-only view of the active system prompt.
 * Authenticated users (session token stored in localStorage as "worker_api_key")
 * can open PromptDraftModal to iterate with AI or edit raw.
 *
 * No WORKER_API_KEY input field — the token is read from localStorage,
 * where it was set during the GitHub OAuth login callback.
 *
 * Agent Governance: No native alert() — all notifications use sonner toasts.
 */

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Loader2, RotateCcw, AlertTriangle, CheckCircle2,
  ExternalLink, Copy, CheckCheck, Code2, Zap,
  Sparkles, History,
} from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { PromptDraftModal } from "@/components/cloudflare-chat/PromptDraftModal";
import {
  SYSTEM_PROMPT_ENDPOINT,
  FULL_INTEGRATION_PROMPT,
  API_ONLY_INTEGRATION_PROMPT,
} from "@/components/cloudflare-chat/SystemPromptModal";

// ─── Types ────────────────────────────────────────────────────────────────────

interface PromptState {
  systemPrompt: string;
  lastUpdated: string | null;
  source: "kv" | "default";
}

interface PromptRevision {
  id: number;
  timestamp: string;
  prior_config_prompt: string;
  new_config_prompt_value: string;
  removed_language: string | null;
  added_language: string | null;
  changed_by: string;
}

// ─── Endpoint copy button ─────────────────────────────────────────────────────

function EndpointCopyButton({
  text,
  label,
  icon: Icon = Copy,
}: {
  text: string;
  label: string;
  icon?: React.ElementType;
}) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
    toast.success("Copied to clipboard");
  };
  return (
    <button
      onClick={copy}
      className="flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-white/10 text-[10px] text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
    >
      {copied ? <CheckCheck className="w-3 h-3 text-emerald-400" /> : <Icon className="w-3 h-3" />}
      {copied ? "Copied!" : label}
    </button>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function SystemPromptEditor() {
  const [state, setState] = useState<PromptState | null>(null);
  const [loading, setLoading] = useState(true);
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [draftOpen, setDraftOpen] = useState(false);
  const [revisions, setRevisions] = useState<PromptRevision[]>([]);
  const [revisionsLoading, setRevisionsLoading] = useState(false);
  const [showRevisions, setShowRevisions] = useState(false);

  // Token is stored in localStorage by the auth callback (no user input needed)
  const apiKey = localStorage.getItem("worker_api_key") ?? "";

  // ── Load current prompt ──────────────────────────────────────────────────

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/agents/cloudflare-docs/system-prompt");
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      const data = (await res.json()) as PromptState;
      setState(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Load revisions ───────────────────────────────────────────────────────

  const loadRevisions = async () => {
    if (!apiKey) { toast.error("Not authenticated"); return; }
    setRevisionsLoading(true);
    try {
      const res = await fetch("/api/agents/cloudflare-docs/prompt-revisions", {
        headers: { "x-api-key": apiKey },
      });
      const data = (await res.json()) as any;
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setRevisions(data.revisions ?? []);
      setShowRevisions(true);
    } catch (e: any) {
      toast.error("Could not load revisions", { description: e.message });
    } finally {
      setRevisionsLoading(false);
    }
  };

  // ── Reset to default ─────────────────────────────────────────────────────

  const reset = async () => {
    if (!apiKey) { toast.error("Not authenticated"); return; }
    setResetting(true);
    try {
      const res = await fetch("/api/agents/cloudflare-docs/system-prompt", {
        method: "DELETE",
        headers: { "x-api-key": apiKey },
      });
      const data = (await res.json()) as any;
      if (!res.ok) throw new Error(data.error ?? `${res.status}`);
      setState({ systemPrompt: data.systemPrompt, lastUpdated: null, source: "default" });
      toast.success("Reset to built-in default");
    } catch (e: any) {
      toast.error("Reset failed", { description: e.message });
    } finally {
      setResetting(false);
    }
  };

  // ── Loading / error states ───────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground gap-3">
        <Loader2 className="w-5 h-5 animate-spin" />
        <span className="text-sm">Loading system prompt…</span>
      </div>
    );
  }

  return (
    <div className="space-y-5">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold">Cloudflare Docs Agent · System Prompt</h3>
            {state?.source === "kv" ? (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 border-emerald-500/40 text-emerald-400 bg-emerald-500/5">
                ✦ Custom (saved)
              </Badge>
            ) : (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 border-blue-500/40 text-blue-400 bg-blue-500/5">
                ◈ Built-in default
              </Badge>
            )}
          </div>
          {state?.lastUpdated && (
            <p className="text-[10px] text-muted-foreground/60">
              Last saved: {new Date(state.lastUpdated).toLocaleString()}
            </p>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={() => { navigator.clipboard.writeText(state?.systemPrompt ?? ""); setCopied(true); setTimeout(() => setCopied(false), 2000); toast.success("Copied"); }}
            title="Copy prompt text"
            className="flex items-center gap-1 px-2 py-1 rounded border border-border/40 text-[10px] text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors font-mono"
          >
            {copied ? <CheckCheck className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
            Copy prompt
          </button>
          <a
            href="/api/agents/cloudflare-docs/system-prompt"
            target="_blank"
            rel="noopener"
            className="flex items-center gap-1 px-2 py-1 rounded border border-border/40 text-[10px] text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
          >
            <ExternalLink className="w-3 h-3" /> Open
          </a>
        </div>
      </div>

      {/* ── Public API endpoint block ─────────────────────────────────────── */}
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
          <p className="text-[10px] text-muted-foreground/70">
            Public (CORS-open). Other Cloudflare Workers can fetch this URL to get the live system prompt — always implement a fallback to a hardcoded default in case this endpoint is unreachable.
          </p>
          <div className="flex flex-wrap gap-2">
            <EndpointCopyButton text={SYSTEM_PROMPT_ENDPOINT} label="Copy endpoint URL" icon={Copy} />
            <EndpointCopyButton text={FULL_INTEGRATION_PROMPT} label="Copy: Build full CF Docs Agent in my worker" icon={Code2} />
            <EndpointCopyButton text={API_ONLY_INTEGRATION_PROMPT} label="Copy: Use hosted agent via API proxy" icon={Zap} />
          </div>
        </div>
      </div>

      {/* ── Read-only prompt viewer ───────────────────────────────────────── */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-[11px] font-medium text-muted-foreground">Current Prompt</label>
          <span className="text-[10px] font-mono text-muted-foreground/50">
            {state?.systemPrompt.length.toLocaleString() ?? 0} chars
          </span>
        </div>
        <ScrollArea className="h-72 rounded-lg border border-border/40 bg-muted/10">
          <pre className="p-4 text-[11px] font-mono text-foreground/80 leading-relaxed whitespace-pre-wrap break-words">
            {state?.systemPrompt ?? ""}
          </pre>
        </ScrollArea>
      </div>

      {/* ── Error banner ─────────────────────────────────────────────────── */}
      {error && (
        <div className="flex items-start gap-2 text-destructive text-xs px-3 py-2 rounded-lg border border-destructive/30 bg-destructive/5">
          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          {error}
        </div>
      )}

      {/* ── Actions ──────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={reset}
            disabled={resetting || state?.source === "default"}
            className="text-muted-foreground hover:text-foreground text-xs gap-1.5"
          >
            {resetting ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />}
            Reset to default
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={showRevisions ? () => setShowRevisions(false) : loadRevisions}
            disabled={revisionsLoading}
            className="text-muted-foreground hover:text-foreground text-xs gap-1.5"
          >
            {revisionsLoading
              ? <Loader2 className="w-3 h-3 animate-spin" />
              : <History className="w-3 h-3" />
            }
            {showRevisions ? "Hide history" : "Revision history"}
          </Button>
        </div>

        <div className="flex items-center gap-2">
          {state?.source === "kv" && (
            <span className="text-[10px] text-muted-foreground/50 flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3 text-emerald-500/60" /> Saved in KV
            </span>
          )}
          <Button
            size="sm"
            onClick={() => setDraftOpen(true)}
            className="bg-orange-500 hover:bg-orange-600 text-white gap-1.5 text-xs"
          >
            <Sparkles className="w-3.5 h-3.5" />
            Draft with AI
          </Button>
        </div>
      </div>

      {/* ── Revision history ─────────────────────────────────────────────── */}
      {showRevisions && revisions.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
            Revision History ({revisions.length})
          </h4>
          <div className="space-y-2">
            {revisions.map((r) => (
              <div key={r.id} className="rounded-lg border border-border/30 bg-muted/10 px-3 py-2.5 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-muted-foreground/60 font-mono">
                    #{r.id} · {r.changed_by} · {formatDistanceToNow(new Date(r.timestamp), { addSuffix: true })}
                  </span>
                  <div className="flex items-center gap-2 text-[10px]">
                    {r.added_language && (
                      <span className="text-emerald-400">
                        +{r.added_language.split("\n").filter(Boolean).length} lines
                      </span>
                    )}
                    {r.removed_language && (
                      <span className="text-red-400">
                        -{r.removed_language.split("\n").filter(Boolean).length} lines
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {showRevisions && revisions.length === 0 && (
        <p className="text-xs text-muted-foreground/50 text-center py-4">No revisions recorded yet.</p>
      )}

      {/* ── Draft modal ───────────────────────────────────────────────────── */}
      {state && (
        <PromptDraftModal
          open={draftOpen}
          onClose={() => setDraftOpen(false)}
          currentPrompt={state.systemPrompt}
          apiKey={apiKey}
          onSaved={(newPrompt, lastUpdated) => {
            setState({ systemPrompt: newPrompt, lastUpdated, source: "kv" });
          }}
        />
      )}
    </div>
  );
}
