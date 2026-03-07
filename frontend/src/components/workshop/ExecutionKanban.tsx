import React from 'react';
import { 
    RefreshCw, Pause, SkipForward, ListTodo, Clock, 
    CheckCircle2, PlayCircle, Database, GripVertical, 
    PenTool, Component, Lock, Webhook
} from 'lucide-react';

export function ExecutionKanban() {
    return (
        <div className="flex flex-col h-screen w-full overflow-hidden bg-zinc-50 dark:bg-[#221c10] text-zinc-900 dark:text-zinc-100 font-sans">
            {/* TopNavBar */}
            <header className="flex items-center justify-between whitespace-nowrap border-b border-amber-500/20 px-6 py-4 bg-white dark:bg-[#221c10]/90 sticky top-0 z-10 shadow-sm dark:shadow-none">
                <div className="flex items-center gap-4 text-amber-500">
                    <RefreshCw className="w-8 h-8" />
                    <h2 className="text-zinc-900 dark:text-zinc-100 text-xl font-bold leading-tight tracking-tight">Cloudflare Agent Orchestrator</h2>
                </div>
                <div className="flex items-center gap-6">
                    <div className="flex items-center gap-4 min-w-[300px]">
                        <div className="flex flex-col w-full gap-1.5">
                            <div className="flex justify-between items-center w-full">
                                <span className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 tracking-wide">Phase 1: 65% Complete</span>
                            </div>
                            <div className="w-full bg-amber-500/20 rounded-full h-2 overflow-hidden">
                                <div className="bg-amber-500 h-2 rounded-full transition-all duration-500" style={{ width: '65%' }}></div>
                            </div>
                        </div>
                    </div>
                    <div className="flex gap-3">
                        <button className="flex items-center justify-center rounded-lg h-9 px-4 bg-amber-500/10 text-amber-600 dark:text-amber-500 hover:bg-amber-500/20 transition-colors text-sm font-bold border border-amber-500/30 gap-2">
                            <Pause className="w-4 h-4 fill-current" />
                            <span>Pause</span>
                        </button>
                        <button className="flex items-center justify-center rounded-lg h-9 px-4 bg-amber-500 text-zinc-950 hover:bg-amber-400 transition-colors text-sm font-bold gap-2 shadow-sm">
                            <span>Force Next Phase</span>
                            <SkipForward className="w-4 h-4 fill-current" />
                        </button>
                    </div>
                </div>
            </header>

            {/* Kanban Board Area */}
            <main className="flex-1 overflow-x-auto overflow-y-auto p-6 bg-zinc-50 dark:bg-[#221c10]/50">
                <div className="min-w-[1000px] flex flex-col gap-8">
                    
                    {/* Headers */}
                    <div className="grid grid-cols-3 gap-6 sticky top-0 z-10 bg-zinc-50/95 dark:bg-[#221c10]/95 py-2 backdrop-blur-sm">
                        <div className="flex items-center gap-2 pb-2 border-b-2 border-zinc-300 dark:border-zinc-700">
                            <ListTodo className="text-zinc-500 w-5 h-5" />
                            <h3 className="font-bold text-lg text-zinc-800 dark:text-zinc-200">Todo</h3>
                            <span className="bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 text-xs px-2 py-0.5 rounded-full ml-auto font-bold tracking-wide">1</span>
                        </div>
                        <div className="flex items-center gap-2 pb-2 border-b-2 border-cyan-500 dark:border-cyan-600">
                            <Clock className="text-cyan-500 w-5 h-5" />
                            <h3 className="font-bold text-lg text-zinc-800 dark:text-zinc-200">In Progress</h3>
                            <span className="bg-cyan-100 dark:bg-cyan-900/40 text-cyan-700 dark:text-cyan-400 text-xs px-2 py-0.5 rounded-full ml-auto font-bold tracking-wide">2</span>
                        </div>
                        <div className="flex items-center gap-2 pb-2 border-b-2 border-green-500 dark:border-green-600">
                            <CheckCircle2 className="text-green-500 w-5 h-5" />
                            <h3 className="font-bold text-lg text-zinc-800 dark:text-zinc-200">Done</h3>
                            <span className="bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400 text-xs px-2 py-0.5 rounded-full ml-auto font-bold tracking-wide">1</span>
                        </div>
                    </div>

                    {/* Phase 1 Swimlane */}
                    <div className="flex flex-col gap-4">
                        <div className="flex items-center gap-3">
                            <PlayCircle className="text-amber-500 w-6 h-6" />
                            <h2 className="text-xl font-bold text-zinc-800 dark:text-zinc-100">Phase 1: Foundation</h2>
                            <span className="text-sm font-bold text-amber-600 dark:text-amber-500 px-2.5 py-1 bg-amber-500/10 rounded-md border border-amber-500/20 uppercase tracking-wider">Active</span>
                        </div>
                        
                        <div className="grid grid-cols-3 gap-6 bg-zinc-100 dark:bg-black/20 p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm">
                            {/* Todo Column */}
                            <div className="flex flex-col gap-3 min-h-[150px]">
                                {/* Card 1 */}
                                <div className="bg-white dark:bg-[#2a2415] p-4 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-700/50 hover:border-amber-500/50 transition-colors cursor-pointer group">
                                    <div className="flex justify-between items-start mb-3">
                                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold uppercase tracking-wider bg-cyan-100 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-400 border border-cyan-200 dark:border-cyan-800/50">
                                            <Database className="w-3.5 h-3.5" />
                                            Data Specialist
                                        </span>
                                        <GripVertical className="text-zinc-400 group-hover:text-amber-500 w-5 h-5 transition-colors" />
                                    </div>
                                    <h4 className="font-bold text-zinc-800 dark:text-zinc-100 mb-2 leading-tight">Set up database schema</h4>
                                    <p className="text-sm text-zinc-600 dark:text-zinc-400 line-clamp-2 mb-4 leading-relaxed">Initialize D1 database and configure primary tables for user and agent management.</p>
                                    <div className="flex items-center justify-between text-xs text-zinc-500 font-medium">
                                        <span className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" /> Est. 2h</span>
                                    </div>
                                </div>
                            </div>
                            
                            {/* In Progress Column */}
                            <div className="flex flex-col gap-3 min-h-[150px]">
                                {/* Card 2 */}
                                <div className="bg-white dark:bg-[#2a2415] p-4 rounded-xl shadow-sm border border-cyan-300 dark:border-cyan-700/50 hover:border-cyan-400 transition-colors cursor-pointer group relative overflow-hidden">
                                    <div className="absolute top-0 left-0 w-1.5 h-full bg-cyan-500"></div>
                                    <div className="flex justify-between items-start mb-3 pl-2">
                                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold uppercase tracking-wider bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 border border-purple-200 dark:border-purple-800/50">
                                            <PenTool className="w-3.5 h-3.5" />
                                            UX Specialist
                                        </span>
                                        <GripVertical className="text-zinc-400 group-hover:text-cyan-500 w-5 h-5 transition-colors" />
                                    </div>
                                    <h4 className="font-bold text-zinc-800 dark:text-zinc-100 mb-2 pl-2 leading-tight">Design foundation UI components</h4>
                                    <p className="text-sm text-zinc-600 dark:text-zinc-400 line-clamp-2 mb-4 pl-2 leading-relaxed">Create baseline Tailwind configuration and core structural elements.</p>
                                    <div className="flex items-center justify-between text-xs text-zinc-500 pl-2">
                                        <div className="w-full bg-zinc-200 dark:bg-zinc-700 rounded-full h-1.5 max-w-[100px]">
                                            <div className="bg-cyan-500 h-1.5 rounded-full" style={{ width: '40%' }}></div>
                                        </div>
                                        <span className="flex items-center gap-1.5 text-cyan-600 dark:text-cyan-400 font-bold"><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Running</span>
                                    </div>
                                </div>

                                {/* Card 3 */}
                                <div className="bg-white dark:bg-[#2a2415] p-4 rounded-xl shadow-sm border border-cyan-300 dark:border-cyan-700/50 hover:border-cyan-400 transition-colors cursor-pointer group relative overflow-hidden">
                                    <div className="absolute top-0 left-0 w-1.5 h-full bg-cyan-500"></div>
                                    <div className="flex justify-between items-start mb-3 pl-2">
                                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold uppercase tracking-wider bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 border border-orange-200 dark:border-orange-800/50">
                                            <Component className="w-3.5 h-3.5" />
                                            Backend Agent
                                        </span>
                                        <GripVertical className="text-zinc-400 group-hover:text-cyan-500 w-5 h-5 transition-colors" />
                                    </div>
                                    <h4 className="font-bold text-zinc-800 dark:text-zinc-100 mb-2 pl-2 leading-tight">Configure Worker routing</h4>
                                    <p className="text-sm text-zinc-600 dark:text-zinc-400 line-clamp-2 mb-4 pl-2 leading-relaxed">Setup Hono router for agent communication endpoints.</p>
                                    <div className="flex items-center justify-between text-xs text-zinc-500 pl-2">
                                        <div className="w-full bg-zinc-200 dark:bg-zinc-700 rounded-full h-1.5 max-w-[100px]">
                                            <div className="bg-cyan-500 h-1.5 rounded-full" style={{ width: '85%' }}></div>
                                        </div>
                                        <span className="flex items-center gap-1.5 text-cyan-600 dark:text-cyan-400 font-bold"><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Running</span>
                                    </div>
                                </div>
                            </div>

                            {/* Done Column */}
                            <div className="flex flex-col gap-3 min-h-[150px]">
                                {/* Card 4 */}
                                <div className="bg-zinc-100 dark:bg-[#221c10] p-4 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-800 opacity-75 grayscale-[20%]">
                                    <div className="flex justify-between items-start mb-3">
                                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold uppercase tracking-wider bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-400 border border-zinc-300 dark:border-zinc-700">
                                            <RefreshCw className="w-3.5 h-3.5" />
                                            Orchestrator
                                        </span>
                                        <CheckCircle2 className="text-green-500 w-5 h-5" />
                                    </div>
                                    <h4 className="font-bold text-zinc-600 dark:text-zinc-300 mb-2 line-through decoration-zinc-400 leading-tight">Project Initialization</h4>
                                    <p className="text-sm text-zinc-500 line-clamp-2 mb-3 leading-relaxed">Setup Wrangler configuration and initial bindings.</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Phase 2 Swimlane (Dimmed/Locked) */}
                    <div className="flex flex-col gap-4 mt-6 opacity-60 grayscale-[50%] pointer-events-none select-none">
                        <div className="flex items-center gap-3">
                            <Lock className="text-zinc-500 w-6 h-6" />
                            <h2 className="text-xl font-bold text-zinc-700 dark:text-zinc-300">Phase 2: Core Features</h2>
                            <span className="text-sm font-bold text-zinc-500 px-2.5 py-1 bg-zinc-200 dark:bg-zinc-800 rounded-md border border-zinc-300 dark:border-zinc-700 uppercase tracking-wider">Locked</span>
                        </div>
                        
                        <div className="grid grid-cols-3 gap-6 bg-zinc-100/50 dark:bg-black/10 p-4 rounded-xl border border-dashed border-zinc-300 dark:border-zinc-700">
                            {/* Todo Column */}
                            <div className="flex flex-col gap-3 min-h-[150px]">
                                {/* Card 5 */}
                                <div className="bg-white dark:bg-[#2a2415]/50 p-4 rounded-xl border border-zinc-200 dark:border-zinc-800">
                                    <div className="flex justify-between items-start mb-3">
                                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold uppercase tracking-wider bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-500 border border-green-200 dark:border-green-800/30">
                                            <Webhook className="w-3.5 h-3.5" />
                                            Integration Agent
                                        </span>
                                    </div>
                                    <h4 className="font-bold text-zinc-700 dark:text-zinc-400 mb-2 leading-tight">Connect to external APIs</h4>
                                </div>
                                
                                {/* Card 6 */}
                                <div className="bg-white dark:bg-[#2a2415]/50 p-4 rounded-xl border border-zinc-200 dark:border-zinc-800">
                                    <div className="flex justify-between items-start mb-3">
                                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold uppercase tracking-wider bg-purple-100 dark:bg-purple-900/20 text-purple-700 dark:text-purple-500 border border-purple-200 dark:border-purple-800/30">
                                            <PenTool className="w-3.5 h-3.5" />
                                            UX Specialist
                                        </span>
                                    </div>
                                    <h4 className="font-bold text-zinc-700 dark:text-zinc-400 mb-2 leading-tight">Implement dashboard views</h4>
                                </div>
                            </div>
                            
                            {/* In Progress Column */}
                            <div className="flex flex-col gap-3 min-h-[150px] border-l border-dashed border-zinc-300 dark:border-zinc-700 pl-6">
                            </div>
                            
                            {/* Done Column */}
                            <div className="flex flex-col gap-3 min-h-[150px] border-l border-dashed border-zinc-300 dark:border-zinc-700 pl-6">
                            </div>
                        </div>
                    </div>

                </div>
            </main>
        </div>
    );
}
