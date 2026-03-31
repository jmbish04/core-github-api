import React, { useState, useEffect } from 'react';
import { BabysitterSessionCard } from './BabysitterSessionCard';

interface ActiveSession {
  id: string;
  status?: string | null;
  loopScore?: number;
  lastMessage?: string;
  interventionCount?: number;
}

export function BabysitterHUD({ apiBase = '/api/learning' }: { apiBase?: string }) {
  const [sessions, setSessions] = useState<ActiveSession[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchSessions = () => {
    fetch(`${apiBase}/sessions?status=running`)
      .then(r => r.json() as Promise<{ data: any[] }>)
      .then(d => {
        const mapped: ActiveSession[] = (d.data ?? []).map((s: any) => ({
          id: s.id,
          status: s.status,
          loopScore: s.loopScore ?? 0,
          lastMessage: s.lastMessage ?? null,
          interventionCount: s.interventionCount ?? 0,
        }));
        setSessions(mapped);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(() => {
    fetchSessions();
    // Poll every 30 seconds
    const interval = setInterval(fetchSessions, 30000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <span className="text-zinc-400 text-sm">
          {loading ? 'Loading...' : `${sessions.length} active session(s)`}
        </span>
        <button
          className="bg-zinc-800 hover:bg-zinc-700 text-zinc-50 text-xs px-3 py-1.5 rounded-sm"
          onClick={fetchSessions}
        >
          Refresh
        </button>
      </div>

      {!loading && sessions.length === 0 && (
        <div className="bg-zinc-900 p-8 rounded-sm text-center text-zinc-500">
          No active sessions.
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {sessions.map(session => (
          <BabysitterSessionCard
            key={session.id}
            session={session}
            apiBase={apiBase}
            onOverride={() => fetchSessions()}
          />
        ))}
      </div>
    </div>
  );
}
