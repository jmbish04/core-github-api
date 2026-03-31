import React from 'react';
import { Button } from '@/components/ui/button';
import { ArrowLeft, ArrowRight, Github, MessageSquare, CloudLightning, Info } from 'lucide-react';
import type { ProjectEditorValidationProps } from './types';

/**
 * @agent-context
 * Renders the Validation step (Step 2) evaluating Live Signal volume.
 * Displays mock or real test results of keyword queries across specified platforms before finalizing the research parameters.
 */
export function ProjectEditorValidation({ testResults, testing, setStep, handleProceedToReview }: ProjectEditorValidationProps) {
  return (
          <div className="space-y-6 animate-in slide-in-from-right-8 duration-500">
            <div className="bg-zinc-950/40 border border-zinc-800/60 rounded-2xl overflow-hidden shadow-xl backdrop-blur-md">
              <div className="p-6">
                 {testing ? (
                   <div className="flex flex-col items-center justify-center py-12 space-y-4">
                      <div className="w-16 h-16 rounded-full bg-blue-500/10 flex items-center justify-center relative">
                        <div className="absolute inset-0 rounded-full border-t-2 border-blue-500 animate-spin"></div>
                        <Search className="w-6 h-6 text-blue-400" />
                      </div>
                      <p className="text-zinc-400 font-medium animate-pulse">Scanning Global Ecosystems for live signals...</p>
                   </div>
                 ) : (
                   <div className="space-y-6">
                      <div className="flex items-center gap-3 bg-blue-950/10 border border-blue-900/30 p-4 rounded-xl">
                        <Info className="w-5 h-5 text-blue-400" />
                        <p className="text-sm text-zinc-300">Live test completed. The following signal volumes were detected across your targeted sources. A higher volume indicates more context for Jules.</p>
                      </div>
                      
                      <div className="grid md:grid-cols-3 gap-6">
                        {/* GitHub Results */}
                        <div className="bg-zinc-900/40 border border-zinc-800/50 rounded-xl p-5 hover:border-zinc-700 transition-colors">
                           <div className="flex items-center justify-between mb-4">
                             <div className="flex items-center gap-2 text-zinc-300">
                               <Github className="w-5 h-5" /> 
                               <span className="font-semibold">GitHub Issues</span>
                             </div>
                             <span className="text-2xl font-bold text-white">{testResults?.githubCount || 0}</span>
                           </div>
                           <div className="h-1.5 w-full bg-zinc-800 rounded-full overflow-hidden">
                             <div className="h-full bg-zinc-400 rounded-full" style={{ width: `${Math.min(((testResults?.githubCount || 0) / 100) * 100, 100)}%` }}></div>
                           </div>
                        </div>

                        {/* Discord Results */}
                        <div className="bg-indigo-950/10 border border-indigo-900/30 rounded-xl p-5 hover:border-indigo-900/50 transition-colors">
                           <div className="flex items-center justify-between mb-4">
                             <div className="flex items-center gap-2 text-indigo-400">
                               <MessageSquare className="w-5 h-5" /> 
                               <span className="font-semibold">Discord Messages</span>
                             </div>
                             <span className="text-2xl font-bold text-white">{testResults?.discordCount || 0}</span>
                           </div>
                           <div className="h-1.5 w-full bg-indigo-950 rounded-full overflow-hidden">
                             <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${Math.min(((testResults?.discordCount || 0) / 100) * 100, 100)}%` }}></div>
                           </div>
                        </div>

                        {/* Cloudflare Results */}
                        <div className="bg-orange-950/10 border border-orange-900/30 rounded-xl p-5 hover:border-orange-900/50 transition-colors">
                           <div className="flex items-center justify-between mb-4">
                             <div className="flex items-center gap-2 text-orange-400">
                               <CloudLightning className="w-5 h-5" /> 
                               <span className="font-semibold">Cloudflare Changelog</span>
                             </div>
                             <span className="text-2xl font-bold text-white">{testResults?.googleCount || 0}</span>
                           </div>
                           <div className="h-1.5 w-full bg-orange-950 rounded-full overflow-hidden">
                             <div className="h-full bg-orange-500 rounded-full" style={{ width: `${Math.min(((testResults?.googleCount || 0) / 10) * 100, 100)}%` }}></div>
                           </div>
                        </div>
                      </div>
                   </div>
                 )}
              </div>
            </div>

            <div className="flex justify-between pt-4">
               <Button variant="ghost" onClick={() => setStep(1)} className="text-zinc-400 hover:text-white px-6">
                 <ArrowLeft className="w-4 h-4 mr-2" /> Adjust Signals
               </Button>
               <Button onClick={handleProceedToReview} disabled={testing} className="bg-zinc-100 hover:bg-white text-zinc-950 font-bold px-8 shadow-[0_0_15px_rgba(255,255,255,0.1)]">
                 Proceed to Briefing <ArrowRight className="w-4 h-4 ml-2" />
               </Button>
            </div>
          </div>
  );
}

// Ensure Search icon is imported since it's used in the spinner
import { Search } from 'lucide-react';
