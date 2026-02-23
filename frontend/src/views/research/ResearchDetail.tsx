import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Loader2, Terminal, CheckCircle } from "lucide-react";

type Brief = {
  id: string;
  title: string;
  status: string;
  requirements: string;
};

type Log = {
  id: string;
  agentName: string;
  logLevel: string; // was level/type
  content: string; // was message
  createdAt: string; // was timestamp
};

type Candidate = {
  id: string;
  sourceUrl: string;
  initialSummary: string; // was description
  judgeScore: number;
  judgeReasoning: string;
  userRating: "pending" | "keep" | "discard"; // was userApproval
};

export default function ResearchDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [brief, setBrief] = useState<Brief | null>(null);
  const [logs, setLogs] = useState<Log[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
      if (!id) return;
      try {
          // Fetch Brief & Candidates
          const resBrief = await fetch(`/api/research/${id}`);
          if (resBrief.ok) {
              const data = await resBrief.json();
              setBrief(data.brief);
              setCandidates(data.candidates || []);
          }

          // Fetch Logs
          const resLogs = await fetch(`/api/research/${id}/logs`);
          if (resLogs.ok) {
              const data = await resLogs.json();
              setLogs(data.logs || []);
          }
      } catch (e) {
          console.error(e);
      } finally {
          setLoading(false);
      }
  };
  
  const handleApprove = async (candidateId: string) => {
      try {
          const res = await fetch(`/api/research/${id}/approve`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ candidateIds: [candidateId] })
          });
          if (res.ok) {
              fetchData(); // Refresh UI
          }
      } catch (e) {
          console.error("Failed to approve", e);
      }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 3000); // 3s polling
    return () => clearInterval(interval);
  }, [id]);

  if (loading && !brief) {
      return <div className="flex h-96 items-center justify-center"><Loader2 className="animate-spin" /></div>;
  }

  if (!brief) return <div>Brief not found</div>;

  return (
    <div className="container mx-auto py-8">
       <div className="flex items-center justify-between mb-6">
           <div>
               <h1 className="text-3xl font-bold">{brief.title}</h1>
               <div className="flex items-center gap-2 mt-2">
                   <Badge variant="outline">{brief.status}</Badge>
                   <span className="text-muted-foreground text-sm">ID: {brief.id}</span>
               </div>
           </div>
           <div className="flex gap-2">
               <Button variant="outline" onClick={() => navigate("/control-center/research")}>Back to Dashboard</Button>
           </div>
       </div>

       <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-2 space-y-6">
             {/* Agents Console / Logs */}
             <Card className="bg-black border-zinc-800">
                <CardHeader className="pb-2 border-b border-zinc-800">
                    <CardTitle className="text-zinc-400 text-sm font-mono flex items-center">
                        <Terminal className="mr-2 h-4 w-4" /> Live Execution Logs
                    </CardTitle>
                </CardHeader>
                <CardContent className="p-0 h-[500px] overflow-y-auto font-mono text-xs">
                    {logs.length === 0 ? (
                        <div className="p-4 text-zinc-500">Waiting for logs...</div>
                    ) : (
                        <div className="flex flex-col-reverse p-4 gap-1">
                            {logs.map(log => (
                                <div key={log.id} className="grid grid-cols-[140px_100px_1fr] gap-2">
                                    <span className="text-zinc-500">{new Date(log.createdAt).toLocaleTimeString()}</span>
                                    <span className={`font-bold ${log.agentName === 'TopicOrchestrator' ? 'text-blue-400' : 'text-purple-400'}`}>
                                        [{log.agentName}]
                                    </span>
                                    <span className={log.logLevel === 'error' ? 'text-red-400' : 'text-zinc-300'}>
                                        {log.content}
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
             </Card>
             
             {/* Report View (Placeholder) */}
               {brief.status === 'complete' && (
                   <Card>
                       <CardHeader>
                           <CardTitle>Research Report</CardTitle>
                       </CardHeader>
                       <CardContent>
                           <p className="text-muted-foreground">Report rendering coming soon.</p>
                       </CardContent>
                   </Card>
               )}
          </div>
          
          <div className="space-y-6">
             {/* Requirements */}
             <Card>
                <CardHeader>
                    <CardTitle>Context</CardTitle>
                </CardHeader>
                <CardContent>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">{brief.requirements}</p>
                </CardContent>
             </Card>
             
             {/* Candidates / HITL */}
             <Card>
                <CardHeader>
                    <CardTitle>Candidates</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    {candidates.length === 0 ? (
                         <div className="text-center py-8 text-muted-foreground">
                            <p>No candidates found yet.</p>
                        </div>
                    ) : (
                        candidates.map(candidate => (
                            <div key={candidate.id} className="border rounded-md p-3 text-sm">
                                <div className="font-semibold mb-1 truncate" title={candidate.sourceUrl}>
                                    <a href={candidate.sourceUrl} target="_blank" rel="noreferrer" className="hover:underline text-blue-400">
                                        {candidate.sourceUrl}
                                    </a>
                                </div>
                                <div className="text-muted-foreground mb-2 line-clamp-2" title={candidate.initialSummary}>
                                    {candidate.initialSummary}
                                </div>
                                <div className="flex items-center justify-between">
                                    <Badge variant={candidate.userRating === 'keep' ? 'default' : 'secondary'}>
                                        Score: {candidate.judgeScore}
                                    </Badge>
                                    
                                    {candidate.userRating === 'pending' && (
                                        <div className="flex gap-2">
                                            <Button size="xs" variant="outline" onClick={() => handleApprove(candidate.id)}>
                                                Approve
                                            </Button>
                                        </div>
                                    )}
                                    {candidate.userRating === 'keep' && <CheckCircle className="h-4 w-4 text-green-500" />}
                                </div>
                            </div>
                        ))
                    )}
                </CardContent>
             </Card>
          </div>
       </div>
    </div>
  );
}
