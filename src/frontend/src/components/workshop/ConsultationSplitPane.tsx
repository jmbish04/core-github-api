import React, { useState } from 'react';
import { 
    Blocks, CheckCircle2, MessageSquare, History, Bot, Paperclip, 
    Send, FileText, Download, Network, Database, Pencil, Webhook
} from 'lucide-react';

export function ConsultationSplitPane() {
    const [activeTab, setActiveTab] = useState<'chat' | 'history'>('chat');
    const [input, setInput] = useState('');

    return (
        <div className="flex h-[calc(100vh-4rem)] w-full overflow-hidden bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-50 font-sans">
            {/* Split Screen Container */}
            <div className="flex-1 flex overflow-hidden">
                
                {/* Left Panel: Chat Interface */}
                <section className="w-1/2 flex flex-col border-r border-zinc-200 dark:border-amber-500/20 bg-white/30 dark:bg-black/10">
                    <div className="flex border-b border-zinc-200 dark:border-amber-500/20 px-6 gap-8 shrink-0">
                        <button 
                            onClick={() => setActiveTab('chat')}
                            className={`flex flex-col items-center justify-center border-b-[3px] pb-[13px] pt-4 transition-colors ${activeTab === 'chat' ? 'border-b-amber-500 text-amber-500' : 'border-b-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-200'}`}
                        >
                            <span className="text-sm font-bold leading-normal tracking-[0.015em] flex items-center gap-2">
                                <MessageSquare className="w-[18px] h-[18px]" /> Chat Interface
                            </span>
                        </button>
                        <button 
                            onClick={() => setActiveTab('history')}
                            className={`hidden md:flex flex-col items-center justify-center border-b-[3px] pb-[13px] pt-4 transition-colors ${activeTab === 'history' ? 'border-b-amber-500 text-amber-500' : 'border-b-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-200'}`}
                        >
                            <span className="text-sm font-bold leading-normal tracking-[0.015em] flex items-center gap-2">
                                <History className="w-[18px] h-[18px]" /> History
                            </span>
                        </button>
                    </div>

                    <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-6">
                        <div className="flex justify-center">
                            <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400 bg-zinc-200/50 dark:bg-amber-500/10 px-3 py-1 rounded-full border border-transparent dark:border-amber-500/20">
                                Consultation Started - Data Specialist assigned
                            </span>
                        </div>
                        
                        {/* Agent Message */}
                        <div className="flex items-end gap-3 max-w-[85%]">
                            <div className="bg-amber-500/20 flex items-center justify-center aspect-square rounded-full w-10 shrink-0 border border-amber-500/30 text-amber-500">
                                <Bot className="w-5 h-5" />
                            </div>
                            <div className="flex flex-1 flex-col gap-1 items-start">
                                <p className="text-zinc-500 dark:text-zinc-400 text-[13px] font-medium leading-normal ml-2">Data Specialist Agent</p>
                                <p className="text-[15px] font-normal leading-relaxed rounded-2xl rounded-bl-none px-5 py-3.5 bg-zinc-100 dark:bg-zinc-900/80 text-zinc-800 dark:text-zinc-100 border border-zinc-200 dark:border-amber-500/20 shadow-sm">
                                    Hello! I'm here to help you design the data layer for your project. I see you're planning a user-centric app. Could you clarify what types of relationships you expect between the User and the Product entities? Are they many-to-many?
                                </p>
                            </div>
                        </div>

                        {/* User Message */}
                        <div className="flex items-end gap-3 max-w-[85%] self-end flex-row-reverse">
                            <div className="bg-zinc-800 flex items-center justify-center aspect-square rounded-full w-10 shrink-0 border border-zinc-200 dark:border-amber-500/30 overflow-hidden">
                                {/* Placeholder for User Avatar */}
                                <div className="w-full h-full bg-gradient-to-tr from-blue-500 to-purple-500"></div>
                            </div>
                            <div className="flex flex-1 flex-col gap-1 items-end">
                                <p className="text-[15px] font-normal leading-relaxed rounded-2xl rounded-br-none px-5 py-3.5 bg-amber-500 text-zinc-950 shadow-sm font-medium">
                                    Yes, a user can favorite multiple products, and a product can be favorited by multiple users. We also need to track when they favorited it.
                                </p>
                            </div>
                        </div>

                        {/* Agent Message */}
                        <div className="flex items-end gap-3 max-w-[85%]">
                            <div className="bg-amber-500/20 flex items-center justify-center aspect-square rounded-full w-10 shrink-0 border border-amber-500/30 text-amber-500">
                                <Bot className="w-5 h-5" />
                            </div>
                            <div className="flex flex-1 flex-col gap-1 items-start">
                                <p className="text-zinc-500 dark:text-zinc-400 text-[13px] font-medium leading-normal ml-2">Data Specialist Agent</p>
                                <p className="text-[15px] font-normal leading-relaxed rounded-2xl rounded-bl-none px-5 py-3.5 bg-zinc-100 dark:bg-zinc-900/80 text-zinc-800 dark:text-zinc-100 border border-zinc-200 dark:border-amber-500/20 shadow-sm">
                                    Got it. I'll update the schema to include a join table, perhaps `UserFavorites`, which will store `user_id`, `product_id`, and a `created_at` timestamp. I am updating the Living PRD now.
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Chat Input */}
                    <div className="p-4 border-t border-zinc-200 dark:border-amber-500/20 bg-white/50 dark:bg-black/20 shrink-0">
                        <div className="flex w-full items-end gap-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-amber-500/30 rounded-xl p-2 focus-within:ring-2 focus-within:ring-amber-500/50 transition-shadow shadow-sm">
                            <button className="p-2 text-zinc-400 hover:text-amber-500 transition-colors shrink-0">
                                <Paperclip className="w-5 h-5" />
                            </button>
                            <textarea 
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                className="w-full min-w-0 resize-none overflow-hidden bg-transparent border-none focus:ring-0 text-zinc-900 dark:text-zinc-50 placeholder:text-zinc-500 p-2 max-h-32 text-[15px] focus:outline-none" 
                                placeholder="Reply to Data Specialist..." 
                                rows={1}
                            />
                            <button className="p-2 text-amber-500 hover:text-amber-400 transition-colors shrink-0 rounded-lg hover:bg-amber-500/10">
                                <Send className="w-5 h-5" />
                            </button>
                        </div>
                    </div>
                </section>

                {/* Resizer Handle */}
                <div className="w-1.5 bg-zinc-200 dark:bg-amber-500/10 cursor-col-resize hover:bg-amber-500/50 transition-colors flex flex-col justify-center items-center group relative z-20">
                    <div className="h-8 w-1 bg-zinc-400 dark:bg-amber-500/40 rounded-full group-hover:bg-zinc-900 dark:group-hover:bg-amber-500 transition-colors"></div>
                </div>

                {/* Right Panel: Living PRD */}
                <section className="w-1/2 flex flex-col bg-zinc-50 dark:bg-[#1a150c]/50">
                    <div className="flex flex-wrap justify-between items-center gap-3 px-8 py-4 border-b border-zinc-200 dark:border-amber-500/20 bg-white/50 dark:bg-black/10 shrink-0">
                        <div className="flex items-center gap-3">
                            <FileText className="text-amber-500 w-6 h-6" />
                            <h1 className="text-zinc-900 dark:text-zinc-50 tracking-tight text-xl font-bold leading-tight">Living PRD</h1>
                        </div>
                        <div className="flex items-center gap-3">
                            <span className="text-xs font-medium text-amber-600 dark:text-amber-500 bg-amber-500/10 px-2.5 py-1 rounded-md flex items-center gap-1.5 border border-amber-500/20 shadow-sm">
                                <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span> Auto-syncing
                            </span>
                            <button className="flex items-center justify-center rounded-lg h-9 px-4 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-amber-500/20 text-zinc-700 dark:text-zinc-200 text-sm font-medium hover:bg-zinc-50 dark:hover:bg-amber-500/10 transition-colors shadow-sm">
                                <Download className="w-[18px] h-[18px] mr-1.5" /> Export
                            </button>
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-8 lg:px-12 bg-zinc-50 dark:bg-zinc-950/20">
                        <div className="max-w-3xl mx-auto flex flex-col gap-8">
                            <div className="border-b border-zinc-200 dark:border-amber-500/10 pb-4">
                                <h2 className="text-3xl font-bold text-zinc-900 dark:text-zinc-50 mb-2">Schema Architecture V2</h2>
                                <p className="text-zinc-500 dark:text-zinc-400 text-sm">Last updated: Just now by Data Specialist Agent</p>
                            </div>

                            <section className="flex flex-col gap-3">
                                <h3 className="text-lg font-bold text-zinc-800 dark:text-zinc-100 flex items-center gap-2">
                                    <Network className="text-zinc-400 w-5 h-5" /> System Architecture
                                </h3>
                                <p className="text-[15px] text-zinc-600 dark:text-zinc-300 leading-relaxed">
                                    The system is designed around a relational database model to support robust querying for the user-centric application. Core entities are loosely coupled where possible, prioritizing read performance for product catalogs.
                                </p>
                            </section>

                            <section className="flex flex-col gap-3">
                                <h3 className="text-lg font-bold text-zinc-800 dark:text-zinc-100 flex items-center gap-2">
                                    <Database className="text-zinc-400 w-5 h-5" /> Storage Schema
                                </h3>
                                <div className="bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-amber-500/20 rounded-xl overflow-hidden shadow-sm">
                                    <div className="px-4 py-2 border-b border-zinc-200 dark:border-amber-500/20 bg-zinc-50 dark:bg-black/20 text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                                        Tables
                                    </div>
                                    <div className="p-4 flex flex-col gap-4 font-mono text-sm">
                                        <div>
                                            <div className="text-amber-600 dark:text-amber-500 font-bold mb-1">Users</div>
                                            <div className="pl-4 text-zinc-600 dark:text-zinc-300 space-y-1">
                                                <div>id <span className="text-zinc-400 dark:text-zinc-500 text-xs">UUID PK</span></div>
                                                <div>email <span className="text-zinc-400 dark:text-zinc-500 text-xs">VARCHAR UNIQUE</span></div>
                                                <div>created_at <span className="text-zinc-400 dark:text-zinc-500 text-xs">TIMESTAMP</span></div>
                                            </div>
                                        </div>
                                        
                                        <div>
                                            <div className="text-amber-600 dark:text-amber-500 font-bold mb-1">Products</div>
                                            <div className="pl-4 text-zinc-600 dark:text-zinc-300 space-y-1">
                                                <div>id <span className="text-zinc-400 dark:text-zinc-500 text-xs">UUID PK</span></div>
                                                <div>title <span className="text-zinc-400 dark:text-zinc-500 text-xs">VARCHAR</span></div>
                                                <div>price <span className="text-zinc-400 dark:text-zinc-500 text-xs">DECIMAL</span></div>
                                            </div>
                                        </div>
                                        
                                        {/* Highlighted New Table */}
                                        <div className="relative bg-amber-500/5 dark:bg-amber-500/10 -mx-4 px-4 py-2 border-l-2 border-amber-500">
                                            <div className="absolute right-4 top-2 flex items-center gap-1 text-[10px] text-amber-600 dark:text-amber-500 font-sans font-medium uppercase tracking-wider bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">
                                                <Pencil className="w-3 h-3" /> Updated
                                            </div>
                                            <div className="text-amber-600 dark:text-amber-500 font-bold mb-1">UserFavorites</div>
                                            <div className="pl-4 text-zinc-800 dark:text-zinc-200 space-y-1 font-medium">
                                                <div>user_id <span className="text-zinc-500 dark:text-zinc-400 text-xs font-normal">UUID FK(Users.id)</span></div>
                                                <div>product_id <span className="text-zinc-500 dark:text-zinc-400 text-xs font-normal">UUID FK(Products.id)</span></div>
                                                <div>created_at <span className="text-zinc-500 dark:text-zinc-400 text-xs font-normal">TIMESTAMP</span></div>
                                                <div className="text-zinc-400 dark:text-zinc-500 text-xs mt-1 italic font-sans">-- Composite Primary Key (user_id, product_id)</div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </section>

                            <section className="flex flex-col gap-3">
                                <h3 className="text-lg font-bold text-zinc-800 dark:text-zinc-100 flex items-center gap-2">
                                    <Webhook className="text-zinc-400 w-5 h-5" /> Key Endpoints
                                </h3>
                                <ul className="list-none space-y-2">
                                    <li className="flex items-start gap-3 bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-amber-500/10 p-3 rounded-lg shadow-sm font-sans">
                                        <span className="bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 text-xs font-bold px-2 py-1 rounded border border-blue-200 dark:border-blue-800/50">GET</span>
                                        <div>
                                            <code className="text-sm text-zinc-700 dark:text-zinc-200 font-mono font-medium">/api/users/&#123;id&#125;/favorites</code>
                                            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">Retrieves list of products favorited by a user.</p>
                                        </div>
                                    </li>
                                    <li className="flex items-start gap-3 bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-amber-500/10 p-3 rounded-lg shadow-sm font-sans">
                                        <span className="bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-xs font-bold px-2 py-1 rounded border border-green-200 dark:border-green-800/50">POST</span>
                                        <div>
                                            <code className="text-sm text-zinc-700 dark:text-zinc-200 font-mono font-medium">/api/users/&#123;id&#125;/favorites</code>
                                            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">Adds a product to user's favorites.</p>
                                        </div>
                                    </li>
                                </ul>
                            </section>
                        </div>
                    </div>
                </section>
            </div>
        </div>
    );
}
