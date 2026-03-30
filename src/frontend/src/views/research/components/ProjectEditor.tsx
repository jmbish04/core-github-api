import React, { useState, useEffect } from 'react';
import { Loader2, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api-client';
import { handleGlobalError } from '@/lib/error-handler';
import { ProjectEditorConfig } from './editor/ProjectEditorConfig';
import { ProjectEditorValidation } from './editor/ProjectEditorValidation';
import { ProjectEditorReview } from './editor/ProjectEditorReview';

export default function ProjectEditor({ projectId, onLaunch }: { projectId: string, onBack: () => void, onLaunch: (id: string) => void }) {
  const [formData, setFormData] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [distinctTerms, setDistinctTerms] = useState({ github: [], discord: [], google: [] });
  const [cronPrompt, setCronPrompt] = useState("");
  const [generatingCron, setGeneratingCron] = useState(false);
  const [availableDiscordChannels, setAvailableDiscordChannels] = useState<any[]>([]);
  
  // Advanced UI State
  const [generalKeywords, setGeneralKeywords] = useState("");
  const [selectedSource, setSelectedSource] = useState("all");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [improvingKeywords, setImprovingKeywords] = useState(false);
  
  // Wizard State
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [testResults, setTestResults] = useState<any>(null);
  const [testing, setTesting] = useState(false);
  const [testingDispatch, setTestingDispatch] = useState(false);
  const [dispatchResultLink, setDispatchResultLink] = useState('');

  useEffect(() => {
    if (projectId === 'new') {
      setFormData({ type: 'custom', status: 'draft', title: '', goal: '', githubTerms: [], discordTerms: [], googleTerms: [], globalDeduplication: true });
    } else {
      api['research'].projects[':id'].details.$get({ param: { id: projectId } })
        .then(res => res.ok ? (res.json() as any) : Promise.reject(new Error("Failed to load project details")))
        .then(data => setFormData(data.project || { type: 'custom', status: 'draft', title: 'Fallback Draft', githubTerms: [], discordTerms: [], googleTerms: [] }))
        .catch((e) => {
           console.warn("Failed to load project details, using fallback:", e);
           setFormData({ id: projectId, type: 'custom', status: 'draft', title: 'Local Sandbox Draft', githubTerms: [], discordTerms: [], googleTerms: [] });
        });
    }
      
    api['research'].terms.distinct.$get()
      .then(res => res.ok ? (res.json() as any) : Promise.reject("Failed distinct terms"))
      .then((data: any) => setDistinctTerms(data || { github: [], discord: [], google: [] }))
      .catch(() => setDistinctTerms({ github: [], discord: [], google: [] }));

    api.discord.channels.$get()
      .then(res => res.ok ? res.json() : [])
      .then((data: any) => setAvailableDiscordChannels(data))
      .catch(() => console.warn('Could not load discord channels'));
  }, [projectId]);

  const saveToDb = async (data: any) => {
    setSaving(true);
    await api['research'].projects[':id'].$put({
      param: { id: projectId },
      json: data
    });
    setSaving(false);
  };

  const handleChange = (field: string, value: any) => {
    setFormData({ ...formData, [field]: value });
  };

  const handleGenerateCron = async (preset?: string) => {
    const prompt = preset || cronPrompt;
    if (!prompt) return;
    
    setGeneratingCron(true);
    try {
      const res = await api['research'].cron.translate.$post({ json: { prompt }});
      if (res.ok) {
          const data = await res.json() as any;
          if (data.cron) {
             handleChange('cronSchedule', data.cron);
             if (preset) setCronPrompt("");
          }
      }
    } catch(e) { handleGlobalError(e); } 
    finally { setGeneratingCron(false); }
  };

  const handleTestSearch = async () => {
    await saveToDb(formData);
    setStep(2);
    setTesting(true);
    setTestResults(null);
    try {
      const res = await api['research'].test.$post({
        json: {
          githubTerms: formData.githubTerms || [],
          discordTerms: formData.discordTerms || []
        }
      });
      if (res.ok) {
        setTestResults(await res.json());
      } else {
        throw new Error(await res.text() || "Failed to verify signals");
      }
    } catch (e) { handleGlobalError(e); } 
    finally { setTesting(false); }
  };

  const handleDiagnosticTest = async () => {
     setTestingDispatch(true);
     setDispatchResultLink('');
     try {
        const res = await fetch('/api/research/test-dispatch', { method: 'POST' });
        if (res.ok) {
           const data = await res.json();
           if (data.link) setDispatchResultLink(data.link);
        } else {
           throw new Error(await res.text() || "Dispatch diagnostics failed");
        }
     } catch (e) {
        handleGlobalError(e);
     } finally {
        setTestingDispatch(false);
     }
  };

  const handleProceedToReview = async () => setStep(3);
  const handleLaunch = async () => {
    try {
      const status = formData.type === 'cron' ? 'active' : 'processing';
      await saveToDb({ ...formData, status, progress: 0 });
      
      const res = await fetch(`/api/research/projects/${projectId}/trigger`, { method: 'POST' });
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(errText || "Trigger failed");
      }
      
      onLaunch(projectId);
    } catch (e) {
      handleGlobalError(e);
    }
  };

  if (!formData) return (
    <div className="flex flex-col items-center justify-center min-h-[400px] text-zinc-400 space-y-4">
      <Loader2 className="w-8 h-8 animate-spin text-zinc-500" />
      <p className="animate-pulse">Loading Orchestrator Context...</p>
    </div>
  );

  return (
    <div className="w-full max-w-5xl mx-auto space-y-8 animate-in fade-in duration-500">
      {/* Header & Progress indicator */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-zinc-950/40 p-6 rounded-2xl border border-zinc-800/60 backdrop-blur-xl shadow-2xl">
        <div className="space-y-1">
          <h1 className="text-3xl font-extrabold tracking-tight text-white flex items-center gap-3">
            {step === 1 && (formData.type === 'cron' ? 'Scheduled Research Intelligence' : 'Custom Research Campaign')}
            {step === 2 && 'Signal Verification'}
            {step === 3 && 'Orchestration Launch'}
            {saving && <Loader2 className="w-5 h-5 text-zinc-500 animate-spin" />}
          </h1>
          <p className="text-zinc-400 text-sm">Configure the multi-source intelligence parameters for Jules.</p>
        </div>

        <div className="flex items-center gap-4">
           {step > 1 && <Button variant="ghost" onClick={() => setStep((step - 1) as 1 | 2)} className="text-zinc-400 hover:text-white">&larr; Go Back</Button>}
           <div className="flex items-center gap-3">
               {[1, 2, 3].map((s) => (
                <div key={s} className="flex items-center gap-2">
                   <div className={`flex items-center justify-center w-8 h-8 rounded-full text-xs font-bold transition-all duration-300 ${step >= s ? 'bg-zinc-100 text-zinc-950 shadow-md' : 'bg-zinc-800 text-zinc-500 border border-zinc-700'}`}>
                      {s < step ? <CheckCircle2 className="w-4 h-4" /> : s}
                   </div>
                   {s < 3 && <div className={`h-[2px] w-4 ${step > s ? 'bg-zinc-400' : 'bg-zinc-800'}`} />}
                </div>
              ))}
           </div>
        </div>
      </div>

      <div className="relative">
        {step === 1 && (
           <ProjectEditorConfig
              formData={formData}
              handleChange={handleChange}
              distinctTerms={distinctTerms as any}
              cronPrompt={cronPrompt}
              setCronPrompt={setCronPrompt}
              handleGenerateCron={handleGenerateCron}
              generatingCron={generatingCron}
              availableDiscordChannels={availableDiscordChannels}
              selectedSource={selectedSource}
              setSelectedSource={setSelectedSource}
              generalKeywords={generalKeywords}
              setGeneralKeywords={setGeneralKeywords}
              showAdvanced={showAdvanced}
              setShowAdvanced={setShowAdvanced}
              improvingKeywords={improvingKeywords}
              setImprovingKeywords={setImprovingKeywords}
              testingDispatch={testingDispatch}
              handleDiagnosticTest={handleDiagnosticTest}
              dispatchResultLink={dispatchResultLink}
              saving={saving}
              handleTestSearch={handleTestSearch}
              api={api}
           />
        )}
        {step === 2 && (
           <ProjectEditorValidation
              testResults={testResults}
              testing={testing}
              setStep={setStep}
              handleProceedToReview={handleProceedToReview}
           />
        )}
        {step === 3 && (
           <ProjectEditorReview
              formData={formData}
              handleLaunch={handleLaunch}
           />
        )}
      </div>
    </div>
  );
}
