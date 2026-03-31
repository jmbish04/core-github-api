import React from 'react';
import DailyTrendsTab from '@/views/research/components/DailyTrendsTab';

export default function DailyTrendsPage() {
  return (
    <div className="p-6 max-w-7xl mx-auto text-white space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Deep Research: Daily Trends</h1>
        <p className="text-zinc-400">Automated daily reports tracking ecosystem shifts.</p>
      </div>

      <div className="space-y-4 pt-4">
         <DailyTrendsTab />
      </div>
    </div>
  );
}
