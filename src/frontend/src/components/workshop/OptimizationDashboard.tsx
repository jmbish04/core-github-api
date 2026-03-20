import React from 'react';
import { 
    Network, Search, Bell, Download, Sparkles, AlertTriangle, 
    TrendingUp, TrendingDown, Settings, ArrowRight, MoreHorizontal 
} from 'lucide-react';

export function OptimizationDashboard() {
    return (
        <div className="flex flex-col min-h-screen bg-zinc-50 dark:bg-[#221e10] text-zinc-900 dark:text-zinc-100 font-sans overflow-x-hidden">
            {/* Top Nav */}
            <header className="flex items-center justify-between whitespace-nowrap border-b border-zinc-200 dark:border-white/10 px-6 py-4 lg:px-10 bg-white dark:bg-transparent">
                <div className="flex items-center gap-8">
                    <div className="flex items-center gap-4">
                        <div className="text-amber-500 flex items-center justify-center">
                            <Network className="w-8 h-8" />
                        </div>
                        <h2 className="text-lg font-bold leading-tight tracking-tight text-zinc-900 dark:text-white">AgentOS</h2>
                    </div>
                    <div className="hidden md:block">
                        <label className="flex flex-col min-w-40 h-10 max-w-64">
                            <div className="flex w-full flex-1 items-stretch rounded-lg h-full bg-zinc-100 dark:bg-white/5 border border-zinc-200 dark:border-white/10 focus-within:border-amber-500/50 transition-colors">
                                <div className="text-zinc-500 dark:text-white/50 flex items-center justify-center pl-4 pr-2">
                                    <Search className="w-5 h-5" />
                                </div>
                                <input 
                                    className="w-full min-w-0 flex-1 resize-none bg-transparent focus:outline-none focus:ring-0 border-none placeholder:text-zinc-500 dark:placeholder:text-white/50 px-2 text-sm text-zinc-900 dark:text-white" 
                                    placeholder="Search operations..." 
                                    type="text"
                                />
                            </div>
                        </label>
                    </div>
                </div>
                <div className="flex items-center gap-6 lg:gap-8">
                    <nav className="hidden lg:flex items-center gap-8">
                        <a className="text-sm font-medium text-zinc-600 dark:text-white/70 hover:text-amber-500 transition-colors" href="#">Dashboard</a>
                        <a className="text-sm font-medium text-zinc-600 dark:text-white/70 hover:text-amber-500 transition-colors" href="#">Workforce</a>
                        <a className="text-sm font-medium text-amber-600 dark:text-amber-500 border-b-2 border-amber-500 pb-1" href="#">Bottlenecks</a>
                        <a className="text-sm font-medium text-zinc-600 dark:text-white/70 hover:text-amber-500 transition-colors" href="#">Analytics</a>
                    </nav>
                    <div className="flex items-center gap-4">
                        <button className="text-zinc-500 dark:text-white/70 hover:text-amber-500 transition-colors">
                            <Bell className="w-6 h-6" />
                        </button>
                        <div className="bg-amber-100 dark:bg-amber-500/20 aspect-square rounded-full w-9 h-9 border border-amber-200 dark:border-amber-500/30 flex items-center justify-center text-amber-700 dark:text-amber-500 font-bold text-sm select-none">
                            JD
                        </div>
                    </div>
                </div>
            </header>

            {/* Main Content */}
            <main className="flex-1 flex flex-col w-full max-w-[1440px] mx-auto px-4 lg:px-10 py-8 gap-8">
                
                {/* Header Section */}
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                    <div className="flex flex-col gap-2">
                        <h1 className="text-3xl md:text-4xl font-bold leading-tight tracking-tight text-zinc-900 dark:text-white">Bottlenecks & Optimization</h1>
                        <p className="text-zinc-600 dark:text-white/60 text-sm md:text-base max-w-2xl leading-relaxed">
                            Identify friction points, analyze wait times, and optimize your AI agent workforce for peak operational efficiency.
                        </p>
                    </div>
                    <div className="flex gap-3">
                        <button className="px-4 py-2 rounded-lg bg-white dark:bg-white/5 border border-zinc-200 dark:border-white/10 text-zinc-700 dark:text-white text-sm font-medium hover:bg-zinc-50 dark:hover:bg-white/10 flex items-center gap-2 shadow-sm transition-colors">
                            <Download className="w-5 h-5 opacity-70" />
                            Export Report
                        </button>
                        <button className="px-4 py-2 rounded-lg bg-amber-500 text-zinc-950 text-sm font-bold hover:bg-amber-400 flex items-center gap-2 shadow-sm transition-colors">
                            <Sparkles className="w-5 h-5 fill-current" />
                            Auto-Optimize
                        </button>
                    </div>
                </div>

                {/* Key Metrics */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="flex flex-col gap-3 rounded-xl p-5 bg-white dark:bg-white/5 border border-zinc-200 dark:border-white/5 relative overflow-hidden group shadow-sm transition-colors hover:border-amber-500/30">
                        <div className="absolute top-0 right-0 p-4 opacity-5 dark:opacity-10 group-hover:opacity-10 dark:group-hover:opacity-20 transition-opacity text-amber-500">
                            <AlertTriangle className="w-16 h-16" />
                        </div>
                        <p className="text-zinc-600 dark:text-white/60 text-sm font-medium z-10">Critical Bottlenecks</p>
                        <p className="text-3xl font-bold text-amber-600 dark:text-amber-500 z-10">4</p>
                        <p className="text-red-600 dark:text-red-400 text-sm font-medium flex items-center gap-1 z-10">
                            <TrendingUp className="w-4 h-4" /> +2 from last week
                        </p>
                    </div>

                    <div className="flex flex-col gap-3 rounded-xl p-5 bg-white dark:bg-white/5 border border-zinc-200 dark:border-white/5 shadow-sm">
                        <p className="text-zinc-600 dark:text-white/60 text-sm font-medium">Avg Handoff Wait Time</p>
                        <p className="text-3xl font-bold text-zinc-900 dark:text-white">2h 45m</p>
                        <p className="text-red-600 dark:text-red-400 text-sm font-medium flex items-center gap-1">
                            <TrendingUp className="w-4 h-4" /> +12.5%
                        </p>
                    </div>

                    <div className="flex flex-col gap-3 rounded-xl p-5 bg-white dark:bg-white/5 border border-zinc-200 dark:border-white/5 shadow-sm">
                        <p className="text-zinc-600 dark:text-white/60 text-sm font-medium">System Idle Time</p>
                        <p className="text-3xl font-bold text-zinc-900 dark:text-white">14%</p>
                        <p className="text-green-600 dark:text-green-400 text-sm font-medium flex items-center gap-1">
                            <TrendingDown className="w-4 h-4" /> -3.2%
                        </p>
                    </div>

                    <div className="flex flex-col gap-3 rounded-xl p-5 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 shadow-sm">
                        <p className="text-amber-700 dark:text-amber-500 text-sm font-medium">Pending Recommendations</p>
                        <p className="text-3xl font-bold text-amber-600 dark:text-amber-500">2</p>
                        <p className="text-zinc-600 dark:text-white/60 text-sm font-medium flex items-center gap-1">
                            Action required
                        </p>
                    </div>
                </div>

                {/* Main Dashboard Grid */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    
                    {/* Heatmap Section */}
                    <div className="lg:col-span-2 flex flex-col gap-4 rounded-xl border border-zinc-200 dark:border-white/10 p-6 bg-white dark:bg-white/5 shadow-sm">
                        <div className="flex justify-between items-start">
                            <div>
                                <h2 className="text-xl font-bold text-zinc-900 dark:text-white">Operational Bottleneck Heatmap</h2>
                                <p className="text-zinc-600 dark:text-white/60 text-sm mt-1">Agent workflow friction points by stage (last 7 days)</p>
                            </div>
                            <select className="bg-zinc-50 dark:bg-[#221e10] border border-zinc-200 dark:border-white/10 rounded-lg px-3 py-1.5 text-sm text-zinc-700 dark:text-white focus:ring-1 focus:ring-amber-500 focus:border-amber-500 outline-none cursor-pointer">
                                <option>Last 7 Days</option>
                                <option>Last 30 Days</option>
                                <option>All Time</option>
                            </select>
                        </div>
                        
                        <div className="mt-6 h-[250px] w-full flex items-end gap-2 sm:gap-4 px-2">
                            {/* Chart Bars */}
                            {[
                                { label: 'Ingestion', height: '30%', tooltip: '30 hrs delay', color: 'bg-amber-500/30' },
                                { label: 'Schema\nReview', height: '85%', tooltip: '185 hrs delay', color: 'bg-amber-500 shadow-[0_0_15px_rgba(244,192,37,0.3)]', isBold: true },
                                { label: 'API Int.', height: '45%', tooltip: '45 hrs delay', color: 'bg-amber-500/30' },
                                { label: 'Logic', height: '15%', tooltip: '15 hrs delay', color: 'bg-cyan-600/60 dark:bg-cyan-500/50' },
                                { label: 'CSS\nRefactor', height: '70%', tooltip: '140 hrs delay', color: 'bg-amber-500/80 shadow-[0_0_10px_rgba(244,192,37,0.2)]', isBold: true },
                                { label: 'QA Test', height: '25%', tooltip: '25 hrs delay', color: 'bg-cyan-600/60 dark:bg-cyan-500/50' },
                                { label: 'Deploy', height: '40%', tooltip: '40 hrs delay', color: 'bg-amber-500/30' }
                            ].map((bar, i) => (
                                <div key={i} className="flex-1 flex flex-col items-center gap-2 group">
                                    <div 
                                        className={`w-full rounded-t-sm relative flex items-end justify-center transition-all opacity-90 group-hover:opacity-100 cursor-crosshair ${bar.color}`} 
                                        style={{ height: bar.height }}
                                    >
                                        <div className="opacity-0 group-hover:opacity-100 absolute -top-8 bg-zinc-900 dark:bg-[#11100a] text-white text-xs py-1 px-2 rounded whitespace-nowrap z-10 shadow-lg pointer-events-none transition-opacity">
                                            {bar.tooltip}
                                        </div>
                                    </div>
                                    <span className={`text-xs text-center truncate w-full whitespace-pre-line leading-tight ${bar.isBold ? 'font-bold text-amber-600 dark:text-amber-500' : 'font-medium text-zinc-500 dark:text-white/50'}`}>
                                        {bar.label}
                                    </span>
                                </div>
                            ))}
                        </div>
                        
                        <div className="flex justify-center gap-6 mt-4 pt-4 border-t border-zinc-100 dark:border-white/5">
                            <div className="flex items-center gap-2">
                                <div className="w-3 h-3 rounded-full bg-amber-500 shadow-[0_0_5px_rgba(244,192,37,0.5)]"></div>
                                <span className="text-xs text-zinc-600 dark:text-white/60 font-medium">High Friction</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <div className="w-3 h-3 rounded-full bg-amber-500/40"></div>
                                <span className="text-xs text-zinc-600 dark:text-white/60 font-medium">Moderate Friction</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <div className="w-3 h-3 rounded-full bg-cyan-600/60 dark:bg-cyan-500/50"></div>
                                <span className="text-xs text-zinc-600 dark:text-white/60 font-medium">Optimal Flow</span>
                            </div>
                        </div>
                    </div>

                    {/* Recommendation Sidebar */}
                    <div className="flex flex-col gap-4">
                        <h2 className="text-xl font-bold px-1 text-zinc-900 dark:text-white">AI Recommendations</h2>
                        
                        {/* Primary Recommendation Card */}
                        <div className="flex flex-col gap-4 rounded-xl border border-amber-500/30 p-6 bg-amber-50 dark:bg-amber-500/10 relative overflow-hidden shadow-sm">
                            <div className="absolute -right-4 -top-4 text-amber-500/10 dark:text-amber-500/20">
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-[120px] h-[120px]">
                                  <path fillRule="evenodd" d="M12 2.25c-5.385 0-9.75 4.365-9.75 9.75s4.365 9.75 9.75 9.75 9.75-4.365 9.75-9.75S17.385 2.25 12 2.25Zm0 1.5a8.25 8.25 0 1 0 0 16.5 8.25 8.25 0 0 0 0-16.5ZM10 6a2 2 0 1 0 0 4 2 2 0 0 0 0-4ZM7 15a3 3 0 0 1 6 0H7Zm7-8a2 2 0 1 0 0 4 2 2 0 0 0 0-4ZM14 15a3 3 0 0 1 6 0h-6Z" clipRule="evenodd" />
                                </svg>
                            </div>
                            
                            <div className="flex items-center gap-3 relative z-10">
                                <div className="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center text-amber-600 dark:text-amber-500 shrink-0">
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                                      <path d="M11 5a3 3 0 11-6 0 3 3 0 016 0zM2.046 15.253c-.058-.468.172-.92.57-1.175A9.953 9.953 0 0110 12c.5 0 .991.037 1.472.109a.75.75 0 10.156-1.492A11.455 11.455 0 0010 10.5c-4.14 0-7.854 1.761-10.457 4.54a.75.75 0 001.071 1.042c2.053-2.11 4.908-3.414 8.13-3.568l-3.219 2.146a.75.75 0 00.832 1.248l4-2.667a.75.75 0 00.18-1.077l-2.667-4a.75.75 0 10-1.248.832l1.673 2.51C11.666 11.539 12 11.75 12 12c0 .25-.335.461-1.046.608-.71.146-1.637.234-2.954.234-1.317 0-2.243-.088-2.954-.234-.71-.147-1.046-.358-1.046-.608z" />
                                      <path d="M14 8a1 1 0 100-2 1 1 0 000 2zM17 8a1 1 0 100-2 1 1 0 000 2zM20 8a1 1 0 100-2 1 1 0 000 2z" />
                                    </svg>
                                </div>
                                <div>
                                    <span className="text-xs font-bold text-amber-600 dark:text-amber-500 tracking-wider uppercase">Action Required</span>
                                    <h3 className="font-bold text-lg leading-tight text-zinc-900 dark:text-white">Capacity Overload Detected</h3>
                                </div>
                            </div>
                            
                            <p className="text-sm text-zinc-700 dark:text-white/80 leading-relaxed mt-1 relative z-10">
                                The <span className="font-bold text-zinc-900 dark:text-white">Data Specialist Agent</span> is currently at 145% capacity during the "Data Schema Review" stage. This is causing downstream delays of up to 48 hours.
                            </p>
                            
                            <div className="bg-white/80 dark:bg-[#221e10]/80 p-4 rounded-lg border border-amber-200 dark:border-white/5 relative z-10 mt-1 shadow-sm backdrop-blur-sm">
                                <p className="text-sm font-medium mb-1.5 text-zinc-800 dark:text-white">Suggested Resolution:</p>
                                <p className="text-[15px] font-bold text-amber-600 dark:text-amber-500 leading-tight">Hire a dedicated Stripe Integration Specialist</p>
                                <p className="text-xs text-zinc-500 dark:text-white/50 mt-1.5 font-medium">Estimated ROI: 32% faster schema reviews</p>
                            </div>
                            
                            <div className="flex gap-3 mt-1 relative z-10">
                                <button className="flex-1 py-2.5 rounded-lg bg-amber-500 text-zinc-950 text-sm font-bold hover:bg-amber-400 transition-colors shadow-sm">
                                    Deploy Agent
                                </button>
                                <button className="flex-1 py-2.5 rounded-lg bg-transparent border border-amber-500/50 text-amber-700 dark:text-amber-500 text-sm font-bold hover:bg-amber-500/10 transition-colors">
                                    View Details
                                </button>
                            </div>
                        </div>

                        {/* Secondary Recommendation */}
                        <div className="flex flex-col gap-3 rounded-xl border border-zinc-200 dark:border-white/10 p-5 bg-white dark:bg-white/5 shadow-sm hover:border-zinc-300 dark:hover:border-white/20 transition-colors">
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-zinc-100 dark:bg-white/10 flex items-center justify-center text-zinc-600 dark:text-white/70 shrink-0">
                                    <Settings className="w-4 h-4" />
                                </div>
                                <h3 className="font-bold text-sm text-zinc-900 dark:text-white">Workflow Optimization</h3>
                            </div>
                            <p className="text-xs text-zinc-600 dark:text-white/60 leading-relaxed">
                                Parallelize CSS Refactoring with QA Testing to reduce overall pipeline time by an estimated 14 hours per sprint.
                            </p>
                            <button className="text-amber-600 dark:text-amber-500 text-xs font-bold self-start mt-1 hover:underline flex items-center gap-1">
                                Review Changes <ArrowRight className="w-3 h-3" />
                            </button>
                        </div>
                    </div>
                </div>

                {/* Wait Times Section */}
                <div className="flex flex-col gap-4 rounded-xl border border-zinc-200 dark:border-white/10 p-6 bg-white dark:bg-white/5 shadow-sm">
                    <div className="flex justify-between items-center mb-2">
                        <div>
                            <h2 className="text-xl font-bold text-zinc-900 dark:text-white">Handoff Wait Time Analysis</h2>
                            <p className="text-zinc-600 dark:text-white/60 text-sm mt-1">Gap duration between stage completion and subsequent stage initiation.</p>
                        </div>
                        <button className="text-zinc-400 hover:text-amber-500 transition-colors">
                            <MoreHorizontal className="w-6 h-6" />
                        </button>
                    </div>
                    
                    <div className="space-y-6 mt-4">
                        {/* Row 1 */}
                        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                            <div className="w-48 text-sm font-medium text-zinc-700 dark:text-white/80 shrink-0">Schema Review → API Int.</div>
                            <div className="flex-1 h-6 bg-zinc-100 dark:bg-white/5 rounded-full flex overflow-hidden">
                                <div className="bg-cyan-600 dark:bg-cyan-500/80 h-full flex items-center px-2 text-[10px] font-bold text-white whitespace-nowrap" style={{ width: '25%' }}>Task: 4h</div>
                                <div className="bg-amber-500 h-full flex items-center px-2 text-[10px] font-bold text-zinc-950 whitespace-nowrap" style={{ width: '60%' }}>Wait: 12h 30m</div>
                            </div>
                            <div className="w-16 text-left sm:text-right text-sm font-bold text-amber-600 dark:text-amber-500 shrink-0">16h 30m</div>
                        </div>
                        
                        {/* Row 2 */}
                        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                            <div className="w-48 text-sm font-medium text-zinc-700 dark:text-white/80 shrink-0">CSS Refactor → QA Test</div>
                            <div className="flex-1 h-6 bg-zinc-100 dark:bg-white/5 rounded-full flex overflow-hidden">
                                <div className="bg-cyan-600 dark:bg-cyan-500/80 h-full flex items-center px-2 text-[10px] font-bold text-white whitespace-nowrap" style={{ width: '40%' }}>Task: 8h</div>
                                <div className="bg-amber-400 dark:bg-amber-500/60 h-full flex items-center px-2 text-[10px] font-bold text-zinc-900 dark:text-zinc-950 whitespace-nowrap" style={{ width: '30%' }}>Wait: 5h 15m</div>
                            </div>
                            <div className="w-16 text-left sm:text-right text-sm font-bold text-zinc-700 dark:text-white/80 shrink-0">13h 15m</div>
                        </div>
                        
                        {/* Row 3 */}
                        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                            <div className="w-48 text-sm font-medium text-zinc-700 dark:text-white/80 shrink-0">Data Ingestion → Schema</div>
                            <div className="flex-1 h-6 bg-zinc-100 dark:bg-white/5 rounded-full flex overflow-hidden">
                                <div className="bg-cyan-600 dark:bg-cyan-500/80 h-full flex items-center px-2 text-[10px] font-bold text-white whitespace-nowrap" style={{ width: '15%' }}>Task: 2h</div>
                                <div className="bg-amber-300 dark:bg-amber-500/40 h-full flex items-center px-2 text-[10px] font-bold text-zinc-800 dark:text-zinc-950 whitespace-nowrap" style={{ width: '10%' }}>Wait: 1h</div>
                            </div>
                            <div className="w-16 text-left sm:text-right text-sm font-bold text-zinc-700 dark:text-white/80 shrink-0">3h 00m</div>
                        </div>
                    </div>
                    
                    <div className="mt-4 flex gap-5 text-xs font-medium text-zinc-500 dark:text-white/50 border-t border-zinc-100 dark:border-white/5 pt-5">
                        <div className="flex items-center gap-2">
                            <div className="w-2.5 h-2.5 rounded bg-cyan-600 dark:bg-cyan-500/80"></div> Active Task Time
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="w-2.5 h-2.5 rounded bg-amber-500"></div> Idle / Wait Time
                        </div>
                    </div>
                </div>

            </main>
        </div>
    );
}
