import React from 'react';
import { 
    Network, Search, Bell, FolderOpen, Bot, Cpu, Gavel, 
    TrendingUp, CreditCard, LayoutDashboard, Users, Filter,
    ArrowRight
} from 'lucide-react';

export function GlobalCommandCenter() {
    return (
        <div className="relative flex h-full w-full flex-col overflow-hidden bg-zinc-950 text-zinc-50 font-sans">
            {/* Top Navigation */}
            <header className="flex items-center justify-between whitespace-nowrap border-b border-zinc-800 px-6 py-3 shrink-0 bg-zinc-900/80 backdrop-blur-md z-10">
                <div className="flex items-center gap-8">
                    <div className="flex items-center gap-3 text-blue-400">
                        <Network className="w-6 h-6" />
                        <h2 className="text-zinc-50 text-lg font-bold leading-tight tracking-tight">Command Center</h2>
                    </div>
                    <label className="flex flex-col min-w-40 h-10 max-w-64">
                        <div className="flex w-full flex-1 items-stretch rounded-lg h-full bg-zinc-800/50 border border-zinc-800 focus-within:border-blue-500 transition-colors">
                            <div className="text-zinc-400 flex items-center justify-center pl-4 rounded-l-lg">
                                <Search className="w-4 h-4" />
                            </div>
                            <input 
                                className="flex w-full min-w-0 flex-1 resize-none overflow-hidden rounded-r-lg text-zinc-50 focus:outline-0 focus:ring-0 border-none bg-transparent placeholder:text-zinc-500 px-4 pl-2 text-sm font-medium" 
                                placeholder="Search systems..." 
                            />
                        </div>
                    </label>
                </div>
                <div className="flex items-center gap-8">
                    <nav className="hidden md:flex items-center gap-6">
                        <a className="text-blue-400 text-sm font-semibold leading-normal" href="#">Dashboard</a>
                        <a className="text-zinc-400 hover:text-zinc-50 transition-colors text-sm font-medium leading-normal" href="#">Projects</a>
                        <a className="text-zinc-400 hover:text-zinc-50 transition-colors text-sm font-medium leading-normal" href="#">Agents</a>
                        <a className="text-zinc-400 hover:text-zinc-50 transition-colors text-sm font-medium leading-normal" href="#">Settings</a>
                    </nav>
                    <div className="flex items-center gap-3">
                        <button className="flex cursor-pointer items-center justify-center rounded-lg h-9 px-4 bg-blue-500 hover:bg-blue-400 text-zinc-950 text-sm font-bold transition-colors">
                            Deploy Project
                        </button>
                        <button className="flex cursor-pointer items-center justify-center rounded-lg w-9 h-9 bg-zinc-800 hover:bg-zinc-700 text-zinc-50 transition-colors relative">
                            <Bell className="w-4 h-4" />
                            <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-amber-500"></span>
                        </button>
                        <div className="w-9 h-9 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center overflow-hidden cursor-pointer ml-2">
                            <div className="w-full h-full bg-zinc-700"></div>
                        </div>
                    </div>
                </div>
            </header>

            <div className="flex flex-1 overflow-hidden">
                {/* Main Content Area */}
                <main className="flex-1 flex flex-col overflow-y-auto px-6 py-8">
                    {/* Page Header */}
                    <div className="flex flex-col gap-2 mb-8">
                        <div className="flex items-center gap-2 text-blue-400 mb-1">
                            <Network className="w-4 h-4" />
                            <span className="text-xs font-bold tracking-widest uppercase">Global Network</span>
                        </div>
                        <h1 className="text-zinc-50 text-3xl font-bold leading-tight">God View</h1>
                        <p className="text-zinc-400 text-sm max-w-2xl">Monitoring and orchestration of multi-agent workflows across all active clusters.</p>
                    </div>

                    {/* Global Stats */}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
                        <div className="flex flex-col gap-3 rounded-xl p-5 bg-zinc-900 border border-zinc-800 relative overflow-hidden group">
                            <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                            <div className="flex justify-between items-start">
                                <p className="text-zinc-400 text-sm font-medium">Active Projects</p>
                                <FolderOpen className="w-5 h-5 text-blue-400" />
                            </div>
                            <div className="flex items-end gap-3 mt-1">
                                <p className="text-zinc-50 text-3xl font-bold">14</p>
                                <p className="text-blue-400 text-sm font-medium mb-1 flex items-center">
                                    <TrendingUp className="w-3 h-3 mr-1" /> 2
                                </p>
                            </div>
                        </div>
                        
                        <div className="flex flex-col gap-3 rounded-xl p-5 bg-zinc-900 border border-zinc-800 relative overflow-hidden group">
                            <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                            <div className="flex justify-between items-start">
                                <p className="text-zinc-400 text-sm font-medium">Total Agents</p>
                                <Bot className="w-5 h-5 text-blue-400" />
                            </div>
                            <div className="flex items-end gap-3 mt-1">
                                <p className="text-zinc-50 text-3xl font-bold">128</p>
                                <p className="text-blue-400 text-sm font-medium mb-1 flex items-center">
                                    <TrendingUp className="w-3 h-3 mr-1" /> 12
                                </p>
                            </div>
                        </div>

                        <div className="flex flex-col gap-3 rounded-xl p-5 bg-zinc-900 border border-zinc-800 relative overflow-hidden group">
                            <div className="absolute inset-0 bg-gradient-to-br from-amber-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                            <div className="flex justify-between items-start">
                                <p className="text-zinc-400 text-sm font-medium">Compute Load</p>
                                <Cpu className="w-5 h-5 text-amber-500" />
                            </div>
                            <div className="flex items-end gap-3 mt-1">
                                <p className="text-zinc-50 text-3xl font-bold">84%</p>
                                <p className="text-amber-500 text-sm font-medium mb-1 flex items-center">
                                    <TrendingUp className="w-3 h-3 mr-1" /> 5%
                                </p>
                            </div>
                        </div>

                        <div className="flex flex-col gap-3 rounded-xl p-5 border border-amber-500/30 bg-amber-500/5 relative overflow-hidden group">
                            <div className="absolute top-0 right-0 p-2">
                                <span className="flex h-2 w-2 relative">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-500 opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                                </span>
                            </div>
                            <div className="flex justify-between items-start">
                                <p className="text-amber-500 text-sm font-medium">Pending Approvals</p>
                                <Gavel className="w-5 h-5 text-amber-500" />
                            </div>
                            <div className="flex items-end gap-3 mt-1">
                                <p className="text-zinc-50 text-3xl font-bold">3</p>
                                <p className="text-zinc-400 text-sm font-medium mb-1">Human attention req.</p>
                            </div>
                        </div>
                    </div>

                    {/* Active Projects List */}
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-zinc-50 text-xl font-bold">Active Projects</h2>
                        <button className="text-blue-400 hover:text-blue-300 text-sm font-medium flex items-center gap-1 transition-colors">
                            View All <ArrowRight className="w-4 h-4 ml-1" />
                        </button>
                    </div>

                    <div className="flex flex-col gap-4">
                        {/* Project Card 1 */}
                        <div className="rounded-xl bg-zinc-900 border border-amber-500/40 overflow-hidden flex flex-col md:flex-row shadow-lg shadow-black/20">
                            <div className="p-6 flex-1 flex flex-col justify-between">
                                <div>
                                    <div className="flex items-center justify-between mb-3">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded bg-amber-500/10 flex items-center justify-center text-amber-500">
                                                <CreditCard className="w-5 h-5" />
                                            </div>
                                            <h3 className="text-zinc-50 text-lg font-bold">Payment API Overhaul</h3>
                                        </div>
                                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-500 border border-amber-500/20">
                                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
                                            Attention Required
                                        </span>
                                    </div>
                                    <p className="text-zinc-400 text-sm mb-6">Orchestrator Status: <span className="text-zinc-300 font-medium">Phase 2 - Execution Halted</span></p>
                                    
                                    <div className="relative pl-3 border-l-2 border-zinc-800 space-y-4 mb-2">
                                        <div className="relative">
                                            <div className="absolute -left-[19px] top-1 w-3 h-3 rounded-full bg-blue-500 ring-4 ring-zinc-900"></div>
                                            <p className="text-xs text-zinc-500 mb-0.5">09:42 AM</p>
                                            <p className="text-sm text-zinc-300">Data Agents compiled transaction schemas.</p>
                                        </div>
                                        <div className="relative">
                                            <div className="absolute -left-[19px] top-1 w-3 h-3 rounded-full bg-amber-500 ring-4 ring-zinc-900 shadow-[0_0_8px_rgba(245,158,11,0.6)]"></div>
                                            <p className="text-xs text-zinc-500 mb-0.5">10:15 AM</p>
                                            <p className="text-sm text-zinc-50 font-medium">Security Agent flagged legacy auth endpoint. Awaiting human confirmation to deprecate.</p>
                                        </div>
                                    </div>
                                </div>
                                <div className="mt-6 flex gap-3">
                                    <button className="px-4 py-2 bg-amber-500 text-zinc-950 text-sm font-bold rounded-lg hover:bg-amber-400 transition-colors">Review Decision</button>
                                    <button className="px-4 py-2 bg-zinc-800 text-zinc-300 text-sm font-medium rounded-lg hover:bg-zinc-700 transition-colors">Details</button>
                                </div>
                            </div>
                            
                            <div className="md:w-64 lg:w-80 bg-zinc-950 p-4 flex flex-col justify-center border-l border-zinc-800 relative overflow-hidden">
                                <div className="absolute inset-0 opacity-20 pointer-events-none" style={{ backgroundImage: "radial-gradient(circle at 2px 2px, rgba(245, 158, 11, 0.4) 1px, transparent 0)", backgroundSize: "20px 20px" }}></div>
                                <div className="relative z-10 flex flex-col gap-3 items-center">
                                    <div className="flex items-center gap-2">
                                        <div className="w-16 h-8 rounded border border-blue-500/30 bg-blue-500/10 flex items-center justify-center text-xs text-blue-400 font-mono">Data</div>
                                        <div className="h-px w-8 bg-blue-500/50"></div>
                                        <div className="w-10 h-10 rounded-full border-2 border-blue-500 bg-zinc-900 flex items-center justify-center text-blue-400 shadow-[0_0_10px_rgba(59,130,246,0.3)] z-10">
                                            <Network className="w-5 h-5" />
                                        </div>
                                        <div className="h-px w-8 bg-amber-500/80 border-t border-dashed border-amber-500"></div>
                                        <div className="w-16 h-8 rounded border border-amber-500/50 bg-amber-500/20 flex items-center justify-center text-xs text-amber-500 font-mono animate-pulse">Sec</div>
                                    </div>
                                    <div className="text-xs text-center text-zinc-500 mt-2">Active Thread Topology</div>
                                </div>
                            </div>
                        </div>

                        {/* Project Card 2 */}
                        <div className="rounded-xl bg-zinc-900 border border-zinc-800 overflow-hidden flex flex-col md:flex-row hover:border-blue-500/30 transition-colors">
                            <div className="p-6 flex-1 flex flex-col justify-between">
                                <div>
                                    <div className="flex items-center justify-between mb-3">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded bg-blue-500/10 flex items-center justify-center text-blue-400">
                                                <LayoutDashboard className="w-5 h-5" />
                                            </div>
                                            <h3 className="text-zinc-50 text-lg font-bold">Admin Dashboard Gen</h3>
                                        </div>
                                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20">
                                            <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                                            Running
                                        </span>
                                    </div>
                                    <p className="text-zinc-400 text-sm mb-6">Orchestrator Status: <span className="text-zinc-300 font-medium">Phase 4 - UI Assembly</span></p>
                                    
                                    <div className="relative pl-3 border-l-2 border-zinc-800 space-y-4 mb-2">
                                        <div className="relative">
                                            <div className="absolute -left-[19px] top-1 w-3 h-3 rounded-full bg-blue-500 ring-4 ring-zinc-900"></div>
                                            <p className="text-xs text-zinc-500 mb-0.5">11:05 AM</p>
                                            <p className="text-sm text-zinc-300">UX Agents completed wireframe conversion.</p>
                                        </div>
                                        <div className="relative">
                                            <div className="absolute -left-[19px] top-1 w-3 h-3 rounded-full bg-blue-500 ring-4 ring-zinc-900"></div>
                                            <p className="text-xs text-zinc-500 mb-0.5">Current</p>
                                            <p className="text-sm text-zinc-300">Frontend Agents wiring up state management.</p>
                                        </div>
                                    </div>
                                </div>
                                <div className="mt-6 flex gap-3">
                                    <button className="px-4 py-2 bg-zinc-800 text-zinc-300 text-sm font-medium rounded-lg hover:bg-zinc-700 transition-colors">View Details</button>
                                </div>
                            </div>
                            
                            <div className="md:w-64 lg:w-80 bg-zinc-950 p-4 flex flex-col justify-center border-l border-zinc-800 relative overflow-hidden">
                                <div className="absolute inset-0 opacity-20 pointer-events-none" style={{ backgroundImage: "linear-gradient(rgba(59, 130, 246, 0.2) 1px, transparent 1px), linear-gradient(90deg, rgba(59, 130, 246, 0.2) 1px, transparent 1px)", backgroundSize: "20px 20px" }}></div>
                                <div className="relative z-10 w-full bg-zinc-900 border border-zinc-800 rounded-lg p-3 h-24 overflow-hidden">
                                    <div className="flex items-center gap-2 mb-2">
                                        <div className="w-2 h-2 rounded-full bg-red-500/50"></div>
                                        <div className="w-2 h-2 rounded-full bg-yellow-500/50"></div>
                                        <div className="w-2 h-2 rounded-full bg-green-500/50"></div>
                                    </div>
                                    <div className="space-y-2">
                                        <div className="h-2 bg-zinc-800 rounded w-3/4"></div>
                                        <div className="h-2 bg-blue-500/40 rounded w-1/2"></div>
                                        <div className="h-2 bg-zinc-800 rounded w-5/6"></div>
                                    </div>
                                    <div className="absolute top-0 left-0 w-full h-1 bg-blue-500/50 shadow-[0_0_8px_rgba(59,130,246,0.8)] animate-[pulse_2s_ease-in-out_infinite]"></div>
                                </div>
                            </div>
                        </div>
                    </div>
                </main>

                {/* Sidebar: Global Agent Roster */}
                <aside className="w-80 border-l border-zinc-800 bg-zinc-900 hidden lg:flex flex-col shrink-0">
                    <div className="p-5 border-b border-zinc-800 flex items-center justify-between sticky top-0 bg-zinc-900/95 backdrop-blur z-10">
                        <h3 className="text-zinc-50 font-bold flex items-center gap-2">
                            <Users className="w-5 h-5 text-blue-400" />
                            Agent Roster
                        </h3>
                        <button className="text-zinc-400 hover:text-zinc-50">
                            <Filter className="w-4 h-4" />
                        </button>
                    </div>
                    <div className="p-5 flex-1 overflow-y-auto space-y-6">
                        {/* SRE Agents */}
                        <div>
                            <div className="flex items-center justify-between mb-3">
                                <h4 className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Site Reliability (SRE)</h4>
                                <span className="text-xs font-medium text-zinc-400">12 Total</span>
                            </div>
                            <div className="space-y-2">
                                {[1, 2].map((i) => (
                                    <div key={`sre-${i}`} className="flex items-center justify-between p-2 rounded bg-zinc-800 border border-zinc-700">
                                        <div className="flex items-center gap-2">
                                            <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                                            <span className="text-sm font-medium text-zinc-300">SRE-Alpha-{i}</span>
                                        </div>
                                        <span className="text-xs text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded">Busy</span>
                                    </div>
                                ))}
                                <div className="flex items-center justify-between p-2 rounded bg-zinc-950 border border-transparent">
                                    <div className="flex items-center gap-2">
                                        <div className="w-2 h-2 rounded-full bg-zinc-700"></div>
                                        <span className="text-sm font-medium text-zinc-500">SRE-Gamma</span>
                                    </div>
                                    <span className="text-xs text-zinc-500">Idle</span>
                                </div>
                            </div>
                        </div>

                        {/* Data Agents */}
                        <div>
                            <div className="flex items-center justify-between mb-3">
                                <h4 className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Data Engineering</h4>
                                <span className="text-xs font-medium text-zinc-400">24 Total</span>
                            </div>
                            <div className="space-y-2">
                                <div className="flex items-center justify-between p-2 rounded border border-amber-500/30 bg-amber-500/5">
                                    <div className="flex items-center gap-2">
                                        <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></div>
                                        <span className="text-sm font-medium text-zinc-50">Data-Node-1</span>
                                    </div>
                                    <span className="text-xs text-amber-500 bg-amber-500/10 px-1.5 py-0.5 rounded">Blocked</span>
                                </div>
                                {[2, 3].map((i) => (
                                    <div key={`data-${i}`} className="flex items-center justify-between p-2 rounded bg-zinc-800 border border-zinc-700">
                                        <div className="flex items-center gap-2">
                                            <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                                            <span className="text-sm font-medium text-zinc-300">Data-Node-{i}</span>
                                        </div>
                                        <span className="text-xs text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded">Busy</span>
                                    </div>
                                ))}
                                <div className="text-center mt-2">
                                    <button className="text-xs text-zinc-500 hover:text-zinc-300">View 21 more...</button>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <div className="p-4 border-t border-zinc-800 bg-zinc-900 mt-auto">
                        <div className="flex items-center justify-between text-xs text-zinc-400 mb-2">
                            <span>Global Agent Utilization</span>
                            <span className="text-blue-400 font-mono">78%</span>
                        </div>
                        <div className="h-1.5 w-full bg-zinc-950 rounded-full overflow-hidden">
                            <div className="h-full bg-blue-500 rounded-full" style={{ width: '78%' }}></div>
                        </div>
                    </div>
                </aside>
            </div>
        </div>
    );
}
