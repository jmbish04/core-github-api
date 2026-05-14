import { useEffect, useRef, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import type { JulesSession } from '@/hooks/jules/useJulesSession';

export function TaskActiveView({ sessionId, session }: { sessionId: string; session: JulesSession }) {
  const [logs, setLogs] = useState<string[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // We only connect to SSE for active sessions
    const source = new EventSource(`/api/jules/stream/${sessionId}`);

    source.onmessage = (event) => {
      setLogs((prev) => [...prev, event.data]);
      if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }
    };

    source.onerror = (err) => {
      console.error('SSE Error:', err);
      source.close();
    };

    return () => {
      source.close();
    };
  }, [sessionId]);

  const progress = session.progress_pct || 0;

  return (
    <div className="space-y-6">
      <Card className="p-6 bg-zinc-900 border-zinc-800 flex flex-col items-center justify-center min-h-[120px]">
        <h2 className="text-xl font-medium tracking-tight mb-2">
          {session.current_step_name || 'Working on task...'}
        </h2>
        <div className="w-full max-w-lg mt-4 flex flex-col gap-2">
          <Progress value={progress} className="h-2 bg-zinc-800" />
          <div className="text-right text-sm text-zinc-500">{progress}% complete</div>
        </div>
      </Card>

      <Card className="bg-zinc-950 border-zinc-800 overflow-hidden">
        <div className="bg-zinc-900 border-b border-zinc-800 px-4 py-2 text-xs font-mono text-zinc-500 uppercase tracking-widest">
          Live Log Stream
        </div>
        <div
          ref={scrollRef}
          className="p-4 h-[400px] overflow-y-auto font-mono text-sm text-zinc-300 whitespace-pre-wrap leading-relaxed"
        >
          {logs.length === 0 ? (
            <span className="text-zinc-600">Waiting for stream...</span>
          ) : (
            logs.map((log, i) => (
              <div key={i} className="mb-1">
                <span className="text-zinc-500 mr-3">{new Date().toLocaleTimeString()}</span>
                {log}
              </div>
            ))
          )}
        </div>
      </Card>
    </div>
  );
}
