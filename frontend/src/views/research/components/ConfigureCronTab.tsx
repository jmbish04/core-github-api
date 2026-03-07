import React, { useEffect, useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api-client';

export default function ConfigureCronTab({ onEditDraft, onViewReport }: { onEditDraft: (id: string) => void, onViewReport: (id: string) => void }) {
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchJobs = async () => {
      try {
        const res = await api['research-projects'].projects.$get({ query: { type: 'cron' } });
        setProjects((await res.json()) as any);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    fetchJobs();
  }, []);

  if (loading) return <div className="text-zinc-500 text-center py-10">Loading configurations...</div>;

  const drafts = projects.filter(p => p.status === 'draft');
  const active = projects.filter(p => p.status === 'active');

  return (
    <div className="space-y-8">
      {drafts.length > 0 && (
        <section>
          <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-wider mb-3">Draft Configurations</h3>
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

      {active.length > 0 && (
        <section>
          <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-wider mb-3">Active Schedules</h3>
          <div className="grid grid-cols-1 gap-4">
            {active.map(p => (
              <Card key={p.id} className="bg-black border-zinc-800 border-l-4 border-l-green-500 cursor-pointer hover:bg-zinc-950 transition-colors" onClick={() => onEditDraft(p.id)}>
                <CardContent className="p-6 flex justify-between items-center">
                  <div>
                    <h4 className="font-bold text-lg">{p.title}</h4>
                    <p className="text-sm text-zinc-400 mt-1">{p.goal}</p>
                    <div className="mt-3 flex gap-2">
                      <span className="text-xs bg-zinc-900 px-2 py-1 rounded text-zinc-300">Schedule: <code className="text-green-400">{p.cronSchedule || '0 8 * * *'}</code></span>
                    </div>
                  </div>
                  <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); onViewReport(p.id); }}>View Latest &rarr;</Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}
      
      {projects.length === 0 && (
         <div className="py-12 text-center text-zinc-500 border border-dashed border-zinc-800 rounded-lg">
           No scheduled jobs configured.
         </div>
      )}
    </div>
  );
}
