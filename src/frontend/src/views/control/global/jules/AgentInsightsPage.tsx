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
import { Loader2 } from "lucide-react"
import { AgentMetricsGrid } from "@/components/jules/AgentMetricsGrid"
import { SessionAnalyticsChart } from "@/components/jules/SessionAnalyticsChart"
import { useAgentInsights } from "@/hooks/jules/useAgentInsights"

export function AgentInsightsPage() {
  const { sessions: recentSessions, metrics, timelineData, outcomeData, isLoading, error } = useAgentInsights()

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

      {isLoading && (
        <div className="flex items-center justify-center py-12 text-zinc-500 gap-2">
          <Loader2 className="w-5 h-5 animate-spin" />
          Loading insights...
        </div>
      )}
      {error ? (
        <div className="text-sm text-red-400 bg-red-950/30 border border-red-900 rounded-md p-3">
          Failed to load insights: {error instanceof Error ? error.message : String(error)}
        </div>
      ) : null}

      <div className="space-y-4">
        {/* Top metrics grid — pass real computed metrics */}
        <AgentMetricsGrid metrics={metrics} />

        {/* Charts section — pass real computed data */}
        <SessionAnalyticsChart timelineData={timelineData} outcomeData={outcomeData} />

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
