import React, { useState } from 'react';
import { toast } from 'sonner';
import { Microscope, Github, FileCode, X } from 'lucide-react';
import { api } from '@/lib/api-client';
import type { RegistryItem } from './data';

interface UxResearcherModalProps {
  isOpen: boolean;
  onClose: () => void;
  registries: RegistryItem[];
  initialRepoUrl?: string;
  initialContext?: string;
}

export const UxResearcherModal = ({ isOpen, onClose, registries, initialRepoUrl, initialContext }: UxResearcherModalProps) => {
  const [repoUrl, setRepoUrl] = useState(initialRepoUrl || '');
  const [context, setContext] = useState(initialContext || '');
  const [report, setReport] = useState<string | null>(null);
  const [step, setStep] = useState(0); // 0: Input, 1: Analyzing, 2: Report

  if (!isOpen) return null;

  const handleAnalyze = async () => {
    if (!context.trim() && !repoUrl.trim()) return;

    setStep(1);

    const registriesContext = JSON.stringify(registries.map(r => ({ title: r.title, desc: r.description, tags: r.category })));

    try {
      const res = await api.tools['shadcn-registry'].research.$post({
        json: { repoUrl, context, registriesContext }
      });

      if (res.ok) {
        const data = await res.json();
        setReport(data.result);
        setStep(2);
      } else {
        throw new Error('Failed to generate research report.');
      }
    } catch (e) {
      console.error(e);
      toast.error("Analysis failed. Please try with less text or check your connection.");
      setStep(0);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-md">
      <div className="bg-card text-card-foreground rounded-2xl shadow-2xl w-full max-w-4xl h-[85vh] flex flex-col overflow-hidden border border-border">

        {/* Header */}
        <div className="p-6 bg-muted flex justify-between items-center shrink-0 border-b border-border">
          <div>
            <h2 className="text-xl font-bold flex items-center gap-2">
              <Microscope size={24} className="text-emerald-500" />
              UX Researcher & Architect
            </h2>
            <p className="text-muted-foreground text-sm mt-1">
              Deep analysis of your backend to generate frontend specs, stories, and wireframes.
            </p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X size={24} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-grow overflow-y-auto bg-background p-6">
          {step === 0 && (
            <div className="space-y-6 max-w-2xl mx-auto">
              <div className="bg-muted p-6 rounded-xl border border-border shadow-sm">
                <label className="block text-sm font-bold text-foreground mb-2 flex items-center gap-2">
                  <Github size={16} /> GitHub Repo URL (Optional)
                </label>
                <input
                  type="text"
                  className="w-full p-3 bg-background border border-input rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none text-foreground"
                  placeholder="https://github.com/username/repo"
                  value={repoUrl}
                  onChange={e => setRepoUrl(e.target.value)}
                />
              </div>

              <div className="bg-muted p-6 rounded-xl border border-border shadow-sm">
                <label className="block text-sm font-bold text-foreground mb-2 flex items-center gap-2">
                  <FileCode size={16} /> Repository Context (Required)
                </label>
                <p className="text-xs text-muted-foreground mb-3">
                  Paste your <code>README.md</code>, <code>schema.prisma</code>, API routes, or backend logic here.
                  The more context, the better the architecture report.
                </p>
                <textarea
                  className="w-full h-64 p-3 bg-background border border-input rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none font-mono text-xs text-foreground"
                  placeholder="Paste code or documentation here..."
                  value={context}
                  onChange={e => setContext(e.target.value)}
                />
              </div>

              <button
                onClick={handleAnalyze}
                disabled={!context.trim()}
                className="w-full py-4 bg-emerald-600 hover:bg-emerald-700 text-primary-foreground rounded-xl font-bold text-lg shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Microscope size={20} />
                Analyze & Architect
              </button>
            </div>
          )}

          {step === 1 && (
            <div className="h-full flex flex-col items-center justify-center space-y-6 text-center">
              <div className="relative">
                <div className="h-24 w-24 rounded-full border-4 border-muted border-t-emerald-500 animate-spin"></div>
                <Microscope size={32} className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-muted-foreground" />
              </div>
              <div className="space-y-2">
                <h3 className="text-xl font-bold text-foreground">Analyzing Architecture...</h3>
                <p className="text-muted-foreground">Deriving user stories from backend logic...</p>
                <p className="text-muted-foreground text-sm">Mapping database schemas to wireframes...</p>
                <p className="text-muted-foreground text-sm">Selecting optimal shadcn components...</p>
              </div>
            </div>
          )}

          {step === 2 && report && (
            <div className="max-w-4xl mx-auto bg-muted p-8 rounded-xl border border-border shadow-sm animate-in fade-in slide-in-from-bottom-4 duration-500">
               <div className="prose prose-sm prose-invert max-w-none">
                 <div className="whitespace-pre-wrap leading-relaxed">
                   {report}
                 </div>
               </div>
               <div className="mt-8 pt-6 border-t border-border flex justify-end gap-3">
                 <button
                   onClick={() => setStep(0)}
                   className="px-4 py-2 text-foreground hover:bg-accent rounded-lg transition-colors"
                 >
                   Start Over
                 </button>
                 <button
                   onClick={() => { navigator.clipboard.writeText(report); toast.success('Report copied to clipboard!'); }}
                   className="px-6 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
                 >
                   Copy Report
                 </button>
               </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
