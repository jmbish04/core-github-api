import React, { useEffect, useState } from 'react';
import { Card, CardHeader, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api-client';

export default function DailyTrendsTab({ onViewReport }: { onViewReport: (id: string) => void }) {
  const [reports, setReports] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchReports = async () => {
      try {
        const res = await api['research-projects'].reports.$get();
        setReports((await res.json()) as any);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    fetchReports();
  }, []);

  if (loading) return <div className="text-zinc-500 text-center py-10">Loading trend reports...</div>;

  // Group reports by project title
  const grouped = reports.reduce((acc, curr) => {
    const title = curr.projectTitle || 'Uncategorized';
    if (!acc[title]) acc[title] = [];
    acc[title].push(curr);
    return acc;
  }, {} as Record<string, any[]>);

  return (
    <div className="space-y-8">
      {(Object.entries(grouped) as [string, any[]][]).map(([title, projectReports]) => (
        <section key={title}>
          <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-wider mb-3">{title}</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {projectReports.map(report => (
              <Card key={report.reportId} className="bg-zinc-950 border-zinc-800 hover:border-zinc-700 cursor-pointer transition-colors" onClick={() => onViewReport(report.projectId)}>
                 <CardContent className="p-5 flex justify-between items-center">
                   <div>
                     <h4 className="font-semibold">Daily Findings</h4>
                     <p className="text-xs text-zinc-500">{new Date(report.createdAt).toLocaleDateString()}</p>
                   </div>
                   <Button variant="ghost" size="sm" className="text-xs">View Report &rarr;</Button>
                 </CardContent>
              </Card>
            ))}
          </div>
        </section>
      ))}

      {reports.length === 0 && (
         <div className="py-12 text-center text-zinc-500 border border-dashed border-zinc-800 rounded-lg">
           No daily trend reports have been generated yet.
         </div>
      )}
    </div>
  );
}
