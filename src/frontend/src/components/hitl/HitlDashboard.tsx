import React, { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CalendarIcon, EyeIcon } from "lucide-react";
import { api } from "@/lib/api-client";

export function HitlDashboard() {
  const [summary, setSummary] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchSummary() {
      try {
        const res = await api.api.hitl.summary.$get();
        if (res.ok) {
          const data = await res.json();
          setSummary(data.summary);
        }
      } catch (err) {
        console.error("Failed to fetch HITL summary", err);
      } finally {
        setLoading(false);
      }
    }
    fetchSummary();
  }, []);

  const getCategoryDetails = (cat: string) => {
    if (cat === 'jules_session_dispatch') {
      return { title: 'Jules Sessions', desc: 'Review & dispatch Jules coding sessions', icon: <CalendarIcon className="h-4 w-4 text-muted-foreground"/>, url: '/hitl/jules-sessions' };
    }
    if (cat === 'build_analysis') {
      return { title: 'Build Failures', desc: 'CI Healer build failure analysis logic', icon: <EyeIcon className="h-4 w-4 text-muted-foreground"/>, url: '/hitl/build-analysis' };
    }
    return { title: cat, desc: 'Generic HITL Category', icon: <EyeIcon className="h-4 w-4 text-muted-foreground"/>, url: `/hitl/${cat}` };
  };

  if (loading) {
     return <div className="text-zinc-500 animate-pulse">Loading overview...</div>;
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {summary.map((item, idx) => {
        const details = getCategoryDetails(item.category);
        return (
          <a key={idx} href={details.url} className="block group">
            <Card className="h-full bg-zinc-950 border-zinc-800 transition-colors group-hover:border-zinc-700">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <div className="space-y-1">
                  <CardTitle className="text-lg font-medium text-zinc-100">
                    {details.title}
                  </CardTitle>
                  <CardDescription className="text-xs">
                    {details.desc}
                  </CardDescription>
                </div>
                {details.icon}
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold flex items-center gap-2">
                  {item.count} 
                  <Badge variant="outline" className="font-normal text-zinc-400 bg-zinc-900/50">
                    Pending
                  </Badge>
                </div>
              </CardContent>
            </Card>
          </a>
        );
      })}
      {summary.length === 0 && (
         <div className="col-span-full py-12 text-center border border-dashed border-zinc-800 rounded-lg">
            <h3 className="text-lg font-medium text-white mb-2">No Pendings Actions</h3>
            <p className="text-muted-foreground">The HITL Queue is currently clean.</p>
         </div>
      )}
    </div>
  );
}
