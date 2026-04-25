/**
 * @file src/frontend/src/components/terminal/SandboxTerminal.tsx
 * @description xterm.js terminal component for displaying live sandbox container output.
 *              Connects to the container's PTY WebSocket via the Worker proxy.
 *              Used inside the ConflictAlert progress sheet and the Sandbox workspace view.
 */

import { useEffect, useRef, useState } from "react";
import { Loader2, Terminal as TerminalIcon, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface SandboxTerminalProps {
  /** The sandbox session ID — used to build the WS URL. */
  sessionId: string;
  /** Optional fixed height. Defaults to 400px. */
  height?: number | string;
  /** Called when the WebSocket connects. */
  onConnect?: () => void;
  /** Called when the WebSocket disconnects. */
  onDisconnect?: () => void;
}

type XTermModules = {
  Terminal: new (opts: Record<string, unknown>) => {
    open(el: HTMLElement): void;
    write(data: string): void;
    dispose(): void;
    onData(handler: (data: string) => void): void;
  };
  FitAddon: new () => { fit(): void; proposeDimensions(): { cols: number; rows: number } | undefined };
  WebLinksAddon: new () => Record<string, unknown>;
};

export function SandboxTerminal({ sessionId, height = 400, onConnect, onDisconnect }: SandboxTerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<XTermModules["Terminal"] | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    (async () => {
      // Dynamic import — xterm is client-only and large
      const [{ Terminal }, { FitAddon }, { WebLinksAddon }] = await Promise.all([
        import("@xterm/xterm"),
        import("@xterm/addon-fit"),
        import("@xterm/addon-web-links"),
      ]);

      if (!mounted || !containerRef.current) return;

      const term = new Terminal({
        theme: {
          background: "#09090b",  // zinc-950
          foreground: "#e4e4e7",  // zinc-200
          cursor: "#22c55e",      // green-500
          selectionBackground: "#3f3f46",
        },
        fontFamily: '"JetBrains Mono", "Fira Code", monospace',
        fontSize: 13,
        lineHeight: 1.5,
        cursorBlink: true,
        scrollback: 5000,
      });

      const fitAddon = new FitAddon();
      const webLinksAddon = new WebLinksAddon();

      term.open(containerRef.current);
      // xterm addons use loadAddon — cast through any
      (term as any).loadAddon(fitAddon);
      (term as any).loadAddon(webLinksAddon);
      fitAddon.fit();

      termRef.current = term;

      // ── WebSocket connection to container PTY ────────────────────────────
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsUrl = `${protocol}//${window.location.host}/api/sandbox/terminal/${sessionId}`;

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        if (!mounted) return;
        setConnected(true);
        setError(null);
        term.write("\x1b[32m✓ Connected to sandbox terminal\x1b[0m\r\n");
        onConnect?.();
      };

      ws.onmessage = (e) => {
        term.write(typeof e.data === "string" ? e.data : new Uint8Array(e.data));
      };

      ws.onclose = () => {
        if (!mounted) return;
        setConnected(false);
        term.write("\r\n\x1b[31m✕ Terminal disconnected\x1b[0m\r\n");
        onDisconnect?.();
      };

      ws.onerror = () => {
        setError("WebSocket connection failed");
        setConnected(false);
      };

      // Send keystrokes to container PTY
      term.onData((data: string) => {
        if (ws.readyState === WebSocket.OPEN) ws.send(data);
      });

      // Handle resize
      const ro = new ResizeObserver(() => fitAddon.fit());
      if (containerRef.current) ro.observe(containerRef.current);

      return () => {
        ro.disconnect();
      };
    })();

    return () => {
      mounted = false;
      termRef.current?.dispose();
      wsRef.current?.close();
    };
  }, [sessionId, onConnect, onDisconnect]);

  const handleDisconnect = () => {
    wsRef.current?.close();
  };

  return (
    <div className="flex flex-col gap-2">
      {/* Header bar */}
      <div className="flex items-center gap-2 px-2 py-1 bg-zinc-900 rounded-t border border-zinc-800 border-b-0">
        <TerminalIcon className="h-3.5 w-3.5 text-zinc-400" />
        <span className="text-xs text-zinc-400 font-mono flex-1">colby-sandbox:{sessionId}</span>
        <Badge
          variant="outline"
          className={`text-[10px] py-0 ${connected ? "border-emerald-700 text-emerald-400" : "border-zinc-700 text-zinc-500"}`}
        >
          {connected ? "connected" : "disconnected"}
        </Badge>
        {connected && (
          <Button size="icon" variant="ghost" className="h-5 w-5" onClick={handleDisconnect}>
            <X className="h-3 w-3" />
          </Button>
        )}
      </div>

      {/* xterm.js mount point */}
      <div className="relative">
        {!connected && !error && (
          <div className="absolute inset-0 flex items-center justify-center bg-zinc-950 z-10">
            <Loader2 className="h-5 w-5 animate-spin text-zinc-400" />
          </div>
        )}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-zinc-950 z-10">
            <span className="text-xs text-red-400">{error}</span>
          </div>
        )}
        <div
          ref={containerRef}
          style={{ height }}
          className="bg-zinc-950 rounded-b border border-zinc-800 border-t-0 overflow-hidden [&_.xterm-viewport]:scrollbar-thin [&_.xterm-viewport]:scrollbar-track-zinc-900 [&_.xterm-viewport]:scrollbar-thumb-zinc-700"
        />
      </div>
    </div>
  );
}
