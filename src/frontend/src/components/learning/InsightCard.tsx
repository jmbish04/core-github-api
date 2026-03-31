import React from 'react';

type Severity = 1 | 2 | 3 | 4 | 5;

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

const SEVERITY_COLORS: Record<number, string> = {
  1: 'bg-slate-700 text-slate-200',
  2: 'bg-blue-700 text-blue-100',
  3: 'bg-yellow-700 text-yellow-100',
  4: 'bg-orange-700 text-orange-100',
  5: 'bg-red-700 text-red-100',
};

const SEVERITY_LABELS: Record<number, string> = {
  1: 'Info',
  2: 'Low',
  3: 'Medium',
  4: 'High',
  5: 'Critical',
};

export function InsightCard({ insight }: { insight: Insight }) {
  const sev = Math.min(5, Math.max(1, insight.severity)) as Severity;
  const severityClass = SEVERITY_COLORS[sev] ?? SEVERITY_COLORS[1];
  const severityLabel = SEVERITY_LABELS[sev] ?? 'Unknown';

  return (
    <div className="bg-zinc-900 p-4 rounded-sm">
      <div className="flex items-start justify-between gap-2 mb-2">
        <span className="text-zinc-400 text-xs font-mono uppercase tracking-widest">
          {insight.patternType.replace(/_/g, ' ')}
        </span>
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${severityClass}`}>
          {severityLabel}
        </span>
      </div>
      <h3 className="text-zinc-50 font-semibold tracking-tighter mb-1">{insight.title}</h3>
      <p className="text-zinc-400 text-sm leading-relaxed">{insight.description}</p>
      {insight.repo && (
        <p className="text-zinc-500 text-xs mt-2 font-mono">{insight.repo}</p>
      )}
      <div className="flex items-center justify-between mt-3">
        <span className="text-zinc-600 text-xs">
          {insight.status}
        </span>
        <span className="text-zinc-600 text-xs font-mono">
          {insight.id.slice(0, 8)}
        </span>
      </div>
    </div>
  );
}
