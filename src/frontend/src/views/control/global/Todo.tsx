/**
 * @file Todo.tsx
 * @description Corkboard-style draggable post-it note board.
 *
 * All state (notes + labels + positions + colors) is persisted to D1
 * via the /api/todos and /api/todos/labels endpoints. No localStorage.
 *
 * ── API surface used ───────────────────────────────────────────────────
 *   GET  /api/todos            → load all active notes
 *   POST /api/todos            → create note  { title, content, posX, posY, rotation, noteColor }
 *   PATCH /api/todos/:id       → update note  { posX, posY, rotation, noteColor, isActive }
 *   DELETE /api/todos/:id      → soft-delete note
 *
 *   GET  /api/todos/labels     → load all labels
 *   POST /api/todos/labels     → create label { text, posX, posY, rotation }
 *   PATCH /api/todos/labels/:id→ update label { posX, posY, rotation }
 *   DELETE /api/todos/labels/:id→ soft-delete label
 */

import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
} from "react";
import Cookies from "js-cookie";
import { Plus, Tag, X, StickyNote, CheckCircle2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// ─── Types ────────────────────────────────────────────────────────────────────

interface PostIt {
  id: string;
  title: string;
  content: string;
  x: number;
  y: number;
  rotation: number;
  color: string;
  isActive: boolean;
}

interface BoardLabel {
  id: string;
  text: string;
  x: number;
  y: number;
  rotation: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const NOTE_COLORS = [
  "#fde68a", // warm yellow (default)
  "#fcd34d", // deeper yellow
  "#fca5a5", // soft pink
  "#86efac", // mint green
  "#93c5fd", // sky blue
  "#d8b4fe", // lavender
];

function randomRotation() {
  return parseFloat(((Math.random() - 0.5) * 6).toFixed(2));
}

// ─── API helpers ──────────────────────────────────────────────────────────────

/** Base path for all todo API calls */
const API_BASE = "/api/frontend/todos";

/**
 * Authenticated fetch wrapper — injects the colby_api_key cookie as
 * the x-api-key header so backend auth passes on every request.
 */
function authFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const token = Cookies.get("colby_api_key");
  const headers: Record<string, string> = {
    ...(init.headers as Record<string, string> ?? {}),
  };
  if (token) headers["x-api-key"] = token;
  return fetch(url, { ...init, headers });
}



// ─── Draggable wrapper ────────────────────────────────────────────────────────

function Draggable({
  id,
  x,
  y,
  onMoveEnd,
  zIndex,
  onBringToFront,
  children,
}: {
  id: string;
  x: number;
  y: number;
  onMoveEnd: (id: string, x: number, y: number) => void;
  zIndex: number;
  onBringToFront: (id: string) => void;
  children: React.ReactNode;
}) {
  const elRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null);

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if ((e.target as HTMLElement).closest("button, textarea, input")) return;
      e.preventDefault();
      onBringToFront(id);
      dragRef.current = { startX: e.clientX, startY: e.clientY, originX: x, originY: y };

      const handleMove = (ev: MouseEvent) => {
        if (!dragRef.current || !elRef.current) return;
        const nx = dragRef.current.originX + ev.clientX - dragRef.current.startX;
        const ny = dragRef.current.originY + ev.clientY - dragRef.current.startY;
        elRef.current.style.left = `${Math.max(0, nx)}px`;
        elRef.current.style.top = `${Math.max(0, ny)}px`;
      };

      const handleUp = (ev: MouseEvent) => {
        if (!dragRef.current) return;
        const nx = Math.max(0, dragRef.current.originX + ev.clientX - dragRef.current.startX);
        const ny = Math.max(0, dragRef.current.originY + ev.clientY - dragRef.current.startY);
        onMoveEnd(id, nx, ny);
        dragRef.current = null;
        window.removeEventListener("mousemove", handleMove);
        window.removeEventListener("mouseup", handleUp);
      };

      window.addEventListener("mousemove", handleMove);
      window.addEventListener("mouseup", handleUp);
    },
    [id, x, y, onMoveEnd, onBringToFront]
  );

  return (
    <div
      ref={elRef}
      onMouseDown={onMouseDown}
      style={{ position: "absolute", left: x, top: y, zIndex, cursor: "grab", userSelect: "none" }}
    >
      {children}
    </div>
  );
}

// ─── Post-it note card ────────────────────────────────────────────────────────

function PostItCard({
  note,
  onDelete,
  onEdit,
  onMoveEnd,
  onMarkDone,
  zIndex,
  onBringToFront,
}: {
  note: PostIt;
  onDelete: (id: string) => void;
  onEdit: (id: string) => void;
  onMoveEnd: (id: string, x: number, y: number) => void;
  onMarkDone: (id: string) => void;
  zIndex: number;
  onBringToFront: (id: string) => void;
}) {
  return (
    <Draggable id={note.id} x={note.x} y={note.y} onMoveEnd={onMoveEnd} zIndex={zIndex} onBringToFront={onBringToFront}>
      <div
        style={{
          background: note.color,
          transform: `rotate(${note.rotation}deg)`,
          width: 200,
          minHeight: 180,
          boxShadow: "3px 4px 12px rgba(0,0,0,0.35), inset 0 -2px 6px rgba(0,0,0,0.08)",
          borderRadius: 2,
          padding: "28px 14px 14px",
          position: "relative",
          fontFamily: "'Patrick Hand', 'Caveat', 'Comic Sans MS', cursive",
        }}
      >
        {/* Tape strip at top */}
        <div style={{
          position: "absolute", top: -8, left: "50%", transform: "translateX(-50%)",
          width: 32, height: 16, background: "rgba(255,255,255,0.55)",
          borderRadius: 2, boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
        }} />

        {/* Mark as done */}
        <button
          onClick={() => onMarkDone(note.id)}
          style={{ position: "absolute", top: 6, left: 6, background: "transparent", border: "none", cursor: "pointer", opacity: 0.6, padding: 2, color: "#1a1a1a" }}
          title="Mark done"
          aria-label="Mark done"
        >
          <CheckCircle2 size={13} />
        </button>

        {/* Edit */}
        <button
          onClick={() => onEdit(note.id)}
          style={{ position: "absolute", top: 6, right: 30, background: "transparent", border: "none", cursor: "pointer", opacity: 0.6, padding: 2, color: "#1a1a1a" }}
          title="Edit note"
          aria-label="Edit note"
        >
          <Pencil size={13} />
        </button>

        {/* Delete */}
        <button
          onClick={() => onDelete(note.id)}
          style={{ position: "absolute", top: 6, right: 6, background: "transparent", border: "none", cursor: "pointer", opacity: 0.6, padding: 2, color: "#1a1a1a" }}
          title="Remove note"
          aria-label="Remove note"
        >
          <X size={13} />
        </button>

        {note.title && (
          <p style={{ margin: "0 0 6px", fontWeight: 700, fontSize: 15, color: "#1a1a1a", lineHeight: 1.25, wordBreak: "break-word" }}>
            {note.title}
          </p>
        )}
        <p style={{ margin: 0, fontSize: 13, color: "#2d2d2d", lineHeight: 1.5, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
          {note.content}
        </p>
      </div>
    </Draggable>
  );
}

// ─── Torn paper label ─────────────────────────────────────────────────────────

function TornLabel({
  label,
  onDelete,
  onEdit,
  onMoveEnd,
  zIndex,
  onBringToFront,
}: {
  label: BoardLabel;
  onDelete: (id: string) => void;
  onEdit: (id: string) => void;
  onMoveEnd: (id: string, x: number, y: number) => void;
  zIndex: number;
  onBringToFront: (id: string) => void;
}) {
  return (
    <Draggable id={label.id} x={label.x} y={label.y} onMoveEnd={onMoveEnd} zIndex={zIndex} onBringToFront={onBringToFront}>
      <div style={{ transform: `rotate(${label.rotation}deg)`, position: "relative" }}>
        <svg width="0" height="0" style={{ position: "absolute" }}>
          <defs>
            <clipPath id={`torn-${label.id}`} clipPathUnits="objectBoundingBox">
              <path d="M0,0.05 Q0.1,0 0.2,0.04 Q0.3,0.08 0.4,0.02 Q0.5,0 0.6,0.06 Q0.7,0.1 0.8,0.03 Q0.9,0 1,0.05 L1,0.9 Q0.95,1 0.85,0.93 Q0.75,0.88 0.65,0.95 Q0.55,1 0.45,0.92 Q0.35,0.86 0.25,0.93 Q0.15,1 0.05,0.94 Q0,0.9 0,0.9 Z" />
            </clipPath>
          </defs>
        </svg>
        <div style={{ background: "#fafaf8", clipPath: `url(#torn-${label.id})`, padding: "12px 22px 14px 18px", boxShadow: "2px 3px 8px rgba(0,0,0,0.28)" }}>
          <span style={{ fontFamily: "'Patrick Hand', 'Caveat', cursive", fontSize: 22, fontWeight: 900, color: "#111", letterSpacing: "-0.5px", whiteSpace: "nowrap", textShadow: "0 1px 0 rgba(0,0,0,0.08)" }}>
            {label.text}
          </span>
        </div>
        <button
          onClick={() => onEdit(label.id)}
          style={{ position: "absolute", top: -4, right: 20, background: "#333", border: "none", borderRadius: "50%", width: 18, height: 18, color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", opacity: 0.8, zIndex: 10 }}
          title="Edit label"
          aria-label="Edit label"
        >
          <Pencil size={10} />
        </button>
        <button
          onClick={() => onDelete(label.id)}
          style={{ position: "absolute", top: -4, right: -4, background: "#333", border: "none", borderRadius: "50%", width: 18, height: 18, color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", opacity: 0.8, zIndex: 10 }}
          title="Remove label"
          aria-label="Remove label"
        >
          <X size={10} />
        </button>
      </div>
    </Draggable>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function TodoPage() {
  const [notes, setNotes] = useState<PostIt[]>([]);
  const [labels, setLabels] = useState<BoardLabel[]>([]);
  const [loading, setLoading] = useState(true);
  const [zMap, setZMap] = useState<Record<string, number>>({});
  const topZ = useRef(10);

  // Dialog state
  const [noteOpen, setNoteOpen] = useState(false);
  const [labelOpen, setLabelOpen] = useState(false);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingLabelId, setEditingLabelId] = useState<string | null>(null);

  const [newTitle, setNewTitle] = useState("");
  const [newContent, setNewContent] = useState("");
  const [newColor, setNewColor] = useState(NOTE_COLORS[0]);
  const [newLabelText, setNewLabelText] = useState("");

  // ── Load from API on mount ──────────────────────────────────────────────────
  useEffect(() => {
    Promise.all([
      authFetch(`${API_BASE}`).then(r => r.json() as any),
      authFetch(`${API_BASE}/labels`).then(r => r.json() as any),
    ]).then(([todoData, labelData]) => {
      setNotes(
        (todoData.todos ?? [])
          .filter((t: any) => t.isDeleted === 0)
          .map((t: any): PostIt => ({
            id: String(t.id),
            title: t.title ?? "",
            content: t.content ?? "",
            x: t.posX ?? 40,
            y: t.posY ?? 40,
            rotation: t.rotation ?? randomRotation(),
            color: t.noteColor ?? NOTE_COLORS[0],
            isActive: t.isActive !== 0,
          }))
      );
      setLabels(
        (labelData.labels ?? []).map((l: any): BoardLabel => ({
          id: String(l.id),
          text: l.text ?? "",
          x: l.posX ?? 60,
          y: l.posY ?? 20,
          rotation: l.rotation ?? randomRotation(),
        }))
      );
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  // ── z-index management ──────────────────────────────────────────────────────
  const bringToFront = useCallback((id: string) => {
    topZ.current += 1;
    setZMap(m => ({ ...m, [id]: topZ.current }));
  }, []);

  // ── Note position persistence (debounced PATCH) ─────────────────────────────
  const persistNotePatch = useCallback((id: string, patch: Record<string, any>) => {
    authFetch(`${API_BASE}/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    }).catch(() => {});
  }, []);

  const handleMoveNote = useCallback((id: string, x: number, y: number) => {
    setNotes(ns => ns.map(n => n.id === id ? { ...n, x, y } : n));
    persistNotePatch(id, { posX: x, posY: y });
  }, [persistNotePatch]);

  // ── Label position persistence ──────────────────────────────────────────────
  const persistLabelPatch = useCallback((id: string, patch: Record<string, any>) => {
    authFetch(`${API_BASE}/labels/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    }).catch(() => {});
  }, []);

  const handleMoveLabel = useCallback((id: string, x: number, y: number) => {
    setLabels(ls => ls.map(l => l.id === id ? { ...l, x, y } : l));
    persistLabelPatch(id, { posX: x, posY: y });
  }, [persistLabelPatch]);

  // ── Create or Edit note ─────────────────────────────────────────────────────
  const handleEditNoteClick = useCallback((id: string) => {
    const note = notes.find(n => n.id === id);
    if (!note) return;
    setEditingNoteId(id);
    setNewTitle(note.title);
    setNewContent(note.content);
    setNewColor(note.color);
    setNoteOpen(true);
  }, [notes]);

  const handleSubmitNote = async () => {
    if (!newTitle.trim() && !newContent.trim()) return;
    
    // If editing existing note
    if (editingNoteId) {
      const note = notes.find(n => n.id === editingNoteId);
      if (!note) return;
      try {
        await authFetch(`${API_BASE}/${editingNoteId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: newTitle, content: newContent, noteColor: newColor }),
        });
        setNotes(ns => ns.map(n => n.id === editingNoteId ? { ...n, title: newTitle, content: newContent, color: newColor } : n));
      } catch {
        setNotes(ns => ns.map(n => n.id === editingNoteId ? { ...n, title: newTitle, content: newContent, color: newColor } : n));
      }
    } else {
      // Create new note
      const rot = randomRotation();
      const px = 40 + (notes.length % 5) * 220;
      const py = 40 + Math.floor(notes.length / 5) * 230;

      try {
        const res = await authFetch(`${API_BASE}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: newTitle, content: newContent, posX: px, posY: py, rotation: rot, noteColor: newColor }),
        });
        const data = await res.json() as any;
        const id = String(data.id ?? crypto.randomUUID());
        setNotes(ns => [...ns, { id, title: newTitle, content: newContent, x: px, y: py, rotation: rot, color: newColor, isActive: true }]);
      } catch {
        const id = crypto.randomUUID();
        setNotes(ns => [...ns, { id, title: newTitle, content: newContent, x: px, y: py, rotation: rot, color: newColor, isActive: true }]);
      }
    }

    setNoteOpen(false);
    setEditingNoteId(null);
    setNewTitle("");
    setNewContent("");
    setNewColor(NOTE_COLORS[0]);
  };

  // ── Delete note ─────────────────────────────────────────────────────────────
  const handleDeleteNote = useCallback(async (id: string) => {
    authFetch(`${API_BASE}/${id}`, { method: "DELETE" }).catch(() => {});
    setNotes(ns => ns.filter(n => n.id !== id));
  }, []);

  // ── Mark done ──────────────────────────────────────────────────────────────
  const handleMarkDone = useCallback(async (id: string) => {
    authFetch(`${API_BASE}/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: false, status: "done" }),
    }).catch(() => {});
    setNotes(ns => ns.filter(n => n.id !== id));
  }, []);

  // ── Create or Edit label ────────────────────────────────────────────────────
  const handleEditLabelClick = useCallback((id: string) => {
    const label = labels.find(l => l.id === id);
    if (!label) return;
    setEditingLabelId(id);
    setNewLabelText(label.text);
    setLabelOpen(true);
  }, [labels]);

  const handleSubmitLabel = async () => {
    if (!newLabelText.trim()) return;

    if (editingLabelId) {
      try {
        await authFetch(`${API_BASE}/labels/${editingLabelId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: newLabelText }),
        });
        setLabels(ls => ls.map(l => l.id === editingLabelId ? { ...l, text: newLabelText } : l));
      } catch {
        setLabels(ls => ls.map(l => l.id === editingLabelId ? { ...l, text: newLabelText } : l));
      }
    } else {
      const rot = randomRotation();
      const px = 60 + labels.length * 30;
      const py = 20 + labels.length * 15;

      try {
        const res = await authFetch(`${API_BASE}/labels`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: newLabelText, posX: px, posY: py, rotation: rot }),
        });
        const data = await res.json() as any;
        const id = String(data.id ?? crypto.randomUUID());
        setLabels(ls => [...ls, { id, text: newLabelText, x: px, y: py, rotation: rot }]);
      } catch {
        setLabels(ls => [...ls, { id: crypto.randomUUID(), text: newLabelText, x: px, y: py, rotation: rot }]);
      }
    }

    setLabelOpen(false);
    setEditingLabelId(null);
    setNewLabelText("");
  };

  // ── Delete label ────────────────────────────────────────────────────────────
  const handleDeleteLabel = useCallback(async (id: string) => {
    authFetch(`${API_BASE}/labels/${id}`, { method: "DELETE" }).catch(() => {});
    setLabels(ls => ls.filter(l => l.id !== id));
  }, []);

  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: "#1c1c1c", color: "#fff" }}>
      {/* ── Toolbar ── */}
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 20px", borderBottom: "1px solid #333", background: "#141414", gap: 12, flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <StickyNote size={18} color="#fde68a" />
          <span style={{ fontWeight: 700, fontSize: 16, letterSpacing: "-0.3px" }}>ToDos</span>
          <span style={{ fontSize: 12, color: "#666", marginLeft: 4 }}>{notes.length} notes</span>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Button variant="ghost" size="sm" onClick={() => { setEditingLabelId(null); setNewLabelText(""); setLabelOpen(true); }} style={{ color: "#aaa", fontSize: 13 }}>
            <Tag size={14} style={{ marginRight: 6 }} />
            Label
          </Button>
          <Button size="sm" onClick={() => { setEditingNoteId(null); setNewTitle(""); setNewContent(""); setNewColor(NOTE_COLORS[0]); setNoteOpen(true); }} style={{ background: "#fde68a", color: "#1a1a1a", fontWeight: 700, fontSize: 13 }}>
            <Plus size={15} style={{ marginRight: 4 }} />
            New Note
          </Button>
        </div>
      </header>

      {/* ── Corkboard ── */}
      <div style={{
        flex: 1, position: "relative", overflow: "auto", minHeight: 600, minWidth: "100%",
        background: `
          radial-gradient(ellipse at 20% 30%, rgba(139,90,43,0.18) 0%, transparent 60%),
          radial-gradient(ellipse at 80% 70%, rgba(100,60,20,0.14) 0%, transparent 60%),
          repeating-linear-gradient(0deg, transparent, transparent 24px, rgba(255,255,255,0.012) 24px, rgba(255,255,255,0.012) 25px),
          repeating-linear-gradient(90deg, transparent, transparent 24px, rgba(255,255,255,0.012) 24px, rgba(255,255,255,0.012) 25px),
          #7a5c3a
        `,
      }}>
        {/* Empty / loading state */}
        {loading && (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
            <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 14 }}>Loading corkboard…</span>
          </div>
        )}

        {!loading && notes.length === 0 && labels.length === 0 && (
          <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, pointerEvents: "none" }}>
            <StickyNote size={48} color="rgba(253,230,138,0.3)" />
            <p style={{ color: "rgba(255,255,255,0.3)", fontSize: 15, fontStyle: "italic" }}>Your corkboard is empty — add a note to get started</p>
          </div>
        )}

        {/* Labels (behind notes in render order) */}
        {labels.map(label => (
          <TornLabel key={label.id} label={label} onEdit={handleEditLabelClick} onDelete={handleDeleteLabel} onMoveEnd={handleMoveLabel} zIndex={zMap[label.id] ?? 1} onBringToFront={bringToFront} />
        ))}

        {/* Notes */}
        {notes.map(note => (
          <PostItCard key={note.id} note={note} onEdit={handleEditNoteClick} onDelete={handleDeleteNote} onMoveEnd={handleMoveNote} onMarkDone={handleMarkDone} zIndex={zMap[note.id] ?? 5} onBringToFront={bringToFront} />
        ))}
      </div>

      {/* ── Create Note Dialog ── */}
      <Dialog open={noteOpen} onOpenChange={setNoteOpen}>
        <DialogContent style={{ maxWidth: 440 }}>
          <DialogHeader><DialogTitle>{editingNoteId ? "Edit Post-it Note" : "New Post-it Note"}</DialogTitle></DialogHeader>
          <div style={{ display: "flex", flexDirection: "column", gap: 14, padding: "8px 0" }}>
            <div>
              <Label style={{ marginBottom: 6, display: "block", fontSize: 12 }}>Title (optional)</Label>
              <Input value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="Quick title…" autoFocus />
            </div>
            <div>
              <Label style={{ marginBottom: 6, display: "block", fontSize: 12 }}>Note</Label>
              <textarea
                value={newContent}
                onChange={e => setNewContent(e.target.value)}
                placeholder="What's on your mind?"
                rows={5}
                style={{ width: "100%", background: "transparent", border: "1px solid #333", borderRadius: 6, padding: "8px 12px", color: "inherit", fontSize: 14, resize: "vertical", fontFamily: "inherit" }}
                onKeyDown={e => { if (e.key === "Enter" && e.metaKey) handleSubmitNote(); }}
              />
            </div>
            <div>
              <Label style={{ marginBottom: 6, display: "block", fontSize: 12 }}>Color</Label>
              <div style={{ display: "flex", gap: 8 }}>
                {NOTE_COLORS.map(c => (
                  <button key={c} onClick={() => setNewColor(c)} aria-label={`Select color ${c}`} style={{ width: 28, height: 28, borderRadius: 4, background: c, border: c === newColor ? "3px solid #fff" : "2px solid transparent", cursor: "pointer", boxShadow: c === newColor ? "0 0 0 1px #888" : "none" }} />
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setNoteOpen(false)}>Cancel</Button>
            <Button onClick={handleSubmitNote} disabled={!newTitle.trim() && !newContent.trim()} style={{ background: newColor, color: "#1a1a1a", fontWeight: 700 }}>
              {editingNoteId ? "Save Note" : "Pin to Board"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Create Label Dialog ── */}
      <Dialog open={labelOpen} onOpenChange={setLabelOpen}>
        <DialogContent style={{ maxWidth: 360 }}>
          <DialogHeader><DialogTitle>{editingLabelId ? "Edit Group Label" : "New Group Label"}</DialogTitle></DialogHeader>
          <div style={{ padding: "8px 0" }}>
            <Label style={{ marginBottom: 6, display: "block", fontSize: 12 }}>Label text</Label>
            <Input value={newLabelText} onChange={e => setNewLabelText(e.target.value)} placeholder="e.g. This Week, Bugs, Ideas…" autoFocus onKeyDown={e => { if (e.key === "Enter") handleSubmitLabel(); }} />
            <p style={{ marginTop: 10, fontSize: 12, color: "#666" }}>Drag labels near a group of notes to mark the section.</p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setLabelOpen(false)}>Cancel</Button>
            <Button onClick={handleSubmitLabel} disabled={!newLabelText.trim()}>{editingLabelId ? "Save Label" : "Add Label"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
