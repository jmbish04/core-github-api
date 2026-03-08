import React, { useState, useEffect, useCallback } from 'react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Loader2, Wand2, Search, CheckCircle2 } from 'lucide-react';
import { api } from '@/lib/api-client';
function useDebounce(callback: Function, delay: number) {
  const [timer, setTimer] = useState<NodeJS.Timeout | null>(null);
  return useCallback((...args: any[]) => {
    if (timer) clearTimeout(timer);
    setTimer(setTimeout(() => callback(...args), delay));
  }, [callback, delay, timer]);
}

export default function ProjectEditor({ projectId, onBack, onLaunch }: { projectId: string, onBack: () => void, onLaunch: (id: string) => void }) {
  const [formData, setFormData] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [distinctTerms, setDistinctTerms] = useState({ github: [], discord: [], google: [] });
  const [cronPrompt, setCronPrompt] = useState("");
  const [generatingCron, setGeneratingCron] = useState(false);
  const [availableDiscordChannels, setAvailableDiscordChannels] = useState<any[]>([]);
  
  // Wizard State
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [testResults, setTestResults] = useState<any>(null);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    api['research-projects'].projects[':id'].details.$get({ param: { id: projectId } })
      .then(res => (res.json() as any))
      .then(data => setFormData(data.project));
      
    api['research-projects'].terms.distinct.$get()
      .then(res => (res.json() as any))
      .then((data: any) => setDistinctTerms(data));

    // Wait until Discord API is actually ready/has a token before failing hard
    api.discord.channels.$get()
      .then(res => res.ok ? res.json() : [])
      .then((data: any) => setAvailableDiscordChannels(data))
      .catch(() => console.warn('Could not load discord channels'));
  }, [projectId]);

  const saveToDb = async (data: any) => {
    setSaving(true);
    await api['research-projects'].projects[':id'].$put({
      param: { id: projectId },
      json: data
    });
    setSaving(false);
  };

  // Removed debouncedSave to prevent the race condition bug
  // We now save explicitly when transitioning steps or finishing.

  const handleChange = (field: string, value: any) => {
    setFormData({ ...formData, [field]: value });
  };

  const handleGenerateCron = async (preset?: string) => {
    const prompt = preset || cronPrompt;
    if (!prompt) return;
    
    setGeneratingCron(true);
    try {
      const res = await api['research-projects'].cron.translate.$post({ json: { prompt }});
      if (res.ok) {
          const data = await res.json() as any;
          if (data.cron) {
             handleChange('cronSchedule', data.cron);
             if (preset) setCronPrompt("");
          }
      }
    } catch(e) {
      console.error(e);
    } finally {
      setGeneratingCron(false);
    }
  };

  const handleTestSearch = async () => {
    // 1. Save current form state to D1 before leaving Step 1
    await saveToDb(formData);
    
    // 2. Move to step 2 and fetch test results
    setStep(2);
    setTesting(true);
    setTestResults(null);
    try {
      const res = await api['research-projects'].test.$post({
        json: {
          githubTerms: formData.githubTerms || [],
          discordTerms: formData.discordTerms || []
        }
      });
      if (res.ok) {
        setTestResults(await res.json());
      }
    } catch (e) {
      console.error(e);
    } finally {
      setTesting(false);
    }
  };

  const handleProceedToReview = async () => {
    setStep(3);
  };

  const handleLaunch = async () => {
    const status = formData.type === 'cron' ? 'active' : 'processing';
    await saveToDb({ ...formData, status, progress: 0 });
    onLaunch(projectId);
  };

  if (!formData) return <div className="text-white">Loading Editor...</div>;

  return (
    <div className="space-y-6 max-w-4xl mx-auto bg-black p-6 border border-zinc-800 rounded-xl text-white">
      <div className="flex justify-between items-center">
        <Button variant="outline" onClick={() => step === 1 ? onBack() : setStep((step - 1) as 1 | 2)}>&larr; Back</Button>
        <div className="flex items-center gap-2">
           <div className={`h-2 w-8 rounded-full ${step >= 1 ? 'bg-purple-600' : 'bg-zinc-800'}`} />
           <div className={`h-2 w-8 rounded-full ${step >= 2 ? 'bg-purple-600' : 'bg-zinc-800'}`} />
           <div className={`h-2 w-8 rounded-full ${step >= 3 ? 'bg-purple-600' : 'bg-zinc-800'}`} />
        </div>
        <span className="text-xs text-zinc-500">{saving ? 'Saving...' : ''}</span>
      </div>

      <h2 className="text-2xl font-bold">
        {step === 1 && (formData.type === 'cron' ? 'Scheduled Research Config' : 'Custom Research Project')}
        {step === 2 && 'Test Search Results'}
        {step === 3 && 'Review & Launch'}
      </h2>
      
      {/* STEP 1: CONFIGURATION */}
      {step === 1 && (
        <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
          <div>
            <label className="text-sm font-semibold text-zinc-400">Project Title</label>
            <Input value={formData.title} onChange={e => handleChange('title', e.target.value)} className="bg-zinc-900 border-zinc-700" />
          </div>
          <div>
            <label className="text-sm font-semibold text-zinc-400">Research Goal</label>
            <Textarea value={formData.goal || ''} onChange={e => handleChange('goal', e.target.value)} className="bg-zinc-900 border-zinc-700 h-24" />
          </div>
          
          <div className="flex items-center gap-3 p-3 border border-zinc-800 rounded bg-zinc-950">
            <input 
               type="checkbox" 
               id="dedupToggle"
               checked={formData.globalDeduplication}
               onChange={e => handleChange('globalDeduplication', e.target.checked)}
               className="w-4 h-4 cursor-pointer accent-purple-600"
            />
            <label htmlFor="dedupToggle" className="text-sm text-zinc-300 cursor-pointer">
               <strong>Global Deduplication</strong> - Only find items that have <em>never</em> been seen by any Research Project before. (If unchecked, items are only deduplicated against this specific project).
            </label>
          </div>

          {formData.type === 'cron' && (
            <div className="space-y-4 p-4 border border-zinc-800 rounded-lg bg-zinc-950">
              <div>
                <label className="text-sm font-semibold text-zinc-400">Cron Schedule</label>
                <div className="flex gap-2 items-center mt-1">
                  <Input value={formData.cronSchedule || ''} onChange={e => handleChange('cronSchedule', e.target.value)} placeholder="0 8 * * *" className="bg-zinc-900 border-zinc-700 w-1/3" />
                  <Button variant="outline" size="sm" onClick={() => handleGenerateCron('Every day at 8am')} disabled={generatingCron} className="border-zinc-700 hover:bg-zinc-800">
                    Daily
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => handleGenerateCron('Every monday at 9am')} disabled={generatingCron} className="border-zinc-700 hover:bg-zinc-800">
                    Weekly
                  </Button>
                </div>
              </div>
              
              <div className="flex gap-2 items-center mt-2">
                <Input 
                  value={cronPrompt} 
                  onChange={e => setCronPrompt(e.target.value)} 
                  placeholder="Or describe schedule... e.g. 'Every weekday at 5pm'" 
                  className="bg-zinc-900 border-zinc-700 flex-1"
                  onKeyDown={e => e.key === 'Enter' && handleGenerateCron()}
                />
                <Button 
                  variant="secondary" 
                  onClick={() => handleGenerateCron()} 
                  disabled={generatingCron || !cronPrompt}
                  className="gap-2 shrink-0 bg-zinc-800 hover:bg-zinc-700 text-white"
                >
                  {generatingCron ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4 text-purple-400" />}
                  Generate
                </Button>
              </div>
            </div>
          )}

          <div className="p-4 border border-zinc-800 rounded bg-zinc-950 space-y-3">
            <h3 className="font-semibold text-sm">Sources Configuration</h3>
            <p className="text-xs text-zinc-500">Select previously used terms or enter new ones.</p>
            
            <Input list="github-suggestions" placeholder="GitHub Terms (comma separated)" value={formData.githubTerms?.join(', ') || ''} onChange={e => handleChange('githubTerms', e.target.value.split(','))} className="bg-zinc-900 border-zinc-800" />
            <datalist id="github-suggestions">
              {distinctTerms.github.map((t, i) => <option key={i} value={t} />)}
            </datalist>

            <Input list="discord-suggestions" placeholder="Discord Search Terms (comma separated)" value={formData.discordTerms?.join(', ') || ''} onChange={e => handleChange('discordTerms', e.target.value.split(','))} className="bg-zinc-900 border-zinc-800" />
            <datalist id="discord-suggestions">
              {distinctTerms.discord.map((t, i) => <option key={i} value={t} />)}
            </datalist>

            {availableDiscordChannels.length > 0 && (
              <div className="mt-2 space-y-2 max-h-48 overflow-y-auto p-2 bg-zinc-900 border border-zinc-800 rounded">
                <p className="text-xs text-zinc-400 font-semibold mb-2">Select Target Discord Channels:</p>
                {availableDiscordChannels.map((ch: any) => {
                  const isSelected = (formData.discordSelectedChannels || []).includes(ch.id);
                  return (
                    <label key={ch.id} className="flex items-center gap-2 text-sm text-zinc-300 cursor-pointer">
                      <input 
                        type="checkbox" 
                        checked={isSelected}
                        onChange={(e) => {
                           const current = new Set(formData.discordSelectedChannels || []);
                           if (e.target.checked) current.add(ch.id);
                           else current.delete(ch.id);
                           handleChange('discordSelectedChannels', Array.from(current));
                        }}
                        className="w-3 h-3 cursor-pointer accent-indigo-500" 
                      />
                      #{ch.name || ch.id}
                    </label>
                  );
                })}
              </div>
            )}

            <Input list="google-suggestions" placeholder="Google Terms (comma separated)" value={formData.googleTerms?.join(', ') || ''} onChange={e => handleChange('googleTerms', e.target.value.split(','))} className="bg-zinc-900 border-zinc-800" />
            <datalist id="google-suggestions">
              {distinctTerms.google.map((t, i) => <option key={i} value={t} />)}
            </datalist>
          </div>

          <Button onClick={handleTestSearch} disabled={saving} className="w-full bg-blue-600 hover:bg-blue-500">
             <Search className="w-4 h-4 mr-2" />
             Test Search Terms
          </Button>
        </div>
      )}

      {/* STEP 2: TEST RESULTS */}
      {step === 2 && (
         <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
            {testing ? (
               <div className="flex flex-col items-center justify-center p-12 space-y-4 border border-zinc-800 rounded-lg bg-zinc-950">
                  <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
                  <p className="text-zinc-400">Executing test searches and generating AI interpretation...</p>
               </div>
            ) : testResults ? (
               <div className="space-y-4">
                  {/* AI Interpretation Card */}
                  <div className="p-4 border border-purple-900/50 bg-purple-950/20 rounded-lg space-y-2">
                     <div className="flex items-center gap-2 text-purple-400 font-semibold text-sm">
                        <Wand2 className="w-4 h-4" /> AI Interpretation
                     </div>
                     <p className="text-sm text-zinc-300 leading-relaxed">
                        {testResults.aiInterpretation}
                     </p>
                  </div>

                  {/* GitHub Results */}
                  {testResults.github && testResults.github.length > 0 && (
                     <div className="space-y-2">
                        <h3 className="text-sm font-semibold text-zinc-400">Sample GitHub Repositories</h3>
                        <div className="grid gap-2">
                           {testResults.github.map((repo: any, i: number) => (
                              <div key={i} className="p-3 border border-zinc-800 bg-zinc-900 rounded-lg">
                                 <a href={repo.url} target="_blank" rel="noreferrer" className="text-blue-400 hover:underline font-mono text-sm">{repo.name}</a>
                                 <p className="text-xs text-zinc-500 mt-1 line-clamp-2">{repo.description}</p>
                                 <div className="flex gap-2 mt-2">
                                    <span className="text-[10px] bg-zinc-800 px-2 py-0.5 rounded text-zinc-400">⭐ {repo.stars}</span>
                                    {repo.topics?.slice(0,3).map((t: string) => (
                                       <span key={t} className="text-[10px] bg-blue-900/30 text-blue-400 px-2 py-0.5 rounded">{t}</span>
                                    ))}
                                 </div>
                              </div>
                           ))}
                        </div>
                     </div>
                  )}

                  {/* Discord Results */}
                  {testResults.discord && testResults.discord.length > 0 && (
                     <div className="space-y-2">
                        <h3 className="text-sm font-semibold text-zinc-400">Sample Discord Posts</h3>
                        <div className="grid gap-2">
                           {testResults.discord.map((post: any, i: number) => (
                              <div key={i} className="p-3 border border-indigo-900/50 bg-indigo-950/20 rounded-lg">
                                 <div className="flex items-center gap-2 text-xs text-indigo-400 font-semibold">
                                    <span>#{post.channel}</span> • <span>@{post.author}</span>
                                 </div>
                                 <p className="text-sm text-zinc-300 mt-1">{post.content}</p>
                              </div>
                           ))}
                        </div>
                     </div>
                  )}

                  <div className="flex gap-4 pt-4">
                     <Button variant="outline" onClick={() => setStep(1)} className="flex-1 border-zinc-700 hover:bg-zinc-800">
                        Refine Terms
                     </Button>
                     <Button onClick={handleProceedToReview} className="flex-1 bg-green-600 hover:bg-green-500">
                        Looks Good &rarr;
                     </Button>
                  </div>
               </div>
            ) : (
               <div className="p-4 border border-red-900 bg-red-950/20 text-red-500 rounded-lg">
                  Failed to load test results.
               </div>
            )}
         </div>
      )}

      {/* STEP 3: REVIEW & LAUNCH */}
      {step === 3 && (
         <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
            <div className="p-6 border border-zinc-800 bg-zinc-950 rounded-lg space-y-4">
               <div>
                  <h3 className="text-sm font-semibold text-zinc-500">Title</h3>
                  <p className="font-semibold text-lg">{formData.title}</p>
               </div>
               
               {formData.type === 'cron' && (
                  <div>
                     <h3 className="text-sm font-semibold text-zinc-500">Schedule</h3>
                     <p className="font-mono text-blue-400 bg-blue-950/30 px-2 py-1 rounded inline-block mt-1">{formData.cronSchedule}</p>
                  </div>
               )}

               <div>
                  <h3 className="text-sm font-semibold text-zinc-500">Active Sources</h3>
                  <div className="flex flex-wrap gap-2 mt-2">
                     {formData.githubTerms?.length > 0 && <span className="text-xs bg-zinc-800 px-2 py-1 rounded">GitHub: {formData.githubTerms.length} terms</span>}
                     {formData.discordTerms?.length > 0 && <span className="text-xs bg-indigo-950 text-indigo-400 px-2 py-1 rounded">Discord: {formData.discordTerms.length} terms ({formData.discordSelectedChannels?.length || 'All'} channels)</span>}
                     {formData.googleTerms?.length > 0 && <span className="text-xs bg-green-950 text-green-400 px-2 py-1 rounded">Google: {formData.googleTerms.length} terms</span>}
                  </div>
               </div>
            </div>

            <Button onClick={handleLaunch} className="w-full bg-purple-600 hover:bg-purple-500 h-12 text-lg font-semibold">
               <CheckCircle2 className="w-5 h-5 mr-2" />
               {formData.type === 'cron' ? 'Activate Cron Job' : 'Dispatch Research Swarm'}
            </Button>
         </div>
      )}
    </div>
  );
}
