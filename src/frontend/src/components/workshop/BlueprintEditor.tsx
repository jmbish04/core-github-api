import React, { useState } from 'react';
import { 
    Bot, Rocket, Blocks, Edit, History, Variable, Play, 
    ChevronUp, Wrench, Plus, Search, Code, Database, 
    X, Key, Globe, Calculator, GripVertical, Sparkles
} from 'lucide-react';

export function BlueprintEditor() {
    const [temperature, setTemperature] = useState(0.2);

    return (
        <div className="flex flex-col h-screen overflow-hidden bg-zinc-50 dark:bg-[#181611] text-zinc-900 dark:text-zinc-100 font-sans">
            {/* Top Navigation */}
            <header className="flex items-center justify-between whitespace-nowrap border-b border-zinc-200 dark:border-[#544e3b] px-6 py-3 bg-white dark:bg-[#221e10] z-10 shrink-0">
                <div className="flex items-center gap-4">
                    <div className="w-6 h-6 text-amber-500">
                        <Bot className="w-6 h-6" />
                    </div>
                    <h2 className="text-lg font-bold leading-tight tracking-tight text-zinc-900 dark:text-white">Agent Factory</h2>
                </div>
                
                <div className="flex flex-1 justify-end gap-8">
                    <nav className="hidden md:flex items-center gap-9">
                        <a className="text-amber-600 dark:text-amber-500 text-sm font-medium leading-normal border-b-2 border-amber-500 pb-1" href="#">Blueprints</a>
                        <a className="text-zinc-500 dark:text-[#bab29c] hover:text-zinc-900 dark:hover:text-white transition-colors text-sm font-medium leading-normal" href="#">Agents</a>
                        <a className="text-zinc-500 dark:text-[#bab29c] hover:text-zinc-900 dark:hover:text-white transition-colors text-sm font-medium leading-normal" href="#">Workflows</a>
                        <a className="text-zinc-500 dark:text-[#bab29c] hover:text-zinc-900 dark:hover:text-white transition-colors text-sm font-medium leading-normal" href="#">Settings</a>
                    </nav>
                    
                    <div className="flex items-center gap-3">
                        <button className="flex items-center justify-center rounded-lg h-9 px-4 bg-zinc-100 dark:bg-[#393528] hover:bg-zinc-200 dark:hover:bg-[#544e3b] text-zinc-700 dark:text-white text-sm font-medium transition-colors border border-zinc-200 dark:border-transparent">
                            Save Draft
                        </button>
                        <button className="flex items-center justify-center rounded-lg h-9 px-4 bg-amber-500 hover:bg-amber-400 text-zinc-950 text-sm font-bold transition-colors shadow-sm">
                            <Rocket className="w-4 h-4 mr-2" />
                            Deploy Agent
                        </button>
                        <div className="w-9 h-9 ml-2 rounded-full border border-zinc-200 dark:border-[#544e3b] bg-gradient-to-tr from-amber-400 to-orange-500"></div>
                    </div>
                </div>
            </header>

            {/* Main Workspace */}
            <main className="flex flex-1 overflow-hidden h-[calc(100vh-61px)]">
                
                {/* Left Panel: Agent Identity */}
                <aside className="w-80 flex flex-col border-r border-zinc-200 dark:border-[#544e3b] bg-white/60 dark:bg-[#221e10]/60 backdrop-blur-md overflow-y-auto shrink-0 z-0 relative shadow-[4px_0_15px_rgba(0,0,0,0.02)] border-r-solid">
                    <div className="p-5 flex flex-col gap-6">
                        <div>
                            <h3 className="text-lg font-bold mb-1 text-zinc-900 dark:text-white">Agent Identity</h3>
                            <p className="text-xs text-zinc-500 dark:text-[#bab29c]">Define the core persona and model.</p>
                        </div>
                        
                        {/* Icon Selection */}
                        <div className="flex items-center gap-4">
                            <div className="w-16 h-16 rounded-xl bg-zinc-50 dark:bg-[#221e10] border border-amber-500 flex items-center justify-center text-amber-500 relative group cursor-pointer shadow-sm">
                                <Blocks className="w-8 h-8" />
                                <div className="absolute inset-0 bg-black/40 rounded-xl flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                    <Edit className="w-4 h-4 text-white" />
                                </div>
                            </div>
                            <div className="flex flex-col gap-1 overflow-hidden">
                                <button className="text-xs font-medium text-zinc-700 dark:text-white bg-zinc-100 dark:bg-[#393528] hover:bg-zinc-200 dark:hover:bg-[#544e3b] px-3 py-1.5 rounded transition-colors border border-zinc-200 dark:border-transparent truncate">Change Icon</button>
                                <button className="text-xs font-medium text-zinc-500 dark:text-[#bab29c] hover:text-zinc-900 dark:hover:text-white px-3 py-1.5 rounded transition-colors truncate">Generate</button>
                            </div>
                        </div>

                        {/* Name Input */}
                        <label className="flex flex-col gap-2">
                            <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Agent Name</span>
                            <input 
                                className="w-full rounded-lg bg-zinc-50 dark:bg-[#221e10] border border-zinc-300 dark:border-[#544e3b] focus:border-amber-500 focus:ring-1 focus:ring-amber-500 h-10 px-3 text-sm text-zinc-900 dark:text-white focus:outline-none" 
                                type="text" 
                                defaultValue="CodeReviewer_Beta"
                            />
                        </label>

                        {/* Description */}
                        <label className="flex flex-col gap-2">
                            <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Description</span>
                            <textarea 
                                className="w-full rounded-lg bg-zinc-50 dark:bg-[#221e10] border border-zinc-300 dark:border-[#544e3b] focus:border-amber-500 focus:ring-1 focus:ring-amber-500 p-3 text-sm h-24 resize-none text-zinc-900 dark:text-white focus:outline-none" 
                                defaultValue="Specializes in reviewing PRs for security vulnerabilities and performance bottlenecks."
                            />
                        </label>

                        {/* Base Model */}
                        <label className="flex flex-col gap-2">
                            <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Base Model</span>
                            <select 
                                className="w-full rounded-lg bg-zinc-50 dark:bg-[#221e10] border border-zinc-300 dark:border-[#544e3b] focus:border-amber-500 focus:ring-1 focus:ring-amber-500 h-10 px-3 text-sm text-zinc-900 dark:text-white focus:outline-none appearance-none cursor-pointer" 
                            >
                                <option>GPT-4 Turbo (0125)</option>
                                <option>Claude 3 Opus</option>
                                <option>Claude 3 Sonnet</option>
                                <option>Mistral Large</option>
                            </select>
                        </label>

                        {/* Temperature */}
                        <div className="flex flex-col gap-2">
                            <div className="flex items-center justify-between p-3 rounded-lg bg-zinc-50 dark:bg-[#221e10] border border-zinc-300 dark:border-[#544e3b] shadow-sm">
                                <div className="flex flex-col">
                                    <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Temperature</span>
                                    <span className="text-xs text-zinc-500 dark:text-[#bab29c]">Creativity control</span>
                                </div>
                                <span className="text-sm font-mono text-amber-600 dark:text-amber-500 font-bold">{temperature.toFixed(1)}</span>
                            </div>
                            <input 
                                className="w-full h-1.5 bg-zinc-200 dark:bg-[#393528] rounded-lg appearance-none cursor-pointer accent-amber-500" 
                                max="1" min="0" step="0.1" type="range" 
                                value={temperature}
                                onChange={(e) => setTemperature(parseFloat(e.target.value))}
                            />
                        </div>
                    </div>
                </aside>

                {/* Central Panel: System Prompt Editor */}
                <section className="flex-1 flex flex-col relative z-0">
                    <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-200 dark:border-[#544e3b] bg-white/50 dark:bg-[#221e10]/50 backdrop-blur-sm shadow-sm">
                        <div className="flex items-center gap-2">
                            <Code className="text-amber-500 w-5 h-5" />
                            <h3 className="text-base font-bold text-zinc-900 dark:text-white">System Prompt</h3>
                        </div>
                        <div className="flex items-center gap-2">
                            <button className="text-xs font-semibold flex items-center gap-1.5 bg-zinc-100 dark:bg-[#393528] hover:bg-zinc-200 dark:hover:bg-[#544e3b] px-2.5 py-1.5 rounded text-zinc-600 dark:text-[#bab29c] transition-colors border border-zinc-200 dark:border-transparent shadow-sm">
                                <History className="w-3.5 h-3.5" />
                                History
                            </button>
                            <button className="text-xs font-semibold flex items-center gap-1.5 bg-zinc-100 dark:bg-[#393528] hover:bg-zinc-200 dark:hover:bg-[#544e3b] px-2.5 py-1.5 rounded text-zinc-600 dark:text-[#bab29c] transition-colors border border-zinc-200 dark:border-transparent shadow-sm">
                                <Variable className="w-3.5 h-3.5" />
                                Insert Variable
                            </button>
                        </div>
                    </div>
                    
                    <div className="flex-1 relative bg-zinc-950 dark:bg-[#0d0c09] p-6 overflow-y-auto font-mono text-[13px] leading-relaxed select-text shadow-inner">
                        {/* Line Numbers */}
                        <div className="absolute left-0 top-0 bottom-0 w-12 border-r border-[#544e3b]/50 flex flex-col items-end pt-6 pr-3 text-[#bab29c]/50 select-none font-mono">
                            {[...Array(15)].map((_, i) => <span key={i} className="mb-0.5">{i + 1}</span>)}
                        </div>
                        
                        {/* Editor Content (Simulated) */}
                        <div className="pl-8 text-zinc-300 outline-none" contentEditable spellCheck="false" suppressContentEditableWarning>
                            <div className="mb-4">
                                <span className="text-purple-400 font-semibold">You are</span> a Senior Security Engineer and Code Reviewer.<br/>
                                <span className="text-purple-400 font-semibold">Your primary objective is</span> to analyze pull requests for security vulnerabilities, performance issues, and adherence to clean code principles.
                            </div>
                            
                            <div className="mb-4">
                                <span className="text-amber-400 font-semibold block mb-1"># Context</span>
                                Project Name: <span className="bg-amber-500/20 text-amber-500 px-1 rounded border border-amber-500/30 font-medium">&#123;&#123;project_name&#125;&#125;</span><br/>
                                Current Branch: <span className="bg-amber-500/20 text-amber-500 px-1 rounded border border-amber-500/30 font-medium">&#123;&#123;target_branch&#125;&#125;</span><br/>
                                Language: <span className="bg-amber-500/20 text-amber-500 px-1 rounded border border-amber-500/30 font-medium">&#123;&#123;primary_language&#125;&#125;</span>
                            </div>
                            
                            <div className="mb-4">
                                <span className="text-amber-400 font-semibold block mb-1"># Guidelines</span>
                                1. Always check against OWASP Top 10 vulnerabilities.<br/>
                                2. Ensure secrets are not hardcoded.<br/>
                                3. Verify input validation and output encoding.
                            </div>
                            
                            <div>
                                <span className="text-amber-400 font-semibold block mb-1"># Tools Available</span>
                                When needed, use the <span className="text-cyan-400 border-b border-dashed border-cyan-400/50 cursor-pointer">GitHub Writer</span> tool to add inline comments to the PR.<br/>
                                For database queries related to schema checks, use <span className="text-cyan-400 border-b border-dashed border-cyan-400/50 cursor-pointer">D1 Querying</span>.
                            </div>
                        </div>

                        {/* Floating action button for AI Assist */}
                        <button
                            aria-label="AI Assist"
                            title="AI Assist"
                            className="absolute bottom-6 right-6 w-12 h-12 rounded-full bg-amber-500 text-zinc-950 shadow-lg shadow-amber-500/20 flex items-center justify-center hover:scale-105 transition-transform z-10"
                        >
                            <Sparkles className="w-5 h-5 fill-current" />
                        </button>
                    </div>

                    {/* Bottom Panel: Test Output */}
                    <div className="h-10 border-t border-zinc-200 dark:border-[#544e3b] bg-white dark:bg-[#221e10] flex items-center justify-between px-4 cursor-pointer hover:bg-zinc-50 dark:hover:bg-[#393528] transition-colors shrink-0 z-20">
                        <div className="flex items-center gap-2">
                            <Play className="w-4 h-4 text-zinc-500 dark:text-[#bab29c] fill-current" />
                            <span className="text-sm font-medium text-zinc-700 dark:text-zinc-200">Test Prompt</span>
                        </div>
                        <ChevronUp className="w-5 h-5 text-zinc-500 dark:text-[#bab29c]" />
                    </div>
                </section>

                {/* Right Panel: Toolbox */}
                <aside className="w-80 border-l border-zinc-200 dark:border-[#544e3b] bg-white/60 dark:bg-[#221e10]/60 backdrop-blur-md flex flex-col shrink-0 z-0 shadow-[-4px_0_15px_rgba(0,0,0,0.02)] border-l-solid">
                    <div className="p-4 border-b border-zinc-200 dark:border-[#544e3b] flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Wrench className="text-cyan-500 w-5 h-5" />
                            <h3 className="text-base font-bold text-zinc-900 dark:text-white">Toolbox</h3>
                        </div>
                        <button
                            aria-label="Add tool"
                            title="Add tool"
                            className="text-zinc-500 dark:text-[#bab29c] hover:text-zinc-900 dark:hover:text-white transition-colors"
                        >
                            <Plus className="w-5 h-5" />
                        </button>
                    </div>
                    
                    {/* Search Tools */}
                    <div className="p-4 border-b border-zinc-200 dark:border-[#544e3b]/50">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 dark:text-[#bab29c] w-4 h-4" />
                            <input 
                                className="w-full rounded-lg bg-zinc-100 dark:bg-[#221e10] border border-zinc-200 dark:border-transparent focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 h-9 pl-9 pr-3 text-sm text-zinc-900 dark:text-white placeholder:text-zinc-500 dark:placeholder:text-[#bab29c]/70 focus:outline-none" 
                                placeholder="Search capabilities..." 
                                type="text"
                            />
                        </div>
                    </div>
                    
                    {/* Tools List */}
                    <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
                        <div className="text-xs font-bold text-zinc-500 dark:text-[#bab29c] uppercase tracking-wider mb-1">Bound Tools (2)</div>
                        
                        {/* Bound Tool 1 */}
                        <div className="p-3 rounded-lg border border-cyan-500/30 bg-cyan-50 dark:bg-cyan-500/5 cursor-grab hover:border-cyan-500/60 transition-colors relative overflow-hidden group shadow-sm">
                            <div className="absolute left-0 top-0 bottom-0 w-1 bg-cyan-500"></div>
                            <div className="flex items-start justify-between">
                                <div className="flex items-center gap-2.5">
                                    <Code className="text-cyan-600 dark:text-cyan-500 w-5 h-5" />
                                    <span className="text-sm font-bold text-zinc-900 dark:text-white">GitHub Writer</span>
                                </div>
                                <button
                                    aria-label="Remove tool"
                                    title="Remove tool"
                                    className="opacity-0 group-hover:opacity-100 text-zinc-400 dark:text-[#bab29c] hover:text-red-500 dark:hover:text-red-400 transition-all"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                            <p className="text-xs text-zinc-600 dark:text-[#bab29c] mt-2 leading-relaxed">Allows agent to post comments and reviews on PRs.</p>
                        </div>
                        
                        {/* Bound Tool 2 */}
                        <div className="p-3 rounded-lg border border-cyan-500/30 bg-cyan-50 dark:bg-cyan-500/5 cursor-grab hover:border-cyan-500/60 transition-colors relative overflow-hidden group shadow-sm">
                            <div className="absolute left-0 top-0 bottom-0 w-1 bg-cyan-500"></div>
                            <div className="flex items-start justify-between">
                                <div className="flex items-center gap-2.5">
                                    <Database className="text-cyan-600 dark:text-cyan-500 w-5 h-5" />
                                    <span className="text-sm font-bold text-zinc-900 dark:text-white">D1 Querying</span>
                                </div>
                                <button
                                    aria-label="Remove tool"
                                    title="Remove tool"
                                    className="opacity-0 group-hover:opacity-100 text-zinc-400 dark:text-[#bab29c] hover:text-red-500 dark:hover:text-red-400 transition-all"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                            <p className="text-xs text-zinc-600 dark:text-[#bab29c] mt-2 leading-relaxed">Read-only access to specific D1 databases.</p>
                        </div>
                        
                        <div className="text-xs font-bold text-zinc-500 dark:text-[#bab29c] uppercase tracking-wider mb-1 mt-4 border-t border-zinc-200 dark:border-transparent pt-3">Available Tools</div>
                        
                        {/* Available Tool 1 */}
                        <div className="p-3 rounded-lg border border-zinc-200 dark:border-[#544e3b] bg-white dark:bg-[#221e10] cursor-grab hover:border-zinc-400 dark:hover:border-[#bab29c] transition-colors opacity-70 hover:opacity-100 flex items-center justify-between shadow-sm">
                            <div className="flex items-center gap-3">
                                <Key className="text-zinc-400 dark:text-[#bab29c] w-5 h-5" />
                                <div className="flex flex-col">
                                    <span className="text-sm font-semibold text-zinc-800 dark:text-white">Cloudflare Secrets</span>
                                    <span className="text-[10px] text-zinc-500 dark:text-[#bab29c]">Access scoped secrets</span>
                                </div>
                            </div>
                            <GripVertical className="text-zinc-300 dark:text-[#bab29c] w-4 h-4" />
                        </div>
                        
                        {/* Available Tool 2 */}
                        <div className="p-3 rounded-lg border border-zinc-200 dark:border-[#544e3b] bg-white dark:bg-[#221e10] cursor-grab hover:border-zinc-400 dark:hover:border-[#bab29c] transition-colors opacity-70 hover:opacity-100 flex items-center justify-between shadow-sm">
                            <div className="flex items-center gap-3">
                                <Globe className="text-zinc-400 dark:text-[#bab29c] w-5 h-5" />
                                <div className="flex flex-col">
                                    <span className="text-sm font-semibold text-zinc-800 dark:text-white">Web Scraper</span>
                                    <span className="text-[10px] text-zinc-500 dark:text-[#bab29c]">Extract data from URLs</span>
                                </div>
                            </div>
                            <GripVertical className="text-zinc-300 dark:text-[#bab29c] w-4 h-4" />
                        </div>
                        
                        {/* Available Tool 3 */}
                        <div className="p-3 rounded-lg border border-zinc-200 dark:border-[#544e3b] bg-white dark:bg-[#221e10] cursor-grab hover:border-zinc-400 dark:hover:border-[#bab29c] transition-colors opacity-70 hover:opacity-100 flex items-center justify-between shadow-sm">
                            <div className="flex items-center gap-3">
                                <Calculator className="text-zinc-400 dark:text-[#bab29c] w-5 h-5" />
                                <div className="flex flex-col">
                                    <span className="text-sm font-semibold text-zinc-800 dark:text-white">Math Engine</span>
                                    <span className="text-[10px] text-zinc-500 dark:text-[#bab29c]">Complex calculations</span>
                                </div>
                            </div>
                            <GripVertical className="text-zinc-300 dark:text-[#bab29c] w-4 h-4" />
                        </div>
                        
                    </div>
                </aside>
            </main>
        </div>
    );
}
