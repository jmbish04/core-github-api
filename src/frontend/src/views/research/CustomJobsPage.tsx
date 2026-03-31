import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import CustomJobsTab from '@/views/research/components/CustomJobsTab';

export default function CustomJobsPage() {
  const navigate = useNavigate();

  return (
    <div className="p-6 max-w-7xl mx-auto text-white space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Deep Research: Custom Jobs</h1>
        <p className="text-zinc-400">Autonomous investigation management.</p>
      </div>

      <div className="space-y-4 pt-4">
         <div className="flex justify-between items-center">
           <h2 className="text-xl font-semibold">One-Time Research</h2>
           <Button 
            onClick={() => navigate('/research/custom/new')} 
            className="bg-zinc-100 text-zinc-900 hover:bg-zinc-200"
          >
             <Plus className="w-4 h-4 mr-2" />
             New Project
          </Button>
         </div>
         <CustomJobsTab 
           onEditDraft={(id) => navigate(`/research/custom/${id}`)} 
           onViewReport={(id) => navigate(`/research/report/${id}`)} 
         />
      </div>
    </div>
  );
}
