import React from 'react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Loader2, Wand2, Search, CheckCircle2, ChevronDown, ChevronRight, Settings2, Github, MessageSquare, CloudLightning, Activity } from 'lucide-react';
import { api } from '@/lib/api-client';
import { handleGlobalError } from '@/lib/error-handler';
import type { ProjectEditorConfigProps } from './types';

/**
 * @agent-context
 * Renders the sophisticated, Shadcn-based configuration interface for the Research Project (Step 1).
 * Handles AI-assisted keyword enhancement, source targeting (GitHub, Discord, Cloudflare), global deduplication, and cron schedule translation.
 * Evaluates real-time UX and leverages the API client for dynamic AI generation of keywords/schedules.
 */
export function ProjectEditorConfig({
  formData, handleChange, distinctTerms,
  availableDiscordChannels, selectedSource, setSelectedSource, generalKeywords, setGeneralKeywords, 
  showAdvanced, setShowAdvanced, improvingKeywords, setImprovingKeywords, testingDispatch, 
  handleDiagnosticTest, dispatchResultLink, saving, handleTestSearch
}: ProjectEditorConfigProps) {
  const [extractingKeywords, setExtractingKeywords] = React.useState(false);
  return (
          <div className="space-y-6 animate-in slide-in-from-right-8 duration-500">
            {/* Core Settings Card */}
            <div className="bg-zinc-950/40 border border-zinc-800/60 rounded-2xl overflow-hidden shadow-xl backdrop-blur-md">
              <div className="p-6 space-y-6">
                 <div className="grid md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Campaign Designation</label>
                      <Input value={formData.title} onChange={e => handleChange('title', e.target.value)} className="bg-zinc-900/50 border-zinc-700/50 focus:border-zinc-500/50 focus:ring-zinc-500/20 text-lg py-6" placeholder="e.g. Q3 Competitor Analysis" />
                    </div>
                    
                    <div className="space-y-2 relative group">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Intelligence Directive</label>
                        <Button 
                          size="sm" 
                          variant="ghost" 
                          className="h-6 text-xs text-blue-400 hover:text-blue-300 hover:bg-blue-950/30 px-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
                          disabled={extractingKeywords || !formData.goal?.trim()}
                          onClick={async () => {
                             setExtractingKeywords(true);
                             try {
                                const res = await fetch('/api/research/keywords/extract', {
                                   method: 'POST',
                                   headers: { 'Content-Type': 'application/json' },
                                   body: JSON.stringify({ directive: formData.goal })
                                });
                                if (!res.ok) throw new Error(await res.text());
                                const data = await res.json();
                                if (data.query) setGeneralKeywords(data.query);
                             } catch (e) {
                                handleGlobalError(e);
                             } finally {
                                setExtractingKeywords(false);
                             }
                          }}
                        >
                          {extractingKeywords ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wand2 className="w-3 h-3" />}
                          Extract Keywords
                        </Button>
                      </div>
                      <Textarea value={formData.goal || ''} onChange={e => handleChange('goal', e.target.value)} className="bg-zinc-900/50 border-zinc-700/50 focus:border-zinc-500/50 focus:ring-zinc-500/20 resize-none pr-4" placeholder="What should the Jules agent look for specifically...?" rows={3} />
                    </div>
                 </div>

                 <div className="flex items-center gap-3 p-4 bg-zinc-900/30 border border-zinc-800/60 rounded-xl hover:bg-zinc-900/50 transition-colors">
                    <input 
                       type="checkbox" 
                       id="dedupToggle"
                       checked={formData.globalDeduplication}
                       onChange={e => handleChange('globalDeduplication', e.target.checked)}
                       className="w-5 h-5 cursor-pointer accent-zinc-300 rounded"
                    />
                    <label htmlFor="dedupToggle" className="text-sm text-zinc-300 cursor-pointer flex-1">
                       <strong className="text-zinc-200">Global Signal Deduplication</strong> <span className="text-zinc-500">— Ensure Jules only analyzes artifacts that have never been seen across the entire organization. Uncheck to isolate deduplication to this campaign only.</span>
                    </label>
                 </div>
              </div>
            </div>

            {/* Target Sources & Keywords Card */}
            <div className="bg-zinc-950/40 border border-zinc-800/60 rounded-2xl overflow-hidden shadow-xl backdrop-blur-md">
              <div className="bg-zinc-900/40 px-6 py-4 border-b border-zinc-800/60 flex items-center gap-3">
                 <Activity className="w-5 h-5 text-blue-400" />
                 <h3 className="font-semibold text-zinc-200">Intelligence Sources & Signals</h3>
              </div>
              <div className="p-6 space-y-6">
                 
                 <div className="flex flex-col md:flex-row gap-4 items-stretch">
                   <div className="w-full md:w-1/3">
                     <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2 block">Primary Source Matrix</label>
                     <select 
                       value={selectedSource}
                       onChange={e => {
                         setSelectedSource(e.target.value);
                         handleChange('sourceSelection', e.target.value);
                       }}
                       className="w-full bg-zinc-900/80 border border-zinc-700/50 rounded-xl px-4 py-3 text-sm text-zinc-200 outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all appearance-none"
                     >
                        <option value="all">All Sources (Federated)</option>
                        <option value="github">GitHub Ecosystem Only</option>
                        <option value="discord">Discord Communities Only</option>
                        <option value="cloudflare">Cloudflare Ecosystem Only</option>
                     </select>
                   </div>
                   
                   <div className="flex-1 flex flex-col justify-end">
                     <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2 block">Seed Keywords</label>
                     <div className="flex flex-col md:flex-row gap-2 relative group w-full">
                        <div className="relative flex-1 w-full">
                           <Search className="w-4 h-4 text-zinc-500 absolute left-4 top-1/2 -translate-y-1/2" />
                           <Input 
                             placeholder="e.g. Next.js performance caching bugs..." 
                             value={generalKeywords}
                             onChange={e => setGeneralKeywords(e.target.value)}
                             className="bg-zinc-900/80 border-zinc-700/50 focus:border-blue-500/50 focus:ring-blue-500/20 py-6 pl-10 md:pr-48 text-md w-full"
                           />
                        </div>
                        <Button 
                          onClick={async () => {
                            setImprovingKeywords(true);
                            try {
                               const res = await api['research'].keywords.improve.$post({ json: { query: generalKeywords }});
                               if (res.ok) {
                                  const data = await res.json() as any;
                                  handleChange('githubTerms', data.githubTerms);
                                  handleChange('discordTerms', data.discordTerms);
                                  setShowAdvanced(true);
                               } else {
                                  throw new Error(await res.text());
                               }
                            } catch (e) {
                                handleGlobalError(e);
                            } finally {
                                setImprovingKeywords(false);
                            }
                          }}
                          disabled={improvingKeywords || !generalKeywords}
                          className="w-full md:w-auto h-12 md:h-auto bg-blue-600 hover:bg-blue-500 text-white rounded-lg px-6 font-semibold transition-all shadow-[0_0_10px_rgba(37,99,235,0.3)] hover:shadow-[0_0_15px_rgba(37,99,235,0.5)] flex-shrink-0"
                        >
                          {improvingKeywords ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Wand2 className="w-4 h-4 mr-2" />}
                          Enhance Signals
                        </Button>
                     </div>
                   </div>
                 </div>

                 {/* Advanced Tab Trigger */}
                 <div className="pt-2">
                    <button 
                      onClick={() => setShowAdvanced(!showAdvanced)} 
                      className="flex items-center gap-2 text-sm font-medium text-zinc-400 hover:text-zinc-200 transition-colors group"
                    >
                      <Settings2 className="w-4 h-4 group-hover:rotate-90 transition-transform duration-300" />
                      {showAdvanced ? 'Hide specific source overrides' : 'Configure specific source overrides'}
                      {showAdvanced ? <ChevronDown className="w-4 h-4 ml-1" /> : <ChevronRight className="w-4 h-4 ml-1" />}
                    </button>
                 </div>

                 {/* Advanced Overrides */}
                 {showAdvanced && (
                   <div className="grid md:grid-cols-3 gap-6 pt-6 border-t border-zinc-800/50 animate-in slide-in-from-top-4 duration-300">
                      {/* GitHub */}
                      <div className="bg-zinc-900/30 border border-zinc-800/50 rounded-xl p-4 space-y-3">
                         <div className="flex items-center gap-2 text-zinc-300 mb-4">
                           <Github className="w-4 h-4" /> <span className="font-semibold text-sm">GitHub Targets</span>
                         </div>
                         <Input list="github-suggestions" placeholder="e.g. auth, redis" value={formData.githubTerms?.join(', ') || ''} onChange={e => handleChange('githubTerms', e.target.value.split(',').map((t: string) => t.trimStart()))} className="bg-zinc-950 border-zinc-800" />
                         <datalist id="github-suggestions">{distinctTerms.github.map((t, i) => <option key={i} value={t} />)}</datalist>
                      </div>

                      {/* Discord */}
                      <div className="bg-indigo-950/10 border border-indigo-900/30 rounded-xl p-4 space-y-3">
                         <div className="flex items-center gap-2 text-indigo-400 mb-4">
                           <MessageSquare className="w-4 h-4" /> <span className="font-semibold text-sm">Discord Targets</span>
                         </div>
                         <Input list="discord-suggestions" placeholder="e.g. bugs, requests" value={formData.discordTerms?.join(', ') || ''} onChange={e => handleChange('discordTerms', e.target.value.split(',').map((t: string) => t.trimStart()))} className="bg-zinc-950 border-indigo-900/50 focus:border-indigo-500/50" />
                         <datalist id="discord-suggestions">{distinctTerms.discord.map((t, i) => <option key={i} value={t} />)}</datalist>
                         
                         {availableDiscordChannels.length > 0 && (
                           <div className="mt-3 space-y-2 max-h-32 overflow-y-auto pr-2 custom-scrollbar">
                             {availableDiscordChannels.map((ch: any) => {
                               const isSelected = (formData.discordSelectedChannels || []).includes(ch.id);
                               return (
                                 <label key={ch.id} className="flex items-center gap-3 text-xs text-zinc-400 hover:text-zinc-200 cursor-pointer p-2 rounded-md hover:bg-zinc-900/50 transition-colors">
                                   <input 
                                     type="checkbox" 
                                     checked={isSelected}
                                     onChange={(e) => {
                                       const current = new Set(formData.discordSelectedChannels || []);
                                       if (e.target.checked) current.add(ch.id);
                                       else current.delete(ch.id);
                                       handleChange('discordSelectedChannels', Array.from(current));
                                     }}
                                     className="w-3.5 h-3.5 rounded-sm bg-zinc-900 border-zinc-700 text-indigo-500 focus:ring-indigo-500 focus:ring-offset-zinc-950" 
                                   />
                                   #{ch.name || ch.id}
                                 </label>
                               );
                             })}
                           </div>
                         )}
                      </div>

                      {/* Cloudflare */}
                      <div className="bg-orange-950/10 border border-orange-900/30 rounded-xl p-4 space-y-3">
                         <div className="flex items-center gap-2 text-orange-400 mb-4">
                           <CloudLightning className="w-4 h-4" /> <span className="font-semibold text-sm">Cloudflare Targets</span>
                         </div>
                         <Input list="google-suggestions" placeholder="e.g. Workers, AI, D1" value={formData.googleTerms?.join(', ') || ''} onChange={e => handleChange('googleTerms', e.target.value.split(',').map((t: string) => t.trimStart()))} className="bg-zinc-950 border-orange-900/50 focus:border-orange-500/50" />
                         <datalist id="google-suggestions">{distinctTerms.google.map((t, i) => <option key={i} value={t} />)}</datalist>
                      </div>
                   </div>
                 )}
              </div>
            </div>

            {/* Run Action */}
            <div className="flex flex-col md:flex-row items-center justify-between gap-4 pt-4">
               <div className="flex-1 flex items-center justify-start gap-4 w-full">
                 <Button 
                     variant="outline" 
                     onClick={handleDiagnosticTest} 
                     disabled={testingDispatch}
                     className="bg-zinc-950/50 border-zinc-800 text-zinc-400 hover:text-white flex-shrink-0"
                  >
                     {testingDispatch ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Activity className="w-4 h-4 mr-2" />}
                     Test Dispatcher
                  </Button>
                  {dispatchResultLink && (
                     <div className="px-3 py-1.5 border border-green-900/50 bg-green-950/30 rounded-md animate-in fade-in">
                        <span className="text-xs text-green-400 flex items-center gap-2">
                          <CheckCircle2 className="w-3 h-3 flex-shrink-0" /> 
                          <a href={dispatchResultLink} target="_blank" rel="noreferrer" className="underline hover:text-green-300 transition-colors break-all">Staged Here</a>
                        </span>
                     </div>
                  )}
               </div>

               <Button 
                 onClick={handleTestSearch} 
                 disabled={saving || !formData.title?.trim() || (!formData.githubTerms?.length && !formData.discordTerms?.length && !formData.googleTerms?.length && !generalKeywords)} 
                 className="bg-zinc-100 hover:bg-white text-zinc-950 font-bold px-8 py-6 rounded-xl shadow-[0_0_20px_rgba(255,255,255,0.1)] hover:shadow-[0_0_30px_rgba(255,255,255,0.2)] transition-all ease-out w-full md:w-auto flex-shrink-0"
               >
                 Verify Signals {"&"} Continue
                 <ChevronRight className="w-5 h-5 ml-2" />
               </Button>
            </div>
          </div>
  );
}
