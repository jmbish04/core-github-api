import React, { useState } from 'react';
import { Blocks, CheckCircle2, Circle, Database, HardDrive, Sparkles } from 'lucide-react';

export function SpecialistSelectionWizard() {
    const [selectedFoundation, setSelectedFoundation] = useState<'d1' | 'r2'>('d1');

    return (
        <div className="relative flex min-h-screen w-full flex-col overflow-x-hidden bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-50 font-sans">
            <div className="flex h-full grow flex-col">
                <header className="flex items-center justify-between whitespace-nowrap border-b border-amber-500/20 px-10 py-4 bg-white/80 dark:bg-black/80 backdrop-blur-md sticky top-0 z-50">
                    <div className="flex items-center gap-4">
                        <div className="w-6 h-6 text-amber-500 flex items-center justify-center">
                            <Blocks className="w-6 h-6" />
                        </div>
                        <h2 className="text-lg font-bold leading-tight tracking-tight">Agent Workshop</h2>
                    </div>
                </header>

                <main className="flex-1 flex justify-center py-12 px-4 sm:px-6 lg:px-8">
                    <div className="max-w-[800px] w-full flex flex-col bg-white dark:bg-zinc-900/50 rounded-xl border border-amber-500/20 shadow-xl overflow-hidden">
                        
                        {/* Progress Header */}
                        <div className="flex flex-col gap-4 p-6 sm:p-8 border-b border-amber-500/10">
                            <div className="flex gap-6 justify-between items-center">
                                <p className="text-base font-semibold leading-normal">Menu Selection</p>
                                <p className="text-sm font-medium text-amber-500">Step 1 of 4</p>
                            </div>
                            <div className="rounded-full bg-amber-500/10 h-2 overflow-hidden">
                                <div className="h-full rounded-full bg-amber-500 transition-all duration-500 ease-in-out" style={{ width: '25%' }}></div>
                            </div>
                        </div>

                        {/* Content Area */}
                        <div className="flex flex-col gap-8 p-6 sm:p-8">
                            <div className="flex flex-col gap-2">
                                <h1 className="tracking-tight text-3xl sm:text-4xl font-bold leading-tight text-zinc-900 dark:text-white">Choose Your Foundation</h1>
                                <p className="text-zinc-600 dark:text-zinc-400 text-base sm:text-lg font-normal leading-relaxed">
                                    Select your primary storage engine to initialize the agent project wizard.
                                </p>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                {/* D1 Card */}
                                <label 
                                    className={`relative flex flex-col gap-4 rounded-xl border-2 p-6 cursor-pointer transition-all ${
                                        selectedFoundation === 'd1' 
                                            ? 'border-amber-500 bg-amber-500/5 shadow-[0_0_15px_rgba(245,158,11,0.15)]' 
                                            : 'border-transparent hover:border-amber-500/30 bg-zinc-100 dark:bg-white/5 hover:bg-zinc-200 dark:hover:bg-white/10 group'
                                    }`}
                                >
                                    <input 
                                        type="radio" 
                                        name="foundation" 
                                        value="d1" 
                                        className="sr-only" 
                                        checked={selectedFoundation === 'd1'}
                                        onChange={() => setSelectedFoundation('d1')}
                                    />
                                    <div className={`absolute top-4 right-4 transition-opacity ${selectedFoundation === 'd1' ? 'text-amber-500 opacity-100' : 'text-zinc-400 dark:text-zinc-500 opacity-0 group-hover:opacity-100'}`}>
                                        {selectedFoundation === 'd1' ? <CheckCircle2 className="w-6 h-6" /> : <Circle className="w-6 h-6" />}
                                    </div>
                                    <div className={`flex items-center justify-center w-12 h-12 rounded-lg transition-colors ${selectedFoundation === 'd1' ? 'text-amber-500 bg-amber-500/10' : 'text-zinc-500 dark:text-zinc-400 bg-zinc-200 dark:bg-white/10 group-hover:text-amber-500 group-hover:bg-amber-500/10'}`}>
                                        <Database className="w-7 h-7" />
                                    </div>
                                    <div className="flex flex-col gap-1">
                                        <h2 className={`text-lg font-bold leading-tight ${selectedFoundation === 'd1' ? 'text-zinc-900 dark:text-white' : 'text-zinc-700 dark:text-zinc-200'}`}>D1 Relational Database</h2>
                                        <p className="text-zinc-600 dark:text-zinc-400 text-sm font-normal leading-relaxed">
                                            Scalable SQLite optimized for edge agents requiring structured data.
                                        </p>
                                    </div>
                                </label>

                                {/* R2 Card */}
                                <label 
                                    className={`relative flex flex-col gap-4 rounded-xl border-2 p-6 cursor-pointer transition-all ${
                                        selectedFoundation === 'r2' 
                                            ? 'border-amber-500 bg-amber-500/5 shadow-[0_0_15px_rgba(245,158,11,0.15)]' 
                                            : 'border-transparent hover:border-amber-500/30 bg-zinc-100 dark:bg-white/5 hover:bg-zinc-200 dark:hover:bg-white/10 group'
                                    }`}
                                >
                                    <input 
                                        type="radio" 
                                        name="foundation" 
                                        value="r2" 
                                        className="sr-only" 
                                        checked={selectedFoundation === 'r2'}
                                        onChange={() => setSelectedFoundation('r2')}
                                    />
                                    <div className={`absolute top-4 right-4 transition-opacity ${selectedFoundation === 'r2' ? 'text-amber-500 opacity-100' : 'text-zinc-400 dark:text-zinc-500 opacity-0 group-hover:opacity-100'}`}>
                                        {selectedFoundation === 'r2' ? <CheckCircle2 className="w-6 h-6" /> : <Circle className="w-6 h-6" />}
                                    </div>
                                    <div className={`flex items-center justify-center w-12 h-12 rounded-lg transition-colors ${selectedFoundation === 'r2' ? 'text-amber-500 bg-amber-500/10' : 'text-zinc-500 dark:text-zinc-400 bg-zinc-200 dark:bg-white/10 group-hover:text-amber-500 group-hover:bg-amber-500/10'}`}>
                                        <HardDrive className="w-7 h-7" />
                                    </div>
                                    <div className="flex flex-col gap-1">
                                        <h2 className={`text-lg font-bold leading-tight ${selectedFoundation === 'r2' ? 'text-zinc-900 dark:text-white' : 'text-zinc-700 dark:text-zinc-200'}`}>R2 Object Storage</h2>
                                        <p className="text-zinc-600 dark:text-zinc-400 text-sm font-normal leading-relaxed">
                                            Fast global object storage for unstructured agent memory and assets.
                                        </p>
                                    </div>
                                </label>
                            </div>
                        </div>

                        {/* Footer Area */}
                        <div className="flex p-6 sm:p-8 justify-end border-t border-amber-500/10 bg-zinc-50 dark:bg-white/5 mt-auto">
                            <button className="flex min-w-[120px] cursor-pointer items-center justify-center rounded-lg h-12 px-6 bg-amber-500 hover:bg-amber-400 text-zinc-950 gap-2 text-base font-bold leading-normal tracking-wide transition-colors shadow-lg shadow-amber-500/20">
                                <Sparkles className="w-5 h-5" />
                                <span>Continue</span>
                            </button>
                        </div>

                    </div>
                </main>
            </div>
        </div>
    );
}
