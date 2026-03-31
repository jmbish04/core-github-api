import React, { useState } from 'react';

interface Session {
  id: string;
  triggerType: string;
  status?: string | null;
  insightCount?: number | null;
  startedAt?: Date | string | null;
  completedAt?: Date | string | null;
  createdAt?: Date | string | null;
}

function formatDuration(start?: Date | string | null, end?: Date | string | null): string {
  if (!start || !end) return '—';
  const diff = new Date(end).getTime() - new Date(start).getTime();
  if (diff < 0) return '—';
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return `${secs}s`;
  return `${Math.floor(secs / 60)}m ${secs % 60}s`;
}

export function SessionRow({ session }: { session: Session }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <tr
        className="cursor-pointer hover:bg-zinc-800 transition-colors"
        onClick={() => setExpanded(e => !e)}
      >
        <td className="py-2 px-3 text-zinc-400 font-mono text-xs">{session.id.slice(0, 8)}…</td>
        <td className="py-2 px-3 text-zinc-50 text-sm capitalize">{session.triggerType}</td>
        <td className="py-2 px-3 text-zinc-50 text-sm">{session.insightCount ?? 0}</td>
        <td className="py-2 px-3 text-zinc-400 text-sm">
          {formatDuration(session.startedAt, session.completedAt)}
        </td>
        <td className="py-2 px-3">
          <span
            className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
              session.status === 'completed'
                ? 'bg-green-800 text-green-100'
                : session.status === 'running'
                ? 'bg-blue-800 text-blue-100'
                : 'bg-zinc-700 text-zinc-300'
            }`}
          >
            {session.status ?? 'pending'}
          </span>
        </td>
      </tr>
      {expanded && (
        <tr className="bg-zinc-900">
          <td colSpan={5} className="py-3 px-4">
            <div className="text-zinc-400 text-xs font-mono space-y-1">
              <div><span className="text-zinc-500">ID:</span> {session.id}</div>
              <div><span className="text-zinc-500">Started:</span> {session.startedAt ? new Date(session.startedAt).toISOString() : '—'}</div>
              <div><span className="text-zinc-500">Completed:</span> {session.completedAt ? new Date(session.completedAt).toISOString() : '—'}</div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
