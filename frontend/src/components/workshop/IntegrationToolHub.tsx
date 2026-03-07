import React from 'react';
import { 
    Blocks, Search, Plus, Code, MoreVertical, Database, 
    CreditCard, LockOpen, Shield, CheckCircle2, AlertCircle
} from 'lucide-react';

export function IntegrationToolHub() {
    return (
        <div className="relative flex h-auto min-h-screen w-full flex-col overflow-x-hidden bg-zinc-50 dark:bg-[#0b1214] text-zinc-900 dark:text-zinc-100 font-sans">
            <div className="flex h-full grow flex-col">
                <header className="flex items-center justify-between whitespace-nowrap border-b border-zinc-200 dark:border-[#131f23] px-10 py-4 bg-white/50 dark:bg-[#0d1618]/50 backdrop-blur-md sticky top-0 z-50">
                    <div className="flex items-center gap-8">
                        <div className="flex items-center gap-4 text-zinc-900 dark:text-white">
                            <div className="w-6 h-6 text-cyan-400">
                                <Blocks className="w-6 h-6" />
                            </div>
                            <h2 className="text-xl font-bold leading-tight tracking-tight">Nexus Agent Hub</h2>
                        </div>
                        <nav className="hidden md:flex items-center gap-9">
                            <a className="text-zinc-600 dark:text-zinc-400 hover:text-cyan-500 dark:hover:text-cyan-400 transition-colors text-sm font-medium leading-normal" href="#">Dashboard</a>
                            <a className="text-zinc-600 dark:text-zinc-400 hover:text-cyan-500 dark:hover:text-cyan-400 transition-colors text-sm font-medium leading-normal" href="#">Agents</a>
                            <a className="text-cyan-500 text-sm font-semibold leading-normal" href="#">Integrations</a>
                            <a className="text-zinc-600 dark:text-zinc-400 hover:text-cyan-500 dark:hover:text-cyan-400 transition-colors text-sm font-medium leading-normal" href="#">Audit Log</a>
                            <a className="text-zinc-600 dark:text-zinc-400 hover:text-cyan-500 dark:hover:text-cyan-400 transition-colors text-sm font-medium leading-normal" href="#">Settings</a>
                        </nav>
                    </div>
                    <div className="flex flex-1 justify-end gap-8 items-center">
                        <label className="flex flex-col min-w-40 h-10 max-w-64">
                            <div className="flex w-full flex-1 items-center rounded-full h-full border border-zinc-200 dark:border-[#131f23] bg-zinc-100 dark:bg-[#131f23]/50 backdrop-blur-sm focus-within:border-cyan-500/50 transition-colors">
                                <div className="text-zinc-400 flex items-center justify-center pl-4 rounded-l-full">
                                    <Search className="w-[18px] h-[18px]" />
                                </div>
                                <input 
                                    className="flex w-full min-w-0 flex-1 resize-none overflow-hidden rounded-full text-zinc-900 dark:text-white focus:outline-0 focus:ring-0 border-none bg-transparent h-full placeholder:text-zinc-500 px-4 pl-2 text-sm font-normal leading-normal" 
                                    placeholder="Search integrations..." 
                                    type="text"
                                />
                            </div>
                        </label>
                        <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-cyan-500 to-blue-500 border border-zinc-200 dark:border-[#131f23]"></div>
                    </div>
                </header>

                <main className="flex-1 flex flex-col px-10 py-8 max-w-[1440px] mx-auto w-full gap-8">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                        <div className="flex flex-col gap-2">
                            <h1 className="text-zinc-900 dark:text-white text-3xl font-bold leading-tight tracking-tight">Integration & Tool Hub</h1>
                            <p className="text-zinc-500 dark:text-zinc-400 text-sm font-normal leading-normal max-w-2xl">Manage API tokens, database bindings, and external services for your AI agents securely. Monitor access and rotate secrets.</p>
                        </div>
                        <button className="flex items-center gap-2 cursor-pointer justify-center overflow-hidden rounded-full h-10 px-6 bg-cyan-500 hover:bg-cyan-600 text-zinc-950 text-sm font-bold leading-normal tracking-wide transition-colors shadow-[0_0_15px_rgba(6,182,212,0.3)]">
                            <Plus className="w-[18px] h-[18px]" />
                            <span>Add Integration</span>
                        </button>
                    </div>

                    {/* Integrations Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {/* GitHub Integration */}
                        <div className="flex flex-col rounded-xl border border-zinc-200 dark:border-[#131f23] bg-white dark:bg-[#0d1618]/60 backdrop-blur-md overflow-hidden relative group">
                            <div className="absolute inset-0 bg-gradient-to-br from-[#131f23]/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                            <div className="p-6 flex flex-col gap-6 relative z-10">
                                <div className="flex justify-between items-start">
                                    <div className="flex items-center gap-4">
                                        <div className="w-12 h-12 rounded-lg bg-zinc-100 dark:bg-[#131f23] flex items-center justify-center border border-zinc-200 dark:border-[#131f23]/50 text-zinc-900 dark:text-white shadow-inner">
                                            <Code className="w-6 h-6" />
                                        </div>
                                        <div>
                                            <h3 className="text-zinc-900 dark:text-white text-lg font-bold">GitHub</h3>
                                            <div className="flex items-center gap-1.5 mt-1">
                                                <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"></div>
                                                <span className="text-emerald-500 text-xs font-medium">Connected</span>
                                            </div>
                                        </div>
                                    </div>
                                    <button className="text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors">
                                        <MoreVertical className="w-5 h-5" />
                                    </button>
                                </div>
                                <div className="flex flex-col gap-3">
                                    <div className="flex justify-between items-center text-sm">
                                        <span className="text-zinc-500 dark:text-zinc-400">Assigned Agents</span>
                                        <div className="flex -space-x-2">
                                            <div className="w-6 h-6 rounded-full bg-indigo-500 ring-2 ring-white dark:ring-[#0d1618]"></div>
                                            <div className="w-6 h-6 rounded-full bg-purple-500 ring-2 ring-white dark:ring-[#0d1618]"></div>
                                            <div className="w-6 h-6 rounded-full bg-blue-500 ring-2 ring-white dark:ring-[#0d1618]"></div>
                                            <div className="inline-flex w-6 h-6 items-center justify-center rounded-full ring-2 ring-white dark:ring-[#0d1618] bg-zinc-200 dark:bg-[#131f23] text-[10px] font-medium text-zinc-600 dark:text-zinc-300">+1</div>
                                        </div>
                                    </div>
                                    <div className="flex justify-between items-center text-sm">
                                        <span className="text-zinc-500 dark:text-zinc-400">Token Rotation</span>
                                        <span className="text-zinc-700 dark:text-zinc-300">Auto (30 days)</span>
                                    </div>
                                    <div className="w-full bg-zinc-200 dark:bg-[#131f23] rounded-full h-1.5 mt-1 overflow-hidden">
                                        <div className="bg-cyan-500 h-1.5 rounded-full" style={{ width: '45%' }}></div>
                                    </div>
                                    <span className="text-xs text-zinc-500 dark:text-zinc-400 text-right">14 days until rotation</span>
                                </div>
                                <div className="pt-4 border-t border-zinc-200 dark:border-[#131f23] flex gap-3">
                                    <button className="flex-1 bg-zinc-100 dark:bg-[#131f23] hover:bg-zinc-200 dark:hover:bg-[#131f23]/80 text-zinc-900 dark:text-white text-sm py-2 rounded-lg font-medium transition-colors border border-zinc-200 dark:border-[#131f23]/50">Manage Secrets</button>
                                    <button className="flex-1 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-600 dark:text-cyan-400 text-sm py-2 rounded-lg font-medium transition-colors border border-cyan-500/20">Rotate Now</button>
                                </div>
                            </div>
                        </div>

                        {/* Cloudflare D1 Integration */}
                        <div className="flex flex-col rounded-xl border border-zinc-200 dark:border-[#131f23] bg-white dark:bg-[#0d1618]/60 backdrop-blur-md overflow-hidden relative group">
                            <div className="p-6 flex flex-col gap-6 relative z-10">
                                <div className="flex justify-between items-start">
                                    <div className="flex items-center gap-4">
                                        <div className="w-12 h-12 rounded-lg bg-zinc-100 dark:bg-[#131f23] flex items-center justify-center border border-zinc-200 dark:border-[#131f23]/50 text-zinc-900 dark:text-white shadow-inner">
                                            <Database className="w-6 h-6" />
                                        </div>
                                        <div>
                                            <h3 className="text-zinc-900 dark:text-white text-lg font-bold">Cloudflare D1</h3>
                                            <div className="flex items-center gap-1.5 mt-1">
                                                <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"></div>
                                                <span className="text-emerald-500 text-xs font-medium">Connected</span>
                                            </div>
                                        </div>
                                    </div>
                                    <button className="text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors">
                                        <MoreVertical className="w-5 h-5" />
                                    </button>
                                </div>
                                <div className="flex flex-col gap-3">
                                    <div className="flex justify-between items-center text-sm">
                                        <span className="text-zinc-500 dark:text-zinc-400">Assigned Agents</span>
                                        <div className="flex -space-x-2">
                                            <div className="w-6 h-6 rounded-full bg-orange-500 ring-2 ring-white dark:ring-[#0d1618]"></div>
                                            <div className="w-6 h-6 rounded-full bg-amber-500 ring-2 ring-white dark:ring-[#0d1618]"></div>
                                        </div>
                                    </div>
                                    <div className="flex justify-between items-center text-sm">
                                        <span className="text-zinc-500 dark:text-zinc-400">Binding Type</span>
                                        <span className="text-zinc-700 dark:text-zinc-300">Read/Write</span>
                                    </div>
                                    <div className="w-full bg-zinc-200 dark:bg-[#131f23] rounded-full h-1.5 mt-1 overflow-hidden">
                                        <div className="bg-amber-500 h-1.5 rounded-full" style={{ width: '85%' }}></div>
                                    </div>
                                    <span className="text-xs text-zinc-500 dark:text-zinc-400 text-right">Approaching connection limit</span>
                                </div>
                                <div className="pt-4 border-t border-zinc-200 dark:border-[#131f23] flex gap-3">
                                    <button className="flex-1 bg-zinc-100 dark:bg-[#131f23] hover:bg-zinc-200 dark:hover:bg-[#131f23]/80 text-zinc-900 dark:text-white text-sm py-2 rounded-lg font-medium transition-colors border border-zinc-200 dark:border-[#131f23]/50">Manage Binding</button>
                                    <button className="flex-1 bg-zinc-100 dark:bg-[#131f23] hover:bg-zinc-200 dark:hover:bg-[#131f23]/80 text-zinc-900 dark:text-white text-sm py-2 rounded-lg font-medium transition-colors border border-zinc-200 dark:border-[#131f23]/50">Query Logs</button>
                                </div>
                            </div>
                        </div>

                        {/* Stripe Integration */}
                        <div className="flex flex-col rounded-xl border border-amber-500/30 bg-white dark:bg-[#0d1618]/60 backdrop-blur-md overflow-hidden relative group">
                            <div className="absolute inset-0 bg-amber-100/50 dark:bg-amber-500/5 opacity-100"></div>
                            <div className="p-6 flex flex-col gap-6 relative z-10">
                                <div className="flex justify-between items-start">
                                    <div className="flex items-center gap-4">
                                        <div className="w-12 h-12 rounded-lg bg-white dark:bg-[#131f23] flex items-center justify-center border border-amber-500/30 text-zinc-900 dark:text-white shadow-inner">
                                            <CreditCard className="w-6 h-6 text-amber-500" />
                                        </div>
                                        <div>
                                            <h3 className="text-zinc-900 dark:text-white text-lg font-bold">Stripe</h3>
                                            <div className="flex items-center gap-1.5 mt-1">
                                                <div className="w-2 h-2 rounded-full bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]"></div>
                                                <span className="text-amber-600 dark:text-amber-500 text-xs font-medium">Locked - Needs Auth</span>
                                            </div>
                                        </div>
                                    </div>
                                    <button className="text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors">
                                        <MoreVertical className="w-5 h-5" />
                                    </button>
                                </div>
                                <div className="flex flex-col gap-3">
                                    <div className="flex justify-between items-center text-sm">
                                        <span className="text-zinc-500 dark:text-zinc-400">Assigned Agents</span>
                                        <span className="text-zinc-400 dark:text-zinc-500 text-xs italic">None (Locked)</span>
                                    </div>
                                    <div className="flex justify-between items-center text-sm">
                                        <span className="text-zinc-500 dark:text-zinc-400">Token Status</span>
                                        <span className="text-amber-600 dark:text-amber-500 font-medium">Expired</span>
                                    </div>
                                    <div className="w-full bg-zinc-200 dark:bg-[#131f23] rounded-full h-1.5 mt-1 overflow-hidden">
                                        <div className="bg-amber-500 h-1.5 rounded-full" style={{ width: '100%' }}></div>
                                    </div>
                                    <span className="text-xs text-amber-600 dark:text-amber-500 text-right">Requires manual rotation</span>
                                </div>
                                <div className="pt-4 border-t border-zinc-200 dark:border-[#131f23] flex gap-3">
                                    <button className="w-full bg-amber-50 dark:bg-amber-500/10 hover:bg-amber-100 dark:hover:bg-amber-500/20 text-amber-600 dark:text-amber-500 text-sm py-2 rounded-lg font-medium transition-colors border border-amber-200 dark:border-amber-500/20 flex justify-center items-center gap-2">
                                        <LockOpen className="w-[18px] h-[18px]" /> Re-authenticate
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Security Audit Log */}
                    <div className="mt-4 flex flex-col rounded-xl border border-zinc-200 dark:border-[#131f23] bg-white dark:bg-[#0d1618]/40 backdrop-blur-sm overflow-hidden">
                        <div className="px-6 py-4 border-b border-zinc-200 dark:border-[#131f23] flex justify-between items-center bg-zinc-50 dark:bg-transparent">
                            <h3 className="text-lg font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                                <Shield className="w-5 h-5 text-cyan-500" />
                                Security Audit Log
                            </h3>
                            <button className="text-xs text-cyan-600 dark:text-cyan-500 hover:text-cyan-700 dark:hover:text-cyan-400 font-medium">View Full Log</button>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left">
                                <thead className="text-xs text-zinc-500 dark:text-zinc-400 bg-zinc-50 dark:bg-[#131f23]/30 uppercase border-b border-zinc-200 dark:border-[#131f23]">
                                    <tr>
                                        <th className="px-6 py-3 font-medium" scope="col">Timestamp</th>
                                        <th className="px-6 py-3 font-medium" scope="col">Agent</th>
                                        <th className="px-6 py-3 font-medium" scope="col">Resource Accessed</th>
                                        <th className="px-6 py-3 font-medium" scope="col">Action</th>
                                        <th className="px-6 py-3 font-medium" scope="col">Status</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-zinc-200 dark:divide-[#131f23]">
                                    <tr className="hover:bg-zinc-50 dark:hover:bg-[#131f23]/20 transition-colors">
                                        <td className="px-6 py-4 whitespace-nowrap text-zinc-500 dark:text-zinc-400 font-mono text-xs">2023-10-27 14:32:01</td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-2">
                                                <div className="w-5 h-5 rounded-full bg-cyan-500"></div>
                                                <span className="text-zinc-700 dark:text-zinc-300 font-medium">CodeReview_Bot</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-zinc-600 dark:text-zinc-300 font-mono text-xs">github_pat_v2_read</td>
                                        <td className="px-6 py-4 text-zinc-700 dark:text-zinc-300">Read Pull Request #402</td>
                                        <td className="px-6 py-4">
                                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 dark:bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20">
                                                <CheckCircle2 className="w-3.5 h-3.5" /> Success
                                            </span>
                                        </td>
                                    </tr>
                                    <tr className="hover:bg-zinc-50 dark:hover:bg-[#131f23]/20 transition-colors">
                                        <td className="px-6 py-4 whitespace-nowrap text-zinc-500 dark:text-zinc-400 font-mono text-xs">2023-10-27 14:15:22</td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-2">
                                                <div className="w-5 h-5 rounded-full bg-purple-500"></div>
                                                <span className="text-zinc-700 dark:text-zinc-300 font-medium">DataAnalyzer_v2</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-zinc-600 dark:text-zinc-300 font-mono text-xs">cloudflare_d1_prod</td>
                                        <td className="px-6 py-4 text-zinc-700 dark:text-zinc-300">Execute SELECT query</td>
                                        <td className="px-6 py-4">
                                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 dark:bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20">
                                                <CheckCircle2 className="w-3.5 h-3.5" /> Success
                                            </span>
                                        </td>
                                    </tr>
                                    <tr className="hover:bg-amber-50/50 dark:hover:bg-amber-500/5 transition-colors bg-white dark:bg-amber-500/5">
                                        <td className="px-6 py-4 whitespace-nowrap text-zinc-500 dark:text-zinc-400 font-mono text-xs">2023-10-27 13:45:10</td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-2">
                                                <div className="w-5 h-5 rounded-full bg-amber-500"></div>
                                                <span className="text-zinc-700 dark:text-zinc-300 font-medium">BillingBot</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-zinc-600 dark:text-zinc-300 font-mono text-xs">stripe_api_live</td>
                                        <td className="px-6 py-4 text-zinc-700 dark:text-zinc-300">Create Invoice</td>
                                        <td className="px-6 py-4">
                                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 dark:bg-amber-500/10 px-2.5 py-1 text-xs font-semibold text-amber-700 dark:text-amber-500 border border-amber-200 dark:border-amber-500/20">
                                                <AlertCircle className="w-3.5 h-3.5" /> Denied (Expired Auth)
                                            </span>
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                </main>
            </div>
        </div>
    );
}
