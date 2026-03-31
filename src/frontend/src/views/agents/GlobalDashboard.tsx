import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer
} from "recharts";
import { AlertCircle, ShieldCheck, Zap, History } from "lucide-react";

// -- TODO: Hookup backend api layer to serve the data on this page
const data = [
  { name: "Mon", immunized: 10, hallucinations: 5 },
  { name: "Tue", immunized: 20, hallucinations: 4 },
  { name: "Wed", immunized: 30, hallucinations: 8 },
  { name: "Thu", immunized: 45, hallucinations: 6 },
  { name: "Fri", immunized: 48, hallucinations: 2 },
];

export default function GlobalDashboard() {
  return (
    <div className="flex flex-col gap-8 p-8 bg-zinc-950 min-h-screen text-zinc-50">
      <header className="flex flex-col gap-2">
        <h1 className="text-4xl font-bold tracking-tighter">Architectural Memory</h1>
        <p className="text-zinc-400">Global pattern recognition and fleet immunization status.</p>
      </header>

      {/* Metric Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <MetricCard 
          title="Active Hallucinations" 
          value="12" 
          delta="-14%" 
          icon={<AlertCircle className="w-4 h-4 text-zinc-400" />} 
        />
        <MetricCard 
          title="Immunized Repos" 
          value="48" 
          delta="+8" 
          icon={<ShieldCheck className="w-4 h-4 text-zinc-200" />} 
        />
        <MetricCard 
          title="Remediation Rate" 
          value="92.4%" 
          delta="+2.1%" 
          icon={<Zap className="w-4 h-4 text-zinc-50" />} 
        />
        <MetricCard 
          title="Total Sessions" 
          value="1,204" 
          delta="Daily Sync Active" 
          icon={<History className="w-4 h-4 text-zinc-500" />} 
        />
      </div>

      {/* Main Chart */}
      <Card className="bg-zinc-900 border-none shadow-2xl">
        <CardHeader>
          <CardTitle className="text-zinc-100 uppercase tracking-widest text-xs">Hallucination Delta vs. Immunization Growth</CardTitle>
        </CardHeader>
        <CardContent className="h-[400px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data}>
              <defs>
                <linearGradient id="colorImm" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#fafafa" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#fafafa" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
              <XAxis 
                dataKey="name" 
                stroke="#71717a" 
                fontSize={12} 
                tickLine={false} 
                axisLine={false}
              />
              <YAxis 
                stroke="#71717a" 
                fontSize={12} 
                tickLine={false} 
                axisLine={false}
                tickFormatter={(value) => `${value}`}
              />
              <Tooltip 
                contentStyle={{ backgroundColor: "#09090b", border: "none", borderRadius: "8px" }}
                itemStyle={{ color: "#fafafa" }}
              />
              <Area 
                type="monotone" 
                dataKey="immunized" 
                stroke="#fafafa" 
                fillOpacity={1} 
                fill="url(#colorImm)" 
                strokeWidth={2}
              />
              <Area 
                type="monotone" 
                dataKey="hallucinations" 
                stroke="#52525b" 
                fill="transparent" 
                strokeWidth={2}
                strokeDasharray="5 5"
              />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}

function MetricCard({ title, value, delta, icon }: { title: string, value: string, delta: string, icon: React.ReactNode }) {
  return (
    <Card className="bg-zinc-900 border-none">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-xs font-medium text-zinc-400 uppercase tracking-wider">
          {title}
        </CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold text-zinc-50">{value}</div>
        <p className="text-xs text-zinc-500 mt-1">
          <span className={delta.startsWith('+') ? "text-zinc-200" : "text-zinc-400"}>{delta}</span> from last period
        </p>
      </CardContent>
    </Card>
  );
}
