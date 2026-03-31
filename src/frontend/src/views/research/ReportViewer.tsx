import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom'; 
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardHeader, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api-client';

export default function ReportViewer() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    if (!id) return;
    
    const fetchReport = async () => {
      const res = await api['research'].projects[':id'].details.$get({ param: { id } });
      setData((await res.json()) as any);
    };

    fetchReport();
    const interval = setInterval(() => {
      if (data?.project?.status === 'processing') fetchReport();
    }, 2500); // Poll while running
    return () => clearInterval(interval);
  }, [id, data?.project?.status]);

  if (!data?.project) return <div className="p-10 text-white">Loading...</div>;

  const { project, latestReport } = data;

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-8 text-white">
      <Button variant="ghost" onClick={() => navigate('/research')} className="text-zinc-400">← Back to Dashboard</Button>
      <div>
        <h1 className="text-3xl font-bold mb-2">{project.title}</h1>
        <p className="text-zinc-400">{project.goal}</p>
      </div>

      {(project.status === 'processing' || project.status === 'draft') && (
        <div className="bg-zinc-950 border border-zinc-800 p-8 rounded-xl space-y-6">
          <div className="flex justify-between text-sm font-medium">
            <span className="text-zinc-400 animate-pulse">Swarm is actively analyzing sources...</span>
            <span>{project.progress}%</span>
          </div>
          <Progress value={project.progress} className="h-2 bg-zinc-800 [&>div]:bg-zinc-100" />

          {/* Skeleton Layout matching final report structure */}
          <div className="space-y-6 pt-8">
            <Skeleton className="h-8 w-[250px] bg-zinc-800" />
            <Skeleton className="h-4 w-[90%] bg-zinc-800" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4">
              {[1, 2, 3, 4].map((i) => (
                <Card key={i} className="bg-black border-zinc-800">
                  <CardHeader>
                    <Skeleton className="h-6 w-3/4 bg-zinc-800" />
                    <Skeleton className="h-4 w-1/2 bg-zinc-800 mt-2" />
                  </CardHeader>
                  <CardContent>
                    <Skeleton className="h-24 w-full bg-zinc-900 rounded-md" />
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </div>
      )}

      {project.status === 'completed' && (
        <Card className="bg-black border-zinc-800 p-6">
          <h2 className="text-2xl font-bold mb-4">Findings</h2>
          <pre className="text-zinc-400 whitespace-pre-wrap">
            {latestReport ? JSON.stringify(latestReport.findings, null, 2) : "No findings generated yet."}
          </pre>
        </Card>
      )}
    </div>
  );
}
