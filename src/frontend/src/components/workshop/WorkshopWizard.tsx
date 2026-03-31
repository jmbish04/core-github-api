import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { SpecialistMenu } from "./SpecialistMenu";
import { ConsultationView } from "./ConsultationView";
import { api } from "@/lib/api-client";
import * as LucideIcons from "lucide-react";

type WizardStep = "menu" | "consultation" | "kanban";

export function WorkshopWizard() {
  const [step, setStep] = useState<WizardStep>("menu");
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);

  const handleSelectAgent = async (agentId: string) => {
    setSelectedAgentId(agentId);
    
    // Auto-save draft when an agent is selected
    try {
      const res = await api.frontend.workshop.draft.$post({
        json: {
          name: `Draft for ${agentId}`,
          draftData: { selectedAgent: agentId },
          projectId: projectId || undefined
        }
      });
      if (res.ok) {
        const data = await res.json();
        setProjectId(data.projectId);
      }
    } catch(e) {
      console.error("Failed to save draft:", e);
    }
    
    setStep("consultation");
  };

  return (
    <div className="flex w-full h-full bg-zinc-950 text-zinc-100 overflow-hidden relative">
      <AnimatePresence mode="wait">
        {step === "menu" && (
          <motion.div
            key="menu"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.3 }}
            className="w-full h-full"
          >
            <SpecialistMenu onSelect={handleSelectAgent} />
          </motion.div>
        )}
        
        {step === "consultation" && (
          <motion.div
            key="consultation"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            transition={{ duration: 0.3 }}
            className="w-full h-full flex flex-col"
          >
            {/* Header with back button */}
            <div className="h-14 border-b border-zinc-800 flex items-center px-4 shrink-0 bg-zinc-900/50">
              <button 
                onClick={() => setStep("menu")}
                className="flex items-center gap-2 text-sm text-zinc-400 hover:text-zinc-100 transition-colors"
               >
                 <LucideIcons.ArrowLeft className="w-4 h-4" />
                 Back to Specialists
              </button>
            </div>
            
            <div className="flex-[1] min-h-0">
               <ConsultationView 
                 agentId={selectedAgentId!} 
                 projectId={projectId!}
                 onComplete={() => setStep("kanban")} 
               />
            </div>
          </motion.div>
        )}

        {step === "kanban" && (
          <motion.div
            key="kanban"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3 }}
            className="w-full h-full flex flex-col items-center justify-center"
          >
            <LucideIcons.CheckCircle className="w-16 h-16 text-emerald-500 mb-4" />
            <h2 className="text-2xl font-semibold mb-2">Project Initialized</h2>
            <p className="text-zinc-400 max-w-md text-center">
              The Agentic Team has been deployed and the kanban board is ready.
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
