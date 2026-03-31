import React, { useEffect, useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api-client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

export default function DailyTrendsTab() {
  const [reports, setReports] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedReport, setSelectedReport] = useState<any | null>(null);

  useEffect(() => {
    const fetchReports = async () => {
      try {
        const res = await api['research'].reports.$get();
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

  const getReportHtml = (report: any) => {
    if (!report?.findings) return '<p>No findings available.</p>';
    if (typeof report.findings === 'string') return report.findings;
    if (report.findings.html) return report.findings.html;
    if (report.findings.content) return report.findings.content;
    return `<pre>${JSON.stringify(report.findings, null, 2)}</pre>`;
  };

  return (
    <div className="space-y-8">
      {(Object.entries(grouped) as [string, any[]][]).map(([title, projectReports]) => (
        <section key={title}>
          <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-wider mb-3">{title}</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {projectReports.map((report) => (
              <Card 
                key={report.reportId} 
                className="bg-zinc-950 border-zinc-800 hover:border-zinc-700 cursor-pointer transition-colors" 
                onClick={() => setSelectedReport(report)}
              >
                 <CardHeader className="p-5 pb-2 flex flex-row justify-between items-center">
                   <CardTitle className="font-semibold text-base">Daily Findings</CardTitle>
                   <Button variant="ghost" size="sm" className="text-xs">View Report &rarr;</Button>
                 </CardHeader>
                 <CardContent className="p-5 pt-0">
                   <p className="text-xs text-zinc-500">{new Date(report.createdAt).toLocaleDateString()}</p>
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

      <Dialog open={!!selectedReport} onOpenChange={(open) => !open && setSelectedReport(null)}>
        <DialogContent className="max-w-4xl h-[80vh] flex flex-col bg-zinc-950 border-zinc-800 text-zinc-200">
          <DialogHeader>
            <DialogTitle>{selectedReport?.projectTitle} - Report</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-hidden mt-4 bg-white rounded-md">
            <iframe 
              className="w-full h-full border-none" 
              srcDoc={getReportHtml(selectedReport)}
              title="Report Content"
              sandbox="allow-same-origin allow-popups"
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
