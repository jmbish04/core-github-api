import React, { useState } from 'react';
import { 
    Blocks, Search, FileText, Bell, ChevronsUpDown, Home, Folder, Bot, 
    BarChart2, Settings2, Wand2, Settings, HelpCircle, Save, ArrowRight,
    FileEdit, UserPlus, ClipboardCheck, FolderOpen, Sparkles, GitMerge, Zap, CheckCircle2
} from 'lucide-react';

export function WorkshopTakeover() {
    const [gitStrategy, setGitStrategy] = useState<'pr' | 'direct'>('pr');

    return (
        <div className="relative flex min-h-screen w-full flex-col overflow-x-hidden bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-50 font-sans">
            <div className="flex h-full grow flex-col">
                <header className="flex items-center justify-between whitespace-nowrap border-b border-zinc-200 dark:border-zinc-800 bg-white/70 dark:bg-zinc-900/70 px-10 py-3 z-10 sticky top-0 backdrop-blur-md">
                    <div className="flex items-center gap-8">
                        <div className="flex items-center gap-4 text-zinc-900 dark:text-zinc-50">
                            <div className="w-6 h-6 text-blue-500 flex items-center justify-center">
                                <Blocks className="w-6 h-6" />
                            </div>
                            <h2 className="text-lg font-bold leading-tight tracking-tight">GitHub Agent Management</h2>
                        </div>
                        <nav className="hidden md:flex items-center gap-9">
                            <a className="text-zinc-500 hover:text-blue-500 transition-colors text-sm font-medium leading-normal" href="#">Dashboard</a>
                            <a className="text-blue-500 text-sm font-medium leading-normal border-b-2 border-blue-500 pb-1" href="#">Workshops</a>
                            <a className="text-zinc-500 hover:text-blue-500 transition-colors text-sm font-medium leading-normal" href="#">Settings</a>
                        </nav>
                    </div>
                    <div className="flex flex-1 justify-end gap-6 items-center">
                        <div className="relative w-64 hidden lg:block">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-zinc-500">
                                <Search className="w-5 h-5" />
                            </div>
                            <input 
                                className="block w-full pl-10 pr-3 py-2 border border-zinc-200 dark:border-zinc-800 rounded-lg leading-5 bg-zinc-50 dark:bg-zinc-900 text-zinc-900 dark:text-zinc-50 placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 sm:text-sm transition-colors" 
                                placeholder="Search agents, workflows..." 
                                type="text"
                            />
                        </div>
                        <div className="flex items-center gap-3">
                            <button className="flex items-center justify-center rounded-lg h-10 px-4 bg-blue-500 hover:bg-blue-600 text-white text-sm font-semibold leading-normal transition-colors shadow-sm shadow-blue-500/20">
                                Create Agent
                            </button>
                            <div className="flex items-center gap-2 border-l border-zinc-200 dark:border-zinc-800 pl-4 ml-2">
                                <button
                                    className="flex items-center justify-center rounded-full w-9 h-9 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 dark:hover:text-zinc-50 transition-colors"
                                    aria-label="View documentation"
                                    title="View documentation"
                                >
                                    <FileText className="w-5 h-5" />
                                </button>
                                <button
                                    className="relative flex items-center justify-center rounded-full w-9 h-9 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 dark:hover:text-zinc-50 transition-colors"
                                    aria-label="View notifications"
                                    title="View notifications"
                                >
                                    <Bell className="w-5 h-5" />
                                    <span className="absolute top-1 right-1 block w-2 h-2 rounded-full bg-amber-500 ring-2 ring-zinc-900"></span>
                                </button>
                                <button
                                    className="ml-2 flex items-center justify-center rounded-full overflow-hidden border-2 border-transparent hover:border-blue-500 transition-colors"
                                    aria-label="User profile menu"
                                    title="User profile menu"
                                >
                                    <div className="w-8 h-8 rounded-full bg-zinc-800"></div>
                                </button>
                            </div>
                        </div>
                    </div>
                </header>

                <div className="flex flex-1 overflow-hidden">
                    {/* Sidebar */}
                    <aside className="w-72 flex-shrink-0 border-r border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hidden md:flex flex-col justify-between py-6 px-4 z-0">
                        <div className="flex flex-col gap-8">
                            <div className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800 cursor-pointer transition-colors border border-transparent dark:hover:border-zinc-800">
                                <div className="bg-gradient-to-br from-blue-400 to-blue-600 aspect-square rounded-md w-10 h-10 flex items-center justify-center text-white font-bold shadow-sm">
                                    AC
                                </div>
                                <div className="flex flex-col flex-1 overflow-hidden">
                                    <h1 className="text-zinc-900 dark:text-zinc-50 text-sm font-semibold leading-tight truncate">Acme Corp Workspace</h1>
                                    <p className="text-zinc-500 text-xs font-medium truncate flex items-center gap-1">
                                        <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-500"></span> Pro Plan
                                    </p>
                                </div>
                                <ChevronsUpDown className="w-5 h-5 text-zinc-500" />
                            </div>

                            <nav className="flex flex-col gap-1">
                                <a className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-zinc-500 hover:bg-zinc-50 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-zinc-50 transition-colors group" href="#">
                                    <Home className="w-5 h-5 group-hover:text-blue-500 transition-colors" />
                                    <span className="text-sm font-medium">Overview</span>
                                </a>
                                <a className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-zinc-500 hover:bg-zinc-50 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-zinc-50 transition-colors group" href="#">
                                    <Folder className="w-5 h-5 group-hover:text-blue-500 transition-colors" />
                                    <span className="text-sm font-medium">Repositories</span>
                                </a>
                                <a className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-zinc-500 hover:bg-zinc-50 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-zinc-50 transition-colors group" href="#">
                                    <Bot className="w-5 h-5 group-hover:text-blue-500 transition-colors" />
                                    <span className="text-sm font-medium">Deployed Agents</span>
                                </a>
                                <a className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-zinc-500 hover:bg-zinc-50 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-zinc-50 transition-colors group" href="#">
                                    <BarChart2 className="w-5 h-5 group-hover:text-blue-500 transition-colors" />
                                    <span className="text-sm font-medium">Analytics</span>
                                </a>
                            </nav>
                        </div>

                        <div className="flex flex-col gap-4">
                            <div className="relative overflow-hidden rounded-xl border border-amber-500/30 bg-gradient-to-br from-amber-500/10 to-zinc-900 p-4 shadow-lg group">
                                <div className="absolute -right-4 -top-4 w-24 h-24 bg-amber-500/20 blur-2xl rounded-full group-hover:bg-amber-500/30 transition-all"></div>
                                <div className="relative z-10 flex flex-col gap-3">
                                    <div className="flex items-center gap-2 text-amber-500">
                                        <Settings2 className="w-5 h-5" />
                                        <span className="text-xs font-bold uppercase tracking-wider">Premium Feature</span>
                                    </div>
                                    <div>
                                        <h3 className="text-zinc-50 font-bold text-base mb-1">Agent Workshop</h3>
                                        <p className="text-zinc-400 text-xs leading-relaxed">Design, configure, and deploy specialized AI agents in a guided environment.</p>
                                    </div>
                                    <button className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg bg-amber-500 hover:bg-amber-600 px-4 py-2 text-zinc-900 text-sm font-bold transition-all shadow-md hover:shadow-amber-500/25">
                                        <Wand2 className="w-4 h-4" />
                                        <span>Open Workshop</span>
                                    </button>
                                </div>
                            </div>
                            <div className="border-t border-zinc-200 dark:border-zinc-800 pt-4">
                                <a className="flex items-center gap-3 px-3 py-2 rounded-lg text-zinc-500 hover:bg-zinc-50 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-zinc-50 transition-colors group" href="#">
                                    <Settings className="w-5 h-5 group-hover:text-blue-500 transition-colors" />
                                    <span className="text-sm font-medium">Settings</span>
                                </a>
                                <a className="flex items-center gap-3 px-3 py-2 rounded-lg text-zinc-500 hover:bg-zinc-50 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-zinc-50 transition-colors group" href="#">
                                    <HelpCircle className="w-5 h-5 group-hover:text-blue-500 transition-colors" />
                                    <span className="text-sm font-medium">Help & Support</span>
                                </a>
                            </div>
                        </div>
                    </aside>

                    {/* Main Content */}
                    <main className="flex-1 overflow-y-auto relative bg-zinc-50 dark:bg-zinc-950 p-6 lg:p-8 flex flex-col items-center">
                        <div className="absolute inset-0 opacity-[0.03] dark:opacity-[0.02] pointer-events-none" style={{ backgroundImage: "radial-gradient(circle at 1px 1px, white 1px, transparent 0)", backgroundSize: "32px 32px" }}></div>
                        
                        <div className="w-full max-w-5xl relative z-10 h-full flex flex-col">
                            {/* Workshop Header */}
                            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8 bg-white dark:bg-zinc-900 p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm">
                                <div className="flex flex-col gap-1">
                                    <div className="flex items-center gap-2 mb-2">
                                        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-blue-500/10 text-blue-500">Workshop Mode</span>
                                        <span className="text-zinc-500 text-sm">•</span>
                                        <span className="text-zinc-500 text-sm font-medium">Acme Web Application</span>
                                    </div>
                                    <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50 flex items-center gap-3">
                                        Agent Deployment Setup
                                    </h1>
                                    <p className="text-zinc-500 text-sm mt-1">Configure your AI workforce for the selected repository.</p>
                                </div>
                                <div className="flex items-center gap-3">
                                    <button className="px-4 py-2 rounded-lg text-sm font-medium text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 border border-transparent dark:hover:border-zinc-700 transition-colors">
                                        Cancel
                                    </button>
                                    <button className="px-4 py-2 rounded-lg text-sm font-medium bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-50 border border-zinc-200 dark:border-zinc-700 hover:border-blue-500/50 transition-colors flex items-center gap-2 shadow-sm">
                                        <Save className="w-4 h-4" />
                                        Save Draft
                                    </button>
                                    <button className="px-4 py-2 rounded-lg text-sm font-medium bg-blue-500 hover:bg-blue-600 text-white transition-colors flex items-center gap-2 shadow-sm shadow-blue-500/20">
                                        Continue
                                        <ArrowRight className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>

                            {/* Stepper */}
                            <div className="mb-8 w-full">
                                <div className="flex items-center justify-between relative w-full">
                                    <div className="absolute left-0 top-1/2 -translate-y-1/2 w-full h-1 bg-zinc-200 dark:bg-zinc-800 rounded-full -z-10"></div>
                                    <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[15%] h-1 bg-blue-500 rounded-full -z-10 transition-all duration-500"></div>
                                    
                                    <div className="flex flex-col items-center gap-2 relative z-10 w-1/3">
                                        <div className="w-10 h-10 rounded-full bg-blue-500 text-white flex items-center justify-center border-4 border-zinc-50 dark:border-zinc-950 shadow-sm">
                                            <FileEdit className="w-5 h-5" />
                                        </div>
                                        <span className="text-sm font-bold text-zinc-900 dark:text-zinc-50">Define Project</span>
                                    </div>
                                    <div className="flex flex-col items-center gap-2 relative z-10 w-1/3">
                                        <div className="w-10 h-10 rounded-full bg-white dark:bg-zinc-900 text-zinc-500 border-4 border-zinc-50 dark:border-zinc-950 flex items-center justify-center shadow-sm">
                                            <UserPlus className="w-5 h-5" />
                                        </div>
                                        <span className="text-sm font-medium text-zinc-500">Select Agents</span>
                                    </div>
                                    <div className="flex flex-col items-center gap-2 relative z-10 w-1/3">
                                        <div className="w-10 h-10 rounded-full bg-white dark:bg-zinc-900 text-zinc-500 border-4 border-zinc-50 dark:border-zinc-950 flex items-center justify-center shadow-sm">
                                            <ClipboardCheck className="w-5 h-5" />
                                        </div>
                                        <span className="text-sm font-medium text-zinc-500">Review</span>
                                    </div>
                                </div>
                            </div>

                            {/* Content */}
                            <div className="flex-1 w-full bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm p-8 overflow-y-auto">
                                <div className="max-w-3xl mx-auto space-y-8">
                                    <div className="space-y-4">
                                        <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-50">Project Details</h2>
                                        <p className="text-sm text-zinc-500">Provide the core context for the AI agents to understand the goal of this deployment.</p>
                                    </div>

                                    <div className="space-y-6">
                                        <div className="space-y-2">
                                            <label className="block text-sm font-medium text-zinc-900 dark:text-zinc-50">Deployment Name <span className="text-red-500">*</span></label>
                                            <input 
                                                className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg px-4 py-2.5 text-zinc-900 dark:text-zinc-50 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all sm:text-sm" 
                                                defaultValue="Frontend Migration to React 18" 
                                                type="text" 
                                            />
                                        </div>

                                        <div className="space-y-2">
                                            <label className="block text-sm font-medium text-zinc-900 dark:text-zinc-50">Target Repository</label>
                                            <div className="flex items-center justify-between bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg px-4 py-3">
                                                <div className="flex items-center gap-3">
                                                    <FolderOpen className="w-5 h-5 text-zinc-500" />
                                                    <span className="text-sm font-medium text-zinc-900 dark:text-zinc-50">acme-corp / web-app-client</span>
                                                </div>
                                                <button className="text-blue-500 hover:text-blue-600 text-sm font-medium transition-colors">Change</button>
                                            </div>
                                        </div>

                                        <div className="space-y-2">
                                            <div className="flex justify-between items-center">
                                                <label className="block text-sm font-medium text-zinc-900 dark:text-zinc-50">Project Objective & Context <span className="text-red-500">*</span></label>
                                                <button className="text-xs text-blue-500 flex items-center gap-1 hover:underline">
                                                    <Sparkles className="w-3.5 h-3.5" /> 
                                                    Generate from issues
                                                </button>
                                            </div>
                                            <textarea 
                                                className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg px-4 py-3 text-zinc-900 dark:text-zinc-50 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all sm:text-sm resize-y" 
                                                rows={6}
                                                defaultValue="We need to upgrade the entire frontend application from React 17 to React 18."
                                            ></textarea>
                                        </div>

                                        <div className="space-y-3 pt-4 border-t border-zinc-200 dark:border-zinc-800">
                                            <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-50">Git Strategy</h3>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                <label className={`relative flex cursor-pointer rounded-lg border bg-zinc-50 dark:bg-zinc-950 p-4 shadow-sm focus:outline-none transition-colors ${gitStrategy === 'pr' ? 'border-blue-500 ring-1 ring-blue-500' : 'border-zinc-200 dark:border-zinc-800 hover:border-zinc-500'}`}>
                                                    <input 
                                                        className="sr-only" 
                                                        type="radio" 
                                                        name="git_strategy" 
                                                        value="pr"
                                                        checked={gitStrategy === 'pr'}
                                                        onChange={() => setGitStrategy('pr')}
                                                    />
                                                    <span className="flex flex-1">
                                                        <span className="flex flex-col">
                                                            <span className="block text-sm font-medium text-zinc-900 dark:text-zinc-50 flex items-center gap-2">
                                                                <GitMerge className={`w-4 h-4 ${gitStrategy === 'pr' ? 'text-blue-500' : 'text-zinc-500'}`} />
                                                                Pull Requests
                                                            </span>
                                                            <span className="mt-1 flex items-center text-xs text-zinc-500">Agents create feature branches and submit PRs for review.</span>
                                                        </span>
                                                    </span>
                                                    {gitStrategy === 'pr' && <CheckCircle2 className="text-blue-500 w-5 h-5 ml-2" />}
                                                </label>

                                                <label className={`relative flex cursor-pointer rounded-lg border bg-zinc-50 dark:bg-zinc-950 p-4 shadow-sm focus:outline-none transition-colors ${gitStrategy === 'direct' ? 'border-blue-500 ring-1 ring-blue-500' : 'border-zinc-200 dark:border-zinc-800 hover:border-zinc-500'}`}>
                                                    <input 
                                                        className="sr-only" 
                                                        type="radio" 
                                                        name="git_strategy" 
                                                        value="direct"
                                                        checked={gitStrategy === 'direct'}
                                                        onChange={() => setGitStrategy('direct')}
                                                    />
                                                    <span className="flex flex-1">
                                                        <span className="flex flex-col">
                                                            <span className="block text-sm font-medium text-zinc-900 dark:text-zinc-50 flex items-center gap-2">
                                                                <Zap className={`w-4 h-4 ${gitStrategy === 'direct' ? 'text-blue-500' : 'text-zinc-500'}`} />
                                                                Direct Commit
                                                            </span>
                                                            <span className="mt-1 flex items-center text-xs text-zinc-500">Agents commit directly to a specified branch (e.g., 'agent-dev').</span>
                                                        </span>
                                                    </span>
                                                    {gitStrategy === 'direct' && <CheckCircle2 className="text-blue-500 w-5 h-5 ml-2" />}
                                                </label>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </main>
                </div>
            </div>
        </div>
    );
}
