import React from "react"
import {
  LineChart,
  Line,
  PieChart,
  Pie,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  Legend,
} from "recharts"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"

export interface SessionTimelineData {
  time: string
  successful: number
  failed: number
}

export interface SessionOutcomeData {
  name: string
  value: number
}

interface SessionAnalyticsChartProps {
  timelineData?: SessionTimelineData[]
  outcomeData?: SessionOutcomeData[]
}

const defaultTimelineData: SessionTimelineData[] = [
  { time: "00:00", successful: 0, failed: 0 },
  { time: "04:00", successful: 0, failed: 0 },
  { time: "08:00", successful: 0, failed: 0 },
  { time: "12:00", successful: 0, failed: 0 },
  { time: "16:00", successful: 0, failed: 0 },
  { time: "20:00", successful: 0, failed: 0 },
]

const defaultOutcomeData: SessionOutcomeData[] = [
  { name: "Success", value: 0 },
  { name: "Failed", value: 0 },
]

// Zinc monochrome palette
const COLORS = ["#d4d4d8", "#52525b"] // zinc-300, zinc-600

export function SessionAnalyticsChart({
  timelineData = defaultTimelineData,
  outcomeData = defaultOutcomeData,
}: SessionAnalyticsChartProps) {
  return (
    <div className="grid gap-4 md:grid-cols-7 lg:grid-cols-7">
      <Card className="md:col-span-4 lg:col-span-5">
        <CardHeader>
          <CardTitle>Sessions Over Time</CardTitle>
          <CardDescription>Successful vs failed agent sessions in the last 24 hours.</CardDescription>
        </CardHeader>
        <CardContent className="pl-2">
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={timelineData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                <XAxis
                  dataKey="time"
                  stroke="#a1a1aa"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  stroke="#a1a1aa"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(value) => `${value}`}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#18181b", // zinc-950
                    border: "1px solid #27272a", // zinc-800
                    borderRadius: "6px",
                    color: "#f4f4f5", // zinc-100
                  }}
                />
                <Legend iconType="circle" />
                <Line
                  type="monotone"
                  dataKey="successful"
                  name="Successful"
                  stroke="#d4d4d8" // zinc-300
                  strokeWidth={2}
                  dot={{ r: 4, fill: "#d4d4d8" }}
                  activeDot={{ r: 6 }}
                />
                <Line
                  type="monotone"
                  dataKey="failed"
                  name="Failed"
                  stroke="#52525b" // zinc-600
                  strokeWidth={2}
                  dot={{ r: 4, fill: "#52525b" }}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card className="md:col-span-3 lg:col-span-2">
        <CardHeader>
          <CardTitle>Session Outcomes</CardTitle>
          <CardDescription>Overall success rate breakdown.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={outcomeData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                  stroke="none"
                >
                  {outcomeData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#18181b",
                    border: "1px solid #27272a",
                    borderRadius: "6px",
                    color: "#f4f4f5",
                  }}
                  itemStyle={{ color: "#f4f4f5" }}
                />
                <Legend iconType="circle" verticalAlign="bottom" height={36} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
