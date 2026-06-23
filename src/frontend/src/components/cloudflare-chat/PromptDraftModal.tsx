/**
 * @file frontend/src/components/cloudflare-chat/PromptDraftModal.tsx
 *
 * Modal for AI-assisted system prompt editing.
 *
 * Tabs:
 *   - AI Consult (default): user enters an instruction → Gemini rewrites the prompt
 *     → user can accept, keep iterating, or switch to Raw Edit
 *   - Edit Raw: editable textarea pre-filled with AI's latest draft (or current prompt)
 *     → user can save directly
 *
 * Saving (from either tab) triggers an AlertDialog confirmation before PUT.
 *
 * Agent Governance: No native alert() — all notifications use sonner toasts.
 */

import { useState, useEffect } from "react";
import { handleGlobalError } from '@/lib/error-handler';
import { handleGlobalSuccess } from '@/lib/success-handler';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Loader2, Sparkles, Code2, Check, AlertTriangle,
  RotateCcw, ChevronRight, Bot,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

interface HistoryTurn {
  role: "user" | "model";
  content: string;
}

interface PromptDraftModalProps {
  open: boolean;
  onClose: () => void;
  currentPrompt: string;
  apiKey: string;
  onSaved: (newPrompt: string, lastUpdated: string) => void;
}

// ─── Diff viewer (simple inline highlight) ────────────────────────────────────

function SimpleDiff({ original, revised }: { original: string; revised: string }) {
  const origLines = new Set(original.split("\n").map((l) => l.trimEnd()));
  const revLines = revised.split("\n");

  return (
    <div className="font-mono text-[11px] leading-relaxed space-y-px">
      {revLines.map((line, i) => {
        const isNew = line.trim() && !origLines.has(line.trimEnd());
        return (
          <div
            key={i}
            className={cn(
              "px-2 py-0.5 rounded-sm",
              isNew ? "bg-emerald-500/10 text-emerald-300" : "text-foreground/75"
            )}
          >
            {isNew ? <span className="text-emerald-500 mr-1.5">+</span> : <span className="text-transparent mr-1.5">·</span>}
            {line || <span className="text-transparent">‎</span>}
          </div>
        );
      })}
    </div>
  );
}

// ─── Main modal ───────────────────────────────────────────────────────────────

export function PromptDraftModal({
  open,
  onClose,
  currentPrompt,
  apiKey,
  onSaved,
}: PromptDraftModalProps) {
  const [tab, setTab] = useState<"ai" | "raw">("ai");

  // AI consult state
  const [instruction, setInstruction] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiDraft, setAiDraft] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryTurn[]>([]);
  const [provider, setProvider] = useState<string | null>(null);

  // Raw edit state
  const [rawDraft, setRawDraft] = useState(currentPrompt);

  // Confirm dialog
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingSave, setPendingSave] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Keep rawDraft in sync when AI draft updates and user switches tab
  useEffect(() => {
    if (aiDraft) setRawDraft(aiDraft);
  }, [aiDraft]);

  // Reset when modal opens/closes
  useEffect(() => {
    if (open) {
      setInstruction("");
      setAiDraft(null);
      setHistory([]);
      setRawDraft(currentPrompt);
      setProvider(null);
      setTab("ai");
    }
  }, [open, currentPrompt]);

  // ── AI Consult ──────────────────────────────────────────────────────────────

  const callAiEdit = async () => {
    if (!instruction.trim()) return;
    setAiLoading(true);
    try {
      const res = await fetch("/api/agents/cloudflare-docs/ai-edit", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
        },
        body: JSON.stringify({
          currentPrompt: aiDraft ?? currentPrompt,
          userInstruction: instruction,
          history,
        }),
      });

      const data = (await res.json()) as any;
      if (!res.ok || !data.success) {
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }

      // Append to history for multi-turn iteration
      setHistory((prev) => [
        ...prev,
        { role: "user", content: instruction },
        { role: "model", content: data.revisedPrompt },
      ]);
      setAiDraft(data.revisedPrompt);
      setProvider(data.provider ?? "gemini");
      setInstruction("");
    } catch (err: any) {
      handleGlobalError(`AI edit failed: ${err.message}`);
    } finally {
      setAiLoading(false);
    }
  };

  // ── Save helpers ────────────────────────────────────────────────────────────

  const requestSave = (prompt: string) => {
    setPendingSave(prompt);
    setConfirmOpen(true);
  };

  const confirmSave = async () => {
    if (!pendingSave) return;
    setSaving(true);
    try {
      const res = await fetch("/api/agents/cloudflare-docs/system-prompt", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
        },
        body: JSON.stringify({ systemPrompt: pendingSave }),
      });
      const data = (await res.json()) as any;
      if (!res.ok || !data.success) throw new Error(data.error ?? `HTTP ${res.status}`);

      handleGlobalSuccess("System Prompt Updated", "New prompt will take effect on the next agent message.");
      onSaved(pendingSave, data.lastUpdated);
      setConfirmOpen(false);
      onClose();
    } catch (err: any) {
      handleGlobalError(`Save failed: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const charCount = (tab === "raw" ? rawDraft : (aiDraft ?? currentPrompt)).length;
  const charWarning = charCount > 28_000;

  return (
    <>
      {/* ─── Main modal ──────────────────────────────────────────────────────── */}
      <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
        <DialogContent className="max-w-3xl w-full h-[85vh] flex flex-col gap-0 p-0 overflow-hidden">
          <DialogHeader className="px-6 pt-5 pb-4 border-b shrink-0">
            <DialogTitle className="flex items-center gap-2 text-base">
              <Bot className="w-4 h-4 text-orange-400" />
              Draft System Prompt
            </DialogTitle>
            <DialogDescription className="text-xs">
              Use AI to refine the prompt, or edit it directly. Changes require confirmation before saving.
            </DialogDescription>
          </DialogHeader>

          <Tabs value={tab} onValueChange={(v) => setTab(v as "ai" | "raw")} className="flex flex-col flex-1 min-h-0">
            <TabsList className="bg-transparent rounded-none border-b px-6 h-auto p-0 justify-start gap-0 shrink-0">
              {[
                { value: "ai", label: "AI Consult", icon: Sparkles },
                { value: "raw", label: "Edit Raw", icon: Code2 },
              ].map(({ value, label, icon: Icon }) => (
                <TabsTrigger
                  key={value}
                  value={value}
                  className="rounded-none border-b-2 border-transparent data-[state=active]:border-orange-500 data-[state=active]:bg-transparent data-[state=active]:text-foreground text-muted-foreground px-4 pb-2 pt-2 text-xs gap-1.5"
                >
                  <Icon className="w-3.5 h-3.5" />
                  {label}
                  {value === "raw" && aiDraft && (
                    <Badge className="ml-1 text-[9px] h-4 px-1.5 bg-orange-500/20 text-orange-300 border-orange-500/30">
                      AI draft loaded
                    </Badge>
                  )}
                </TabsTrigger>
              ))}
            </TabsList>

            {/* ── AI Consult ────────────────────────────────────────────────── */}
            <TabsContent value="ai" className="flex-1 min-h-0 m-0 flex flex-col overflow-hidden">
              <div className="flex flex-col flex-1 min-h-0 px-6 py-4 gap-4">

                {/* Instruction input */}
                <div className="space-y-1.5 shrink-0">
                  <label className="text-[11px] font-medium text-muted-foreground">
                    What should Gemini change?
                  </label>
                  <div className="flex gap-2">
                    <textarea
                      value={instruction}
                      onChange={(e) => setInstruction(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey && !aiLoading) {
                          e.preventDefault();
                          callAiEdit();
                        }
                      }}
                      placeholder="e.g. Make the tone more concise. Remove references to internal tools. Add a rule about always citing docs URLs."
                      rows={3}
                      className="flex-1 rounded-lg border border-border/50 bg-muted/20 px-3 py-2 text-xs text-foreground/90 leading-relaxed resize-none outline-none focus:border-orange-500/40 transition-colors"
                    />
                    <Button
                      onClick={callAiEdit}
                      disabled={aiLoading || !instruction.trim()}
                      className="bg-orange-500 hover:bg-orange-600 text-white gap-1.5 text-xs shrink-0 self-end h-9"
                    >
                      {aiLoading
                        ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Thinking…</>
                        : <><Sparkles className="w-3.5 h-3.5" /> Get edit</>
                      }
                    </Button>
                  </div>
                  <p className="text-[10px] text-muted-foreground/50">↵ Enter to submit · ⇧↵ new line · Iteration {history.length / 2 | 0} of ∞</p>
                </div>

                {/* Result area */}
                {aiDraft ? (
                  <div className="flex-1 min-h-0 flex flex-col gap-2">
                    <div className="flex items-center justify-between shrink-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-medium text-muted-foreground">Gemini's edit</span>
                        {provider && (
                          <Badge variant="outline" className="text-[9px] px-1.5 h-4 border-blue-500/30 text-blue-400">
                            via {provider}
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-xs h-7 gap-1.5 text-muted-foreground hover:text-foreground"
                          onClick={() => { setTab("raw"); setRawDraft(aiDraft); }}
                        >
                          <Code2 className="w-3 h-3" />
                          Edit raw
                          <ChevronRight className="w-3 h-3" />
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => requestSave(aiDraft)}
                          className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5 text-xs h-7"
                        >
                          <Check className="w-3 h-3" />
                          Accept & save
                        </Button>
                      </div>
                    </div>
                    <ScrollArea className="flex-1 min-h-0 rounded-lg border border-border/30 bg-muted/10 p-3">
                      <SimpleDiff original={currentPrompt} revised={aiDraft} />
                    </ScrollArea>
                  </div>
                ) : (
                  <div className="flex-1 min-h-0 rounded-xl border border-dashed border-border/30 flex items-center justify-center">
                    <div className="text-center space-y-2 text-muted-foreground/50">
                      <Sparkles className="w-8 h-8 mx-auto opacity-30" />
                      <p className="text-xs">Enter an instruction above and click <strong>Get edit</strong></p>
                      <p className="text-[10px]">You can iterate as many times as needed before accepting</p>
                    </div>
                  </div>
                )}
              </div>
            </TabsContent>

            {/* ── Edit Raw ──────────────────────────────────────────────────── */}
            <TabsContent value="raw" className="flex-1 min-h-0 m-0 flex flex-col overflow-hidden">
              <div className="flex flex-col flex-1 min-h-0 px-6 py-4 gap-3">
                <div className="flex items-center justify-between shrink-0">
                  <label className="text-[11px] font-medium text-muted-foreground">
                    Raw prompt editor
                  </label>
                  <div className="flex items-center gap-2">
                    <span className={cn(
                      "text-[10px] font-mono",
                      charWarning ? "text-red-400" : "text-muted-foreground/50"
                    )}>
                      {charCount.toLocaleString()} / 32,000
                    </span>
                    {!aiDraft && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-xs h-7 gap-1.5 text-muted-foreground"
                        onClick={() => setRawDraft(currentPrompt)}
                      >
                        <RotateCcw className="w-3 h-3" />
                        Reset
                      </Button>
                    )}
                  </div>
                </div>

                <textarea
                  value={rawDraft}
                  onChange={(e) => setRawDraft(e.target.value)}
                  spellCheck={false}
                  className="flex-1 min-h-0 rounded-lg border border-border/50 bg-muted/20 px-3.5 py-3 text-xs font-mono text-foreground/90 leading-relaxed resize-none outline-none focus:border-orange-500/40 transition-colors"
                />

                {charWarning && (
                  <p className="text-[10px] text-red-400 flex items-center gap-1 shrink-0">
                    <AlertTriangle className="w-3 h-3" /> Approaching 32 KB KV value limit
                  </p>
                )}

                <div className="flex justify-end shrink-0">
                  <Button
                    onClick={() => requestSave(rawDraft)}
                    disabled={charWarning || rawDraft === currentPrompt}
                    className="bg-orange-500 hover:bg-orange-600 text-white gap-1.5 text-xs"
                  >
                    <Check className="w-3.5 h-3.5" />
                    Save prompt
                  </Button>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      {/* ─── Confirm dialog ───────────────────────────────────────────────────── */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Replace system prompt?</AlertDialogTitle>
            <AlertDialogDescription>
              This will immediately overwrite the active Cloudflare Docs Agent system prompt in KV.
              The previous version will be recorded in the revision history.
              This action takes effect on the next agent message.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Go back</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmSave}
              disabled={saving}
              className="bg-orange-500 hover:bg-orange-600 text-white"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Confirm & save
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
