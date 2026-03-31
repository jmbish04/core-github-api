import React, { useState, useEffect } from 'react';
import { SessionRow } from './SessionRow';

interface Session {
  id: string;
  triggerType: string;
  status?: string | null;
  insightCount?: number | null;
  startedAt?: Date | string | null;
  completedAt?: Date | string | null;
  createdAt?: Date | string | null;
}

export function SessionsTable({ apiBase = '/api/learning' }: { apiBase?: string }) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  useEffect(() => {
    setLoading(true);
    fetch(`${apiBase}/sessions?page=${page}`)
      .then(r => r.json() as Promise<{ data: Session[] }>)
      .then(d => { setSessions(d.data ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [page]);

  return (
    <div>
      {loading && <p className="text-zinc-400">Loading sessions...</p>}
      <div className="bg-zinc-900 rounded-sm overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-zinc-800">
            <tr>
              <th className="py-2 px-3 text-zinc-400 text-xs font-semibold uppercase tracking-widest">ID</th>
              <th className="py-2 px-3 text-zinc-400 text-xs font-semibold uppercase tracking-widest">Trigger</th>
              <th className="py-2 px-3 text-zinc-400 text-xs font-semibold uppercase tracking-widest">Insights</th>
              <th className="py-2 px-3 text-zinc-400 text-xs font-semibold uppercase tracking-widest">Duration</th>
              <th className="py-2 px-3 text-zinc-400 text-xs font-semibold uppercase tracking-widest">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y-0">
            {sessions.map(session => (
              <SessionRow key={session.id} session={session} />
            ))}
            {!loading && sessions.length === 0 && (
              <tr>
                <td colSpan={5} className="py-6 px-3 text-zinc-500 text-center">
                  No sessions found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="flex gap-3 mt-4 items-center">
        <button
          className="bg-zinc-800 text-zinc-50 px-4 py-1.5 rounded-sm text-sm disabled:opacity-40"
          onClick={() => setPage(p => Math.max(1, p - 1))}
          disabled={page === 1}
        >
          Previous
        </button>
        <span className="text-zinc-400 text-sm">Page {page}</span>
        <button
          className="bg-zinc-800 text-zinc-50 px-4 py-1.5 rounded-sm text-sm disabled:opacity-40"
          onClick={() => setPage(p => p + 1)}
          disabled={sessions.length < 20}
        >
          Next
        </button>
      </div>
    </div>
  );
}
