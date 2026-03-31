import React, { useState, useEffect } from 'react';
import { InsightCard } from './InsightCard';

interface Insight {
  id: string;
  patternType: string;
  title: string;
  description: string;
  severity: number;
  status: string;
  repo?: string | null;
  createdAt?: Date | string | null;
}

interface Filters {
  patternType: string;
  severity: string;
  status: string;
}

interface InsightGridProps {
  apiBase?: string;
}

export function InsightGrid({ apiBase = '/api/learning' }: InsightGridProps) {
  const [insights, setInsights] = useState<Insight[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<Filters>({
    patternType: '',
    severity: '',
    status: '',
  });

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page) });
    if (filters.patternType) params.set('patternType', filters.patternType);
    if (filters.severity) params.set('severity', filters.severity);
    if (filters.status) params.set('status', filters.status);

    fetch(`${apiBase}/insights?${params}`)
      .then(r => r.json() as Promise<{ data: Insight[] }>)
      .then(d => { setInsights(d.data ?? []); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, [page, filters]);

  return (
    <div>
      {/* Filter bar */}
      <div className="flex gap-3 mb-6 flex-wrap">
        <select
          className="bg-zinc-800 text-zinc-50 px-3 py-1.5 rounded-sm text-sm"
          value={filters.patternType}
          onChange={e => setFilters(f => ({ ...f, patternType: e.target.value }))}
        >
          <option value="">All Patterns</option>
          <option value="doom_loop">Doom Loop</option>
          <option value="anti_pattern">Anti-Pattern</option>
          <option value="standard_violation">Standard Violation</option>
          <option value="best_practice">Best Practice</option>
        </select>
        <select
          className="bg-zinc-800 text-zinc-50 px-3 py-1.5 rounded-sm text-sm"
          value={filters.severity}
          onChange={e => setFilters(f => ({ ...f, severity: e.target.value }))}
        >
          <option value="">All Severities</option>
          {[1, 2, 3, 4, 5].map(s => (
            <option key={s} value={String(s)}>{s}</option>
          ))}
        </select>
        <select
          className="bg-zinc-800 text-zinc-50 px-3 py-1.5 rounded-sm text-sm"
          value={filters.status}
          onChange={e => setFilters(f => ({ ...f, status: e.target.value }))}
        >
          <option value="">All Statuses</option>
          <option value="open">Open</option>
          <option value="proposed">Proposed</option>
          <option value="resolved">Resolved</option>
        </select>
      </div>

      {loading && <p className="text-zinc-400">Loading insights...</p>}
      {error && <p className="text-red-400">{error}</p>}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {insights.map(insight => (
          <InsightCard key={insight.id} insight={insight} />
        ))}
        {!loading && insights.length === 0 && (
          <p className="text-zinc-500 col-span-full">No insights found.</p>
        )}
      </div>

      {/* Pagination */}
      <div className="flex gap-3 mt-6 items-center">
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
          disabled={insights.length < 20}
        >
          Next
        </button>
      </div>
    </div>
  );
}
