import React from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

export const DiffViewer = ({ taskEventId }: { taskEventId: string }) => {
    // Stub diff payload for viewing
    const diffBefore = `function calculateTotal(items) {\n  let total = 0;\n  for (let i = 0; i < items.length; i++) {\n    total += items[i].price;\n  }\n  return total;\n}`;
    const diffAfter = `function calculateTotal(items) {\n  return items.reduce((total, item) => total + item.price, 0);\n}`;

    return (
        <div className="dark w-full max-w-6xl mx-auto space-y-4 rounded-xl overflow-hidden border border-zinc-800 shadow-xl bg-zinc-950 flex flex-col">
            <div className="p-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/70">
                <div className="flex items-center gap-4">
                    <h2 className="text-lg font-bold text-zinc-100 tracking-tight">Code Review</h2>
                    <Badge variant="outline" className="text-blue-400 border-blue-900/50 bg-blue-950/30 font-mono text-xs px-2 tracking-wide uppercase">Refactor</Badge>
                </div>
                <div className="flex gap-3">
                    <Button variant="outline" size="sm" className="h-9 px-4 border-zinc-700 bg-zinc-900 hover:bg-zinc-800 text-zinc-300">Request Changes</Button>
                    <Button size="sm" className="h-9 px-4 bg-blue-600 hover:bg-blue-700 text-white border-0 shadow-md transition-all">Approve Merge</Button>
                </div>
            </div>
            
            <div className="grid grid-cols-2 divide-x divide-zinc-800 flex-1 min-h-[400px]">
                {/* Left: Original */}
                <div className="flex flex-col bg-[#0a0a0a]">
                    <div className="py-2.5 px-4 shadow-sm border-b border-zinc-800/60 bg-zinc-950/80">
                        <span className="text-xs font-mono font-bold tracking-wider uppercase text-red-400/80">utils.js (Original)</span>
                    </div>
                    <ScrollArea className="flex-1 p-4">
                        <pre className="text-sm font-mono leading-relaxed">
                            {diffBefore.split('\n').map((line, i) => (
                                <div key={i} className="flex hover:bg-zinc-900/50">
                                    <span className="text-zinc-600 w-10 inline-block select-none text-right pr-3">{i + 1}</span>
                                    <span className="text-zinc-300 bg-red-950/10 px-2 flex-1 border-l border-red-500/20">{line}</span>
                                </div>
                            ))}
                        </pre>
                    </ScrollArea>
                </div>

                {/* Right: Modified */}
                <div className="flex flex-col bg-[#0a0a0a]">
                    <div className="py-2.5 px-4 shadow-sm border-b border-zinc-800/60 bg-zinc-950/80">
                        <span className="text-xs font-mono font-bold tracking-wider uppercase text-green-400/80">utils.js (Modified)</span>
                    </div>
                    <ScrollArea className="flex-1 p-4">
                        <pre className="text-sm font-mono leading-relaxed">
                            {diffAfter.split('\n').map((line, i) => (
                                <div key={i} className="flex hover:bg-zinc-900/50">
                                    <span className="text-zinc-600 w-10 inline-block select-none text-right pr-3">{i + 1}</span>
                                    <span className="text-zinc-200 bg-green-950/20 px-2 flex-1 border-l border-green-500/20">{line}</span>
                                </div>
                            ))}
                        </pre>
                    </ScrollArea>
                </div>
            </div>
        </div>
    );
};
