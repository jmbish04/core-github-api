import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from "@/components/ui/button";
import ConfigureCronTab from '@/views/research/components/ConfigureCronTab';

export default function ConfigureCronPage() {
  const navigate = useNavigate();

  return (
    <div className="p-6 max-w-7xl mx-auto text-white space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Deep Research: Configure Cron</h1>
        <p className="text-zinc-400">Scheduled extraction and recurring insights.</p>
      </div>

      <div className="space-y-4 pt-4">
         <div className="flex justify-between items-center">
           <h2 className="text-xl font-semibold">Scheduled Research</h2>
           <Button 
             onClick={() => navigate('/research/configure-cron/new')} 
             className="bg-zinc-100 text-zinc-900 hover:bg-zinc-200"
           >
             New Scheduled Job
           </Button>
         </div>
         <ConfigureCronTab 
           onEditDraft={(id) => navigate(`/research/configure-cron/${id}`)} 
           onViewReport={(id) => navigate(`/research/report/${id}`)} 
         />
      </div>
    </div>
  );
}
