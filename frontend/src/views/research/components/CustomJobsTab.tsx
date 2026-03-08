import React, { useEffect, useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/lib/api-client';

export default function CustomJobsTab({ onEditDraft, onViewReport }: { onEditDraft: (id: string) => void, onViewReport: (id: string) => void }) {
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchJobs = async () => {
      try {
        const res = await api['research-projects'].projects.$get({ query: { type: 'custom' } });
        setProjects((await res.json()) as any);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    fetchJobs();
    
    // Poll for progress updates every few seconds
    const interval = setInterval(fetchJobs, 5000);
    return () => clearInterval(interval);
  }, []);

  if (loading) return <div className="text-zinc-500 text-center py-10">Loading jobs...</div>;

  const drafts = projects.filter(p => p.status === 'draft');
  const processing = projects.filter(p => p.status === 'processing');
  const completed = projects.filter(p => ['completed', 'failed'].includes(p.status));

  return (
    <div className="space-y-8">
      {drafts.length > 0 && (
        <section>
          <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-wider mb-3">Drafts</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {drafts.map(p => (
              <Card key={p.id} className="bg-zinc-950 border-zinc-800 hover:border-zinc-700 cursor-pointer transition-colors" onClick={() => onEditDraft(p.id)}>
                <CardContent className="p-4 space-y-2">
                  <h4 className="font-semibold">{p.title || 'Untitled Draft'}</h4>
                  <p className="text-xs text-zinc-500 line-clamp-2">{p.goal || 'No goal specified...'}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}

      {processing.length > 0 && (
        <section>
          <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-wider mb-3">In Progress</h3>
          <div className="grid grid-cols-1 gap-4">
            {processing.map(p => (
              <Card key={p.id} className="bg-zinc-950 border-purple-900/50 cursor-pointer hover:bg-zinc-900/50" onClick={() => onViewReport(p.id)}>
                <CardContent className="p-6 space-y-4">
                  <div className="flex justify-between items-center">
                    <h4 className="font-bold text-lg">{p.title}</h4>
                    <span className="text-xs text-purple-400 animate-pulse">{p.progress}%</span>
                  </div>
                  <Progress value={p.progress} className="h-1 bg-zinc-800 [&>div]:bg-purple-600" />
                  <div className="space-y-2 pt-2">
                    <Skeleton className="h-3 w-3/4 bg-zinc-800" />
                    <Skeleton className="h-3 w-1/2 bg-zinc-800" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}

      {completed.length > 0 && (
        <section>
          <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-wider mb-3">Completed</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {completed.map(p => (
              <Card key={p.id} className="bg-black border-zinc-800 hover:border-zinc-600 cursor-pointer transition-colors" onClick={() => onViewReport(p.id)}>
                <CardContent className="p-5 flex justify-between items-center">
                  <div>
                    <h4 className="font-semibold">{p.title}</h4>
                    <span className="text-xs text-zinc-500">Finished computing</span>
                  </div>
                  <Button variant="ghost" size="sm" className="text-xs">View Report &rarr;</Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}
      
      {projects.length === 0 && (
         <div className="py-12 text-center text-zinc-500 border border-dashed border-zinc-800 rounded-lg">
           No custom jobs yet. Create a new project to get started.
         </div>
      )}
    </div>
  );
}
