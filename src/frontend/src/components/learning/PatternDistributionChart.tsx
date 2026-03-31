import React, { useEffect, useState } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

interface PatternCount {
  patternType: string;
  count: number;
}

export function PatternDistributionChart({ apiBase = '/api/learning' }: { apiBase?: string }) {
  const [data, setData] = useState<PatternCount[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${apiBase}/insights/global`)
      .then(r => r.json() as Promise<{ data: PatternCount[] }>)
      .then(d => { setData(d.data ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [apiBase]);

  if (loading) return <div className="text-zinc-400 text-sm">Loading chart...</div>;

  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
        <XAxis
          dataKey="patternType"
          tick={{ fill: '#fafafa', fontSize: 11 }}
          tickFormatter={v => v.replace(/_/g, ' ')}
        />
        <YAxis tick={{ fill: '#fafafa', fontSize: 11 }} />
        <Tooltip
          contentStyle={{ background: '#18181b', border: 'none', color: '#fafafa' }}
          labelStyle={{ color: '#fafafa' }}
        />
        <Bar dataKey="count" fill="#f97316" radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
