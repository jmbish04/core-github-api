import React from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Activity, CheckCircle2, Clock, Users } from "lucide-react"

export interface AgentMetrics {
  sessionsToday: number
  successRate: number
  avgDurationMinutes: number
  activeNow: number
}

interface AgentMetricsGridProps {
  metrics?: AgentMetrics
}

export function AgentMetricsGrid({ metrics }: AgentMetricsGridProps) {
  const data = metrics || {
    sessionsToday: 0,
    successRate: 0,
    avgDurationMinutes: 0,
    activeNow: 0,
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Sessions Today</CardTitle>
          <Activity className="h-4 w-4 text-zinc-500" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{data.sessionsToday}</div>
          <p className="text-xs text-zinc-500">+12% from yesterday</p>
        </CardContent>
      </Card>
      
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Success Rate</CardTitle>
          <CheckCircle2 className="h-4 w-4 text-zinc-500" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{data.successRate.toFixed(1)}%</div>
          <p className="text-xs text-zinc-500">+2.1% from last week</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Avg Duration</CardTitle>
          <Clock className="h-4 w-4 text-zinc-500" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{data.avgDurationMinutes}m</div>
          <p className="text-xs text-zinc-500">-1.2m from last week</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Active Now</CardTitle>
          <Users className="h-4 w-4 text-zinc-500" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{data.activeNow}</div>
          <p className="text-xs text-zinc-500">Currently executing</p>
        </CardContent>
      </Card>
    </div>
  )
}
