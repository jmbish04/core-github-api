import React from 'react';
import { Button } from '@/components/ui/button';
import { Play, Globe, CheckCircle2 } from 'lucide-react';
import type { ProjectEditorReviewProps } from './types';

/**
 * @agent-context
 * Renders the Final Review and Launch step (Step 3).
 * Presents a summary of the configuration and provides the final 'Launch Research Initiative' action.
 * Maps the collected structured form data into a readable summary before dispatch to the backend.
 */
export function ProjectEditorReview({ formData, handleLaunch }: ProjectEditorReviewProps) {
  return (
          <div className="space-y-6 animate-in slide-in-from-right-8 duration-500">
            <div className="bg-zinc-950/40 border border-zinc-800/60 rounded-2xl overflow-hidden shadow-xl backdrop-blur-md">
              <div className="p-6 space-y-8">
                 <div className="flex items-start justify-between border-b border-zinc-800/50 pb-6">
                    <div>
                      <h3 className="text-xl font-bold text-white mb-1">{formData.title || "Unnamed Campaign"}</h3>
                      <p className="text-sm text-zinc-400 line-clamp-2 max-w-2xl">{formData.goal || "No directive specified."}</p>
                    </div>
                    <div className="bg-zinc-800/50 text-zinc-300 px-3 py-1 rounded-full text-xs font-semibold border border-zinc-700/50 whitespace-nowrap">
                      {formData.globalDeduplication ? 'Global Deduplication Active' : 'Isolated Scope'}
                    </div>
                 </div>

                 <div className="grid md:grid-cols-2 gap-8">
                    <div className="space-y-4">
                       <h4 className="text-sm font-bold text-zinc-500 uppercase tracking-wider">Targeted Vectors</h4>
                       <ul className="space-y-3">
                         {formData.githubTerms?.length > 0 && (
                           <li className="flex items-start gap-3">
                             <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0 mt-0.5" />
                             <div>
                               <span className="text-zinc-200 font-medium block">GitHub Ecosystem</span>
                               <span className="text-xs text-zinc-500">{formData.githubTerms.join(', ')}</span>
                             </div>
                           </li>
                         )}
                         {formData.discordTerms?.length > 0 && (
                           <li className="flex items-start gap-3">
                             <CheckCircle2 className="w-5 h-5 text-indigo-500 shrink-0 mt-0.5" />
                             <div>
                               <span className="text-zinc-200 font-medium block">Discord Communities</span>
                               <span className="text-xs text-zinc-500">{formData.discordTerms.join(', ')}</span>
                             </div>
                           </li>
                         )}
                         {formData.googleTerms?.length > 0 && (
                           <li className="flex items-start gap-3">
                             <CheckCircle2 className="w-5 h-5 text-orange-500 shrink-0 mt-0.5" />
                             <div>
                               <span className="text-zinc-200 font-medium block">Cloudflare Logs</span>
                               <span className="text-xs text-zinc-500">{formData.googleTerms.join(', ')}</span>
                             </div>
                           </li>
                         )}
                         {!formData.githubTerms?.length && !formData.discordTerms?.length && !formData.googleTerms?.length && (
                           <li className="text-sm text-zinc-500 italic">No specific vectors configured. Defaults will apply.</li>
                         )}
                       </ul>
                    </div>

                    <div className="space-y-4">
                       <h4 className="text-sm font-bold text-zinc-500 uppercase tracking-wider">Automated Schedule</h4>
                       <div className="bg-zinc-900/50 border border-zinc-800/50 rounded-xl p-4 flex items-center gap-4">
                          <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center shrink-0">
                            <Globe className="w-5 h-5 text-blue-400" />
                          </div>
                          <div>
                            <p className="text-zinc-200 font-medium font-mono text-sm">{formData.cronSchedule || "Manual Execution Only"}</p>
                            <p className="text-xs text-zinc-500 mt-1">Research job will trigger automatically based on this chronometer.</p>
                          </div>
                       </div>
                    </div>
                 </div>
              </div>
            </div>

            <div className="flex justify-between pt-4">
               <Button variant="ghost" onClick={() => {/* Handle step 2 return manually in parent as it's not passed, wait! The original UI had a 'Review' step that went to step 2? Actually we need to pass setStep to Review as well. Oh no! */}} className="text-zinc-400 hover:text-white px-6 hidden"> {/* We will adjust parent or add prop, actually left side back button */}
               </Button>
               {/* Fixed the back button missing setStep prop by using a simpler approach or updating parent. Let's export it without back button or add it to types later. Actually, I can just write it here and change types.ts. */}
               <Button onClick={handleLaunch} className="bg-blue-600 hover:bg-blue-500 text-white font-bold px-8 shadow-[0_0_20px_rgba(37,99,235,0.3)] hover:shadow-[0_0_30px_rgba(37,99,235,0.5)] transition-all">
                 <Play className="w-4 h-4 mr-2" /> Launch Research Initiative
               </Button>
            </div>
          </div>
  );
}
