import React, { useEffect, useState } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

interface DayCount {
  date: string;
  count: number;
}

export function InsightTrendChart({ apiBase = '/api/learning' }: { apiBase?: string }) {
  const [data, setData] = useState<DayCount[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Fetch sessions from last 30 days and aggregate by day
    fetch(`${apiBase}/sessions?page=1`)
      .then(r => r.json() as Promise<{ data: any[] }>)
      .then(d => {
        const sessions = d.data ?? [];
        const dayCounts: Record<string, number> = {};
        const now = Date.now();
        const thirtyDays = 30 * 24 * 60 * 60 * 1000;

        for (const session of sessions) {
          const ts = session.createdAt ?? session.startedAt;
          if (!ts) continue;
          const date = new Date(ts);
          if (now - date.getTime() > thirtyDays) continue;
          const day = date.toISOString().slice(0, 10);
          dayCounts[day] = (dayCounts[day] ?? 0) + (session.insightCount ?? 0);
        }

        const sorted = Object.entries(dayCounts)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([date, count]) => ({ date, count }));

        setData(sorted);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [apiBase]);

  if (loading) return <div className="text-zinc-400 text-sm">Loading chart...</div>;

  return (
    <ResponsiveContainer width="100%" height={240}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="insightGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#f97316" stopOpacity={0.4} />
            <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
        <XAxis
          dataKey="date"
          tick={{ fill: '#fafafa', fontSize: 10 }}
          tickFormatter={v => v.slice(5)}
        />
        <YAxis tick={{ fill: '#fafafa', fontSize: 10 }} />
        <Tooltip
          contentStyle={{ background: '#18181b', border: 'none', color: '#fafafa' }}
          labelStyle={{ color: '#fafafa' }}
        />
        <Area
          type="monotone"
          dataKey="count"
          stroke="#f97316"
          fill="url(#insightGradient)"
          strokeWidth={2}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
