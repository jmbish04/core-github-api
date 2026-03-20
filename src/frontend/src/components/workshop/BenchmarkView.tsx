import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';

export const BenchmarkView = () => {
    const benchmarks = [
        { name: "Code Quality", score: 92, target: 85 },
        { name: "Unit Test Coverage", score: 88, target: 90 },
        { name: "Architectural Compliance", score: 96, target: 95 }
    ];

    return (
        <Card className="dark w-full bg-zinc-950 text-zinc-50 border-zinc-800 shadow-2xl relative overflow-hidden">
            <CardHeader className="border-b border-zinc-800/60 pb-5 bg-zinc-900/30">
                <CardTitle className="text-xl font-extrabold tracking-tight">Global Benchmarks</CardTitle>
            </CardHeader>
            <CardContent className="p-6 space-y-8 bg-[#0a0a0a]">
                {benchmarks.map((b, i) => (
                    <div key={i} className="space-y-3">
                        <div className="flex justify-between items-end">
                            <span className="text-xs font-bold uppercase tracking-[0.1em] text-zinc-300">{b.name}</span>
                            <span className="font-mono text-xs font-medium text-zinc-400">{b.score} / 100</span>
                        </div>
                        <div className="relative pt-2">
                            <Progress value={b.score} className={`h-2.5 bg-zinc-900 rounded-full overflow-hidden ${b.score >= b.target ? '[&>div]:bg-green-500' : '[&>div]:bg-red-500'}`} />
                            <div 
                                className="absolute top-1 bottom-0 w-1 bg-zinc-200 z-10 rounded-full shadow-[0_0_5px_rgba(255,255,255,0.5)]" 
                                style={{ left: `calc(${b.target}% - 2px)` }}
                                title={`Target: ${b.target}`}
                            />
                        </div>
                    </div>
                ))}
            </CardContent>
        </Card>
    );
};
