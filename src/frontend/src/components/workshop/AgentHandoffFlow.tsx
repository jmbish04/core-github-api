import React from 'react';
import { 
    Search, Filter, Plus, Database, Globe, Cloud, 
    MoreVertical, ArrowRightLeft, Database as DataObject, 
    Network 
} from 'lucide-react';

export function AgentHandoffFlow() {
    return (
        <div className="relative flex min-h-screen w-full flex-col overflow-x-hidden bg-zinc-50 dark:bg-[#11100a] text-zinc-900 dark:text-zinc-100 font-sans">
            <div className="flex h-full grow flex-col">
                <header className="flex items-center justify-between whitespace-nowrap border-b border-zinc-200 dark:border-[#363228] px-10 py-3 bg-white dark:bg-[#1c1a14]">
                    <div className="flex items-center gap-8">
                        <div className="flex items-center gap-4 text-amber-500">
                            <Network className="w-6 h-6" />
                            <h2 className="text-zinc-900 dark:text-zinc-100 text-lg font-bold leading-tight tracking-tight">Cross-Project Orchestrator</h2>
                        </div>
                        <label className="flex flex-col min-w-40 h-10 max-w-64">
                            <div className="flex w-full flex-1 items-stretch rounded-lg h-full border border-zinc-200 dark:border-transparent focus-within:border-amber-500/50 transition-colors">
                                <div className="text-zinc-400 dark:text-[#a8a291] flex bg-zinc-100 dark:bg-[#11100a] items-center justify-center pl-4 rounded-l-lg border-r-0">
                                    <Search className="w-5 h-5" />
                                </div>
                                <input 
                                    className="flex w-full min-w-0 flex-1 resize-none overflow-hidden rounded-lg text-zinc-900 dark:text-zinc-100 focus:outline-0 focus:ring-0 border-none bg-zinc-100 dark:bg-[#11100a] h-full placeholder:text-zinc-500 dark:placeholder-[#a8a291] px-4 rounded-l-none border-l-0 pl-2 text-sm font-normal leading-normal" 
                                    placeholder="Search flows, agents, projects..." 
                                    type="text"
                                />
                            </div>
                        </label>
                    </div>
                    <div className="flex flex-1 justify-end gap-8">
                        <nav className="hidden md:flex items-center gap-9">
                            <a className="text-zinc-500 dark:text-[#a8a291] hover:text-zinc-900 dark:hover:text-zinc-100 text-sm font-medium leading-normal transition-colors" href="#">Dashboard</a>
                            <a className="text-amber-600 dark:text-amber-500 text-sm font-medium leading-normal border-b-2 border-amber-500 pb-1" href="#">Flows</a>
                            <a className="text-zinc-500 dark:text-[#a8a291] hover:text-zinc-900 dark:hover:text-zinc-100 text-sm font-medium leading-normal transition-colors" href="#">Agents</a>
                            <a className="text-zinc-500 dark:text-[#a8a291] hover:text-zinc-900 dark:hover:text-zinc-100 text-sm font-medium leading-normal transition-colors" href="#">Projects</a>
                            <a className="text-zinc-500 dark:text-[#a8a291] hover:text-zinc-900 dark:hover:text-zinc-100 text-sm font-medium leading-normal transition-colors" href="#">Settings</a>
                        </nav>
                        <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-amber-400 to-orange-500 border border-zinc-200 dark:border-[#363228]"></div>
                    </div>
                </header>

                <main className="flex-1 flex overflow-hidden">
                    {/* Left Content: Graph View */}
                    <div className="flex-1 flex flex-col p-6 overflow-y-auto">
                        <div className="flex flex-wrap justify-between gap-3 mb-6">
                            <div className="flex min-w-72 flex-col gap-2">
                                <h1 className="text-zinc-900 dark:text-zinc-100 tracking-tight text-3xl font-bold leading-tight">Cross-Project Agent Hand-off Flow</h1>
                                <p className="text-zinc-500 dark:text-[#a8a291] text-sm font-normal leading-normal">Visualizing tasks and context transitions between projects</p>
                            </div>
                            <div className="flex gap-3 items-center">
                                <button className="flex items-center justify-center rounded-lg h-10 px-4 bg-white dark:bg-[#1c1a14] text-zinc-700 dark:text-zinc-100 text-sm font-medium leading-normal border border-zinc-200 dark:border-[#363228] hover:bg-zinc-50 dark:hover:bg-[#11100a] transition-colors gap-2 shadow-sm">
                                    <Filter className="w-[18px] h-[18px]" />
                                    <span>Filter Nodes</span>
                                </button>
                                <button className="flex items-center justify-center rounded-lg h-10 px-4 bg-amber-500 text-zinc-950 text-sm font-bold leading-normal hover:bg-amber-400 transition-colors gap-2 shadow-sm">
                                    <Plus className="w-[18px] h-[18px]" />
                                    <span>New Hand-off</span>
                                </button>
                            </div>
                        </div>

                        <div className="pb-3 border-b border-zinc-200 dark:border-[#363228]">
                            <div className="flex gap-8">
                                <button className="flex flex-col items-center justify-center border-b-[3px] border-b-amber-500 text-amber-600 dark:text-zinc-100 pb-[13px] pt-4 font-bold">
                                    <span className="text-sm leading-normal tracking-wide">Graph View</span>
                                </button>
                                <button className="flex flex-col items-center justify-center border-b-[3px] border-b-transparent text-zinc-500 dark:text-[#a8a291] hover:text-zinc-900 dark:hover:text-zinc-100 pb-[13px] pt-4 transition-colors font-medium">
                                    <span className="text-sm leading-normal tracking-wide">Dependency Map</span>
                                </button>
                                <button className="flex flex-col items-center justify-center border-b-[3px] border-b-transparent text-zinc-500 dark:text-[#a8a291] hover:text-zinc-900 dark:hover:text-zinc-100 pb-[13px] pt-4 transition-colors font-medium">
                                    <span className="text-sm leading-normal tracking-wide">Timeline</span>
                                </button>
                            </div>
                        </div>

                        {/* Graph Area */}
                        <div className="mt-4 flex-1 bg-zinc-100 dark:bg-[#1c1a14] rounded-xl border border-zinc-200 dark:border-[#363228] relative overflow-hidden min-h-[500px]">
                            {/* Decorative Graph Elements */}
                            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(244,192,37,0.05)_0%,transparent_100%)] pointer-events-none"></div>
                            
                            {/* Node 1: Project A */}
                            <div className="absolute top-[20%] left-[15%] flex flex-col items-center gap-2">
                                <div className="w-16 h-16 rounded-lg bg-white dark:bg-[#11100a] border-2 border-zinc-300 dark:border-zinc-600 flex items-center justify-center shadow-md dark:shadow-[0_0_15px_rgba(255,255,255,0.05)] z-10">
                                    <Database className="text-zinc-500 dark:text-zinc-300 w-7 h-7" />
                                </div>
                                <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300 bg-white/80 dark:bg-[#11100a]/80 px-2 py-1 rounded shadow-sm border border-zinc-200 dark:border-transparent">Core API (Proj A)</span>
                                <span className="text-[10px] text-zinc-500 dark:text-[#a8a291] uppercase tracking-wider font-semibold">Data Specialist</span>
                            </div>

                            {/* Node 2: Project B */}
                            <div className="absolute top-[60%] right-[15%] flex flex-col items-center gap-2">
                                <div className="w-16 h-16 rounded-lg bg-white dark:bg-[#11100a] border-2 border-amber-500 flex items-center justify-center shadow-lg dark:shadow-[0_0_20px_rgba(244,192,37,0.2)] z-10">
                                    <Globe className="text-amber-500 w-7 h-7" />
                                </div>
                                <span className="text-xs font-medium text-amber-600 dark:text-amber-500 bg-white/80 dark:bg-[#11100a]/80 px-2 py-1 rounded shadow-sm border border-amber-200 dark:border-transparent">Admin UI (Proj B)</span>
                                <span className="text-[10px] text-zinc-500 dark:text-[#a8a291] uppercase tracking-wider font-semibold">UX Specialist</span>
                            </div>

                            {/* Node 3: Other */}
                            <div className="absolute top-[70%] left-[30%] flex flex-col items-center gap-2 opacity-50">
                                <div className="w-12 h-12 rounded-lg bg-white dark:bg-[#11100a] border border-zinc-300 dark:border-zinc-700 flex items-center justify-center z-10 shadow-sm">
                                    <Cloud className="text-zinc-500 w-5 h-5" />
                                </div>
                                <span className="text-[10px] font-medium text-zinc-600 dark:text-zinc-500">Gateway</span>
                            </div>

                            {/* Connecting Lines (SVG) */}
                            <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 0 }}>
                                {/* Active Path */}
                                <path className="opacity-80" d="M 20% 25% C 50% 25%, 50% 65%, 80% 65%" fill="none" stroke="rgba(244,192,37,0.6)" strokeDasharray="8 4" strokeWidth="3"></path>
                                {/* Glowing overlay for active path */}
                                <path d="M 20% 25% C 50% 25%, 50% 65%, 80% 65%" fill="none" stroke="rgba(244,192,37,0.2)" strokeWidth="8"></path>
                                {/* Inactive Path */}
                                <path d="M 20% 25% C 20% 70%, 25% 75%, 32% 75%" fill="none" stroke="rgba(100,116,139,0.3)" strokeWidth="2"></path>
                                {/* Flow particles */}
                                <circle className="shadow-[0_0_10px_#f4c025] animate-pulse" cx="50%" cy="45%" fill="#f4c025" r="4"></circle>
                            </svg>

                            {/* Legend */}
                            <div className="absolute bottom-4 left-4 bg-white/90 dark:bg-[#11100a]/90 p-3 rounded-lg border border-zinc-200 dark:border-[#363228] flex flex-col gap-2 shadow-sm">
                                <div className="flex items-center gap-2">
                                    <div className="w-3 h-0.5 bg-amber-500"></div>
                                    <span className="text-xs text-zinc-600 dark:text-[#a8a291]">Critical Path (Amber)</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <div className="w-3 h-0.5 bg-cyan-500"></div>
                                    <span className="text-xs text-zinc-600 dark:text-[#a8a291]">Data Stream (Cyan)</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Right Sidebar: Details */}
                    <div className="w-80 border-l border-zinc-200 dark:border-[#363228] bg-zinc-50 dark:bg-[#1c1a14] flex flex-col overflow-y-auto shrink-0 z-20 shadow-[-4px_0_15px_rgba(0,0,0,0.02)]">
                        <div className="p-6 pb-4 border-b border-zinc-200 dark:border-[#363228] flex items-center justify-between sticky top-0 bg-zinc-50/80 dark:bg-[#1c1a14]/80 backdrop-blur-sm z-10">
                            <h3 className="text-zinc-900 dark:text-zinc-100 text-lg font-bold leading-tight tracking-tight">Hand-off Details</h3>
                            <button className="text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors">
                                <MoreVertical className="w-5 h-5" />
                            </button>
                        </div>
                        
                        <div className="p-6 flex flex-col gap-8">
                            {/* Active Transfer Card */}
                            <div className="bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 rounded-xl p-4 flex flex-col gap-3 shadow-sm">
                                <div className="flex items-center gap-2 text-amber-600 dark:text-amber-500">
                                    <ArrowRightLeft className="w-[18px] h-[18px]" />
                                    <span className="text-sm font-bold uppercase tracking-wider">Active Transfer</span>
                                </div>
                                <div>
                                    <p className="text-zinc-900 dark:text-zinc-100 font-semibold mb-1 text-[15px]">Data Specialist → UX Specialist</p>
                                    <p className="text-xs text-zinc-600 dark:text-[#a8a291] leading-relaxed">Passing schema definition from Project A to Project B</p>
                                </div>
                                <div className="flex items-center justify-between mt-2 pt-3 border-t border-amber-200 dark:border-amber-500/20">
                                    <span className="text-xs font-medium text-zinc-500 dark:text-[#a8a291]">Status</span>
                                    <span className="text-xs font-bold text-amber-700 dark:text-amber-500 bg-amber-100 dark:bg-amber-500/20 px-2.5 py-1 rounded-full flex items-center gap-1.5 shadow-sm">
                                        <span className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-pulse"></span> In Progress
                                    </span>
                                </div>
                            </div>

                            {/* Payload Info */}
                            <div className="flex flex-col gap-3">
                                <h4 className="text-xs font-bold text-zinc-500 dark:text-[#a8a291] uppercase tracking-wider flex items-center gap-2 border-b border-zinc-200 dark:border-[#363228] pb-2">
                                    <DataObject className="w-4 h-4 text-zinc-400" /> Payload Context
                                </h4>
                                <div className="bg-white dark:bg-[#11100a] rounded-lg p-4 border border-zinc-200 dark:border-[#363228] shadow-sm flex flex-col gap-3">
                                    <div className="flex justify-between items-center">
                                        <span className="text-sm text-zinc-500 dark:text-[#a8a291] font-medium">Size</span>
                                        <span className="text-sm font-mono font-medium text-zinc-700 dark:text-zinc-300">2.4 MB</span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span className="text-sm text-zinc-500 dark:text-[#a8a291] font-medium">Format</span>
                                        <span className="text-sm font-mono font-medium text-zinc-700 dark:text-zinc-300">JSON/GraphQL</span>
                                    </div>
                                    <div className="flex justify-between items-center pt-1">
                                        <span className="text-sm text-zinc-500 dark:text-[#a8a291] font-medium">Shared Secrets</span>
                                        <span className="text-xs font-bold font-mono text-cyan-700 dark:text-cyan-400 bg-cyan-100 dark:bg-cyan-400/10 px-2 py-0.5 rounded border border-cyan-200 dark:border-cyan-400/20">2 tokens</span>
                                    </div>
                                </div>
                            </div>

                            {/* Dependency Map Preview */}
                            <div className="flex flex-col gap-3">
                                <h4 className="text-xs font-bold text-zinc-500 dark:text-[#a8a291] uppercase tracking-wider flex items-center gap-2 border-b border-zinc-200 dark:border-[#363228] pb-2">
                                    <Network className="w-4 h-4 text-zinc-400" /> Dependency Impact
                                </h4>
                                <div className="bg-white dark:bg-[#11100a] rounded-lg p-4 border border-zinc-200 dark:border-[#363228] shadow-sm">
                                    <p className="text-xs text-zinc-500 dark:text-[#a8a291] mb-4 font-medium">Timeline affected by this hand-off:</p>
                                    
                                    <div className="flex flex-col gap-y-4 relative pl-1.5 mt-2">
                                        <div className="absolute left-[9px] top-2 bottom-2 w-[2px] bg-zinc-200 dark:bg-[#363228]"></div>
                                        
                                        <div className="flex items-start gap-4 relative">
                                            <div className="w-3 h-3 rounded-full bg-zinc-400 dark:bg-zinc-600 border-2 border-white dark:border-[#11100a] z-10 mt-1 shadow-sm"></div>
                                            <div>
                                                <p className="text-sm text-zinc-700 dark:text-zinc-300 font-bold leading-tight">Core API Schema Locked</p>
                                                <p className="text-xs text-zinc-500 dark:text-[#a8a291] mt-0.5 font-medium">Today, 14:00</p>
                                            </div>
                                        </div>
                                        
                                        <div className="flex items-start gap-4 relative">
                                            <div className="w-4 h-4 rounded-full bg-amber-500 border-[3px] border-white dark:border-[#11100a] shadow-[0_0_8px_rgba(244,192,37,0.4)] z-10 mt-0.5 -ml-0.5 animate-pulse"></div>
                                            <div>
                                                <p className="text-sm text-amber-600 dark:text-amber-500 font-bold leading-tight">Hand-off Execution</p>
                                                <p className="text-xs text-amber-500/70 dark:text-amber-500/70 mt-0.5 font-medium">In progress</p>
                                            </div>
                                        </div>
                                        
                                        <div className="flex items-start gap-4 relative">
                                            <div className="w-3 h-3 rounded-full bg-zinc-300 dark:bg-zinc-700 border-2 border-white dark:border-[#11100a] z-10 mt-1 shadow-sm"></div>
                                            <div>
                                                <p className="text-sm text-zinc-500 dark:text-zinc-500 font-bold leading-tight">Admin UI Build Trigger</p>
                                                <p className="text-xs text-zinc-400 dark:text-zinc-600 mt-0.5 font-medium">Pending hand-off</p>
                                            </div>
                                        </div>
                                    </div>
                                    
                                </div>
                            </div>
                        </div>
                    </div>
                </main>
            </div>
        </div>
    );
}
