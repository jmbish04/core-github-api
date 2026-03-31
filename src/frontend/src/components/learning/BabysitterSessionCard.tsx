import React, { useState } from 'react';

interface ActiveSession {
  id: string;
  status?: string | null;
  loopScore?: number;
  lastMessage?: string;
  interventionCount?: number;
}

interface BabysitterSessionCardProps {
  session: ActiveSession;
  apiBase?: string;
  onOverride?: (sessionId: string) => void;
}

export function BabysitterSessionCard({
  session,
  apiBase = '/api/learning',
  onOverride,
}: BabysitterSessionCardProps) {
  const [overriding, setOverriding] = useState(false);
  const [done, setDone] = useState(false);

  const handleOverride = async () => {
    setOverriding(true);
    try {
      await fetch(`${apiBase}/upscale`, { method: 'POST' });
      setDone(true);
      onOverride?.(session.id);
    } catch {
      // ignore
    } finally {
      setOverriding(false);
    }
  };

  const loopScore = session.loopScore ?? 0;
  const loopColor = loopScore >= 3 ? 'text-red-400' : loopScore >= 1 ? 'text-yellow-400' : 'text-green-400';

  return (
    <div className="bg-zinc-900 p-4 rounded-sm">
      <div className="flex items-start justify-between mb-2">
        <div>
          <span className="text-zinc-400 text-xs font-mono">{session.id.slice(0, 12)}…</span>
          <p className={`text-sm font-semibold ${loopColor}`}>
            Loop Score: {loopScore}
          </p>
        </div>
        <span
          className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
            session.status === 'active'
              ? 'bg-blue-800 text-blue-100'
              : 'bg-zinc-700 text-zinc-300'
          }`}
        >
          {session.status ?? 'unknown'}
        </span>
      </div>

      {session.lastMessage && (
        <p className="text-zinc-400 text-xs truncate mb-2">{session.lastMessage}</p>
      )}

      <div className="flex items-center justify-between text-zinc-500 text-xs mb-3">
        <span>Interventions: {session.interventionCount ?? 0}</span>
      </div>

      {done ? (
        <span className="text-green-400 text-xs">Override sent.</span>
      ) : (
        <button
          className="bg-orange-700 hover:bg-orange-600 text-white text-xs px-3 py-1.5 rounded-sm transition-colors disabled:opacity-40"
          onClick={handleOverride}
          disabled={overriding}
        >
          {overriding ? 'Sending…' : 'Manual Override'}
        </button>
      )}
    </div>
  );
}
