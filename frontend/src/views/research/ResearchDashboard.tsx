import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from "@/components/ui/card";
import { useNavigate } from "react-router-dom";
import { Plus, Clock, CheckCircle2, AlertCircle, Loader2, PlayCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";

type Brief = {
  id: string;
  title: string;
  status: "planning" | "researching" | "waiting_approval" | "review" | "complete" | "failed";
  createdAt: string;
};

export default function ResearchDashboard() {
  const navigate = useNavigate();
  const [briefs, setBriefs] = useState<Brief[]>([]);
  const [loading, setLoading] = useState(true);

  // Poll for updates every 10s
  useEffect(() => {
    const fetchBriefs = async () => {
        try {
            // Need a new endpoint: `GET /api/research/list`?
            // Or just use `GET /api/research/:id` if we know IDs?
            // We typically need a list endpoint. 
            // Since I didn't create a list endpoint in backend yet, I'll add a TODO and use a mock or 
            // if I missed creating it, I should likely create it. 
            // Wait, I only created `/create` and `/:id`. I need `/list`.
            // For now, I will Mock it to unblock UI dev, or use `localStorage` if I was allowed.
            // Let's assume I will add `GET /api/research` to backend next.
            const res = await fetch("/api/research"); 
            if (res.ok) {
                const data = await res.json();
                setBriefs(data.briefs || []);
            }
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    fetchBriefs();
    const interval = setInterval(fetchBriefs, 10000);
    return () => clearInterval(interval);
  }, []);

  const getStatusColor = (status: string) => {
      switch(status) {
          case 'planning': return 'bg-blue-500/10 text-blue-500 hover:bg-blue-500/20';
          case 'researching': return 'bg-purple-500/10 text-purple-500 hover:bg-purple-500/20';
          case 'waiting_approval': return 'bg-yellow-500/10 text-yellow-500 hover:bg-yellow-500/20';
          case 'complete': return 'bg-green-500/10 text-green-500 hover:bg-green-500/20';
          default: return 'bg-gray-500/10 text-gray-500';
      }
  };

  return (
    <div className="container mx-auto py-8">
      <div className="flex justify-between items-center mb-8">
        <div>
           <h1 className="text-3xl font-bold tracking-tight">Research Center</h1>
           <p className="text-muted-foreground">Manage autonomous research agents and topics.</p>
        </div>
        <Button onClick={() => navigate("/control-center/research/new")}>
          <Plus className="mr-2 h-4 w-4" /> New Topic
        </Button>
      </div>
      
      {loading && briefs.length === 0 ? (
          <div className="flex justify-center p-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {briefs.length === 0 ? (
                <Card className="border-dashed bg-muted/40 col-span-full">
                    <CardHeader>
                        <CardTitle className="text-center text-muted-foreground">No active research</CardTitle>
                    </CardHeader>
                    <CardContent className="text-center pb-8">
                        <Button variant="link" onClick={() => navigate("/control-center/research/new")}>Start your first topic</Button>
                    </CardContent>
                </Card>
            ) : (
                briefs.map(brief => (
                    <Card key={brief.id} className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => navigate(`/control-center/research/${brief.id}`)}>
                        <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
                            <CardTitle className="text-lg font-semibold line-clamp-1">{brief.title}</CardTitle>
                            <Badge variant="secondary" className={getStatusColor(brief.status)}>
                                {brief.status.replace("_", " ")}
                            </Badge>
                        </CardHeader>
                        <CardContent>
                            <div className="flex items-center text-sm text-muted-foreground mt-4">
                                <Clock className="mr-1 h-3 w-3" />
                                {new Date(brief.createdAt).toLocaleDateString()}
                            </div>
                        </CardContent>
                    </Card>
                ))
            )}
        </div>
      )}
    </div>
  );
}
