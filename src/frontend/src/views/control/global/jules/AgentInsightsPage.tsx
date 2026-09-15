import React, { useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { AgentMetricsGrid } from "@/components/jules/AgentMetricsGrid"
import { SessionAnalyticsChart } from "@/components/jules/SessionAnalyticsChart"

interface HistorySession {
  id: string
  repo: string
  status: "success" | "failed" | "in_progress" | "unknown"
  duration: string
  startedAt: string
}

export function AgentInsightsPage() {
  const [recentSessions, setRecentSessions] = useState<HistorySession[]>([])

  // Load mock data representing a client-side aggregation of /api/julius/history
  useEffect(() => {
    // In a real application, this would fetch from GET /api/julius/history
    // For now, we use mock data representing the aggregated result.
    const mockSessions: HistorySession[] = [
      {
        id: "sess_01HGWJ9Z4K2",
        repo: "google/jules-dashboard",
        status: "success",
        duration: "4m 12s",
        startedAt: "10 mins ago",
      },
      {
        id: "sess_01HGWJ9Z4K3",
        repo: "google/jules-agent",
        status: "in_progress",
        duration: "2m 05s",
        startedAt: "2 mins ago",
      },
      {
        id: "sess_01HGWJ9Z4K4",
        repo: "google/genai-sdk",
        status: "failed",
        duration: "1m 30s",
        startedAt: "1 hour ago",
      },
      {
        id: "sess_01HGWJ9Z4K5",
        repo: "google/jules-dashboard",
        status: "success",
        duration: "15m 22s",
        startedAt: "3 hours ago",
      },
      {
        id: "sess_01HGWJ9Z4K6",
        repo: "google/jules-dashboard",
        status: "success",
        duration: "8m 45s",
        startedAt: "5 hours ago",
      },
    ]

    setRecentSessions(mockSessions)
  }, [])

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case "success":
        return "default" // or a custom green if added to theme
      case "failed":
        return "destructive"
      case "in_progress":
        return "secondary"
      default:
        return "outline"
    }
  }

  const getStatusText = (status: string) => {
    switch (status) {
      case "success":
        return "Success"
      case "failed":
        return "Failed"
      case "in_progress":
        return "In Progress"
      default:
        return "Unknown"
    }
  }

  return (
    <div className="flex-1 space-y-4 p-8 pt-6">
      <div className="flex items-center justify-between space-y-2">
        <h2 className="text-3xl font-bold tracking-tight text-zinc-100">Agent Insights</h2>
        <div className="flex items-center space-x-2">
          {/* Action buttons could go here */}
        </div>
      </div>

      <div className="space-y-4">
        {/* Top metrics grid */}
        <AgentMetricsGrid />

        {/* Charts section */}
        <SessionAnalyticsChart />

        {/* Recent sessions table */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Sessions</CardTitle>
            <CardDescription>
              A history of recent agent execution sessions and their outcomes.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow className="border-zinc-800 hover:bg-zinc-900/50">
                  <TableHead className="w-[150px] text-zinc-400">Session ID</TableHead>
                  <TableHead className="text-zinc-400">Repository</TableHead>
                  <TableHead className="text-zinc-400">Status</TableHead>
                  <TableHead className="text-zinc-400">Duration</TableHead>
                  <TableHead className="text-right text-zinc-400">Started At</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentSessions.map((session) => (
                  <TableRow key={session.id} className="border-zinc-800 hover:bg-zinc-900/50">
                    <TableCell className="font-mono text-xs text-zinc-300">
                      {session.id}
                    </TableCell>
                    <TableCell className="font-medium text-zinc-200">
                      {session.repo}
                    </TableCell>
                    <TableCell>
                      <Badge variant={getStatusBadgeVariant(session.status) as any}>
                        {getStatusText(session.status)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-zinc-300">{session.duration}</TableCell>
                    <TableCell className="text-right text-zinc-400">
                      {session.startedAt}
                    </TableCell>
                  </TableRow>
                ))}
                {recentSessions.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="h-24 text-center text-zinc-500">
                      No recent sessions found.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
