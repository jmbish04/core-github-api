import { useState } from 'react';
import { StitchProjectBrowser } from '@/components/jules/StitchProjectBrowser';
import { RetrofitWorkflow } from '@/components/jules/RetrofitWorkflow';

export default function DesignLabPage() {
  const [selectedScreenId, setSelectedScreenId] = useState<string | null>(null);

  return (
    <div className="flex flex-col min-h-screen bg-zinc-950 text-zinc-100 p-6">
      <div className="max-w-7xl mx-auto w-full space-y-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white mb-2">Jules Design Intelligence</h1>
          <p className="text-zinc-400">
            Browse generative UI designs from Stitch and retrofit them directly into your codebase.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-7">
            <StitchProjectBrowser onSelectScreen={(screenId) => setSelectedScreenId(screenId)} />
          </div>
          
          <div className="lg:col-span-5">
            <RetrofitWorkflow selectedScreenId={selectedScreenId} />
          </div>
        </div>
      </div>
    </div>
  );
}
